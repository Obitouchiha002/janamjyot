import { useEffect, useRef, useState } from "react";
import { useSignInGate } from "@/lib/gate";
import { getLang } from "@/lib/prefs";
import { useT } from "@/lib/i18n";
import {
  FinalVerdict, PersonPanel, PlanetTable, TimingWindows, DoshaPanel,
  MatchChat, YearOutlook, WeddingDates, MarriageOutlook, MatchHistory, SectionTitle,
} from "@/components/match/DeepMatch";
import { useAuth } from "@/auth";
import { HeartHandshake, Bot, Mars, Venus, CheckCircle2, FileText, Download, Loader2, Share2 } from "lucide-react";
import AnswerText from "@/components/AnswerText";
import { Pressable } from "@/components/mobile/Pressable";
import { haptic, isNative, saveToDownloads, shareFile, shareText } from "@/lib/native";

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
  const t = useT();
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
          <label className={LABEL}>{t("Name")}</label>
          <input className={FIELD} placeholder={t("Full name")} value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })} />
        </div>

        <div>
          <label className={LABEL}>{t("Date of birth")}</label>
          <input type="date" className={FIELD} value={value.date}
            onChange={(e) => onChange({ ...value, date: e.target.value })} />
        </div>

        <div>
          <label className={LABEL}>{t("Birth time")}</label>
          {/* A 3-col grid, NOT flex. The old flex row put `w-full` (from FIELD)
              AND `w-[86px]` on the same select — conflicting width utilities of
              equal specificity, so the AM/PM box won `w-full`, refused to shrink
              and blew off the right edge while hour/min collapsed to empty pills.
              Grid cells own the widths, so each select just fills its cell. */}
          <div className="grid grid-cols-3 gap-2">
            <select value={value.hour} onChange={(e) => onChange({ ...value, hour: e.target.value })}
              aria-label="Hour" className={`${FIELD} appearance-none text-center`}>
              {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => <option key={h}>{h}</option>)}
            </select>
            <select value={value.min} onChange={(e) => onChange({ ...value, min: e.target.value })}
              aria-label="Minute" className={`${FIELD} appearance-none text-center`}>
              {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((m) => <option key={m}>{m}</option>)}
            </select>
            <select value={value.ampm} onChange={(e) => onChange({ ...value, ampm: e.target.value })}
              aria-label="AM or PM" className={`${FIELD} appearance-none text-center`}>
              <option>AM</option><option>PM</option>
            </select>
          </div>
        </div>

        <div className="relative">
          <label className={LABEL}>{t("Birth place")}</label>
          <input
            className={FIELD}
            placeholder={t("Start typing a city…")}
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

/*
 * The North Indian chart, drawn into the PDF.
 *
 * The screen renders it as SVG, which jsPDF cannot take. Rasterising the DOM
 * node would work and would also drag in html2canvas for one square — lines
 * and text are three dozen calls and stay sharp at any print size.
 *
 * Same house centres as the on-screen chart, scaled to the box, so the printed
 * page and the phone agree about where a planet sits.
 */
const PDF_HOUSE_CENTERS: Record<number, { x: number; y: number }> = {
  1: { x: 0.50, y: 0.25 }, 2: { x: 0.25, y: 0.125 }, 3: { x: 0.125, y: 0.25 }, 4: { x: 0.25, y: 0.50 },
  5: { x: 0.125, y: 0.75 }, 6: { x: 0.25, y: 0.875 }, 7: { x: 0.50, y: 0.75 }, 8: { x: 0.75, y: 0.875 },
  9: { x: 0.875, y: 0.75 }, 10: { x: 0.75, y: 0.50 }, 11: { x: 0.875, y: 0.25 }, 12: { x: 0.75, y: 0.125 },
};
const PDF_SHORT: Record<string, string> = {
  Sun: "Su", Moon: "Mo", Mars: "Ma", Mercury: "Me", Jupiter: "Ju",
  Venus: "Ve", Saturn: "Sa", Rahu: "Ra", Ketu: "Ke",
};
const PDF_SIGN_NO: Record<string, number> = {
  Aries: 1, Taurus: 2, Gemini: 3, Cancer: 4, Leo: 5, Virgo: 6,
  Libra: 7, Scorpio: 8, Sagittarius: 9, Capricorn: 10, Aquarius: 11, Pisces: 12,
};

