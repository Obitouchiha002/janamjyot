/**
 * Rate-limit check for the AI failover.
 *
 *   npm run check:rate-limit
 *
 * WHY
 *   On the free Groq tier each model allows 8,000 tokens a minute and one chat
 *   is several thousand. A 429 there means "try again in a few seconds", but it
 *   was treated as the model being down — so a second person chatting in the
 *   same minute was dropped to the smallest model, whose answers slid into
 *   English and got placements wrong.
 *
 * WHAT THIS PROVES (with a stubbed Groq, no network)
 *   • a 429 on the first model goes straight to another strong model, no wait
 *   • when every strong model is briefly limited, the reply WAITS and retries a
 *     strong one instead of using the weak model
 *   • a long limit is not waited out — the weak model answers at once
 *   • a bucket already known to be too empty is skipped without a request
 *   • a hung provider is abandoned at its call time limit
 *   • a retired (404) model is not re-asked on every message
 *   • a strong model later in the chain (e.g. Cerebras) beats a weak one ahead
 */
process.env.AI_PROVIDER_ORDER = "groq";
process.env.GROQ_API_KEY = "test-key";
process.env.AI_WEAK_MODELS = "weak";
process.env.AI_MAX_WAIT_MS = "6000";
process.env.AI_CALL_TIMEOUT_MS = "1500";
delete process.env.GEMINI_API_KEY;
delete process.env.OLLAMA_MODEL;
delete process.env.OLLAMA_BASE_URL;

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) {
    console.error(`FAIL  ${name}${detail ? " — " + detail : ""}`);
    failures++;
  }
};

type Reply = { status: number; retryAfter?: string; remaining?: number; limit?: number; hang?: boolean; body?: string };
let script: Record<string, Reply[]> = {};
let calls: string[] = [];

(globalThis as any).fetch = async (_url: string, init: any) => {
  const model = JSON.parse(init.body).model as string;
  calls.push(model);
  const r = script[model]?.shift() ?? { status: 200 };
  if (r.hang) {
    return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
  }
  const headers = new Headers();
  if (r.retryAfter) headers.set("retry-after", r.retryAfter);
  if (r.limit) headers.set("x-ratelimit-limit-tokens", String(r.limit));
  if (r.remaining !== undefined) headers.set("x-ratelimit-remaining-tokens", String(r.remaining));
  const body = r.status === 200
    ? JSON.stringify({ choices: [{ message: { content: `answer from ${model}` } }] })
    : r.body ?? JSON.stringify({ error: { message: "Rate limit reached" } });
  return new Response(body, { status: r.status, headers });
};

(async () => {
  const { llmGenerate, setKeyOverrides, parseDurationMs } = await import("../llm");
  let n = 0;
  const models = () => {
    n++;
    const m = { a: `strong-a${n}`, b: `strong-b${n}`, w: `weak-${n}` };
    setKeyOverrides({ GROQ_MODELS: `${m.a},${m.b},${m.w}` });
    calls = [];
    return m;
  };
  const timed = async (prompt = "hello") => {
    const t0 = Date.now();
    const out = await llmGenerate(prompt, { maxTokens: 100 });
    return { out, ms: Date.now() - t0 };
  };

  check("durations parse", parseDurationMs("7.66s") === 7660 && parseDurationMs("2m59.5s") === 179500 && parseDurationMs("12") === 12000 && parseDurationMs("450ms") === 450);

  // 1. first model limited, second ready → second, no wait
  let m = models();
  script = { [m.a]: [{ status: 429, retryAfter: "2" }] };
  let r = await timed();
  check("429 on one strong model uses the other strong model", r.out === `answer from ${m.b}`, r.out);
  check("…without waiting", r.ms < 1000, `${r.ms}ms`);

  // 2. both strong briefly limited → wait and retry a strong one, never the weak
  m = models();
  script = { [m.a]: [{ status: 429, retryAfter: "1.2" }], [m.b]: [{ status: 429, retryAfter: "1.2" }] };
  r = await timed();
  check("short limits on every strong model are waited out", r.out === `answer from ${m.a}` || r.out === `answer from ${m.b}`, `${r.out} (calls: ${calls.join(" → ")})`);
  check("…and the weak model is never called", !calls.includes(m.w), calls.join(" → "));
  check("…after roughly the stated wait", r.ms >= 1000 && r.ms < 4000, `${r.ms}ms`);

  // 3. long limits → weak model at once
  m = models();
  script = { [m.a]: [{ status: 429, retryAfter: "40" }], [m.b]: [{ status: 429, retryAfter: "40" }] };
  r = await timed();
  check("a long limit is not waited out — the weak model answers", r.out === `answer from ${m.w}`, r.out);
  check("…immediately", r.ms < 1000, `${r.ms}ms`);

  // 3b. and the next reply on this instance does not knock on the limited ones
  calls = [];
  r = await timed();
  check("a model known to be limited is not asked again", r.out === `answer from ${m.w}` && calls.length === 1, calls.join(" → "));

  // 4. a bucket reported nearly empty is skipped without a request
  m = models();
  script = { [m.a]: [{ status: 200, limit: 8000, remaining: 50 }] };
  await timed();
  calls = [];
  r = await timed("x".repeat(14000)); // ~5,000 tokens
  check("an empty bucket is skipped without a wasted request", r.out === `answer from ${m.b}` && calls[0] === m.b, calls.join(" → "));

  // 5. a provider that hangs is abandoned at its time limit
  m = models();
  script = { [m.a]: [{ status: 200, hang: true }] };
  r = await timed();
  check("a hung provider is abandoned for the next one", r.out === `answer from ${m.b}`, r.out);
  check("…at the call time limit, not the server's", r.ms >= 1400 && r.ms < 3000, `${r.ms}ms`);

  // 6. a retired model is not asked again on the next message
  m = models();
  script = { [m.a]: [{ status: 404, body: "model is no longer available" }] };
  await timed();
  calls = [];
  r = await timed();
  check("a retired (404) model is not re-asked on every message", calls[0] === m.b, calls.join(" → "));

  // 7. a strong model served by a later provider beats a weak one in front of it
  n++;
  setKeyOverrides({ GROQ_MODELS: `strong-x${n},weak-x${n},strong-y${n}` });
  calls = [];
  script = { [`strong-x${n}`]: [{ status: 429, retryAfter: "40" }] };
  r = await timed();
  check("a ready strong model later in the chain is used before the weak one", r.out === `answer from strong-y${n}`, calls.join(" → "));

  if (failures) {
    console.error(`\n${failures} failure(s).`);
    process.exit(1);
  }
  console.log(
    "PASS — a 429 moves to another strong model, short limits are waited out " +
    "instead of dropping to the weak model, long ones are not, and a known-empty " +
    "bucket is skipped without a request; hung and retired models are left behind.",
  );
  process.exit(0);
})();
