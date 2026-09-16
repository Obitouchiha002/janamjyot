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
import { logAiCall } from "./ai-log";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";

export interface GenOpts {
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Gemini 2.5 "thinking" token budget. 0 disables it (output is not eaten by thinking). */
  thinkingBudget?: number;
  /**
   * This prompt carries someone's private life — their birth details, their
   * chart, what they said about their marriage or their job. Providers whose
   * free tier may keep content for product improvement are skipped entirely for
   * these, even if it means falling all the way through to a paid one.
   *
   * Saving an API bill is not a reason to hand a stranger's conversation to a
   * training corpus, and there is no way to take it back afterwards.
   */
  private?: boolean;
  /** What this call was for — chat, life_report, match… Recorded for costing. */
  purpose?: string;
  /**
   * Small bookkeeping (notes, labels) that a light model does as well as a big
   * one. Sent to the light models first, with minimal reasoning, so it does not
   * spend the strong models' per-minute token budget that the next person's
   * actual question needs.
   */
  light?: boolean;
  /**
   * This one is worth the good model. A paid report or a fact-checked reading
   * goes to the small models only when nothing else is left — they are where
   * the wrong house numbers come from, and a wrong number in a document someone
   * keeps is worse than a slower answer.
   */
  strong?: boolean;
  /** Set by llmGenerate: aborts a call that has run past its time. */
  signal?: AbortSignal;
}

interface Provider {
  name: string;
  generate(prompt: string, opts: GenOpts): Promise<string>;
  /**
   * True when this provider MAY use prompt content to improve its models on the
   * tier we are on. Assumed true unless we know otherwise: getting this wrong
   * in the cautious direction costs money, in the other direction it costs
   * someone's privacy, and only one of those is recoverable.
   */
  trainsOnContent?: boolean;
  /** Largest prompt+reply this provider accepts, in tokens, when it is known to be small. */
  maxContext?: number;
  /** Paid-equivalent rate, US$ per million tokens, for costing free calls too. */
  rate?: { in: number; out: number };
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
  /** When `rateLimit` was read (ms since epoch) — the numbers age as the window refills. */
  rateLimitAt?: number;
  /** Do not send this provider anything before this time (ms since epoch). */
  coolUntil?: number;
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
    // Cerebras names its per-minute bucket "…-tokens-minute"; read as the same.
    const v = headers.get(k) ?? headers.get(k.replace(/(requests|tokens)$/, "$1-minute"));
    if (v) rl[k] = v;
  }
  if (Object.keys(rl).length) {
    stat(name).rateLimit = rl;
    stat(name).rateLimitAt = Date.now();
  }
}

/** "7.66s", "2m59.5s", "1h2m", "450ms" or plain seconds → milliseconds. */
export function parseDurationMs(v: string | null | undefined): number {
  if (!v) return 0;
  const t = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 1000);
  let ms = 0;
  for (const [, n, u] of t.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    ms += Number(n) * (u === "h" ? 3600e3 : u === "m" ? 60e3 : u === "s" ? 1e3 : 1);
  }
  return Math.round(ms);
}

/*
 * How long until this provider can take a prompt of this size.
 *
 * Groq's free tier is a token bucket — 8,000 a minute per model, refilling
 * continuously — and one chat is several thousand of them. A 429 there almost
 * never means "gone for the day"; it means "a few seconds". Treating it as a
 * failure is what dropped people to the weakest model mid-conversation, where
 * the answers drifted into English and got placements wrong.
 *
 * Two sources, whichever says wait longer: an explicit cool-down set by a 429,
 * and the bucket as the provider last reported it, refilled for the time since.
 */
function waitMs(p: Provider, estTokens: number): number {
  const s = stat(p.name);
  const now = Date.now();
  let wait = Math.max(0, (s.coolUntil ?? 0) - now);
  const rl = s.rateLimit;
  const limit = Number(rl?.["x-ratelimit-limit-tokens"] ?? 0);
  const remaining = Number(rl?.["x-ratelimit-remaining-tokens"] ?? NaN);
  if (limit > 0 && Number.isFinite(remaining) && s.rateLimitAt && estTokens <= limit) {
    const perMs = limit / 60_000;
    const available = Math.min(limit, remaining + (now - s.rateLimitAt) * perMs);
    if (estTokens > available) wait = Math.max(wait, Math.ceil((estTokens - available) / perMs));
  }
  return wait;
}

