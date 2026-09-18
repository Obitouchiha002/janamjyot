import { useEffect, useMemo, useRef, useState } from "react";
import { PastTimeline } from "@/components/PastTimeline";
import { ReportProgress } from "@/components/ReportProgress";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, Activity, Coins, Briefcase, Heart, Users, Plane, Store, Download, RefreshCw, Languages, CheckCircle2, AlertTriangle, Lightbulb, History, Compass, TrendingUp, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { NorthIndianChart } from "@/components/NorthIndianChart";
import { isNative, saveToDownloads, shareFile } from "@/lib/native";
import SpeakButton from "@/components/SpeakButton";
import AnswerText from "@/components/AnswerText";
import ReportChat from "@/components/ReportChat";
import { getLang } from "@/lib/prefs";
import { useT } from "@/lib/i18n";
import { haptic } from "@/lib/native";

const LANGS: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hinglish", label: "Hinglish" },
  { value: "hi", label: "हिंदी" },
  { value: "ta", label: "தமிழ்" },
  { value: "te", label: "తెలుగు" },
  { value: "mr", label: "मराठी" },
  { value: "bn", label: "বাংলা" },
  { value: "gu", label: "ગુજરાતી" },
  { value: "kn", label: "ಕನ್ನಡ" },
  { value: "ml", label: "മലയാളം" },
  { value: "pa", label: "ਪੰਜਾਬੀ" },
  { value: "ur", label: "اردو" },
];

const SECTIONS = [
  { id: "health", icon: Activity, title: "Health", accent: "border-l-rose-400" },
  { id: "wealth", icon: Coins, title: "Wealth", accent: "border-l-amber-400" },
  { id: "career", icon: Briefcase, title: "Career & Profession", accent: "border-l-blue-400" },
  { id: "marriage", icon: Heart, title: "Marriage", accent: "border-l-pink-400" },
  { id: "relationships", icon: Users, title: "Relationships", accent: "border-l-violet-400" },
  // Travel and business are their own readings, not footnotes to career: "should
  // I go abroad" and "job ya apna kaam" are the two questions people arrive with.
  { id: "travel", icon: Plane, title: "Travel & Foreign", accent: "border-l-sky-400" },
  { id: "business", icon: Store, title: "Business vs Job", accent: "border-l-emerald-400" },
];

// Renders **bold** segments as highlighted key terms; the rest stays plain.
/*
 * Removed: a local RichText that rendered **bold** and nothing else.
 *
 * The report's timeline fields are one bullet per LINE, and this dropped every
 * line break — so "• Ketu-Saturn (2019-2020): … • Venus-Venus (2021-2024): …"
 * arrived as a single grey paragraph with bullet characters stranded inside
 * sentences. AnswerText (the same renderer the chat uses) makes real list items
 * with real spacing, so the page below is now readable in one pass.
 */

// Animated Vimshottari Dasha timeline — a real graph of the life periods.
function DashaTimeline({ dasha }: { dasha: any }) {
  const maha: any[] = dasha?.mahadasha ?? [];
  if (maha.length < 2) return null;
  const t = (s: string) => new Date(s).getTime();
  const start = t(maha[0].from);
  const end = t(maha[maha.length - 1].to);
  const span = end - start || 1;
  const now = Date.now();
  const curLord = dasha?.current?.mahadasha;
  const COLORS: Record<string, string> = {
    Ketu: "#6b7280", Venus: "#ec4899", Sun: "#f59e0b", Moon: "#64748b", Mars: "#ef4444",
    Rahu: "#7c3aed", Jupiter: "#ca8a04", Saturn: "#4338ca", Mercury: "#059669",
  };
  const nowPct = Math.min(100, Math.max(0, ((now - start) / span) * 100));

  return (
    <div className="bg-card rounded-2xl border shadow-sm p-5 va-rise va-card-hover">
      <h3 className="font-bold text-primary mb-1">Dasha Journey</h3>
      <p className="text-xs text-muted-foreground mb-4">Your Vimshottari Mahadasha timeline — the highlighted bar is running now.</p>
      <div className="relative">
        <div className="flex w-full h-9 rounded-lg overflow-hidden border">
          {maha.map((m, i) => {
            const w = ((t(m.to) - t(m.from)) / span) * 100;
            const active = m.lord === curLord;
            const c = COLORS[m.lord] || "#94a3b8";
            return (
              <div
                key={i}
                title={`${m.lord}: ${m.from} → ${m.to}`}
                className="va-grow-x relative flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
                style={{
                  width: `${w}%`,
                  background: c,
                  opacity: active ? 1 : 0.55,
                  animationDelay: `${i * 0.07}s`,
                  boxShadow: active ? "inset 0 0 0 2px rgba(255,255,255,0.7)" : undefined,
                }}
              >
                {w > 6 ? m.lord.slice(0, 2) : ""}
              </div>
            );
          })}
        </div>
        {/* "now" marker */}
        <div className="absolute -top-1 -bottom-1 w-[2px] bg-primary" style={{ left: `${nowPct}%` }}>
          <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary" />
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
        <span>{maha[0].from}</span>
        <span>{maha[maha.length - 1].to}</span>
      </div>
    </div>
  );
}

