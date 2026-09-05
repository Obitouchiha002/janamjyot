/**
 * The chat doing something, instead of describing it.
 *
 * "Meri kundli match kar do" used to get an answer explaining that matching
 * exists and where to find it — which means the person has to leave the
 * conversation, find a screen, and re-enter details they were already talking
 * about. Most people just don't. The work happens here now: the other person's
 * details open inside the thread, the real matching runs, and the score comes
 * back as the next message.
 *
 * Only the model decides that a task was asked for; this only knows how to
 * carry one out. The set is fixed on the server, so a model cannot invent an
 * action the app has no way to perform.
 *
 * Everything paid still goes through the same authorise-then-settle path as the
 * rest of the app — a matching started from chat costs exactly what a matching
 * costs, and a failure still costs nothing.
 */
import { useEffect, useRef, useState } from "react";
import { HeartHandshake, Sparkles, ChevronRight, X } from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";
import { haptic } from "@/lib/native";
import { getLang } from "@/lib/prefs";

type Lang = "en" | "hi" | "hinglish";
type Tri = { en: string; hi: string; hinglish: string };
const t = (x: Tri, l: Lang) => x[l] ?? x.en;

const L = {
  matchTitle: { en: "Match a kundli", hi: "कुंडली मिलान", hinglish: "Kundli milan" },
  matchHint: {
    en: "Their birth details — yours are already here.",
    hi: "उनकी जन्म जानकारी — आपकी पहले से मौजूद है।",
    hinglish: "Unki janam details — aapki pehle se maujood hai.",
  },
  name: { en: "Their name", hi: "उनका नाम", hinglish: "Unka naam" },
  dob: { en: "Date of birth", hi: "जन्म तिथि", hinglish: "Janam tithi" },
  tob: { en: "Time of birth", hi: "जन्म समय", hinglish: "Janam samay" },
  place: { en: "Place of birth", hi: "जन्म स्थान", hinglish: "Janam sthan" },
  run: { en: "Match now", hi: "मिलान करें", hinglish: "Milan karein" },
  running: { en: "Matching…", hi: "मिलान हो रहा है…", hinglish: "Milan ho raha hai…" },
  pickPlace: { en: "Pick the birth place from the list.", hi: "सूची में से जन्म स्थान चुनें।", hinglish: "List me se janam sthan chunein." },
  gunas: { en: "gunas", hi: "गुण", hinglish: "gunas" },
  full: { en: "Full report", hi: "पूरी रिपोर्ट", hinglish: "Poori report" },
  open: { en: "Open", hi: "खोलें", hinglish: "Kholein" },
} satisfies Record<string, Tri>;

/** What each non-form action offers, and where it goes. */
const SIMPLE: Record<string, { label: Tri; to: (c: string) => string }> = {
  life_report: { label: { en: "Open my full life report", hi: "मेरी पूरी लाइफ रिपोर्ट खोलें", hinglish: "Meri poori life report kholein" }, to: (c) => `/report/${c}` },
  timeline:    { label: { en: "See my next years",        hi: "मेरे आने वाले साल देखें",     hinglish: "Mere aane wale saal dekhein" }, to: (c) => `/timeline/${c}` },
  career:      { label: { en: "Open my career report",    hi: "मेरी करियर रिपोर्ट खोलें",    hinglish: "Meri career report kholein" }, to: (c) => `/reports/${c}/career` },
  wealth:      { label: { en: "Open my wealth report",    hi: "मेरी धन रिपोर्ट खोलें",       hinglish: "Meri wealth report kholein" }, to: (c) => `/reports/${c}/wealth` },
  marriage:    { label: { en: "Open my marriage report",  hi: "मेरी विवाह रिपोर्ट खोलें",    hinglish: "Meri marriage report kholein" }, to: (c) => `/reports/${c}/marriage` },
};

export default function ChatAction({ action, chartId }: { action: string; chartId: string }) {
  const lang = getLang() as Lang;
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const simple = SIMPLE[action];
  if (simple) {
    return (
      <Pressable
        to={simple.to(chartId)}
        feedback="medium"
        className="mt-2.5 flex w-full items-center gap-2.5 rounded-xl border border-accent/35 bg-accent/8 px-3.5 py-3 text-left"
      >
        <Sparkles className="h-[17px] w-[17px] shrink-0 text-accent" />
        <span className="min-w-0 flex-1 text-[13px] font-bold text-accent">{t(simple.label, lang)}</span>
        <ChevronRight className="h-[16px] w-[16px] shrink-0 text-accent/70" />
      </Pressable>
    );
  }

  if (action === "match") return <MatchCard chartId={chartId} lang={lang} onClose={() => setDismissed(true)} />;
  return null;
}