/*
 * The small models in a chain. A reply from one of these is worth a short wait
 * for a strong model instead: they are where wrong placements and a slide into
 * English came from. Override with AI_WEAK_MODELS (a regex).
 */
const WEAK = new RegExp(env("AI_WEAK_MODELS") || "gpt-oss-20b|flash-lite|8b|ollama", "i");
/** Longest a single reply will wait, in total, for a rate limit to clear. */
const MAX_WAIT_MS = Number(env("AI_MAX_WAIT_MS") || 12_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/*
 * Time limits. The serverless function is killed at 60s, so the whole chain —
 * waits, failed attempts and the answer — has to fit inside that, with room to
 * save the reply and respond.
 */
const DEADLINE_MS = Number(env("AI_DEADLINE_MS") || 50_000);
const CALL_TIMEOUT_MS = Number(env("AI_CALL_TIMEOUT_MS") || 25_000);
/*
 * 30s, not 45: a long call that eats 45 of the chain's 50 seconds leaves no
 * room to ask anyone else, so one slow provider failed a whole report instead
 * of being stepped over. A report part that has not answered in half a minute
 * is not about to.
 */
const CALL_TIMEOUT_LONG_MS = Number(env("AI_CALL_TIMEOUT_LONG_MS") || 30_000);

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
          ...(opts.signal ? { abortSignal: opts.signal } : {}),
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
        signal: opts.signal,
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
          ...(opts.light && /gpt-oss/i.test(model) ? { reasoning_effort: "low" } : {}),
        }),
      });
      recordRateLimit(tag, res.headers);
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        const err: any = new Error(`${res.status} ${t.slice(0, 200)}`);
        if (res.status === 429) {
          // Groq also says it in the body: "Please try again in 7.66s."
          const inBody = t.match(/try again in ([\d.hms]+)/i)?.[1];
          err.retryAfterMs =
            parseDurationMs(res.headers.get("retry-after")) ||
            parseDurationMs(inBody) ||
            parseDurationMs(res.headers.get("x-ratelimit-reset-tokens")) ||
            parseDurationMs(res.headers.get("x-ratelimit-reset-requests"));
        }
        throw err;
      }
      const j: any = await res.json();
      /*
       * Strip any reasoning the model left in the reply.
       *
       * Groq's whole lineup is reasoning models now — the llama pair we were
       * pinned to is gone — and one of them (qwen3.6) returns its entire
       * thinking inside <think> tags in `content` rather than a separate
       * field. Sent straight through, a user would open the chat and read the
       * model talking to itself about them.
       *
       * Cheap, and harmless for a model that never emits them.
       */
      const content = String(j.choices?.[0]?.message?.content ?? "");
      return content.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^\s*<think>[\s\S]*$/i, "").trim();
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
        signal: opts.signal,
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
  /*
   * Gemini models, tried in order. Flash first: its free-tier quota is large
   * enough that the limit is practically never reached, where 2.5-pro is capped
   * at a few dozen a day. Add models with GEMINI_MODELS (see below).
   *
   * The list ENDS with `gemini-flash-latest` on purpose. Google retires named
   * versions — gemini-2.0-flash and gemini-2.0-flash-lite both went 404 in
   * production, and the pinned list had no survivor behind them. A pinned model
   * is predictable until the day it is deleted; the alias always resolves to
   * whatever is current. Pinned versions lead so behaviour stays stable, and the
   * alias sits at the back so a retirement can never take the app down again.
   */
  /*
   * Current models lead; GEMINI_MODELS adds to them rather than replacing them.
   *
   * Production pinned a list that aged out from under it: gemini-2.0-flash went
   * 404 and gemini-2.5-flash's free quota was spent, so every chat that reached
   * Gemini burned five requests before a flash-lite answered generically. The
   * newer flash models had their own untouched free quota the whole time.
   * Checked Sept 2026: gemini-3.6-flash answers a full chart prompt in ~4s in
   * good Hinglish; 3.5-flash is right but ~15s. A stale name in the env now
   * costs one 404 every six hours instead of a failed hop on every message.
   * GEMINI_MODELS_ONLY=true restores "use exactly the env list".
   */
  const envModels = (env("GEMINI_MODELS") || env("GEMINI_MODEL") || "")
    .split(",").map((m) => m.trim()).filter(Boolean);
  const geminiModels = env("GEMINI_MODELS_ONLY") === "true" && envModels.length
    ? envModels
    : [...new Set(["gemini-3.6-flash", "gemini-3.5-flash", ...envModels, "gemini-2.5-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"])];

  const byName: Record<string, Provider[]> = { ollama: [], gemini: [], groq: [], cerebras: [], openrouter: [], openai: [], anthropic: [] };

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
    /*
     * Groq retired the llama pair this was pinned to — both returned 404 in
     * production, which is what left Gemini as the only provider able to answer
     * and quietly broke the privacy routing. Checked against Groq's live list
     * and each one actually generated before being put here.
     *
     * qwen3.6-27b is deliberately absent: it returns its own <think> reasoning
     * inside the reply. The stripper above catches it, but a model that needs
     * catching is not the one to lead with.
     */
    const groqModels = (env("GROQ_MODELS") || env("GROQ_MODEL") || "openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b")
      .split(",").map((m) => m.trim()).filter(Boolean);
    for (const m of groqModels) {
      byName.groq.push(
        openAICompatProvider(env("GROQ_API_KEY")!, "https://api.groq.com/openai/v1", m, `groq:${m}`)
      );
    }
  }
  /*
   * Cerebras — a second free home for the same strong models Groq serves.
   *
   * Free tier (checked Sept 2026): gpt-oss-120b and qwen-3.8-27b, each 5
   * requests and 30K tokens a minute, 1M tokens a day — roughly 150 chats a
   * day per model, in their own buckets, on top of Groq's. Cerebras states it
   * does not store, log or reuse prompts, so it is privacy-safe like Groq.
   * The free tier caps context at 8,192 tokens; `maxContext` makes the router
   * skip it for a report prompt that would not fit instead of wasting a call.
   */
  if (env("CEREBRAS_API_KEY")) {
    const models = (env("CEREBRAS_MODELS") || "gpt-oss-120b,qwen-3.8-27b")
      .split(",").map((m) => m.trim()).filter(Boolean);
    for (const m of models) {
      const p = openAICompatProvider(env("CEREBRAS_API_KEY")!, "https://api.cerebras.ai/v1", m, `cerebras:${m}`);
      p.maxContext = Number(env("CEREBRAS_MAX_CONTEXT") || 8192);
      byName.cerebras.push(p);
    }
  }
  /*
   * Any other OpenAI-compatible endpoint, added without a code change.
   *
   * The free landscape moves: Cerebras' no-card tier became a card trial, a
   * provider retires a model, someone opens a new free tier next month. Adding
   * one means shipping a deploy, which is the wrong shape of problem — so up to
   * three extras are read straight from the environment:
   *   EXTRA1_BASE_URL, EXTRA1_API_KEY, EXTRA1_MODELS, EXTRA1_SAFE=true
   * SAFE says the provider does not train on what we send it; without it the
   * extra is treated like any other training-capable service and only sees a
   * private prompt when nothing safe is left.
   */
  for (const n of [1, 2, 3]) {
    const base = env(`EXTRA${n}_BASE_URL`);
    const key = env(`EXTRA${n}_API_KEY`);
    if (!base || !key) continue;
    const models = (env(`EXTRA${n}_MODELS`) || "").split(",").map((m) => m.trim()).filter(Boolean);
    if (!models.length) { console.warn(`[llm] EXTRA${n}_MODELS is empty — skipping`); continue; }
    byName[`extra${n}`] = models.map((m) => {
      const p = openAICompatProvider(key, base, m, `extra${n}:${m}`);
      const ctx = Number(env(`EXTRA${n}_MAX_CONTEXT`) || 0);
      if (ctx) p.maxContext = ctx;
      return p;
    });
    PROVIDER_META[`extra${n}`] = { trains: env(`EXTRA${n}_SAFE`) !== "true", rate: { in: 0.3, out: 0.9 } };
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
  const order = (env("AI_PROVIDER_ORDER") || "gemini,groq,cerebras,openrouter,openai,anthropic,ollama")
    .split(",")
    .map((s) => s.trim().toLowerCase());
  // A provider with a key but missing from a hand-written AI_PROVIDER_ORDER is
  // still used — after the listed ones — rather than silently never called.
  for (const name of Object.keys(byName)) {
    if (!order.includes(name) && byName[name].length) {
      console.warn(`[llm] ${name} is configured but not in AI_PROVIDER_ORDER — added at the end`);
      order.push(name);
    }
  }
  const ordered: Provider[] = [];
  for (const name of order) {
    for (const p of byName[name] ?? []) {
      const meta = PROVIDER_META[name];
      // Unknown provider → assumed to train. The cautious default costs money;
      // the other default costs someone's privacy, and only one is recoverable.
      p.trainsOnContent = meta ? meta.trains : true;
      p.rate = meta?.rate ?? { in: 1, out: 3 };
      ordered.push(p);
    }
  }
  return ordered;
}

