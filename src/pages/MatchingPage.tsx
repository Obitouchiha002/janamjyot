import { useEffect, useRef, useState } from "react";
import { HeartHandshake, Bot, Mars, Venus, CheckCircle2, AlertTriangle, FileText, Download, Loader2 } from "lucide-react";
import AnswerText from "@/components/AnswerText";
import { Pressable } from "@/components/mobile/Pressable";
import { haptic, isNative, saveToDownloads, shareFile } from "@/lib/native";

interface Place { label: string; latitude: number; longitude: number; timezone: string; }
interface PersonForm {
  name: string; date: string; hour: string; min: string; ampm: string;
  place: string; latitude?: number; longitude?: number; timezone?: string;
}
const empty: PersonForm = { name: "", date: "", hour: "12", min: "00", ampm: "AM", place: "" };

const LANGS: [string, string][] = [
  ["en", "English"], ["hinglish", "Hinglish"], ["hi", "हिंदी"], ["ta", "தமிழ்"],
  ["te", "తెలుగు"], ["mr", "मराठी"], ["bn", "বাংলা"], ["gu", "ગુજરાતી"],
  ["kn", "ಕನ್ನಡ"], ["ml", "മലയാളം"], ["pa", "ਪੰਜਾਬੀ"], ["ur", "اردو"],
];

const FIELD =
  "w-full rounded-2xl border border-input bg-card px-4 py-3.5 text-[15px] outline-none focus:border-accent transition-colors";
const LABEL = "mb-1.5 block px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground";

