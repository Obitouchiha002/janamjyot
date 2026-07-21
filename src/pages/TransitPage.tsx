import { useEffect, useRef, useState, useCallback } from "react";
import { getLang } from "@/lib/prefs";
import { useParams } from "react-router-dom";
import { RefreshCw, Sparkles, Globe2, Bot, Send } from "lucide-react";
import AnswerText from "@/components/AnswerText";
import SpeakButton from "@/components/SpeakButton";
import { Pressable } from "@/components/mobile/Pressable";
import { haptic } from "@/lib/native";
import { useVisibleInterval } from "@/lib/useVisibleInterval";

interface TPlanet {
  planet: string;
  sign: string;
  sign_index: number;
  longitude: number;
  full_degree: number;
  dms: string;
  sign_lord: string;
  degree: number;
  nakshatra: string;
  pada: number;
  nak_lord: string;
  sub_lord: string;
  latitude: number;
  shara: string;
  speed: number;
  ra: number;
  dec: number;
  retrograde: boolean;
  house_from_lagna: number | null;
  house_from_moon: number | null;
}
interface TData {
  datetime: string;
  natal: { lagna: string; moon: string };
  planets: TPlanet[];
  highlights: string[];
}

const PLANET_GLYPH: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Rahu: "☊", Ketu: "☋",
};
// Brighter palette used on the dark "sky" wheel so the planets glow and pop.
const SKY_COLOR: Record<string, string> = {
  Sun: "#fbbf24", Moon: "#e2e8f0", Mercury: "#34d399", Venus: "#f472b6",
  Mars: "#f87171", Jupiter: "#fcd34d", Saturn: "#818cf8", Rahu: "#94a3b8", Ketu: "#a78bfa",
};
const SIGN_ABBR = ["Ar", "Ta", "Ge", "Cn", "Le", "Vi", "Li", "Sc", "Sg", "Cp", "Aq", "Pi"];

// Signed number for display, e.g. +13.95 / -0.06
const sgn = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);

const LANGS: Array<[string, string]> = [
  ["en", "English"], ["hinglish", "Hinglish"], ["hi", "हिंदी"], ["ta", "தமிழ்"],
  ["te", "తెలుగు"], ["mr", "मराठी"], ["bn", "বাংলা"], ["gu", "ગુજરાતી"],
  ["kn", "ಕನ್ನಡ"], ["ml", "മലയാളം"], ["pa", "ਪੰਜਾਬੀ"], ["ur", "اردو"],
];

const TRANSIT_QUESTIONS = [
  "How is my current period going?",
  "How are these live transits affecting me?",
  "What is Shani (Saturn) influencing right now?",
  "How will the next few months be?",
  "Is a good opportunity coming up now?",
];

// ---- Live sky orrery -----------------------------------------------------
// Geocentric orbit order, inner → outer (Moon closest, then the planets, with the
// shadow nodes Rahu/Ketu on the outermost ring opposite each other).
const ORBIT: Record<string, number> = {
  Moon: 50, Mercury: 64, Venus: 78, Sun: 92, Mars: 106, Jupiter: 119, Saturn: 132, Rahu: 145, Ketu: 145,
};
// Relative visual sizes (Sun/Jupiter biggest, Mercury smallest).
const PSIZE: Record<string, number> = {
  Sun: 11, Moon: 8.5, Mercury: 5.5, Venus: 7, Mars: 6.5, Jupiter: 9.5, Saturn: 8.5, Rahu: 6, Ketu: 6,
};
const SHADOW = new Set(["Rahu", "Ketu"]);

// A fixed star field (generated once) so the sky doesn't re-shuffle on every render.
const STARS = Array.from({ length: 80 }, (_, i) => {
  const ang = (i * 137.5) * (Math.PI / 180); // golden-angle spread = natural scatter
  const rad = Math.sqrt((i + 0.5) / 80) * 166;
  return {
    x: 180 + rad * Math.cos(ang),
    y: 180 + rad * Math.sin(ang),
    r: 0.3 + ((i * 7) % 10) / 10,
    dur: (2 + ((i * 13) % 30) / 10).toFixed(2),
    delay: (((i * 17) % 40) / 10).toFixed(2),
  };
});

