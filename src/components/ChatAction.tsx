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
import { HeartHandshake, Sparkles, ChevronRight, X, FileDown } from "lucide-react";
import { NorthIndianChart } from "@/components/NorthIndianChart";
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
const SIMPLE: Record<string, { label: Tri; to: (c: string, q: string) => string }> = {
  // "Message karun ya nahi" is not a reading, it is a decision — it goes to the
  // Faisla flow with the question already filled in, so nobody retypes it.
  decide:      { label: { en: "Work this decision out with me", hi: "यह फ़ैसला साथ में तय करें", hinglish: "Ye faisla saath mein tay karein" }, to: (_c, q) => `/decide${q ? `?q=${encodeURIComponent(q)}` : ""}` },
  life_report: { label: { en: "Open my full life report", hi: "मेरी पूरी लाइफ रिपोर्ट खोलें", hinglish: "Meri poori life report kholein" }, to: (c) => `/report/${c}` },
  timeline:    { label: { en: "See my next years",        hi: "मेरे आने वाले साल देखें",     hinglish: "Mere aane wale saal dekhein" }, to: (c) => `/timeline/${c}` },
  career:      { label: { en: "Open my career report",    hi: "मेरी करियर रिपोर्ट खोलें",    hinglish: "Meri career report kholein" }, to: (c) => `/reports/${c}/career` },
  wealth:      { label: { en: "Open my wealth report",    hi: "मेरी धन रिपोर्ट खोलें",       hinglish: "Meri wealth report kholein" }, to: (c) => `/reports/${c}/wealth` },
  marriage:    { label: { en: "Open my marriage report",  hi: "मेरी विवाह रिपोर्ट खोलें",    hinglish: "Meri marriage report kholein" }, to: (c) => `/reports/${c}/marriage` },
  // A chart holds one life. When the question is about someone else's, saying
  // so is only half an answer — this is the other half.
  add_person:  { label: { en: "Make their kundli",         hi: "उनकी कुंडली बनाएँ",           hinglish: "Unki kundli banayein" },        to: (c) => `/create-chart?return=${encodeURIComponent(`/chat/${c}`)}` },
};

export default function ChatAction({ action, chartId, question }: { action: string; chartId: string; question?: string }) {
  const lang = getLang() as Lang;
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const simple = SIMPLE[action];
  if (simple) {
    return (
      <Pressable
        to={simple.to(chartId, question ?? "")}
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
  if (action === "d1" || action === "d9") return <ChartCard chartId={chartId} which={action} lang={lang} />;
  if (action === "pdf") return <PdfCard chartId={chartId} lang={lang} />;
  return null;
}

/**
 * The chart itself, in the thread.
 *
 * Being told about a placement and seeing where it sits are different things,
 * and sending someone to another screen to look breaks the conversation they
 * were having. Drawn with the same component the chart screens use, from the
 * same endpoint, so it cannot disagree with them.
 */
function ChartCard({ chartId, which, lang }: { chartId: string; which: "d1" | "d9"; lang: Lang }) {
  const [data, setData] = useState<any>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/chart/${chartId}/${which}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d && !d.error ? setData(d) : setFailed(true)))
      .catch(() => setFailed(true));
  }, [chartId, which]);

  if (failed) return null;
  if (!data) return <div className="skeleton mt-2.5 aspect-square w-full rounded-xl" />;

  const planets = (data.planets ?? []).map((p: any) => ({ ...p, short: String(p.planet).substring(0, 2) }));
  const title = which === "d1"
    ? { en: "Birth chart (D1)", hi: "जन्म कुंडली (D1)", hinglish: "Janam kundli (D1)" }[lang]
    : { en: "Navamsa (D9)", hi: "नवांश (D9)", hinglish: "Navamsa (D9)" }[lang];

  return (
    <div className="mt-2.5 rounded-xl border border-border bg-card p-3">
      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <NorthIndianChart planets={planets} ascendantSign={data.ascendant?.sign ?? ""} shortNames />
      <Pressable to={`/chart/${chartId}/${which}`} className="mt-2 flex items-center gap-1 text-[12px] font-bold text-accent">
        {{ en: "Placements", hi: "ग्रह स्थिति", hinglish: "Grah sthiti" }[lang]}
        <ChevronRight className="h-[14px] w-[14px]" />
      </Pressable>
    </div>
  );
}

/**
 * The life report as a file they can keep or send.
 *
 * Built in the browser from the report they already own, so asking for it
 * again costs nothing — the credit was spent when the report was generated,
 * and turning it into a PDF is not a second purchase.
 */
function PdfCard({ chartId, lang }: { chartId: string; lang: Lang }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "none">("idle");

  const build = async () => {
    setState("busy");
    try {
      // cached_only: asking for a file must never become a 29-credit purchase.
      const r = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartId, cached_only: true }),
      });
      const rep = r.ok ? await r.json() : null;
      if (!rep || rep.error || !rep.sections?.length) { setState("none"); return; }

      const { jsPDF } = await import("jspdf");   // lazy: never in the first load
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const M = 44, W = doc.internal.pageSize.getWidth(), CW = W - M * 2;
      let y = 64;
      const line = (text: string, size: number, bold = false, gap = 16) => {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(size);
        for (const l of doc.splitTextToSize(String(text).replace(/\*\*/g, ""), CW)) {
          if (y > 780) { doc.addPage(); y = 64; }
          doc.text(l, M, y); y += gap;
        }
      };
      line(`${rep.birth_details?.name || "Life report"} — JanamJyot`, 18, true, 24);
      line(
        [rep.birth_details?.date_of_birth, rep.birth_details?.time_of_birth, rep.birth_details?.place_of_birth]
          .filter(Boolean).join(" · "), 10, false, 22,
      );
      for (const s of rep.sections) { y += 8; line(s.title || "", 13, true, 20); line(s.body || s.content || "", 10.5, false, 15); }
      doc.save(`JanamJyot-${(rep.birth_details?.name || "report").replace(/\s+/g, "-")}.pdf`);
      setState("done");
    } catch {
      setState("none");
    }
  };

  if (state === "none") {
    return (
      <p className="mt-2.5 text-[12px] text-muted-foreground">
        {{ en: "Generate your life report first, then I can make the PDF.",
           hi: "पहले अपनी लाइफ रिपोर्ट बनवाइए, फिर मैं PDF बना दूँगा।",
           hinglish: "Pehle apni life report banwaiye, phir main PDF bana dunga." }[lang]}
      </p>
    );
  }

  return (
    <Pressable
      onClick={state === "idle" ? build : undefined}
      disabled={state === "busy"}
      feedback="medium"
      className="mt-2.5 flex w-full items-center gap-2.5 rounded-xl border border-accent/35 bg-accent/8 px-3.5 py-3 text-left disabled:opacity-60"
    >
      <FileDown className="h-[17px] w-[17px] shrink-0 text-accent" />
      <span className="flex-1 text-[13px] font-bold text-accent">
        {state === "busy"
          ? { en: "Making the PDF…", hi: "PDF बन रही है…", hinglish: "PDF ban rahi hai…" }[lang]
          : state === "done"
            ? { en: "Saved — tap to make it again", hi: "सेव हो गई — दोबारा बनाने के लिए दबाएँ", hinglish: "Save ho gayi — dobara banane ke liye dabaein" }[lang]
            : { en: "Download my life report (PDF)", hi: "मेरी लाइफ रिपोर्ट (PDF) डाउनलोड करें", hinglish: "Meri life report (PDF) download karein" }[lang]}
      </span>
    </Pressable>
  );
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