function to24h(hour: string, min: string, ampm: string): string {
  let h = parseInt(hour || "12", 10) % 12;
  if (ampm === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(parseInt(min || "0", 10)).padStart(2, "0")}`;
}

function PersonForm({ title, icon: Icon, tint, value, onChange }: {
  title: string; icon: any; tint: string; value: PersonForm; onChange: (v: PersonForm) => void;
}) {
  const [q, setQ] = useState(value.place);
  const [opts, setOpts] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const tRef = useRef<any>(null);

  useEffect(() => {
    if (q.length < 2 || q === value.place) { setOpts([]); return; }
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => {
      fetch(`/api/places?q=${encodeURIComponent(q)}`)
        .then((r) => r.json()).then((d) => { setOpts(Array.isArray(d) ? d : []); setOpen(true); })
        .catch(() => {});
    }, 300);
  }, [q]); // eslint-disable-line

  return (
    // overflow-visible so the place dropdown isn't clipped by m-card's overflow:hidden.
    <section className="m-card p-4" style={{ overflow: 'visible' }}>
      <h3 className="mb-3.5 flex items-center gap-2.5 text-[15px] font-bold">
        <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${tint}22`, color: tint }}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {title}
      </h3>

      <div className="space-y-3.5">
        <div>
          <label className={LABEL}>Name</label>
          <input className={FIELD} placeholder="Full name" value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })} />
        </div>

        <div>
          <label className={LABEL}>Date of birth</label>
          <input type="date" className={FIELD} value={value.date}
            onChange={(e) => onChange({ ...value, date: e.target.value })} />
        </div>

        <div>
          <label className={LABEL}>Birth time</label>
          <div className="flex gap-2">
            <select value={value.hour} onChange={(e) => onChange({ ...value, hour: e.target.value })}
              className={`${FIELD} flex-1 appearance-none text-center`}>
              {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => <option key={h}>{h}</option>)}
            </select>
            <select value={value.min} onChange={(e) => onChange({ ...value, min: e.target.value })}
              className={`${FIELD} flex-1 appearance-none text-center`}>
              {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((m) => <option key={m}>{m}</option>)}
            </select>
            <select value={value.ampm} onChange={(e) => onChange({ ...value, ampm: e.target.value })}
              className={`${FIELD} w-[86px] shrink-0 appearance-none text-center`}>
              <option>AM</option><option>PM</option>
            </select>
          </div>
        </div>

        <div className="relative">
          <label className={LABEL}>Birth place</label>
          <input
            className={FIELD}
            placeholder="Start typing a city…"
            value={q}
            onChange={(e) => { setQ(e.target.value); onChange({ ...value, place: "", latitude: undefined }); }}
          />
          {open && opts.length > 0 && (
            <div className="absolute z-30 mt-1.5 max-h-56 w-full overflow-y-auto rounded-2xl border border-border bg-card shadow-xl">
              {opts.map((p, i) => (
                <Pressable key={i} subtle
                  onClick={() => { onChange({ ...value, place: p.label, latitude: p.latitude, longitude: p.longitude, timezone: p.timezone }); setQ(p.label); setOpen(false); }}
                  className="flex min-h-[46px] w-full items-center border-b border-border px-4 py-3 text-left text-[14px] last:border-0">
                  {p.label}
                </Pressable>
              ))}
            </div>
          )}
          {value.latitude != null && (
            <p className="mt-1.5 flex items-center gap-1 px-1 text-[11.5px] font-semibold text-accent">
              <CheckCircle2 className="h-3.5 w-3.5" /> {value.place}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Big Guna Milan score ring — the one number the user actually came for. */
function ScoreRing({ total, max, percent }: { total: number; max: number; percent: number }) {
  const R = 62;
  const C = 2 * Math.PI * R;
  const dash = (Math.max(0, Math.min(100, percent)) / 100) * C;
  return (
    <div className="relative grid h-[160px] w-[160px] shrink-0 place-items-center">
      <div className="pointer-events-none absolute inset-4 rounded-full bg-accent/10 blur-2xl" />
      <svg viewBox="0 0 160 160" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={R} fill="none" strokeWidth="11" className="stroke-muted" />
        <circle
          cx="80" cy="80" r={R} fill="none" strokeWidth="11" strokeLinecap="round"
          className="stroke-accent"
          strokeDasharray={`${dash} ${C}`}
          style={{ transition: "stroke-dasharray 1s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="relative text-center">
        <p className="text-[40px] font-bold leading-none text-accent">{total}</p>
        <p className="mt-1 text-[13px] font-semibold text-muted-foreground">/ {max} gunas</p>
      </div>
    </div>
  );
}

export default function MatchingPage() {
  const [boy, setBoy] = useState<PersonForm>({ ...empty });
  const [girl, setGirl] = useState<PersonForm>({ ...empty });
  const [lang, setLang] = useState("en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  // Long-form report (Phase 2): generated on demand, then downloadable as PDF.
  const [report, setReport] = useState<any>(null);
  const [reportBusy, setReportBusy] = useState<"" | "gen" | "pdf" | "share">("");

  const ready = (p: PersonForm) => p.name && p.date && p.latitude != null;
  const toInput = (p: PersonForm) => ({
    name: p.name, date_of_birth: p.date, time_of_birth: to24h(p.hour, p.min, p.ampm),
    place_of_birth: p.place, latitude: p.latitude, longitude: p.longitude, timezone: p.timezone, language: "en",
  });

  const match = async () => {
    if (!ready(boy) || !ready(girl)) { haptic.error(); setError("Enter name, date and place for both (choose the place from the suggestions)."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boy: toInput(boy), girl: toInput(girl), language: lang }),
      });
      const d = await res.json();
      if (!res.ok) { haptic.error(); setError(d.error || "Matching failed."); }
      else { haptic.success(); setResult(d); setReport(null); }
    } catch { haptic.error(); setError("Network error."); }
    finally { setLoading(false); }
  };

  const buildReport = async () => {
    if (reportBusy) return;
    setReportBusy("gen"); setError(null);
    try {
      const res = await fetch("/api/match/report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boy: toInput(boy), girl: toInput(girl), language: lang }),
      });
      const d = await res.json();
      if (!res.ok || d.error) { haptic.error(); setError(d.error || "Could not build the report."); }
      else { haptic.success(); setReport(d); }
    } catch { haptic.error(); setError("Network error while building the report."); }
    finally { setReportBusy(""); }
  };

  /** Same premium A4 layout as the other reports, kept simple and readable. */
  const buildPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const M = 46, CW = PW - M * 2;
    let y = M;

    const plain = (s: string) => String(s || "").replace(/\*\*/g, "");
    const nextPage = (need: number) => { if (y + need > PH - M) { doc.addPage(); y = M; } };

    doc.setFillColor(217, 119, 6); doc.rect(0, 0, PW, 96, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(19);
    doc.text(plain(report.title), M, 46, { maxWidth: CW });
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    doc.text(`${result.total}/${result.max} gunas · ${result.percent}% · ${plain(result.verdict)}`, M, 70, { maxWidth: CW });
    y = 128;

    doc.setTextColor(31, 41, 55);
    if (report.intro) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(11.5);
      const lines = doc.splitTextToSize(plain(report.intro), CW);
      nextPage(lines.length * 15 + 10); doc.text(lines, M, y); y += lines.length * 15 + 14;
    }

    for (const s of report.sections || []) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      nextPage(46); doc.setTextColor(217, 119, 6);
      doc.text(plain(s.heading), M, y); y += 17;
      doc.setTextColor(31, 41, 55); doc.setFont("helvetica", "normal"); doc.setFontSize(11);
      const lines = doc.splitTextToSize(plain(s.body), CW);
      nextPage(lines.length * 14); doc.text(lines, M, y); y += lines.length * 14 + 14;
    }

    if (report.remedies?.length) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(217, 119, 6);
      nextPage(46); doc.text("Suggested remedies", M, y); y += 17;
      doc.setTextColor(31, 41, 55); doc.setFont("helvetica", "normal"); doc.setFontSize(11);
      for (const r of report.remedies) {
        const lines = doc.splitTextToSize(`•  ${plain(r)}`, CW - 8);
        nextPage(lines.length * 14); doc.text(lines, M + 4, y); y += lines.length * 14 + 4;
      }
      y += 10;
    }

    if (report.verdict) {
      nextPage(60); doc.setFillColor(249, 247, 243); doc.roundedRect(M, y - 12, CW, 52, 8, 8, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.setTextColor(31, 41, 55);
      doc.text(doc.splitTextToSize(plain(report.verdict), CW - 24), M + 12, y + 8);
      y += 62;
    }
    if (report.disclaimer) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(9.5); doc.setTextColor(107, 114, 128);
      const lines = doc.splitTextToSize(plain(report.disclaimer), CW);
      nextPage(lines.length * 12); doc.text(lines, M, y);
    }

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text(`JanamJyot · Kundli Matching · page ${i} of ${pages}`, PW / 2, PH - 22, { align: "center" });
    }
    return doc;
  };

  const fileName = () =>
    `${(boy.name || "Groom").replace(/\s+/g, "_")}_${(girl.name || "Bride").replace(/\s+/g, "_")}_Matching.pdf`;

  const onDownload = async () => {
    if (!report || reportBusy) return;
    setReportBusy("pdf");
    try {
      const doc = await buildPdf();
      const uri = await saveToDownloads(fileName(), doc.output("datauristring"), {
        notifyTitle: "Matching report ready", notifyBody: "Your Kundli matching PDF is ready",
      });
      if (isNative && uri) await shareFile(uri, "Kundli Matching Report");
    } catch { alert("Couldn't create the PDF. Please try again."); }
    finally { setReportBusy(""); }
  };

  return (
    <div className="space-y-6 pt-2">
      <div className="m-enter flex items-center justify-between gap-3 px-1">
        <p className="text-[13px] leading-snug text-muted-foreground">
          Ashtakoot Guna Milan — 36 point compatibility.
        </p>
        <select
          value={lang}
          onChange={(e) => { haptic.select(); setLang(e.target.value); }}
          aria-label="Reply language"
          className="h-9 shrink-0 rounded-full border border-border bg-card px-3 text-[12.5px] font-semibold text-muted-foreground outline-none"
        >
          {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="m-enter space-y-4" style={{ animationDelay: '0.04s' }}>
        <PersonForm title="Groom" icon={Mars} tint="#7DA6F2" value={boy} onChange={setBoy} />
        <PersonForm title="Bride" icon={Venus} tint="#F26D9B" value={girl} onChange={setGirl} />
      </div>

      <div className="m-enter" style={{ animationDelay: '0.08s' }}>
        <Pressable
          onClick={match}
          feedback="medium"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
        >
          <HeartHandshake className="h-[18px] w-[18px]" strokeWidth={2.4} />
          {loading ? "Matching…" : "Match Kundlis"}
        </Pressable>
        {error && <p className="mt-3 px-1 text-center text-[13px] font-medium text-destructive">{error}</p>}
      </div>

      {loading && (
        <div className="space-y-3">
          <div className="skeleton h-[190px]" />
          <div className="skeleton h-[80px]" />
          <div className="skeleton h-[80px] opacity-60" />
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* ── Score ───────────────────────────────────────────────────── */}
          <section className="m-card m-enter relative overflow-hidden p-5">
            <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-accent/10 blur-2xl" />
            <div className="flex flex-col items-center">
              <ScoreRing total={result.total} max={result.max} percent={result.percent} />
              <p className="mt-4 text-[19px] font-bold leading-tight">{result.verdict}</p>
              <p className="mt-0.5 text-[13px] font-semibold text-accent">{result.percent}% match</p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-muted p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Groom</p>
                <p className="mt-1 truncate text-[14.5px] font-bold">{result.boy.name}</p>
                <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{result.boy.rasi} · {result.boy.nakshatra}</p>
              </div>
              <div className="rounded-2xl bg-muted p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Bride</p>
                <p className="mt-1 truncate text-[14.5px] font-bold">{result.girl.name}</p>
                <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{result.girl.rasi} · {result.girl.nakshatra}</p>
              </div>
            </div>
          </section>

          {/* ── Koota breakdown ─────────────────────────────────────────── */}
          <section className="m-enter" style={{ animationDelay: '0.05s' }}>
            <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
              Ashtakoot breakdown
            </h3>
            <div className="space-y-2.5">
              {result.kootas.map((k: any) => {
                const pct = k.max ? (k.score / k.max) * 100 : 0;
                const weak = k.score === 0;
                return (
                  <div key={k.name} className="m-card p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[14.5px] font-bold">{k.name}</p>
                      <p className="shrink-0 text-[14px] font-bold tabular-nums">
                        <span className={weak ? "text-destructive" : "text-accent"}>{k.score}</span>
                        <span className="text-muted-foreground">/{k.max}</span>
                      </p>
                    </div>

                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${weak ? "bg-destructive" : "bg-accent"}`}
                        style={{ width: `${pct}%`, transition: "width 0.8s cubic-bezier(0.22,1,0.36,1)" }}
                      />
                    </div>

                    <p className="mt-2.5 text-[12px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{k.boy}</span>
                      {" · "}
                      <span className="font-semibold text-foreground">{k.girl}</span>
                    </p>
                    <p className="selectable mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{k.note}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Doshas ──────────────────────────────────────────────────── */}
          <section className="m-enter" style={{ animationDelay: '0.08s' }}>
            <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
              Dosha check
            </h3>
            <div className="space-y-2.5">
              {[["Mangal Dosha", result.doshas.mangal], ["Bhakoot", result.doshas.bhakoot], ["Nadi", result.doshas.nadi]].map(([t, v]) => {
                const ok = /no |cancel/i.test(String(v));
                return (
                  <div key={String(t)} className="m-card flex gap-3 p-4">
                    <span className={`mt-0.5 shrink-0 ${ok ? "text-accent" : "text-destructive"}`}>
                      {ok ? <CheckCircle2 className="h-[18px] w-[18px]" /> : <AlertTriangle className="h-[18px] w-[18px]" />}
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t}</h4>
                      <p className="selectable mt-1 text-[13.5px] leading-relaxed">{v}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── AI summary ──────────────────────────────────────────────── */}
          {result.summary && (
            <section className="m-card m-enter p-4" style={{ animationDelay: '0.11s' }}>
              <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                <Bot className="h-4 w-4 text-accent" /> Astrologer's view
              </h3>
              <div className="selectable text-[14.5px] leading-relaxed">
                <AnswerText text={result.summary} />
              </div>
            </section>
          )}

          {/* ── Detailed report + PDF ───────────────────────────────────── */}
          {!report ? (
            <Pressable
              onClick={buildReport}
              disabled={reportBusy === "gen"}
              feedback="medium"
              className="m-enter flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
              style={{ animationDelay: '0.13s' }}
            >
              {reportBusy === "gen"
                ? <><Loader2 className="h-[17px] w-[17px] animate-spin" /> Preparing your report…</>
                : <><FileText className="h-[17px] w-[17px]" /> Get Detailed Report</>}
            </Pressable>
          ) : (
            <section className="m-card m-enter p-4">
              <h3 className="text-[17px] font-bold leading-snug">{report.title}</h3>
              {report.intro && (
                <div className="selectable mt-2 text-[14px] leading-relaxed text-muted-foreground">
                  <AnswerText text={report.intro} />
                </div>
              )}

              <div className="mt-4 space-y-4">
                {(report.sections || []).map((s: any, i: number) => (
                  <div key={i}>
                    <h4 className="text-[14.5px] font-bold text-accent">{s.heading}</h4>
                    <div className="selectable mt-1 text-[14px] leading-relaxed">
                      <AnswerText text={s.body} />
                    </div>
                  </div>
                ))}
              </div>

              {report.remedies?.length > 0 && (
                <div className="mt-4 rounded-2xl bg-muted p-3.5">
                  <p className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                    Suggested remedies
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {report.remedies.map((r: string, i: number) => (
                      <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed">
                        <span className="text-accent">•</span>
                        <span className="selectable"><AnswerText text={r} /></span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.verdict && (
                <div className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 p-3.5">
                  <div className="selectable text-[14px] font-semibold leading-relaxed">
                    <AnswerText text={report.verdict} />
                  </div>
                </div>
              )}

              <Pressable
                onClick={onDownload}
                disabled={reportBusy === "pdf"}
                feedback="medium"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
              >
                {reportBusy === "pdf"
                  ? <><Loader2 className="h-[17px] w-[17px] animate-spin" /> Preparing PDF…</>
                  : <><Download className="h-[17px] w-[17px]" /> Download PDF</>}
              </Pressable>

              {report.disclaimer && (
                <p className="selectable mt-3 text-center text-[11.5px] italic leading-relaxed text-muted-foreground">
                  {report.disclaimer}
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