export default function LifeReportPage() {
  const { chartId } = useParams();
  const [chart, setChart] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  /*
   * Defaults to the language they chose for the app, not to English.
   *
   * Someone who picks हिंदी at first launch and then reads an English reading
   * here has been told the choice applies and found that it does not. The
   * select still lets them answer in another language for one reading.
   */
  const [lang, setLang] = useState(getLang());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Ask the user which language BEFORE generating — no auto-generate.
  const [chosen, setChosen] = useState(false);
  const t = useT();
  /*
   * Which area is open. Only the areas the report actually HAS are offered:
   * an older report has five, a new one has seven, and a tab that opens an
   * empty page is worse than a tab that is not there.
   */
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  const topRef = useRef<HTMLSpanElement>(null);
  const present = useMemo(
    () => SECTIONS.filter((s) => report?.[s.id] && !report[s.id].error),
    [report],
  );
  useEffect(() => {
    if (present.length && !present.some((s) => s.id === active)) setActive(present[0].id);
  }, [present, active]);
  /*
   * Reports they already have. Loaded on arrival because it decides what the
   * first screen IS — a list to open, or an empty state that says make one.
   */
  const [history, setHistory] = useState<Array<{ id: string; language: string; created_at: string; areas: number }> | null>(null);
  const loadHistory = () => {
    if (!chartId) return;
    fetch(`/api/reports/${chartId}/history`)
      .then((r) => r.json())
      .then((d) => setHistory(Array.isArray(d.reports) ? d.reports : []))
      .catch(() => setHistory([]));
  };
  useEffect(loadHistory, [chartId]);

  /** Open a saved report — no model call, no credit, no wait. */
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const openSaved = (id: string) => {
    haptic.tap();
    setOpenId(id);
    setLoading(true); setError(null); setChosen(true);
    fetch(`/api/reports/${chartId}/history/${id}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setReport(d); })
      .catch(() => setError("Network error."))
      .finally(() => setLoading(false));
  };

  const removeSaved = async (id: string) => {
    haptic.warning();
    setHistory((h) => (h ?? []).filter((x) => x.id !== id));
    await fetch(`/api/reports/${chartId}/history/${id}`, { method: "DELETE" }).catch(() => {});
  };

  const activeIdx = present.findIndex((s) => s.id === active);
  const prevSection = activeIdx > 0 ? present[activeIdx - 1] : null;
  const nextSection = activeIdx >= 0 && activeIdx < present.length - 1 ? present[activeIdx + 1] : null;

  const loadReport = (language: string, regenerate = false) => {
    setLoading(true);
    setError(null);
    fetch("/api/generate-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chartId, language, regenerate }),
    })
      .then(async res => {
        const d = await res.json();
        if (!res.ok || d.error) setError(d.error?.message || d.error || "Could not generate the report.");
        else { setReport(d); loadHistory(); }
      })
      .catch(() => setError("Network error while generating the report."))
      .finally(() => setLoading(false));
  };

  /*
   * A new report, one area at a time.
   *
   * Seven areas in one request had to finish inside sixty seconds, and on a
   * tired free model they did not: the whole report failed and the next press
   * started from nothing. Now each area is its own small request, two run at a
   * time, each one appears on the page the moment it is written, and only an
   * area that failed is asked again. The server keeps what finished, and the
   * report is saved — and charged — once all seven exist.
   */
  const [writing, setWriting] = useState<{ done: number; total: number; failed: string[] } | null>(null);
  const draftRef = useRef<string | null>(null);

  const writeAreas = async (draftId: string, areas: string[], language: string) => {
    const failed: string[] = [];
    let next = 0;
    const worker = async () => {
      while (next < areas.length) {
        const area = areas[next++];
        let ok = false;
        // Two tries each: a second attempt usually lands on another model.
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
          try {
            const r = await fetch("/api/report/area", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chartId, draftId, area }),
            });
            const d = await r.json();
            if (r.ok && d.data?.summary) {
              ok = true;
              setReport((prev: any) => ({ ...(prev ?? {}), [area]: d.data }));
              setWriting((w) => (w ? { ...w, done: w.done + 1 } : w));
            }
          } catch { /* try again */ }
        }
        if (!ok) failed.push(area);
      }
    };
    await Promise.all([worker(), worker()]);
    return failed;
  };

  const finish = async (draftId: string) => {
    const r = await fetch("/api/report/finish", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chartId, draftId }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.ok) {
      setReport(d.report);
      setOpenId(d.id);
      draftRef.current = null;
      loadHistory();
      return true;
    }
    if (d.error) setError(d.error);
    return false;
  };

  const newReport = async (language: string) => {
    setError(null); setReport(null); setOpenId(undefined);
    setLoading(true);
    try {
      const r = await fetch("/api/report/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartId, language }),
      });
      const d = await r.json();
      if (!r.ok || d.error) { setError(d.error || "Could not start the report."); return; }
      draftRef.current = d.draftId;
      setLoading(false);
      setWriting({ done: 0, total: d.areas.length, failed: [] });
      let failed = await writeAreas(d.draftId, d.areas, language);
      /*
       * One patient pass before asking them to do anything.
       *
       * On the free tier an area usually fails because a model's per-minute
       * budget ran dry, and it refills within the minute. Waiting fifteen
       * seconds and trying only the missing areas again finishes most reports
       * without the person ever seeing a button.
       */
      if (failed.length) {
        await new Promise((r) => setTimeout(r, 15_000));
        failed = await writeAreas(d.draftId, failed, language);
      }
      if (failed.length) { setWriting({ done: d.areas.length - failed.length, total: d.areas.length, failed }); return; }
      await finish(d.draftId);
      setWriting(null);
    } catch {
      setError("Network error while writing the report.");
    } finally {
      setLoading(false);
    }
  };

  /** Only the areas that did not make it — nothing already written is redone. */
  const retryMissing = async () => {
    const draftId = draftRef.current;
    if (!draftId || !writing?.failed.length) return;
    haptic.tap();
    const todo = writing.failed;
    setWriting({ ...writing, failed: [] });
    const failed = await writeAreas(draftId, todo, lang);
    if (failed.length) { setWriting((w) => (w ? { ...w, failed } : w)); return; }
    if (await finish(draftId)) setWriting(null);
  };

  // Load the chart once. We do NOT auto-generate the report — the user first
  // picks the report language, then taps Generate.
  useEffect(() => {
    if (!chartId) return;
    setLoading(true);
    fetch(`/api/chart/${chartId}`)
      .then(res => (res.ok ? res.json() : null))
      .then(d => {
        // The chart's own language if it has one, otherwise the language they
        // chose for the app — never a hard-coded "en".
        if (d) { setChart(d); setLang(d.birth_details?.language || getLang()); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [chartId]);

  // Generate (first time) or switch language (regenerate) — both mark "chosen".
  /*
   * "New report" means NEW.
   *
   * It called the same loader as everything else, which asks the server for a
   * cached report first — so pressing New report on a chart that already had
   * one opened the old one again, and there was no way to get a fresh reading
   * at all. Opening an old one is what the "Previous reports" list is for.
   */
  const generate = (l: string) => { setLang(l); setChosen(true); setOpenId(undefined); void newReport(l); };
  const onLangChange = (l: string) => { setLang(l); setChosen(true); loadReport(l); };

  const downloadPdf = async () => {
    if (!report) return;
    const { jsPDF } = await import("jspdf"); // lazy-loaded so it's not in the initial bundle
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const M = 44;
    const CW = PW - M * 2;
    const footerH = 30;

    // App theme colours.
    const C = {
      primary: [30, 41, 59], accent: [217, 119, 6], cream: [248, 245, 239],
      muted: [107, 114, 128], text: [31, 41, 55], white: [255, 255, 255],
      green: [21, 101, 52], red: [153, 27, 27], zebra: [249, 247, 243],
      line: [226, 232, 240], soft: [243, 240, 233],
    };
    const setText = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);
    const setFill = (c: number[]) => doc.setFillColor(c[0], c[1], c[2]);
    const setDraw = (c: number[]) => doc.setDrawColor(c[0], c[1], c[2]);

    let y = 0;
    const ensure = (h: number) => { if (y + h > PH - footerH) { doc.addPage(); y = M; } };

    // Body paragraph with comfortable line-height.
    const para = (text: string, o: { size?: number; color?: number[]; bold?: boolean; gap?: number; indent?: number } = {}) => {
      if (!text) return;
      const size = o.size ?? 10;
      const lh = size + 5;
      const x = M + (o.indent ?? 0);
      doc.setFont("helvetica", o.bold ? "bold" : "normal");
      doc.setFontSize(size);
      setText(o.color || C.text);
      for (const ln of doc.splitTextToSize(String(text), CW - (o.indent ?? 0))) {
        ensure(lh); doc.text(ln, x, y); y += lh;
      }
      y += o.gap ?? 6;
    };

    // Paragraph that renders **bold** segments inline, with word-wrapping.
    const richPara = (text: string, o: { size?: number; color?: number[]; gap?: number } = {}) => {
      if (!text) return;
      const size = o.size ?? 10;
      const lh = size + 5;
      setText(o.color || C.text);
      doc.setFontSize(size);
      // tokenize into bold / normal segments
      const tokens: { t: string; bold: boolean }[] = [];
      const re = /\*\*([^*]+)\*\*/g;
      let last = 0, m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        if (m.index > last) tokens.push({ t: text.slice(last, m.index), bold: false });
        tokens.push({ t: m[1], bold: true });
        last = re.lastIndex;
      }
      if (last < text.length) tokens.push({ t: text.slice(last), bold: false });

      let x = M;
      ensure(lh);
      for (const tok of tokens) {
        doc.setFont("helvetica", tok.bold ? "bold" : "normal");
        for (const w of tok.t.split(/(\s+)/)) {
          if (!w) continue;
          const ww = doc.getTextWidth(w);
          if (/^\s+$/.test(w)) { if (x > M) x += ww; continue; }
          if (x + ww > M + CW) { y += lh; x = M; ensure(lh); }
          doc.text(w, x, y); x += ww;
        }
      }
      y += lh + (o.gap ?? 9);
    };

    // Big section heading with an accent underline + light rule.
    const heading = (t: string) => {
      ensure(34); y += 10;
      doc.setFont("helvetica", "bold"); doc.setFontSize(13.5); setText(C.primary);
      doc.text(t, M, y); y += 7;
      setDraw(C.accent); doc.setLineWidth(2); doc.line(M, y, M + 46, y);
      setDraw(C.line); doc.setLineWidth(0.6); doc.line(M + 50, y, PW - M, y);
      doc.setLineWidth(1); y += 16;
    };

    // Bold sub-label (for fields inside a section) — uniform navy, professional.
    const subLabel = (t: string) => {
      ensure(16); y += 2;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); setText(C.primary);
      doc.text(t.toUpperCase(), M, y);
      y += 4;
      setDraw(C.line); doc.setLineWidth(0.4); doc.line(M, y, M + 80, y);
      y += 9;
    };

    const ABBR: Record<string, string> = {
      Sun: "Su", Moon: "Mo", Mars: "Ma", Mercury: "Me", Jupiter: "Ju",
      Venus: "Ve", Saturn: "Sa", Rahu: "Ra", Ketu: "Ke", Ascendant: "As",
    };
    const abbr = (n: string) => ABBR[n] || n.slice(0, 2);

    // Draw a North-Indian (diamond) chart at (ox,oy) of given size with houses.
    const POS: Record<number, [number, number]> = {
      1: [0.5, 0.27], 2: [0.27, 0.12], 3: [0.12, 0.27], 4: [0.27, 0.5],
      5: [0.12, 0.73], 6: [0.27, 0.88], 7: [0.5, 0.73], 8: [0.73, 0.88],
      9: [0.88, 0.73], 10: [0.73, 0.5], 11: [0.88, 0.27], 12: [0.73, 0.12],
    };
    const drawChart = (ox: number, oy: number, size: number, title: string, houses: any[]) => {
      // title
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); setText(C.primary);
      doc.text(title, ox + size / 2, oy - 6, { align: "center" });
      // frame + diagonals + diamond
      setDraw(C.primary); doc.setLineWidth(1);
      doc.rect(ox, oy, size, size);
      doc.line(ox, oy, ox + size, oy + size);
      doc.line(ox + size, oy, ox, oy + size);
      doc.line(ox + size / 2, oy, ox + size, oy + size / 2);
      doc.line(ox + size, oy + size / 2, ox + size / 2, oy + size);
      doc.line(ox + size / 2, oy + size, ox, oy + size / 2);
      doc.line(ox, oy + size / 2, ox + size / 2, oy);
      (houses || []).forEach((h: any) => {
        const pos = POS[h.house]; if (!pos) return;
        const cx = ox + pos[0] * size, cy = oy + pos[1] * size;
        // faint sign number
        doc.setFont("helvetica", "normal"); doc.setFontSize(6); setText(C.muted);
        doc.text(String((h.sign_id ?? 0) + 1), cx, cy - 7, { align: "center" });
        // planets (mark ascendant in house 1)
        let names = (h.planets || []).map(abbr);
        if (h.house === 1) names = ["As", ...names];
        if (!names.length) return;
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); setText(C.primary);
        const lines = doc.splitTextToSize(names.join(" "), size * 0.3);
        lines.forEach((ln: string, i: number) => doc.text(ln, cx, cy + 3 + i * 8, { align: "center" }));
      });
    };

    const b = chart?.birth_details, s = chart?.summary;
    const dasha = chart?.dasha, cur = dasha?.current;
    const name = b?.name || "Chart";
    const todayStr = new Date().toISOString().slice(0, 10);

    // ===== Header band =====
    setFill(C.primary); doc.rect(0, 0, PW, 96, "F");
    setFill(C.accent); doc.rect(0, 96, PW, 3, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); setText(C.accent);
    doc.text("JanamJyot", M, 30);
    doc.setFontSize(20); setText(C.white);
    doc.text(`${name}`, M, 58);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); setText([203, 213, 225]);
    doc.text("Vedic Life Report", M, 76);
    doc.setFontSize(8.5); setText([148, 163, 184]);
    doc.text(`Generated ${todayStr}`, PW - M, 30, { align: "right" });
    y = 96 + 24;

    // ===== Birth details =====
    heading("Birth Details");
    if (b) {
      const fields: [string, string][] = [
        ["Name", b.name || "-"],
        ["Date of Birth", b.date_of_birth || "-"],
        ["Time of Birth", b.time_of_birth || "-"],
        ["Place of Birth", b.place_of_birth || "-"],
        ["Coordinates", b.latitude != null ? `${b.latitude}, ${b.longitude}` : "-"],
        ["Timezone", b.timezone || "-"],
        ["Lagna (Ascendant)", s?.lagna || "-"],
        ["Moon Rashi", s?.rashi || "-"],
        ["Sun Sign", s?.sun_sign || "-"],
        ["Nakshatra", s?.nakshatra ? `${s.nakshatra}${s.nakshatra_pada ? " (Pada " + s.nakshatra_pada + ")" : ""}` : "-"],
      ];
      const rows = Math.ceil(fields.length / 2);
      const rowH = 34;
      const boxH = rows * rowH + 22;
      ensure(boxH);
      setFill(C.soft); doc.roundedRect(M, y, CW, boxH, 6, 6, "F");
      const colW = CW / 2;
      fields.forEach((fd, i) => {
        const r = Math.floor(i / 2), c = i % 2;
        const x = M + 16 + c * colW;
        const ry = y + 24 + r * rowH;
        // label (small, muted) on top, value (bold) clearly below it
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); setText(C.muted);
        doc.text(fd[0].toUpperCase(), x, ry);
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); setText(C.primary);
        doc.text(doc.splitTextToSize(fd[1], colW - 30)[0], x, ry + 14);
      });
      // light separators between rows for clarity
      setDraw(C.line); doc.setLineWidth(0.5);
      for (let r = 1; r < rows; r++) doc.line(M + 12, y + 8 + r * rowH, M + CW - 12, y + 8 + r * rowH);
      y += boxH + 8;
    }

    // ===== Birth charts (D1 + D9) =====
    const d1h = chart?.d1_chart?.houses, d9h = chart?.d9_chart?.houses;
    if (d1h?.length || d9h?.length) {
      heading("Birth Charts");
      const size = Math.min(210, (CW - 30) / 2);
      ensure(size + 24);
      const oy = y + 16;
      if (d1h?.length) drawChart(M, oy, size, "D1 — Lagna (Rasi) Chart", d1h);
      if (d9h?.length) drawChart(M + size + 30, oy, size, "D9 — Navamsa Chart", d9h);
      y = oy + size + 12;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); setText(C.muted);
      ensure(12);
      doc.text("Numbers = sign (1 Aries … 12 Pisces) · As = Ascendant · Su/Mo/Ma/Me/Ju/Ve/Sa/Ra/Ke = planets", M, y);
      y += 14;
    }

    // ===== Current dasha highlight =====
    if (cur && (cur.mahadasha || cur.antardasha)) {
      heading("Current Dasha Period");
      ensure(54);
      const bw = (CW - 14) / 2;
      const box = (x: number, ttl: string, lord: string, from: string, to: string, tint: number[]) => {
        setFill(C.soft); doc.roundedRect(x, y, bw, 50, 6, 6, "F");
        setFill(tint); doc.roundedRect(x, y, 4, 50, 2, 2, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); setText(C.muted);
        doc.text(ttl.toUpperCase(), x + 14, y + 16);
        doc.setFont("helvetica", "bold"); doc.setFontSize(15); setText(C.primary);
        doc.text(lord || "-", x + 14, y + 34);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); setText(C.muted);
        if (from) doc.text(`${from}  to  ${to}`, x + 14, y + 45);
      };
      box(M, "Mahadasha", cur.mahadasha, cur.mahadasha_from, cur.mahadasha_to, [124, 58, 237]);
      box(M + bw + 14, "Antardasha", cur.antardasha, cur.antardasha_from, cur.antardasha_to, [79, 70, 229]);
      y += 50 + 10;
    }

    // ===== Mahadasha timeline =====
    const tableBlock = (cols: { label: string; w: number }[], rows: string[][]) => {
      const rowH = 16;
      ensure(rowH);
      setFill(C.primary); doc.rect(M, y, CW, rowH, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); setText(C.white);
      let cx = M; cols.forEach(c => { doc.text(c.label, cx + 6, y + 11); cx += c.w * CW; });
      y += rowH;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      rows.forEach((r, idx) => {
        ensure(rowH);
        if (idx % 2 === 0) { setFill(C.zebra); doc.rect(M, y, CW, rowH, "F"); }
        setText(C.text); cx = M;
        r.forEach((v, i) => { doc.text(String(v), cx + 6, y + 11); cx += cols[i].w * CW; });
        y += rowH;
      });
      y += 14;
    };

    if (dasha?.mahadasha?.length) {
      heading("Mahadasha Timeline (Vimshottari)");
      tableBlock(
        [{ label: "Mahadasha Lord", w: 0.4 }, { label: "From", w: 0.3 }, { label: "To", w: 0.3 }],
        dasha.mahadasha.map((m: any) => [m.lord, m.from, m.to])
      );
    }

    const upcoming = chart?.dashas?.next_7_years;
    if (upcoming?.length) {
      heading("Upcoming Antardasha (next ~7 years)");
      tableBlock(
        [{ label: "Period (Maha-Antar)", w: 0.4 }, { label: "From", w: 0.3 }, { label: "To", w: 0.3 }],
        upcoming.slice(0, 14).map((a: any) => [a.period, a.from, a.to])
      );
    }

    // ===== Planetary positions =====
    if (chart?.planets?.length) {
      heading("Planetary Positions");
      tableBlock(
        [{ label: "Planet", w: 0.3 }, { label: "Sign", w: 0.26 }, { label: "House", w: 0.18 }, { label: "Nakshatra", w: 0.26 }],
        chart.planets.map((p: any) => [
          p.planet + (p.retrograde ? " (R)" : ""), p.sign, "House " + p.house, p.nakshatra || "-",
        ])
      );
    }

    // ===== AI reading sections =====
    for (const sec of SECTIONS) {
      const data = report[sec.id];
      if (!data || data.error) continue;
      ensure(40); y += 8;
      const barH = 26;
      setFill(C.soft); doc.roundedRect(M, y, CW, barH, 5, 5, "F");
      setFill(C.accent); doc.roundedRect(M, y, 5, barH, 2, 2, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); setText(C.primary);
      doc.text(sec.title, M + 16, y + 17);
      y += barH + 12;

      const f = (lbl: string, val: string) => {
        if (!val) return;
        subLabel(lbl);
        richPara(val, { size: 10, gap: 9 });
      };
      f("Overall Pattern", data.summary || data.overall);
      f("Past", data.past);
      f("Current Phase", data.present || data.current);
      f("Next 5-7 Years", data.future || data.next);
      f("Positive Indications", data.positive || data.growth || data.strengths || data.compatibility);
      f("Challenges / Cautions", data.caution || data.risk || data.challenges || data.delay);
      f("Practical Guidance", data.guidance || data.practical_guidance);
      if (data.disclaimer) {
        ensure(20); setDraw(C.line); doc.setLineWidth(0.5); doc.line(M, y, PW - M, y); y += 8;
        para(data.disclaimer, { size: 8, color: C.muted, gap: 6 });
      }
      y += 6;
    }

    // ===== Short summary at the end =====
    const brief = (t: string) => {
      if (!t) return "";
      const s = String(t).replace(/\*\*/g, "").trim();
      const dot = s.indexOf(". ");
      if (dot > 40 && dot < 220) return s.slice(0, dot + 1);
      return s.length > 220 ? s.slice(0, 217).trim() + "…" : s;
    };
    const sums = SECTIONS
      .map((sec) => ({ sec, data: report[sec.id] }))
      .filter((x) => x.data && !x.data.error && (x.data.summary || x.data.overall));
    if (sums.length) {
      heading("Summary — Key Highlights");
      for (const { sec, data } of sums) {
        subLabel(sec.title);
        richPara(brief(data.summary || data.overall), { size: 9.5, gap: 8 });
      }
    }

    // ===== Footer on every page =====
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      setDraw(C.line); doc.setLineWidth(0.6); doc.line(M, PH - footerH + 4, PW - M, PH - footerH + 4);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); setText(C.muted);
      doc.text(`Vedic Astra  ·  ${name}`, M, PH - 14);
      doc.text(`Page ${i} of ${pages}`, PW - M, PH - 14, { align: "right" });
    }

    // `doc.save()` triggers a browser download, which does nothing inside the
    // Android webview. Hand the bytes to the native layer instead: it writes the
    // file to the phone's Documents folder, posts a "saved" notification, and
    // offers the system share sheet.
    const fileName = `${name.replace(/\s+/g, "_")}_Life_Report.pdf`;
    if (!isNative) {
      doc.save(fileName);
      return;
    }
    try {
      const uri = await saveToDownloads(fileName, doc.output("datauristring"), {
        notifyTitle: "Life Report ready",
        notifyBody: `${name}'s full life report PDF is ready`,
      });
      if (uri) await shareFile(uri, "Life Report");
    } catch {
      alert("Couldn't save the report. Check your storage.");
    }
  };

  // Build chart props.
  const d1Planets = (chart?.planets ?? []).map((p: any) => ({ ...p, short: String(p.planet ?? "").substring(0, 2) }));
  const d9 = chart?.d9_chart;
  const d9Planets = (d9?.planet_positions ?? []).map((p: any) => ({ ...p, short: String(p.planet ?? "").substring(0, 2) }));

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b pb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/dashboard/${chartId}`}><ArrowLeft className="w-5 h-5"/></Link>
        </Button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
            Life Report <Sparkles className="w-5 h-5 text-accent"/>
          </h1>
          <p className="text-muted-foreground text-sm">
            {chart?.birth_details?.name ? `${chart.birth_details.name} — ` : ""}AI reading from the calculated chart.
          </p>
        </div>
        {/* The toolbar acts on a report — before one is open it is three
            controls for something that does not exist yet. */}
        <div className={`flex items-center gap-2 ${report ? "" : "hidden"}`}>
          <Languages className="w-4 h-4 text-muted-foreground" />
          <select
            value={lang}
            onChange={e => onLangChange(e.target.value)}
            disabled={loading}
            className="h-9 rounded-md border border-input bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2"
            title="Report language"
          >
            {LANGS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => loadReport(lang, true)} title="Regenerate fresh">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" disabled={!report || loading} onClick={downloadPdf}>
            <Download className="w-4 h-4 mr-1"/> PDF
          </Button>
        </div>
      </div>

      {/* Everything below belongs WITH a report, not in front of one.
          Before there is a reading, a screen full of charts, a dasha bar and a
          past-timeline card is a wall between the person and the one thing they
          came to do. It appears the moment a report is open. */}
      {report && chart?.summary && (
        <div className="rounded-3xl bg-gradient-to-br from-primary to-indigo-900 text-white p-6 shadow-lg">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <h2 className="text-2xl font-bold">{chart.birth_details?.name}</h2>
              <p className="text-sm text-white/70 mt-1">
                {chart.birth_details?.date_of_birth} · {chart.birth_details?.time_of_birth} · {chart.birth_details?.place_of_birth}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                {[
                  ["Lagna", chart.summary.lagna],
                  ["Rashi", chart.summary.rashi],
                  ["Nakshatra", chart.summary.nakshatra],
                  ["Dasha", `${chart.summary.current_mahadasha}-${chart.summary.current_antardasha}`],
                ].map(([k, v]) => (
                  <div key={k} className="bg-white/10 rounded-xl px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-white/60">{k}</p>
                    <p className="font-semibold text-sm">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      {report && chart?.planets && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-2xl border shadow-sm p-4 va-rise va-card-hover" style={{ animationDelay: "0.05s" }}>
            <h3 className="font-bold text-primary mb-3 text-center">D1 — Lagna Chart</h3>
            <NorthIndianChart planets={d1Planets} ascendantSign={chart.ascendant?.sign} />
          </div>
          {d9 && (
            <div className="bg-card rounded-2xl border shadow-sm p-4 va-rise va-card-hover" style={{ animationDelay: "0.12s" }}>
              <h3 className="font-bold text-primary mb-3 text-center">D9 — Navamsa Chart</h3>
              <NorthIndianChart planets={d9Planets} ascendantSign={d9.ascendant_sign} />
            </div>
          )}
        </div>
      )}

      {/* Dasha timeline graph */}
      {report && chart?.dasha && <DashaTimeline dasha={chart.dasha} />}

      {/*
        The past comes BEFORE the forecast — and before the paywall for the full
        report. A reading that opens on 2029 asks for trust it has not earned;
        one that opens on a stretch the reader recognises has earned it. It is
        also the honest order to sell in: see whether this thing knows you,
        then decide whether to buy the rest.
      */}
      {report && chartId && chart && <PastTimeline chartId={chartId} lang={lang} />}

      {/* Report body */}
      {!chosen && !report ? (
        /* ── The landing: two things to do, nothing else ───────────────────
           It used to open on charts, a dasha bar and a past-timeline card,
           with the actual choice buried under all of it. A person arriving
           here wants one of exactly two things: make a new report, or open one
           they already have. So that is the whole screen. */
        <div className="mx-auto max-w-lg space-y-3">
          {history === null && <div className="skeleton h-[104px]" />}

          {history !== null && (
            <>
              <div className="rounded-3xl border bg-card p-6 text-center shadow-sm va-rise">
                <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
                  <Sparkles className="h-7 w-7" />
                </div>
                <h2 className="text-[19px] font-bold text-primary">{t("Your full life report")}</h2>
                <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">
                  {t("Seven areas of your life, read from your own chart — with the periods you have already lived, so you can check it.")}
                </p>

                {/* Language belongs to the NEW report, so it sits with it. */}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {LANGS.map(l => (
                    <button
                      key={l.value}
                      onClick={() => { haptic.tap(); setLang(l.value); }}
                      className={`rounded-full border-2 px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${
                        lang === l.value ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card text-foreground/75"
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>

                <Button size="lg" className="mt-4 w-full" onClick={() => generate(lang)}>
                  <Sparkles className="mr-2 h-4 w-4" /> {t("New report")}
                </Button>
              </div>

              {/* Reports they already have — opening one is free and instant. */}
              <div className="rounded-3xl border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2 px-1 pb-2">
                  <History className="h-4 w-4 text-accent" />
                  <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t("Previous reports")}
                  </h3>
                </div>

                {!history.length && (
                  <p className="px-1 py-3 text-[13px] text-muted-foreground">
                    {t("None yet — the reports you make are kept here.")}
                  </p>
                )}

                <div className="space-y-2">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center gap-2 rounded-2xl border-2 border-border px-3.5 py-3">
                      <button onClick={() => openSaved(h.id)} className="min-w-0 flex-1 text-left">
                        <span className="block text-[14px] font-bold">
                          {new Date(h.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        <span className="block text-[12px] text-muted-foreground">
                          {(LANGS.find((l) => l.value === h.language)?.label) || h.language} · {h.areas} {t("areas")}
                        </span>
                      </button>
                      <button
                        onClick={() => removeSaved(h.id)}
                        aria-label={t("Delete")}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-destructive"
                      >
                        <Trash2 className="h-[17px] w-[17px]" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      ) : (loading || writing) && !report ? (
        <ReportProgress />
      ) : error || !report ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-muted-foreground">{error || "No report available."}</p>
          <Button onClick={() => loadReport(lang, true)}>Try again</Button>
        </div>
      ) : (
        <div className="max-w-4xl">
          {/* ── One area at a time ───────────────────────────────────────────
              Seven areas stacked on a phone is a forty-screen scroll, and the
              thing people actually do with a report — read the one part they
              came for — costs them a hunt. So it reads like a notebook: tabs
              across the top, one section on the page, and next/back at the end
              for anyone who does want the whole thing. */}
          {/* Each area's own score, on its tab.
              A number the reader can see before opening anything turns seven
              tabs into a summary of the whole report: where they are strong,
              where the work is. The bar carries it at a glance — the reading
              underneath says why. */}
          <div className="-mx-4 mb-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max gap-2.5">
              {present.map((section) => {
                const Icon = section.icon;
                const on = section.id === active;
                const score = Number(report[section.id]?.rating);
                const has = Number.isFinite(score) && score >= 1 && score <= 10;
                // Green is genuinely good, amber is mixed, rose is hard. A
                // report where every tile is green says nothing.
                const tone = !has ? 'text-muted-foreground' : score >= 7 ? 'text-emerald-600' : score >= 4 ? 'text-amber-600' : 'text-rose-600';
                const bar = !has ? 'bg-muted-foreground/30' : score >= 7 ? 'bg-emerald-500' : score >= 4 ? 'bg-amber-500' : 'bg-rose-500';
                return (
                  <button
                    key={section.id}
                    onClick={() => { haptic.tap(); setActive(section.id); topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}
                    className={`w-[112px] shrink-0 rounded-2xl border-2 p-3 text-left transition-colors ${
                      on ? 'border-primary bg-accent/10' : 'border-border bg-card'
                    }`}
                  >
                    <Icon className={`h-[17px] w-[17px] ${on ? 'text-accent' : 'text-muted-foreground'}`} />
                    <p className="mt-1.5 truncate text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                      {t(section.title)}
                    </p>
                    {has ? (
                      <>
                        <p className={`text-[20px] font-bold leading-tight ${tone}`}>
                          {score}<span className="text-[11px] font-semibold text-muted-foreground">/10</span>
                        </p>
                        <span className="mt-1 block h-[5px] w-full overflow-hidden rounded-full bg-muted">
                          <span className={`block h-full rounded-full ${bar}`} style={{ width: `${score * 10}%` }} />
                        </span>
                      </>
                    ) : (
                      <p className="mt-1 text-[12px] font-semibold text-muted-foreground">{t("Open")}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <span ref={topRef} />

          {/* Being written: how far along, and — if some areas would not come —
              a button that writes only those. */}
          {writing && (
            <div className="mb-4 rounded-2xl border-2 border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[14px] font-bold">
                  {writing.failed.length ? t("Almost done") : t("Writing your report")} · {writing.done}/{writing.total}
                </p>
                {!writing.failed.length && <RefreshCw className="h-4 w-4 animate-spin text-accent" />}
              </div>
              <span className="mt-2 block h-[6px] w-full overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-accent transition-all" style={{ width: `${(writing.done / writing.total) * 100}%` }} />
              </span>
              {!!writing.failed.length && (
                <>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    {t("A few areas could not be written just now. Everything above is saved — this only writes what is missing.")}
                  </p>
                  <Button className="mt-3 w-full" onClick={retryMissing}>
                    <RefreshCw className="mr-2 h-4 w-4" /> {t("Write the missing areas")}
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Written, but not all of it — say so, and offer the rest for free. */}
          {report.partial && (
            <div className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
              <p className="text-[14px] font-bold text-amber-900">
                {t("Some areas are still missing")}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-amber-900/80">
                {t("The AI ran out of capacity part-way. What is written below is yours to read — finishing the rest costs you nothing.")}
              </p>
              <Button className="mt-3 w-full" onClick={() => loadReport(lang, true)} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> {t("Finish the report")}
              </Button>
            </div>
          )}

          {present.filter((s) => s.id === active).map((section) => {
            const data = report[section.id];
            return (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24 bg-card rounded-3xl border shadow-sm overflow-hidden va-rise"
              >
                {/* header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b bg-gradient-to-r from-primary to-primary/85">
                  <span className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                    <section.icon className="w-5 h-5 text-accent"/>
                  </span>
                  <h2 className="text-[19px] font-bold tracking-tight text-white">{t(section.title)}</h2>
                  <SpeakButton
                    className="ml-auto text-white/70 hover:text-white hover:bg-white/10"
                    lang={getLang()}
                    text={[section.title, data.summary || data.overall, data.past, data.present || data.current, data.future || data.next].filter(Boolean).join('. ')}
                  />
                </div>

                <div className="space-y-6 p-5 sm:p-6">
                  {/* lead / overall */}
                  <div className="relative border-l-4 border-accent pl-4">
                    <h4 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-accent">{t("Overall Pattern")}</h4>
                    <p className="text-[16px] font-semibold leading-relaxed text-primary"><AnswerText text={data.summary || data.overall} /></p>
                  </div>

                  {/* past / present — items-start so a one-bullet "present" is
                      not stretched to the height of a five-bullet "past", which
                      reads as a section with nothing in it. */}
                  <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
                    <div className="rounded-2xl bg-secondary/40 p-5">
                      <h4 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-primary">
                        <History className="h-3.5 w-3.5 text-accent"/> {t("Past")}
                      </h4>
                      <div className="text-foreground/85"><AnswerText text={data.past} /></div>
                    </div>
                    <div className="rounded-2xl bg-secondary/40 p-5">
                      <h4 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-primary">
                        <Compass className="h-3.5 w-3.5 text-accent"/> {t("Current Phase")}
                      </h4>
                      <div className="text-foreground/85"><AnswerText text={data.present || data.current} /></div>
                    </div>
                  </div>

                  {/* future */}
                  <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5">
                    <h4 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-accent">
                      <TrendingUp className="h-3.5 w-3.5"/> {t("Next 5-7 Years")}
                    </h4>
                    <div className="text-foreground/90"><AnswerText text={data.future || data.next} /></div>
                  </div>

                  {/* positive / cautions */}
                  <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2">
                    <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-5">
                      <h4 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5"/> {t("Positive")}
                      </h4>
                      <div className="text-emerald-950/80"><AnswerText text={data.positive || data.growth || data.strengths || data.compatibility} /></div>
                    </div>
                    <div className="rounded-2xl border border-rose-200/70 bg-rose-50/50 p-5">
                      <h4 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-rose-700">
                        <AlertTriangle className="h-3.5 w-3.5"/> {t("Cautions")}
                      </h4>
                      <div className="text-rose-950/80"><AnswerText text={data.caution || data.risk || data.challenges || data.delay} /></div>
                    </div>
                  </div>

                  {/* guidance */}
                  <div className="rounded-2xl border border-primary/10 bg-primary/[0.04] p-5">
                    <h4 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-primary">
                      <Lightbulb className="h-3.5 w-3.5 text-accent"/> {t("Practical Guidance")}
                    </h4>
                    <div className="font-medium text-primary"><AnswerText text={data.guidance || data.practical_guidance} /></div>
                  </div>

                  {data.disclaimer && (
                    <p className="border-t border-dashed pt-4 text-[12px] italic leading-relaxed text-muted-foreground">{data.disclaimer}</p>
                  )}
                </div>
              </section>
            );
          })}

          {/* The small chat beside the report — and it opens the section a
              question is about. Not offered on a partial report: it reads the
              stored one, which a partial report never is. */}
          {chartId && !report.partial && !writing && (
            <ReportChat
              chartId={chartId}
              reportId={openId}
              lang={lang}
              onSection={(id) => { if (present.some((p) => p.id === id)) { setActive(id); topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }}
            />
          )}

          {/* Back / next, for reading the whole thing in order. */}
          <div className="mt-4 flex items-center gap-2.5">
            {prevSection ? (
              <button
                onClick={() => { haptic.tap(); setActive(prevSection.id); topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border-2 border-border px-4 py-3 text-left"
              >
                <ChevronLeft className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">{t("Back")}</span>
                  <span className="block truncate text-[13.5px] font-bold">{t(prevSection.title)}</span>
                </span>
              </button>
            ) : <span className="flex-1" />}
            {nextSection ? (
              <button
                onClick={() => { haptic.tap(); setActive(nextSection.id); topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}
                className="flex min-w-0 flex-1 items-center justify-end gap-2 rounded-2xl border-2 border-accent bg-accent/10 px-4 py-3 text-right"
              >
                <span className="min-w-0">
                  <span className="block text-[10.5px] font-bold uppercase tracking-wider text-accent/80">{t("Next")}</span>
                  <span className="block truncate text-[13.5px] font-bold text-accent">{t(nextSection.title)}</span>
                </span>
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-accent" />
              </button>
            ) : <span className="flex-1" />}
          </div>
        </div>
      )}
    </div>
  );
}