function ZodiacWheel({ planets }: { planets: TPlanet[] }) {
  const cx = 180, cy = 180;
  const pos = (lon: number, r: number) => {
    const a = (lon * Math.PI) / 180;
    return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
  };
  const orbitRadii = [...new Set(Object.values(ORBIT))];

  return (
    <div className="relative flex items-center justify-center">
      <svg viewBox="0 0 360 360" className="w-full max-w-[380px]" style={{ filter: "drop-shadow(0 8px 24px rgba(15,23,42,0.35))" }}>
        <defs>
          {/* deep-space background */}
          <radialGradient id="space" cx="50%" cy="42%" r="62%">
            <stop offset="0%" stopColor="#1b2a4a" />
            <stop offset="55%" stopColor="#0f1b35" />
            <stop offset="100%" stopColor="#070d1d" />
          </radialGradient>
          {/* radar sweep wedge */}
          <radialGradient id="sweep" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0" />
          </radialGradient>
          {/* glow filter for the planets */}
          <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* a soft 3D sphere gradient per planet */}
          {Object.entries(SKY_COLOR).map(([name, color]) => (
            <radialGradient key={name} id={`sph-${name}`} cx="34%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="38%" stopColor={color} />
              <stop offset="100%" stopColor={color} stopOpacity={SHADOW.has(name) ? 0.35 : 0.85} />
            </radialGradient>
          ))}
        </defs>

        {/* sky */}
        <circle cx={cx} cy={cy} r={172} fill="url(#space)" />

        {/* stars */}
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#dbeafe"
            style={{ animation: `va-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite` }} />
        ))}

        {/* rotating radar sweep — makes the sky feel alive */}
        <g style={{ transformOrigin: "180px 180px", animation: "va-spin 14s linear infinite" }}>
          <path d={`M ${cx} ${cy} L ${cx} ${cy - 168} A 168 168 0 0 1 ${cx + 168 * Math.sin(0.7)} ${cy - 168 * Math.cos(0.7)} Z`}
            fill="url(#sweep)" />
        </g>

        {/* faint orbit rings */}
        {orbitRadii.map((r) => (
          <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="#9fb6e0" strokeOpacity="0.12" strokeWidth="1" />
        ))}

        {/* zodiac sign ring */}
        <circle cx={cx} cy={cy} r={160} fill="none" stroke="#1e3a5f" strokeOpacity="0.55" strokeWidth="20" />
        {Array.from({ length: 12 }).map((_, i) => {
          const out = pos(i * 30, 170);
          const inn = pos(i * 30, 150);
          const label = pos(i * 30 + 15, 160);
          return (
            <g key={i}>
              <line x1={inn.x} y1={inn.y} x2={out.x} y2={out.y} stroke="#3b5a86" strokeOpacity="0.5" strokeWidth="1" />
              <text x={label.x} y={label.y + 3} textAnchor="middle" fontSize="9" fontWeight="700"
                fill="#fcd34d" fillOpacity="0.85" style={{ letterSpacing: "0.5px" }}>{SIGN_ABBR[i]}</text>
            </g>
          );
        })}

        {/* center sun-point */}
        <circle cx={cx} cy={cy} r={3.5} fill="#fde68a" filter="url(#glow)" />

        {/* planets on their orbits at the live longitude */}
        {planets.map((p, idx) => {
          const r = ORBIT[p.planet] ?? 100;
          const { x, y } = pos(p.longitude, r);
          const size = PSIZE[p.planet] ?? 7;
          const color = SKY_COLOR[p.planet] ?? "#94a3b8";
          const isSun = p.planet === "Sun";
          return (
            // outer group sweeps a full circle on open, then settles at the real spot
            <g
              key={p.planet}
              style={{
                transformOrigin: "180px 180px",
                animation: `va-orbit-in 1.8s cubic-bezier(0.22,1,0.36,1) ${(idx * 0.12).toFixed(2)}s both`,
              }}
            >
              {/* Sun corona */}
              {isSun && (
                <circle cx={x} cy={y} r={size + 7} fill={color} opacity="0.18"
                  style={{ animation: "va-pulse 3.5s ease-in-out infinite", transformOrigin: `${x}px ${y}px` }} />
              )}
              {/* retrograde halo */}
              {p.retrograde && (
                <circle cx={x} cy={y} r={size + 4} fill="none" stroke="#f87171" strokeWidth="1.5">
                  <animate attributeName="r" values={`${size + 3};${size + 7};${size + 3}`} dur="2.4s" repeatCount="indefinite" />
                  <animate attributeName="stroke-opacity" values="0.7;0.1;0.7" dur="2.4s" repeatCount="indefinite" />
                </circle>
              )}
              {/* soft glow + sphere */}
              <g style={{ animation: `va-twinkle ${(3 + (idx % 4) * 0.4).toFixed(1)}s ease-in-out ${idx * 0.2}s infinite` }}>
                <circle cx={x} cy={y} r={size + 2.5} fill={color} opacity="0.25" filter="url(#glow)" />
                <circle cx={x} cy={y} r={size} fill={`url(#sph-${p.planet})`}
                  stroke={SHADOW.has(p.planet) ? color : "#ffffff"} strokeOpacity={SHADOW.has(p.planet) ? 0.5 : 0.35}
                  strokeWidth={SHADOW.has(p.planet) ? 1 : 0.6}
                  strokeDasharray={SHADOW.has(p.planet) ? "2 2" : undefined} />
              </g>
              {/* glyph label tucked just outside the sphere */}
              <text x={x} y={y - size - 3} textAnchor="middle" fontSize="9.5" fontWeight="700"
                fill={color} style={{ paintOrder: "stroke", stroke: "#070d1d", strokeWidth: 2.5 }}>
                {PLANET_GLYPH[p.planet] ?? "•"}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** One transiting planet, as a phone-readable card instead of a wide table row. */
function PlanetCard({ p }: { p: TPlanet }) {
  const color = SKY_COLOR[p.planet] ?? "#94a3b8";
  return (
    <div className="m-card p-4">
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[18px] font-bold"
          style={{ background: `${color}22`, color }}
        >
          {PLANET_GLYPH[p.planet] ?? "•"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[15px] font-bold leading-tight">
            {p.planet}
            {p.retrograde && (
              <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold text-destructive">℞</span>
            )}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {p.sign} · {p.dms} <span className="opacity-70">({p.sign_lord})</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-[12px] font-bold text-accent" title="House from Lagna">
            {p.house_from_lagna ?? "–"}
          </span>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-[12px] font-bold" title="House from Moon">
            {p.house_from_moon ?? "–"}
          </span>
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-border pt-3.5">
        {[
          ["Nakshatra", `${p.nakshatra} · pada ${p.pada}`],
          ["Nak / Sub lord", `${p.nak_lord}, ${p.sub_lord}`],
          ["Speed °/day", sgn(p.speed)],
          ["Full°", p.full_degree?.toFixed(2)],
          ["Lat / Shara", p.shara],
          ["R.Asc / Decl", `${sgn(p.ra)} / ${sgn(p.dec)}`],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k}</p>
            <p className={`mt-0.5 truncate text-[12.5px] font-semibold ${k === "Speed °/day" && p.speed < 0 ? "text-destructive" : ""}`}>{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TransitPage() {
  const { chartId } = useParams();
  const [data, setData] = useState<TData | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const reqRef = useRef(0);

  const load = useCallback(() => {
    if (!chartId) return;
    const id = ++reqRef.current;
    setLoading(true);
    fetch(`/api/transit/${chartId}`)
      .then((r) => r.json())
      .then((d) => {
        if (id === reqRef.current && !d?.error) {
          setData(d);
          setUpdatedAt(new Date().toLocaleTimeString());
        }
      })
      .catch(() => {})
      .finally(() => { if (id === reqRef.current) setLoading(false); });
  }, [chartId]);

  // Pauses while the app is backgrounded, and refreshes on return.
  useVisibleInterval(load, 60_000);

  // ---- Transit chat (separate from Ask AI / Sectors) ----
  const [lang, setLang] = useState(getLang());
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartId) return;
    fetch(`/api/chat-history/${chartId}?context=transit`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        if (!Array.isArray(rows)) return;
        setHistory(rows.filter((r) => r.message).map((r) => ({
          role: r.role === "user" ? "user" : "ai", text: r.message,
        })));
      })
      .catch(() => {});
  }, [chartId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history, chatLoading]);

  const ask = async (rawQ: string) => {
    const q = rawQ.trim();
    if (!q || chatLoading) return;
    setHistory((p) => [...p, { role: "user", text: q }]);
    setQuestion("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartId, question: q, language: lang, context: "transit" }),
      });
      const d = await res.json();
      if (res.ok) haptic.success(); else haptic.error();
      setHistory((p) => [...p, { role: "ai", text: res.ok ? d.answer : d.error || "Could not generate an answer." }]);
    } catch {
      haptic.error();
      setHistory((p) => [...p, { role: "ai", text: "Error fetching answer." }]);
    } finally {
      setChatLoading(false);
    }
  };

  if (!data) {
    return (
      <div className="space-y-3 pt-2">
        <div className="skeleton h-[300px]" />
        <div className="skeleton h-[110px]" />
        <div className="skeleton h-[90px] opacity-60" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      <style>{`
        @keyframes va-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes va-twinkle { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes va-pulse { 0%,100% { opacity: 0.18; transform: scale(1); } 50% { opacity: 0.32; transform: scale(1.18); } }
        @keyframes va-orbit-in { 0% { transform: rotate(360deg); opacity: 0; } 30% { opacity: 1; } 100% { transform: rotate(0deg); opacity: 1; } }
      `}</style>

      {/* ── Natal context + refresh ──────────────────────────────────────── */}
      <div className="m-enter flex items-center justify-between gap-3 px-1">
        <p className="text-[12.5px] leading-snug text-muted-foreground">
          Lagna <span className="font-semibold text-foreground">{data.natal?.lagna}</span> · Moon{" "}
          <span className="font-semibold text-foreground">{data.natal.moon}</span>
          <br />
          <span className="text-[11px]">Updated {updatedAt} · auto every 60s</span>
        </p>
        <Pressable
          onClick={load}
          disabled={loading}
          aria-label="Refresh"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground"
        >
          <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} />
        </Pressable>
      </div>

      {/* ── Live sky wheel ───────────────────────────────────────────────── */}
      <section className="m-card m-enter p-4" style={{ animationDelay: '0.04s' }}>
        <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          <Globe2 className="h-4 w-4 text-accent" /> Live sky wheel
        </h3>
        <ZodiacWheel planets={data.planets} />
        <div className="mt-3 flex flex-wrap justify-center gap-x-3.5 gap-y-1.5">
          {data.planets.map((p) => (
            <span key={p.planet} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: SKY_COLOR[p.planet] ?? "#94a3b8", boxShadow: `0 0 6px ${SKY_COLOR[p.planet] ?? "#94a3b8"}` }}
              />
              {PLANET_GLYPH[p.planet]} {p.planet}
              {p.retrograde && <span className="font-bold text-destructive">℞</span>}
            </span>
          ))}
        </div>
      </section>

      {/* ── Highlights ───────────────────────────────────────────────────── */}
      {(data.highlights ?? []).length > 0 && (
        <section className="m-card m-enter p-4" style={{ animationDelay: '0.07s' }}>
          <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-4 w-4 text-accent" /> The sky right now, for you
          </h3>
          <ul className="space-y-2.5">
            {data.highlights.map((h, i) => (
              <li key={i} className="selectable flex gap-2 text-[14px] leading-relaxed">
                <span className="mt-0.5 text-accent">•</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Transiting planets ───────────────────────────────────────────── */}
      <section className="m-enter" style={{ animationDelay: '0.1s' }}>
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          Transiting planets
        </h3>
        <div className="space-y-2.5">
          {data.planets.map((p) => <PlanetCard key={p.planet} p={p} />)}
        </div>
        <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-muted-foreground">
          Round badges: first = house from Lagna, second = house from Moon. All values are live &amp; sidereal (Lahiri). ℞ = retrograde.
        </p>
      </section>

      {/* ── Transit-aware chat (its own separate conversation) ───────────── */}
      <section className="m-card m-enter p-4" style={{ animationDelay: '0.13s' }}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
            <Bot className="h-4 w-4 text-accent" /> Transit chat
          </h3>
          <select
            value={lang}
            onChange={(e) => { haptic.select(); setLang(e.target.value); }}
            aria-label="Reply language"
            className="h-9 shrink-0 rounded-full border border-border bg-card px-3 text-[12.5px] font-semibold text-muted-foreground outline-none"
          >
            {LANGS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </div>

        <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
          This chat reads your <strong className="font-semibold text-foreground">live transits</strong> together with all your charts (D1, D9, D10, D6, D11) and dashas. It is separate from Ask AI and Life Sectors.
        </p>

        {history.length === 0 && (
          <div className="mb-4 space-y-2">
            {TRANSIT_QUESTIONS.map((q) => (
              <Pressable
                key={q}
                subtle
                disabled={chatLoading}
                onClick={() => ask(q)}
                className="flex min-h-[46px] w-full items-center rounded-2xl border border-border px-3.5 py-2.5 text-left text-[13.5px] font-medium"
              >
                {q}
              </Pressable>
            ))}
          </div>
        )}

        <div className="space-y-3.5">
          {history.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "ai" && (
                <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                  <Bot className="h-[17px] w-[17px]" />
                </span>
              )}
              {msg.role === "ai" ? (
                <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-border bg-muted px-3.5 py-3">
                  <div className="mb-1 flex justify-end">
                    <SpeakButton text={msg.text} lang={lang} />
                  </div>
                  <div className="selectable text-[14px] leading-relaxed">
                    <AnswerText text={msg.text} />
                  </div>
                </div>
              ) : (
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-3 text-accent-foreground shadow-lg shadow-accent/20">
                  <p className="selectable whitespace-pre-wrap text-[14px] leading-relaxed">{msg.text}</p>
                </div>
              )}
            </div>
          ))}

          {chatLoading && (
            <div className="flex justify-start gap-2.5">
              <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                <Bot className="h-[17px] w-[17px]" />
              </span>
              <div className="flex items-center gap-2.5 rounded-2xl rounded-tl-md border border-border bg-muted px-3.5 py-3">
                <span className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
                <span className="text-[13px] text-muted-foreground">Thinking…</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); ask(question); }}
          className="mt-4 flex items-end gap-2 border-t border-border pt-3.5"
        >
          <input
            className="h-12 min-w-0 flex-1 rounded-2xl border border-input bg-card px-4 text-[15px] outline-none transition-colors focus:border-accent"
            placeholder="Ask about the current transits…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={chatLoading}
          />
          <Pressable
            onClick={() => ask(question)}
            feedback="medium"
            disabled={!question.trim() || chatLoading}
            aria-label="Send"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/25"
          >
            <Send className="h-[19px] w-[19px]" strokeWidth={2.3} />
          </Pressable>
        </form>
      </section>

      <p className="px-1 pb-2 text-center text-[11.5px] leading-relaxed text-muted-foreground">
        Houses are counted from your natal Lagna and natal Moon (Chandra Lagna). Astrology offers guidance, not certainty.
      </p>
    </div>
  );
}