/**
 * What each provider does with a prompt, and what it would cost if nothing were
 * free. Both matter for the same reason: a business cannot be built on a free
 * tier it does not understand.
 *
 * `trainsOnContent` reflects the tier we are actually on. Google's free tier
 * says content may be used to improve their products; the paid tier says it is
 * not — so Gemini is treated as training-capable unless GEMINI_PAID_TIER is set
 * to say otherwise. Groq states it does not train on customer data. A local
 * Ollama never leaves the machine. Anthropic's API does not train on inputs.
 * OpenRouter depends on how it is routed, so it is assumed unsafe unless
 * OPENROUTER_ZDR says the account is on zero-data-retention routing.
 *
 * Rates are US$ per million tokens, list price, used to cost calls that are
 * currently free. A free tier is a discount, not a business model, and pricing
 * it as though we were paying is the only way to know whether ₹49 for fifty
 * questions is a product or a slow leak.
 */
const PROVIDER_META: Record<string, { trains: boolean; rate: { in: number; out: number } }> = {
  // extra1…extra3 are added at build time from the environment (see above).
  gemini:     { trains: env("GEMINI_PAID_TIER") !== "true", rate: { in: 0.30, out: 2.50 } },
  groq:       { trains: false,                              rate: { in: 0.20, out: 0.60 } },
  cerebras:   { trains: false,                              rate: { in: 0.35, out: 0.75 } },
  openrouter: { trains: env("OPENROUTER_ZDR") !== "true",   rate: { in: 0.50, out: 1.50 } },
  openai:     { trains: false,                              rate: { in: 0.40, out: 1.60 } },
  anthropic:  { trains: false,                              rate: { in: 3.00, out: 15.00 } },
  ollama:     { trains: false,                              rate: { in: 0,    out: 0 } },
};

