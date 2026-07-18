/**
 * Text-to-speech controller (singleton).
 *
 * Speaks text through the backend Gemini-TTS endpoint (POST /api/tts), which
 * picks the right voice from the `context` we send:
 *   • context "main"  → the main-app voice   (server: GEMINI_TTS_VOICE_MAIN)
 *   • context "chat"  → the astrologer voice  (server: GEMINI_TTS_VOICE_CHAT)
 * The API key lives ONLY on the server — the app never sees it.
 *
 * Long text is split into short sentence chunks that are fetched and played one
 * after another (with the next chunk pre-fetched while the current one plays),
 * so playback starts fast and pauses naturally between sentences. If the server
 * has no TTS key configured, we fall back to the browser's built-in voice.
 *
 * Only ONE thing speaks at a time: starting a new `speak()` stops the previous
 * audio. Supports play / pause / resume / stop.
 */

export type TtsState = "idle" | "loading" | "playing" | "paused";
type Sub = (activeId: string | null, state: TtsState) => void;

// app language → BCP-47 locale (used only for the browser fallback voice)
const LANG: Record<string, string> = {
  en: "en-IN", hinglish: "hi-IN", hi: "hi-IN", ta: "ta-IN", te: "te-IN",
  mr: "mr-IN", bn: "bn-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN", ur: "ur-IN",
};

const MAX_CHUNK = 180; // characters per spoken chunk

function toChunks(text: string): string[] {
  const clean = text.replace(/\*\*/g, "").replace(/^[•\-*]\s+/gm, "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  // keep sentence-ending punctuation so pauses land naturally
  const parts = clean.match(/[^.!?।]+[.!?।]*\s*/g) || [clean];
  const chunks: string[] = [];
  let buf = "";
  for (const p of parts) {
    if (buf && (buf + p).length > MAX_CHUNK) { chunks.push(buf.trim()); buf = p; }
    else buf += p;
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

// ── singleton state ─────────────────────────────────────────────────────────
const subs = new Set<Sub>();
let activeId: string | null = null;
let state: TtsState = "idle";

let token = 0;                        // bumps on every stop/new-speak to cancel stale async work
let audio: HTMLAudioElement | null = null;
let chunks: string[] = [];
let ctx: "main" | "chat" = "main";
let langCode = "en";                  // raw app language ("hi" | "en" | "hinglish" | …) — guides Gemini pronunciation
let langLocale = "en-IN";             // BCP-47 locale for the browser fallback voice
let browserMode = false;
let urls: string[] = [];             // object URLs to revoke
let prefetch: Record<number, Promise<string | null>> = {};

function set(s: TtsState) { state = s; subs.forEach((fn) => fn(activeId, state)); }

export function subscribe(fn: Sub): () => void {
  subs.add(fn);
  fn(activeId, state);
  return () => { subs.delete(fn); };
}

async function getChunkUrl(i: number): Promise<string | null> {
  if (i < 0 || i >= chunks.length) return null;
  if (!prefetch[i]) {
    prefetch[i] = (async () => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunks[i], context: ctx, lang: langCode }),
        });
        const c = res.headers.get("content-type") || "";
        if (res.ok && c.includes("audio")) {
          const url = URL.createObjectURL(await res.blob());
          urls.push(url);
          return url;
        }
      } catch { /* fall through */ }
      return null; // not configured / error → caller uses browser voice
    })();
  }
  return prefetch[i];
}

async function playIndex(i: number, myToken: number) {
  if (myToken !== token) return;
  if (i >= chunks.length) { finishIfCurrent(myToken); return; }

  const url = await getChunkUrl(i);
  if (myToken !== token) return;

  if (url === null) { browserFallback(i, myToken); return; } // server TTS unavailable

  getChunkUrl(i + 1); // warm the next chunk while this one plays

  const a = new Audio(url);
  audio = a;
  a.onended = () => { if (myToken === token) playIndex(i + 1, myToken); };
  a.onerror = () => { if (myToken === token) playIndex(i + 1, myToken); };
  set("playing");
  try { await a.play(); } catch { /* autoplay guard */ }
}

function browserFallback(fromIdx: number, myToken: number) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  if (!synth) { finishIfCurrent(myToken); return; }
  browserMode = true;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(chunks.slice(fromIdx).join(" "));
  u.lang = langLocale;
  u.rate = 0.98;
  u.onend = () => { if (myToken === token) finishIfCurrent(myToken); };
  u.onerror = () => { if (myToken === token) finishIfCurrent(myToken); };
  set("playing");
  synth.speak(u);
}

function finishIfCurrent(myToken: number) {
  if (myToken !== token) return;
  cleanup();
  activeId = null;
  set("idle");
}

function cleanup() {
  try { audio?.pause(); } catch { /* noop */ }
  audio = null;
  try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
  urls.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* noop */ } });
  urls = [];
  prefetch = {};
  chunks = [];
  browserMode = false;
}

/** Stop everything and reset to idle. */
export function stop() {
  token++;
  cleanup();
  if (activeId !== null || state !== "idle") { activeId = null; set("idle"); }
}

export function pause() {
  if (state !== "playing") return;
  if (browserMode) { try { window.speechSynthesis?.pause(); } catch { /* noop */ } }
  else { try { audio?.pause(); } catch { /* noop */ } }
  set("paused");
}

export function resume() {
  if (state !== "paused") return;
  if (browserMode) { try { window.speechSynthesis?.resume(); } catch { /* noop */ } }
  else { try { audio?.play(); } catch { /* noop */ } }
  set("playing");
}

/** Start speaking `text`. Stops any current playback first. */
export function speak(id: string, text: string, opts?: { context?: "main" | "chat"; lang?: string }) {
  stop();                       // stop old audio, bumps token
  const myToken = token;        // this session's token
  chunks = toChunks(text);
  if (!chunks.length) return;
  ctx = opts?.context === "chat" ? "chat" : "main";
  langCode = (opts?.lang || "en").toLowerCase();
  langLocale = LANG[langCode] || "en-IN";
  activeId = id;
  set("loading");
  playIndex(0, myToken);
}

/**
 * One-tap control for a Speak button:
 *   idle/other  → start speaking this text
 *   playing     → pause
 *   paused      → resume
 *   loading     → cancel
 */
export function toggle(id: string, text: string, opts?: { context?: "main" | "chat"; lang?: string }) {
  if (activeId === id) {
    if (state === "playing") return pause();
    if (state === "paused") return resume();
    if (state === "loading") return stop();
  }
  speak(id, text, opts);
}
