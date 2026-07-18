/**
 * Multi-provider LLM layer with automatic fallback.
 *
 * Configure one or more AI providers in .env.local. They are tried IN ORDER;
 * when one fails (e.g. quota/429/rate-limit/server error) the next is used
 * automatically, so a single exhausted key never takes the app down.
 *
 * Supported (all optional, add as many as you like):
 *   GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3   (Google Gemini)
 *   GROQ_API_KEY            (Groq — free & fast, OpenAI-compatible)
 *   OPENROUTER_API_KEY      (OpenRouter — many free models)
 *   OPENAI_API_KEY          (OpenAI, or any OpenAI-compatible endpoint)
 *
 * Order can be customised with AI_PROVIDER_ORDER, e.g. "groq,gemini,openrouter".
 */
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";

export interface GenOpts {
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Gemini 2.5 "thinking" token budget. 0 disables it (output is not eaten by thinking). */
  thinkingBudget?: number;
}

interface Provider {
  name: string;
  generate(prompt: string, opts: GenOpts): Promise<string>;
}

/**
 * Keys added from the admin panel. They live in the database, are loaded at
 * boot (and again whenever an admin changes one), and take precedence over the
 * .env values — so a key can be rotated without a redeploy.
 */
let keyOverrides: Record<string, string> = {};

export function setKeyOverrides(map: Record<string, string>) {
  keyOverrides = map;
  // Providers are built once and memoized, so a new key only takes effect if we
  // throw the memo away.
  cached = null;
}

function env(key: string): string | undefined {
  const v = keyOverrides[key] ?? process.env[key];
  return v ? v.trim() : undefined;
}

// ---- live per-provider stats (for the AI monitor) -------------------------
export interface ProviderStat {
  name: string;
  requests: number;
  success: number;
  failures: number;
  quotaHits: number;
  lastStatus: "ok" | "quota" | "error" | "untested";
  lastError?: string;
  lastUsedAt?: string;
  /** Rate-limit headers, when the provider returns them (Groq/OpenAI/OpenRouter). */
  rateLimit?: Record<string, string>;
}

const statsMap = new Map<string, ProviderStat>();

function stat(name: string): ProviderStat {
  let s = statsMap.get(name);
  if (!s) {
    s = { name, requests: 0, success: 0, failures: 0, quotaHits: 0, lastStatus: "untested" };
    statsMap.set(name, s);
  }
  return s;
}

function recordRateLimit(name: string, headers: Headers) {
  const keys = [
    "x-ratelimit-remaining-requests",
    "x-ratelimit-limit-requests",
    "x-ratelimit-remaining-tokens",
    "x-ratelimit-limit-tokens",
    "x-ratelimit-reset-requests",
    "x-ratelimit-reset-tokens",
    "retry-after",
  ];
  const rl: Record<string, string> = {};
  for (const k of keys) {
    const v = headers.get(k);
    if (v) rl[k] = v;
  }
  if (Object.keys(rl).length) stat(name).rateLimit = rl;
}

// ---- provider builders ----------------------------------------------------
function geminiProvider(apiKey: string, model: string, tag: string): Provider {
  const client = new GoogleGenAI({ apiKey });
  return {
    name: tag,
    async generate(prompt, opts) {
      const res = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
          ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
          ...(opts.thinkingBudget !== undefined
            ? { thinkingConfig: { thinkingBudget: opts.thinkingBudget } }
            : {}),
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
        },
      });
      return res.text ?? "";
    },
  };
}

function openAICompatProvider(
  apiKey: string,
  baseUrl: string,
  model: string,
  tag: string
): Provider {
  return {
    name: tag,
    async generate(prompt, opts) {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: opts.temperature ?? 0.9,
          ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      recordRateLimit(tag, res.headers);
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`${res.status} ${t.slice(0, 200)}`);
      }
      const j: any = await res.json();
      return j.choices?.[0]?.message?.content ?? "";
    },
  };
}