let cached: Provider[] | null = null;
function providers(): Provider[] {
  if (!cached) {
    cached = buildProviders();
    const safe = cached.filter((p) => !p.trainsOnContent).map((p) => p.name);
    console.log(
      `[llm] providers configured (in fallback order): ${cached.map((p) => p.name).join(", ") || "NONE"}`
    );
    console.log(
      `[llm] privacy-safe for personal prompts: ${safe.join(", ") || "NONE — personal prompts will FAIL"}`
    );
  }
  return cached;
}

/**
 * What one generation would have cost at list price, whoever served it.
 *
 * Token counts are estimated from characters (~4 per token) because the
 * providers do not all report usage through this interface. That is precise
 * enough for the only question being asked — "is a chat costing more than
 * thirty paise?" — and being approximately right about the economics beats
 * being exactly right about nothing, which is where a free tier leaves you.
 *
 * Fire-and-forget: costing must never be able to fail a user's answer.
 */
function recordCall(
  p: Provider, prompt: string, out: string, ms: number,
  attempt: number, ok: boolean, purpose?: string,
): void {
  try {
    const inTok = Math.ceil(prompt.length / 4);
    const outTok = Math.ceil((out || "").length / 4);
    const usd = (inTok / 1e6) * (p.rate?.in ?? 0) + (outTok / 1e6) * (p.rate?.out ?? 0);
    // One conversion, one place. Moves with the rupee only when we say so.
    const paise = Math.round(usd * Number(env("USD_INR") || 88) * 100);
    void logAiCall({
      provider: p.name, purpose: purpose || "other",
      in_tokens: inTok, out_tokens: outTok, cost_paise: paise,
      latency_ms: ms, attempt, ok,
    });
  } catch { /* costing must never break a reply */ }
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
  // Private by DEFAULT. Almost every prompt this app builds carries a birth
  // chart and whatever the person just said about their marriage or their job,
  // and annotating fifteen call sites means the sixteenth — added months from
  // now by someone who never read this — leaks. Opt out explicitly with
  // `private: false` for a prompt that genuinely contains nobody's life.
  //
  // The bill is recoverable. The disclosure is not.
  const isPrivate = opts.private !== false;
  const safe = list.filter((p) => !p.trainsOnContent);

  /*
   * Prefer the safe ones — then decide what to do when none of them ANSWERS.
   *
   * Configured is not the same as working. Both privacy-safe providers were
   * configured and both were dead: Groq returning 404 for these models on this
   * key, Bedrock refusing on an unpaid subscription. That left Gemini as the
   * only thing able to reply, and failing closed took the entire chat down
   * while protecting nobody — the same data had been going to Gemini first for
   * months. Breaking the product does not un-send it.
   *
   * So a private prompt tries the safe providers first and falls through,
   * loudly, rather than dying. AI_PRIVACY_STRICT=true refuses instead, which is
   * where this belongs once a privacy-safe provider actually works — and the
   * warning below is what says it does not yet.
   */
  const strict = env("AI_PRIVACY_STRICT") === "true";
  let usable = list;
  if (isPrivate) {
    if (safe.length) usable = strict ? safe : [...safe, ...list.filter((p) => p.trainsOnContent)];
    else if (strict) {
      throw new Error(
        "No privacy-safe AI provider is configured, and AI_PRIVACY_STRICT is on. " +
        "Set a working GROQ_API_KEY or ANTHROPIC_API_KEY, or GEMINI_PAID_TIER=true " +
        "if the Gemini key is on a paid billing account."
      );
    }
  }

  /*
   * Skip a provider that cannot physically accept this prompt.
   *
   * Groq's on-demand tier caps a single request at 8,000 tokens for the two
   * strong models. A chart prompt sits right on that line, so both answered
   * 413 "Request too large" and the chat fell all the way through to the
   * smallest model — which replied with generic advice and none of the chart.
   * Two wasted round-trips, several seconds of latency, and a worse answer.
   *
   * The ceiling is learned from the provider's own rate-limit headers (recorded
   * on every response, success or failure), so nothing is hard-coded and a tier
   * upgrade takes effect by itself. A provider that has never reported one is
   * assumed to fit — guessing it does not is how you skip the good model.
   */
  const estTokens = Math.ceil(prompt.length / 3.5) + (opts.maxTokens ?? 1200);
  const fits = (p: Provider) => {
    const cap = Number(stat(p.name).rateLimit?.["x-ratelimit-limit-tokens"] ?? 0);
    if (p.maxContext && estTokens > p.maxContext) return false;
    return !cap || estTokens <= cap;
  };
  const sized = usable.filter(fits);
  // Never empty the list: a prompt too big for everything must still be TRIED
  // and fail with a real error, not silently find nobody to send it to.
  if (sized.length && sized.length < usable.length) {
    const skipped = usable.filter((p) => !fits(p)).map((p) => p.name);
    console.log(`[llm] ~${estTokens} tokens — too large for ${skipped.join(", ")}; skipped`);
    usable = sized;
  }

  /*
   * Walk the chain — but a rate limit that clears in a few seconds is waited
   * out, not treated as the provider being down.
   *
   * Picking the next provider:
   *   • The next one in order is ready → use it, unless it is a WEAK model and
   *     a strong one ahead of it (same privacy class) will be ready within the
   *     wait budget; then wait for the strong one.
   *   • It is cooling down → prefer a READY strong provider of the same privacy
   *     class further down (another Groq model has its own bucket); else wait
   *     if it fits the budget; else skip it for this reply.
   * A private prompt is therefore never sent to a training provider just
   * because a safe one needed three seconds.
   */
  const begun = Date.now();
  const rank = new Map(usable.map((p, i) => [p, i]));
  const queue = [...usable];
  const skipped: Provider[] = [];
  const retried = new Set<Provider>();
  let lastErr: any;
  let attempt = 0;
  if (opts.strong) {
    // Weak models to the back, privacy class preserved.
    const cls = (p: Provider) => (p.trainsOnContent ? 1 : 0);
    queue.sort((a, b) => cls(a) - cls(b) || Number(WEAK.test(a.name)) - Number(WEAK.test(b.name)) || rank.get(a)! - rank.get(b)!);
    queue.forEach((p, i) => rank.set(p, i));
  }
  if (opts.light) {
    // Light models first — within each privacy class, so this never moves a
    // private prompt ahead onto a provider that trains on it.
    const cls = (p: Provider) => (p.trainsOnContent ? 1 : 0);
    queue.sort((a, b) => cls(a) - cls(b) || Number(!WEAK.test(a.name)) - Number(!WEAK.test(b.name)) || rank.get(a)! - rank.get(b)!);
    queue.forEach((p, i) => rank.set(p, i));
  }
  let waited = 0;
  const budget = () => Math.min(MAX_WAIT_MS - waited, DEADLINE_MS - (Date.now() - begun) - 15_000);
  const pause = async (ms: number, why: string) => {
    const t = Math.max(0, Math.ceil(ms));
    if (!t) return;
    console.log(`[llm] waiting ${(t / 1000).toFixed(1)}s for ${why}`);
    await sleep(t);
    waited += t;
  };
  const pick = async (): Promise<Provider | undefined> => {
    while (queue.length) {
      const head = queue[0];
      const w = waitMs(head, estTokens);
      if (w === 0) {
        if (WEAK.test(head.name) && !opts.light) {
          // A strong model further down (another provider serving the same
          // model, in its own bucket) beats the weak one in front of it.
          const later = queue.find((q) => q !== head && !WEAK.test(q.name) && q.trainsOnContent === head.trainsOnContent && waitMs(q, estTokens) === 0);
          if (later) {
            queue.splice(queue.indexOf(later), 1);
            return later;
          }
          const strong = queue
            .filter((q) => q !== head && !WEAK.test(q.name) && q.trainsOnContent === head.trainsOnContent && rank.get(q)! < rank.get(head)!)
            .map((q) => ({ q, w: waitMs(q, estTokens) }))
            .filter((x) => x.w <= budget())
            .sort((a, b) => a.w - b.w)[0];
          if (strong) {
            await pause(strong.w, strong.q.name);
            queue.splice(queue.indexOf(strong.q), 1);
            return strong.q;
          }
        }
        return queue.shift();
      }
      const readyPeer = queue.find((q) => q !== head && !WEAK.test(q.name) && q.trainsOnContent === head.trainsOnContent && waitMs(q, estTokens) === 0);
      if (readyPeer) {
        queue.splice(queue.indexOf(readyPeer), 1);
        return readyPeer;
      }
      if (w <= budget()) {
        await pause(w, head.name);
        return queue.shift();
      }
      skipped.push(queue.shift()!);
      console.log(`[llm] ${head.name} rate-limited for ${(w / 1000).toFixed(0)}s — skipped for this reply`);
    }
    // Every provider was skipped as cooling and none was tried: try the best
    // of them anyway, rather than fail a reply on a guess about a rate limiter.
    return attempt === 0 ? skipped.shift() : undefined;
  };

  for (let p = await pick(); p; p = await pick()) {
    attempt++;
    const s = stat(p.name);
    s.requests++;
    s.lastUsedAt = new Date().toISOString();
    const started = Date.now();
    const left = DEADLINE_MS - (started - begun);
    if (left < 4000) {
      console.warn(`[llm] out of time after ${attempt - 1} attempt(s) — not trying ${p.name}`);
      break;
    }
    const ac = new AbortController();
    const limit = Math.min(left, (opts.maxTokens ?? 0) > 2000 ? CALL_TIMEOUT_LONG_MS : CALL_TIMEOUT_MS);
    const timer = setTimeout(() => ac.abort(), limit);
    try {
      /*
       * Every call has a time limit. A provider that retries internally — the
       * Gemini SDK does, through a run of 503s — once held a single chat for
       * 132 seconds. The server is killed at 60, so the person got an error
       * after a two-minute wait, from a question another model would have
       * answered in three.
       */
      const out = await Promise.race([
        p.generate(prompt, { ...opts, signal: ac.signal }),
        new Promise<never>((_, rej) => ac.signal.addEventListener("abort", () => rej(new Error(`timeout after ${Math.round(limit / 1000)}s`)))),
      ]).finally(() => clearTimeout(timer));
      if (out && out.trim()) {
        s.success++;
        s.lastStatus = "ok";
        s.lastError = undefined;
        recordCall(p, prompt, out, Date.now() - started, attempt, true, opts.purpose);
        if (lastErr) console.log(`[llm] recovered via ${p.name}`);
        return out;
      }
      recordCall(p, prompt, "", Date.now() - started, attempt, false, opts.purpose);
      s.failures++;
      s.lastStatus = "error";
      s.lastError = "empty output";
      lastErr = new Error(`${p.name} returned empty output`);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      recordCall(p, prompt, "", Date.now() - started, attempt, false, opts.purpose);
      s.failures++;
      if (/429|quota|rate.?limit|exhaust/i.test(msg)) {
        s.quotaHits++;
        s.lastStatus = "quota";
        const after = Number(e?.retryAfterMs) || 0;
        if (after > 0) {
          s.coolUntil = Date.now() + after;
          // One more go at the same model when the wait is short — the next
          // pick() waits only if nothing as good is ready sooner.
          if (!retried.has(p) && after <= budget()) {
            retried.add(p);
            const at = queue.findIndex((q) => rank.get(q)! > rank.get(p!)!);
            queue.splice(at === -1 ? queue.length : at, 0, p);
          }
        } else {
          s.coolUntil = Date.now() + 60_000;
        }
      } else {
        s.lastStatus = "error";
        /*
         * Errors that will say the same thing next time are not re-asked on
         * every message: a retired model (404 "no longer available"), an
         * account that cannot pay (403), a model "experiencing high demand"
         * (503) or one that just timed out. Each of these cost a round-trip on
         * every chat, in front of the provider that was actually going to answer.
         */
        if (/\b404\b|no longer available|not found/i.test(msg)) s.coolUntil = Date.now() + 6 * 3600_000;
        else if (/\b(401|402|403)\b|payment|permission|denied|insufficient|credit/i.test(msg)) {
          // A billing wall does not clear on its own. Cerebras answers 402 when
          // a key belongs to a personal account with no active credits, and it
          // answered it for every request until this stopped asking.
          s.coolUntil = Date.now() + 6 * 3600_000;
        }
        else if (/\b503\b|high demand|overloaded|unavailable/i.test(msg)) s.coolUntil = Date.now() + 30_000;
        else if (/timeout after/i.test(msg)) s.coolUntil = Date.now() + 60_000;
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