interface Place { label: string; latitude: number; longitude: number; timezone: string }

function MatchCard({ chartId, lang, onClose }: { chartId: string; lang: Lang; onClose: () => void }) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [tob, setTob] = useState("");
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<Place[]>([]);
  const [picked, setPicked] = useState<Place | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<any>(null);
  const timer = useRef<any>(null);

  // Same debounced lookup the standalone form uses, so a place typed here
  // resolves to exactly the same coordinates.
  useEffect(() => {
    if (q.length < 2 || (picked && q === picked.label)) { setOpts([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch(`/api/places?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setOpts(Array.isArray(d) ? d.slice(0, 5) : []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q, picked]);

  const run = () => {
    if (busy) return;
    if (!name.trim() || !dob || !tob) { setErr(t(L.pickPlace, lang)); return; }
    if (!picked) { setErr(t(L.pickPlace, lang)); return; }
    setErr(""); setBusy(true); haptic.tap();

    // `self: chartId` lets the server use the person's own saved chart as one
    // side, so they never retype details the app already holds.
    fetch("/api/match/from-chart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chartId,
        other: {
          name: name.trim(), date_of_birth: dob, time_of_birth: tob,
          place_of_birth: picked.label, latitude: picked.latitude,
          longitude: picked.longitude, timezone: picked.timezone,
        },
        language: lang,
      }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { setErr(d.error || "Match nahi ho paya."); return; }
        setResult(d);
        haptic.success();
        window.dispatchEvent(new Event("jj:credits"));
      })
      .catch(() => setErr("Network error."))
      .finally(() => setBusy(false));
  };

  if (result) {
    const pct = result.percent ?? 0;
    const tint = pct >= 60 ? "#22C55E" : pct >= 45 ? "#E8B44A" : "#F87171";
    return (
      <div className="mt-2.5 rounded-xl border border-border bg-muted/50 p-3.5">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-[15px] font-black"
                style={{ background: `${tint}22`, color: tint }}>
            {result.total}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold">
              {result.total}/{result.max} {t(L.gunas, lang)} · {pct}%
            </p>
            {result.verdict && (
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{result.verdict}</p>
            )}
          </div>
        </div>
        {result.summary && (
          <p className="mt-2.5 whitespace-pre-wrap border-t border-border/70 pt-2.5 text-[12.5px] leading-relaxed">
            {result.summary}
          </p>
        )}
        <Pressable to="/match" className="mt-2.5 flex items-center gap-1 text-[12px] font-bold text-accent">
          {t(L.full, lang)} <ChevronRight className="h-[14px] w-[14px]" />
        </Pressable>
      </div>
    );
  }

  const field = "w-full rounded-lg border border-input bg-card px-3 py-2 text-[13.5px] outline-none focus:border-accent";
  return (
    <div className="mt-2.5 rounded-xl border border-accent/30 bg-accent/[0.06] p-3.5" style={{ overflow: "visible" }}>
      <div className="mb-2.5 flex items-center gap-2">
        <HeartHandshake className="h-[17px] w-[17px] shrink-0 text-accent" />
        <span className="flex-1 text-[13px] font-bold text-accent">{t(L.matchTitle, lang)}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground">
          <X className="h-[15px] w-[15px]" />
        </button>
      </div>
      <p className="mb-2.5 text-[11.5px] text-muted-foreground">{t(L.matchHint, lang)}</p>

      <div className="space-y-2">
        <input className={field} placeholder={t(L.name, lang)} value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <input className={field} type="date" aria-label={t(L.dob, lang)} value={dob} onChange={(e) => setDob(e.target.value)} />
          <input className={field} type="time" aria-label={t(L.tob, lang)} value={tob} onChange={(e) => setTob(e.target.value)} />
        </div>
        <div className="relative">
          <input
            className={field}
            placeholder={t(L.place, lang)}
            value={q}
            onChange={(e) => { setQ(e.target.value); setPicked(null); }}
          />
          {!!opts.length && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
              {opts.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => { setPicked(o); setQ(o.label); setOpts([]); }}
                  className="block w-full px-3 py-2 text-left text-[12.5px] hover:bg-muted"
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {err && <p className="mt-2 text-[12px] text-destructive">{err}</p>}

      <Pressable
        onClick={run}
        disabled={busy}
        feedback="medium"
        className="mt-2.5 w-full rounded-lg bg-accent py-2.5 text-center text-[13.5px] font-bold text-accent-foreground disabled:opacity-50"
      >
        {busy ? t(L.running, lang) : t(L.run, lang)}
      </Pressable>
    </div>
  );
}