function drawChart(doc: any, x: number, y: number, size: number, person: any, caption: string) {
  doc.setDrawColor(200, 170, 110); doc.setLineWidth(0.8);
  doc.rect(x, y, size, size);
  doc.line(x, y, x + size, y + size);
  doc.line(x + size, y, x, y + size);
  // The inner diamond.
  doc.line(x + size / 2, y, x + size, y + size / 2);
  doc.line(x + size, y + size / 2, x + size / 2, y + size);
  doc.line(x + size / 2, y + size, x, y + size / 2);
  doc.line(x, y + size / 2, x + size / 2, y);

  const asc = PDF_SIGN_NO[person?.lagna] || 1;
  const byHouse: Record<number, string[]> = {};
  for (const p of person?.planets ?? []) {
    (byHouse[p.house] ||= []).push(`${PDF_SHORT[p.planet] ?? p.planet}${p.retrograde ? "R" : ""}`);
  }

  for (let h = 1; h <= 12; h++) {
    const c = PDF_HOUSE_CENTERS[h];
    const cx = x + c.x * size, cy = y + c.y * size;
    doc.setFontSize(6.5); doc.setTextColor(150, 150, 150);
    doc.text(String(((asc + h - 2) % 12) + 1), cx, cy - size * 0.055, { align: "center" });
    doc.setFontSize(7); doc.setTextColor(60, 60, 60);
    const names = byHouse[h] ?? [];
    names.forEach((n, i) => doc.text(n, cx, cy + size * 0.02 + i * 8, { align: "center" }));
  }
  doc.setFontSize(9); doc.setTextColor(31, 41, 55);
  doc.text(`${caption} — ${person?.name ?? ""} (${person?.lagna ?? ""})`, x, y + size + 12, { maxWidth: size });
  doc.setTextColor(31, 41, 55);
}