// Ollama — your OWN AI running locally (http://localhost:11434). No API key, NO
// limits, fully offline & free.
//
// We use Ollama's NATIVE /api/chat endpoint (not the OpenAI-compatible one),
// because only the native API honours `options.num_ctx`. Our chart prompt is large
// (~4-6k tokens); without a big enough context window the model silently truncates
// the instructions and replies with almost nothing. num_ctx:8192 fixes that.
function ollamaProvider(baseUrl: string, model: string, tag: string): Provider {
  // Accept a base url with or without a trailing /v1 and target the native API.
  const root = baseUrl.replace(/\/$/, "").replace(/\/v1$/, "");
  return {
    name: tag,
    async generate(prompt, opts) {
      const res = await fetch(`${root}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          ...(opts.json ? { format: "json" } : {}),
          options: {
            num_ctx: 8192, // full context for the chart packet
            num_predict: opts.maxTokens ?? 2048, // room for a complete 4-phase answer
            temperature: opts.temperature ?? 0.8,
          },
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`${res.status} ${t.slice(0, 200)}`);
      }
      const j: any = await res.json();
      return j.message?.content ?? "";
    },
  };
}

// Anthropic / Claude (official SDK). Paid backup — used when free providers run out.
// Note: temperature/top_p are not accepted on Opus 4.8/4.7 (would 400), so we don't send them.
function anthropicProvider(apiKey: string, model: string, tag: string): Provider {
  const client = new Anthropic({ apiKey });
  return {
    name: tag,
    async generate(prompt, opts) {
      const res = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 8192,
        messages: [{ role: "user", content: prompt }],
      });
      return (res.content ?? [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");
    },
  };
}

// AWS Bedrock (Claude via Bedrock API key, bearer-token auth, raw HTTP).
// Bedrock returns the Anthropic Messages response shape. Region + model must be set.
function bedrockProvider(apiKey: string, region: string, model: string, tag: string): Provider {
  return {
    name: tag,
    async generate(prompt, opts) {
      const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/invoke`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: opts.maxTokens ?? 8192,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`${res.status} ${t.slice(0, 220)}`);
      }
      const j: any = await res.json();
      return (j.content ?? [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");
    },
  };
}

// ---- assemble the configured providers ------------------------------------
function buildProviders(): Provider[] {
  // Gemini models, tried in order. Default leads with FLASH models because they
  // have a huge free-tier quota (~1500 requests/day each) — so the limit is
  // practically never reached. (gemini-2.5-pro is far more limited on the free
  // tier (~25-50/day), so it is NOT first; add it via GEMINI_MODELS if you want
  // top quality and have billing enabled.) Override with GEMINI_MODELS.
  const geminiModels = (
    env("GEMINI_MODELS") ||
    env("GEMINI_MODEL") ||
    "gemini-2.5-flash,gemini-2.0-flash"
  )
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const byName: Record<string, Provider[]> = { ollama: [], gemini: [], groq: [], openrouter: [], openai: [], anthropic: [] };

  // Ollama — your local AI. Enabled when OLLAMA_MODEL (or OLLAMA_BASE_URL) is set.
  // Tried FIRST by default so chats run on your machine with no limits; the cloud
  // keys below stay as automatic backup. Multiple models allowed (comma-separated).
  if (env("OLLAMA_MODEL") || env("OLLAMA_BASE_URL")) {
    const base = env("OLLAMA_BASE_URL") || "http://localhost:11434/v1";
    const models = (env("OLLAMA_MODEL") || "llama3.1")
      .split(",").map((m) => m.trim()).filter(Boolean);
    for (const m of models) byName.ollama.push(ollamaProvider(base, m, `ollama:${m}`));
  }

  const geminiKeys = [
    ...new Set(
      [
        env("GEMINI_API_KEY"),
        env("GEMINI_API_KEY_2"),
        env("GEMINI_API_KEY_3"),
        ...(env("GEMINI_API_KEYS") || "").split(",").map((k) => k.trim()),
      ].filter((k): k is string => !!k)
    ),
  ];

  // Try the BEST model across all keys first, then drop to the next model, etc.
  // e.g. pro(key1) → pro(key2) → flash(key1) → flash(key2) → flash-lite(...) → ...
  for (const model of geminiModels) {
    geminiKeys.forEach((k, i) => {
      const label = geminiKeys.length > 1 ? `${model} (key${i + 1})` : model;
      byName.gemini.push(geminiProvider(k, model, label));
    });
  }

  if (env("GROQ_API_KEY")) {
    // Multiple Groq models: if the big model is rate-limited, fall to a lighter,
    // higher-limit one. All free and very generous.
    const groqModels = (env("GROQ_MODELS") || env("GROQ_MODEL") || "llama-3.3-70b-versatile,llama-3.1-8b-instant")
      .split(",").map((m) => m.trim()).filter(Boolean);
    for (const m of groqModels) {
      byName.groq.push(
        openAICompatProvider(env("GROQ_API_KEY")!, "https://api.groq.com/openai/v1", m, `groq:${m}`)
      );
    }
  }
  if (env("OPENROUTER_API_KEY")) {
    byName.openrouter.push(
      openAICompatProvider(
        env("OPENROUTER_API_KEY")!,
        "https://openrouter.ai/api/v1",
        env("OPENROUTER_MODEL") || "meta-llama/llama-3.3-70b-instruct:free",
        "openrouter"
      )
    );
  }
  if (env("OPENAI_API_KEY")) {
    byName.openai.push(
      openAICompatProvider(
        env("OPENAI_API_KEY")!,
        env("OPENAI_BASE_URL") || "https://api.openai.com/v1",
        env("OPENAI_MODEL") || "gpt-4o-mini",
        "openai"
      )
    );
  }
  const anthKey = env("BEDROCK_API_KEY") || env("ANTHROPIC_API_KEY");
  if (anthKey) {
    // Auto-detect: an AWS Bedrock API key starts with "ABSK" — route it through
    // Bedrock (bearer auth + region + anthropic.* model IDs) instead of the
    // standard api.anthropic.com SDK (which would 401 on a Bedrock key).
    if (anthKey.startsWith("ABSK") || env("BEDROCK_API_KEY")) {
      const region = env("BEDROCK_REGION") || env("AWS_REGION") || "us-east-1";
      const model = env("BEDROCK_MODEL") || "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
      byName.anthropic.push(bedrockProvider(anthKey, region, model, `bedrock:${model}`));
    } else {
      const model = env("ANTHROPIC_MODEL") || "claude-opus-4-8";
      byName.anthropic.push(anthropicProvider(anthKey, model, `claude:${model}`));
    }
  }

  // Order: fast & accurate cloud providers first, then paid Claude/Bedrock, and
  // local Ollama LAST — it's the final safety net (slow on most machines, lower
  // accuracy than the cloud models) so chat never fully dies, but it's only used
  // when everything else is exhausted. Override with AI_PROVIDER_ORDER.
  const order = (env("AI_PROVIDER_ORDER") || "gemini,groq,openrouter,openai,anthropic,ollama")
    .split(",")
    .map((s) => s.trim().toLowerCase());
  const ordered: Provider[] = [];
  for (const name of order) ordered.push(...(byName[name] ?? []));
  return ordered;
}

let cached: Provider[] | null = null;
function providers(): Provider[] {
  if (!cached) {
    cached = buildProviders();
    console.log(
      `[llm] providers configured (in fallback order): ${cached.map((p) => p.name).join(", ") || "NONE"}`
    );
  }
  return cached;
}

/**
 * Generate text, trying each configured provider until one succeeds.
 * Throws only if every provider fails.
 */
export async function llmGenerate(prompt: string, opts: GenOpts = {}): Promise<string> {
  const list = providers();
  if (!list.length) {
    throw new Error(
      "No AI provider configured. Set GEMINI_API_KEY (and/or GROQ_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY) in .env.local"
    );
  }
  let lastErr: any;
  for (const p of list) {
    const s = stat(p.name);
    s.requests++;
    s.lastUsedAt = new Date().toISOString();
    try {
      const out = await p.generate(prompt, opts);
      if (out && out.trim()) {
        s.success++;
        s.lastStatus = "ok";
        s.lastError = undefined;
        if (lastErr) console.log(`[llm] recovered via ${p.name}`);
        return out;
      }
      s.failures++;
      s.lastStatus = "error";
      s.lastError = "empty output";
      lastErr = new Error(`${p.name} returned empty output`);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      s.failures++;
      if (/429|quota|rate.?limit|exhaust/i.test(msg)) {
        s.quotaHits++;
        s.lastStatus = "quota";
      } else {
        s.lastStatus = "error";
      }
      s.lastError = msg.slice(0, 180);
      lastErr = e;
      console.warn(`[llm] ${p.name} failed (${msg.slice(0, 140)}) — trying next provider`);
    }
  }
  throw lastErr ?? new Error("All AI providers failed");
}

/** Number of providers configured (for diagnostics). */
export function providerCount(): number {
  return providers().length;
}

/** Live status of every configured provider, in fallback order (for the monitor). */
export function getAiStatus() {
  const order = providers().map((p) => p.name);
  return {
    order,
    providers: order.map((name) => stat(name)),
    // The provider that would be tried first and is not currently rate-limited.
    active: order.find((n) => stat(n).lastStatus !== "quota") ?? order[0] ?? null,
  };
}