export default function MatchingPage() {
  const t = useT();
  const { user } = useAuth();
  const [boy, setBoy] = useState<PersonForm>({ ...empty });
  const [girl, setGirl] = useState<PersonForm>({ ...empty });
  /*
   * Defaults to the language they chose for the app, not to English.
   *
   * Someone who picks हिंदी at first launch and then reads an English reading
   * here has been told the choice applies and found that it does not. The
   * select still lets them answer in another language for one reading.
   */
  const [lang, setLang] = useState(getLang());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  /*
   * The exact birth inputs this result was computed from.
   *
   * The chat, the year picker and the wedding-date scan all recompute from
   * these server-side. Reading them back off the two forms instead would send
   * whatever is in the boxes NOW — so editing a date after matching, without
   * pressing Match again, silently asked about a different couple.
   */
  const [inputs, setInputs] = useState<{ boy: any; girl: any } | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  // Long-form report (Phase 2): generated on demand, then downloadable as PDF.
  const [report, setReport] = useState<any>(null);
  const [reportBusy, setReportBusy] = useState<"" | "gen" | "pdf" | "share">("");

  const ready = (p: PersonForm) => p.name && p.date && p.latitude != null;
  const toInput = (p: PersonForm) => ({
    name: p.name, date_of_birth: p.date, time_of_birth: to24h(p.hour, p.min, p.ampm),
    place_of_birth: p.place, latitude: p.latitude, longitude: p.longitude, timezone: p.timezone, language: "en",
  });

  /**
   * Reopen a saved match exactly as it was computed.
   *
   * The stored result is shown rather than recomputed: the koota table would
   * come back identical, but the AI verdict would be worded differently every
   * time, and a saved reading that changes when you reopen it is not saved.
   */
  const openSaved = (row: any) => {
    if (!row?.result) return;
    setResult(row.result);
    setInputs({ boy: row.boy, girl: row.girl });
    setReport(null);
    setError(null);
    // Put the two forms back too, so Match again re-runs the same couple.
    const toForm = (b: any): PersonForm => ({
      name: b?.name ?? "", date: b?.date_of_birth ?? "",
      hour: (b?.time_of_birth ?? "12:00").slice(0, 2),
      minute: (b?.time_of_birth ?? "12:00").slice(3, 5),
      ampm: Number((b?.time_of_birth ?? "12:00").slice(0, 2)) >= 12 ? "PM" : "AM",
      place: b?.place_of_birth ?? "", latitude: b?.latitude, longitude: b?.longitude,
      timezone: b?.timezone ?? "Asia/Kolkata",
    } as any);
    setBoy(toForm(row.boy));
    setGirl(toForm(row.girl));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Share the headline numbers. Native sheet, then the browser's, then clipboard. */
  const shareMatch = async () => {
    if (!result) return;
    const line = `${result.boy?.name} & ${result.girl?.name} — ${result.total}/${result.max} (${result.percent}%)`
      + `\n${result.final_verdict?.headline || result.verdict || ""}`;
    await shareText("Kundli Matching — JanamJyot", line, "https://janamjyot.lzworth.in");
  };

  const needsSignIn = useSignInGate();

  const match = async () => {
    if (needsSignIn("match", () => void match())) return;
    if (!ready(boy) || !ready(girl)) { haptic.error(); setError(t("Enter name, date and place for both (choose the place from the suggestions).")); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const payload = { boy: toInput(boy), girl: toInput(girl), language: lang };
      const res = await fetch("/api/match/deep", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) { haptic.error(); setError(d.error || t("Matching failed.")); }
      else {
        haptic.success(); setResult(d); setReport(null); setInputs(payload);
        // Saved quietly for signed-in users. A failure here must never surface
        // as an error on a reading that computed perfectly well.
        if (user) {
          fetch("/api/match/history", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, result: d }),
          }).then(() => setHistoryKey((k) => k + 1)).catch(() => {});
        }
      }
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
      if (!res.ok || d.error) { haptic.error(); setError(d.error || t("Could not build the report.")); }
      else { haptic.success(); setReport(d); }
    } catch { haptic.error(); setError(t("Network error while building the report.")); }
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

    /* ---- everything the deep reading computed, before the AI prose ----
     *
     * The long-form reading used to be the whole PDF. A family printing this
     * and taking it to an astrologer needs the numbers he will check — the
     * birth details, both charts, the koota table, which doshas are live —
     * not only an essay about them.
     */
    const H2 = (label: string) => {
      nextPage(46); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      doc.setTextColor(217, 119, 6); doc.text(label, M, y); y += 18;
      doc.setTextColor(31, 41, 55); doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    };
    const para = (text: string, size = 11, indent = 0) => {
      if (!text) return;
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(plain(text), CW - indent);
      nextPage(lines.length * (size + 3)); doc.text(lines, M + indent, y);
      y += lines.length * (size + 3) + 6;
    };

    // Final verdict — first, because it is the answer.
    const fv = result.final_verdict;
    if (fv?.headline) {
      H2("Final verdict");
      doc.setFont("helvetica", "bold"); para(fv.headline, 12);
      doc.setFont("helvetica", "normal");
      const recLabel = fv.recommendation === "proceed" ? "Recommendation: go ahead"
        : fv.recommendation === "consult_astrologer" ? "Recommendation: speak to an astrologer first"
        : "Recommendation: go ahead, with care";
      para(recLabel, 11);
      para(fv.will_it_go_well, 11);
      if (fv.problems?.length) {
        doc.setFont("helvetica", "bold"); para("What to watch", 11);
        doc.setFont("helvetica", "normal");
        for (const x of fv.problems) para(`\u2022  ${x}`, 10.5, 8);
      }
      if (fv.solutions?.length) {
        doc.setFont("helvetica", "bold"); para("What helps", 11);
        doc.setFont("helvetica", "normal");
        for (const x of fv.solutions) para(`\u2022  ${x}`, 10.5, 8);
      }
      y += 4;
    }

    // Birth details, side by side.
    H2("Birth details");
    const bd = (who: any, form: any) =>
      `${who?.name || ""}  ·  ${form.date || ""}  ${form.hour}:${form.minute} ${form.ampm}  ·  ${form.place || ""}`;
    para(`Groom: ${bd(result.boy, boy)}`, 10.5);
    para(`Bride: ${bd(result.girl, girl)}`, 10.5);
    y += 2;

    // Both D1 charts, actually drawn.
    if (result.boy_deep && result.girl_deep) {
      H2("Birth charts (D1)");
      const S = (CW - 24) / 2;
      nextPage(S + 34);
      drawChart(doc, M, y, S, result.boy_deep, "Groom");
      drawChart(doc, M + S + 24, y, S, result.girl_deep, "Bride");
      y += S + 34;
    }

    // Ashtakoot table.
    if (result.kootas?.length) {
      H2("Ashtakoot (Guna Milan)");
      doc.setFontSize(10.5);
      for (const k of result.kootas) {
        nextPage(16);
        doc.setFont("helvetica", "bold"); doc.text(String(k.name), M, y);
        doc.setFont("helvetica", "normal");
        doc.text(`${k.score}/${k.max}`, M + 110, y);
        doc.text(doc.splitTextToSize(`${k.boy} — ${k.girl}`, CW - 170)[0] ?? "", M + 160, y);
        y += 15;
      }
      nextPage(18);
      doc.setFont("helvetica", "bold");
      doc.text(`Total  ${result.total}/${result.max}  (${result.percent}%)`, M, y + 4);
      doc.setFont("helvetica", "normal"); y += 24;
    }

    // Doshas, and the remedies that actually apply.
    if (result.dosha_details?.length) {
      H2("Doshas");
      for (const d of result.dosha_details) {
        doc.setFont("helvetica", "bold");
        para(`${d.name}: ${d.active ? "present" : d.cancelled ? "present, cancelled" : "not present"}`, 11);
        doc.setFont("helvetica", "normal");
        para(d.detail, 10.5, 8);
      }
    }
    if (result.remedies?.length) {
      H2("Remedies");
      for (const r of result.remedies) {
        doc.setFont("helvetica", "bold"); para(r.title, 11);
        doc.setFont("helvetica", "normal");
        for (const st of r.steps) para(`\u2022  ${st}`, 10.5, 8);
        para(r.note, 10, 8);
      }
    }

    // 7th house, karakas and the individual promise.
    if (result.boy_deep && result.girl_deep) {
      H2("7th house, Venus & Jupiter");
      const row = (label: string, a: string, b: string) => {
        nextPage(16); doc.setFontSize(10.5);
        doc.setFont("helvetica", "bold"); doc.text(label, M, y);
        doc.setFont("helvetica", "normal");
        doc.text(a, M + 150, y); doc.text(b, M + 330, y); y += 15;
      };
      const seventh = (p: any, key: "seventh_d1" | "seventh_d9") =>
        `${p[key]?.sign ?? "-"} · lord ${p[key]?.lord ?? "-"} in ${p[key]?.lord_house ?? "-"}${p[key]?.lord_in_dusthana ? " (difficult)" : ""}`;
      const pl = (x: any) => (x ? `${x.sign} · house ${x.house}${x.retrograde ? " · R" : ""}` : "-");
      row("", result.boy_deep.name, result.girl_deep.name);
      row("7th (D1)", seventh(result.boy_deep, "seventh_d1"), seventh(result.girl_deep, "seventh_d1"));
      row("7th (D9)", seventh(result.boy_deep, "seventh_d9"), seventh(result.girl_deep, "seventh_d9"));
      row("Venus", pl(result.boy_deep.venus), pl(result.girl_deep.venus));
      row("Jupiter", pl(result.boy_deep.jupiter), pl(result.girl_deep.jupiter));
      row("Marriage promise", result.boy_deep.promise?.level ?? "-", result.girl_deep.promise?.level ?? "-");
      y += 10;
    }

    // Timing.
    if (result.timing) {
      H2("Timing");
      para(result.timing.note, 11);
      for (const o of result.timing.overlaps ?? []) {
        para(`\u2022  ${o.from} to ${o.to}  —  ${result.boy_deep?.name}: ${o.boy_period}, ${result.girl_deep?.name}: ${o.girl_period}`, 10.5, 8);
      }
      y += 4;
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
    } catch { alert(t("Couldn't create the PDF. Please try again.")); }
    finally { setReportBusy(""); }
  };

  return (
    <div className="space-y-6 pt-2">
      {/*
        Title and toolbar both wrap.
        Without flex-wrap on the row AND on the button group, three controls
        beside a sentence pushed the whole page sideways on a phone — the
        content stayed put and the screen scrolled horizontally, which looks
        like the layout broke rather than like something overflowed.
      */}
      <div className="m-enter flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground">
          {t("Ashtakoot Guna Milan — 36 point compatibility.")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {result && (
            <Pressable
              subtle
              onClick={shareMatch}
              className="flex items-center gap-1.5 rounded-full border-2 border-border bg-card px-3.5 py-2 text-[13px] font-bold"
            >
              <Share2 className="h-[15px] w-[15px]" /> {t("Share")}
            </Pressable>
          )}
          <MatchHistory signedIn={!!user} refreshKey={historyKey} onOpen={openSaved} />
          <select
            value={lang}
            onChange={(e) => { haptic.select(); setLang(e.target.value); }}
            aria-label="Reply language"
            className="h-9 shrink-0 rounded-full border border-border bg-card px-3 text-[12.5px] font-semibold text-muted-foreground outline-none"
          >
            {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="m-enter space-y-4" style={{ animationDelay: '0.04s' }}>
        <PersonForm title={t("Groom")} icon={Mars} tint="#7DA6F2" value={boy} onChange={setBoy} />
        <PersonForm title={t("Bride")} icon={Venus} tint="#F26D9B" value={girl} onChange={setGirl} />
      </div>

      <div className="m-enter" style={{ animationDelay: '0.08s' }}>
        <Pressable
          onClick={match}
          feedback="medium"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
        >
          <HeartHandshake className="h-[18px] w-[18px]" strokeWidth={2.4} />
          {loading ? t("Matching…") : t("Match Kundlis")}
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
              <p className="mt-0.5 text-[13px] font-semibold text-accent">{result.percent}% {t("match")}</p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-muted p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("Groom")}</p>
                <p className="mt-1 truncate text-[14.5px] font-bold">{result.boy?.name}</p>
                <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{result.boy.rasi} · {result.boy.nakshatra}</p>
              </div>
              <div className="rounded-2xl bg-muted p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("Bride")}</p>
                <p className="mt-1 truncate text-[14.5px] font-bold">{result.girl?.name}</p>
                <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{result.girl.rasi} · {result.girl.nakshatra}</p>
              </div>
            </div>
          </section>

          {/*
            The verdict comes FIRST, above the koota table.
            A family reading this wants "should we go ahead, and what then" —
            the eight-koota breakdown is the evidence for that answer, not the
            answer, and putting the evidence first made people scroll past the
            only part they came for.
          */}
          {result.final_verdict && <FinalVerdict v={result.final_verdict} lang={lang} />}

          {/* ── Koota breakdown ─────────────────────────────────────────── */}
          <section className="m-enter" style={{ animationDelay: '0.05s' }}>
            <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
              {t("Ashtakoot breakdown")}
            </h3>
            <div className="space-y-2.5">
              {(result.kootas ?? []).map((k: any) => {
                const pct = k.max ? (k.score / k.max) * 100 : 0;
                const weak = k.score === 0;
                return (
                  <div key={k.name} className="m-card p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[14.5px] font-bold">
                        {k.name}
                        {/* Flag our documented simplification rather than let a
                            total imply precision the source tables don't have. */}
                        {k.approximate && (
                          <span
                            title="Sources differ on this koota — may read 1 point different elsewhere"
                            className="ml-1.5 align-middle text-[10px] font-bold text-muted-foreground"
                          >
                            ≈
                          </span>
                        )}
                      </p>
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

          {/*
            Doshas, with their cancellations and only the remedies that apply.
            The server decides which of the three are ACTIVE; this reads that
            boolean rather than the sentence, because the sentence is translated
            and once flipped every icon red the moment someone chose Hindi.
          */}
          <section className="m-enter" style={{ animationDelay: '0.08s' }}>
            <SectionTitle>{t("Doshas & remedies")}</SectionTitle>
            <DoshaPanel doshas={result.dosha_details ?? []} remedies={result.remedies ?? []} />
          </section>

          {/* ── Both charts, side by side ───────────────────────────────── */}
          {result.boy_deep && result.girl_deep && (
            <section className="m-enter" style={{ animationDelay: '0.09s' }}>
              <SectionTitle>{t("Both charts")}</SectionTitle>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <PersonPanel p={result.boy_deep} tint="#7DA6F2" roleLabel={t("Groom")} />
                <PersonPanel p={result.girl_deep} tint="#F26D9B" roleLabel={t("Bride")} />
              </div>
            </section>
          )}

          {/* ── Every planet, both people ───────────────────────────────── */}
          {result.boy_deep && result.girl_deep && (
            <section className="m-enter" style={{ animationDelay: '0.10s' }}>
              <SectionTitle>{t("All planets")}</SectionTitle>
              <PlanetTable boy={result.boy_deep} girl={result.girl_deep} />
            </section>
          )}

          {/* ── Timing ──────────────────────────────────────────────────── */}
          {result.timing && (
            <section className="m-enter" style={{ animationDelay: '0.10s' }}>
              <SectionTitle>{t("Timing")}</SectionTitle>
              <TimingWindows boy={result.boy_deep} girl={result.girl_deep} timing={result.timing} />
            </section>
          )}

          {/* ── The year ahead, and wedding dates ───────────────────────── */}
          {inputs && (
            <section className="m-enter space-y-2.5" style={{ animationDelay: '0.11s' }}>
              <SectionTitle>{t("The year ahead")}</SectionTitle>
              <YearOutlook boyInput={inputs.boy} girlInput={inputs.girl} lang={lang} />
              <MarriageOutlook boyInput={inputs.boy} girlInput={inputs.girl} lang={lang} />
              <WeddingDates boyInput={inputs.boy} girlInput={inputs.girl} />
            </section>
          )}

          {/* ── Ask about this couple ───────────────────────────────────── */}
          {inputs && (
            <section className="m-enter" style={{ animationDelay: '0.11s' }}>
              <SectionTitle>{t("Ask about this match")}</SectionTitle>
              <MatchChat boyInput={inputs.boy} girlInput={inputs.girl} lang={lang} />
            </section>
          )}

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
                    {t("Suggested remedies")}
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
