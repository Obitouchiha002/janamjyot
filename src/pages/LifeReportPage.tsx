import { useEffect, useState } from "react";
import { PastTimeline } from "@/components/PastTimeline";
import { ReportProgress } from "@/components/ReportProgress";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, Activity, Coins, Briefcase, Heart, Users, Plane, Store, Download, RefreshCw, Languages, CheckCircle2, AlertTriangle, Lightbulb, History, Compass, TrendingUp } from "lucide-react";
import { NorthIndianChart } from "@/components/NorthIndianChart";
import { isNative, saveToDownloads, shareFile } from "@/lib/native";
import SpeakButton from "@/components/SpeakButton";
import { getLang } from "@/lib/prefs";

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
function RichText({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <>
      {String(text).split(/(\*\*[^*]+?\*\*)/g).map((p, i) => {
        const m = /^\*\*([\s\S]+?)\*\*$/.exec(p);
        return m ? <strong key={i} className="va-key">{m[1]}</strong> : <span key={i}>{p}</span>;
      })}
    </>
  );
}

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
        else setReport(d);
      })
      .catch(() => setError("Network error while generating the report."))
      .finally(() => setLoading(false));
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
  const generate = (l: string) => { setLang(l); setChosen(true); loadReport(l); };
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
        <div className="flex items-center gap-2">
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

      {/* Header / chart summary card */}
      {chart?.summary && (
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
      {chart?.planets && (
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
      {chart?.dasha && <DashaTimeline dasha={chart.dasha} />}

      {/*
        The past comes BEFORE the forecast — and before the paywall for the full
        report. A reading that opens on 2029 asks for trust it has not earned;
        one that opens on a stretch the reader recognises has earned it. It is
        also the honest order to sell in: see whether this thing knows you,
        then decide whether to buy the rest.
      */}
      {chartId && chart && <PastTimeline chartId={chartId} lang={lang} />}

      {/* Report body */}
      {!chosen && !report ? (
        /* Language gate — pick a language, THEN generate. */
        <div className="max-w-lg mx-auto rounded-3xl border bg-card p-7 text-center shadow-sm va-rise">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
            <Languages className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-primary">Which language for your report?</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We'll write your full life report in the language you choose.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            {LANGS.map(l => (
              <button
                key={l.value}
                onClick={() => setLang(l.value)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  lang === l.value
                    ? "border-accent bg-accent text-accent-foreground shadow"
                    : "border-input bg-white text-foreground hover:border-accent/50"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <Button size="lg" className="mt-6 w-full" onClick={() => generate(lang)}>
            <Sparkles className="w-4 h-4 mr-2" /> Generate My Report
          </Button>
        </div>
      ) : loading ? (
        <ReportProgress />
      ) : error || !report ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-muted-foreground">{error || "No report available."}</p>
          <Button onClick={() => loadReport(lang, true)}>Try again</Button>
        </div>
      ) : (
        <div className="space-y-8 max-w-4xl">
          {SECTIONS.map((section, idx) => {
            const data = report[section.id];
            if (!data || data.error) return null;
            return (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24 bg-card rounded-3xl border shadow-sm overflow-hidden va-rise va-card-hover"
                style={{ animationDelay: `${0.18 + idx * 0.09}s` }}
              >
                {/* header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b bg-gradient-to-r from-primary to-primary/85">
                  <span className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                    <section.icon className="w-5 h-5 text-accent"/>
                  </span>
                  <h2 className="text-xl font-bold tracking-tight text-white">{section.title}</h2>
                  <SpeakButton
                    className="ml-auto text-white/70 hover:text-white hover:bg-white/10"
                    lang={getLang()}
                    text={[section.title, data.summary || data.overall, data.past, data.present || data.current, data.future || data.next].filter(Boolean).join('. ')}
                  />
                </div>

                <div className="p-6 space-y-6">
                  {/* lead / overall */}
                  <div className="relative pl-4 border-l-4 border-accent">
                    <h4 className="text-[11px] uppercase tracking-widest font-bold text-accent mb-1">Overall Pattern</h4>
                    <p className="text-primary font-semibold text-lg leading-relaxed"><RichText text={data.summary || data.overall} /></p>
                  </div>

                  {/* past / present */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="rounded-2xl bg-secondary/40 p-4 va-tile-hover">
                      <h4 className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-primary mb-1.5">
                        <History className="w-3.5 h-3.5 text-accent"/> Past
                      </h4>
                      <p className="text-foreground/85 text-sm leading-relaxed"><RichText text={data.past} /></p>
                    </div>
                    <div className="rounded-2xl bg-secondary/40 p-4 va-tile-hover">
                      <h4 className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-primary mb-1.5">
                        <Compass className="w-3.5 h-3.5 text-accent"/> Current Phase
                      </h4>
                      <p className="text-foreground/85 text-sm leading-relaxed"><RichText text={data.present || data.current} /></p>
                    </div>
                  </div>

                  {/* future */}
                  <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 va-tile-hover">
                    <h4 className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-accent mb-1.5">
                      <TrendingUp className="w-3.5 h-3.5"/> Next 5-7 Years
                    </h4>
                    <p className="text-foreground/90 text-sm leading-relaxed"><RichText text={data.future || data.next} /></p>
                  </div>

                  {/* positive / cautions — refined, professional tints */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-4 va-tile-hover">
                      <h4 className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-emerald-700 mb-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5"/> Positive
                      </h4>
                      <p className="text-sm leading-relaxed text-emerald-950/80"><RichText text={data.positive || data.growth || data.strengths || data.compatibility} /></p>
                    </div>
                    <div className="rounded-2xl border border-rose-200/70 bg-rose-50/50 p-4 va-tile-hover">
                      <h4 className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-rose-700 mb-1.5">
                        <AlertTriangle className="w-3.5 h-3.5"/> Cautions
                      </h4>
                      <p className="text-sm leading-relaxed text-rose-950/80"><RichText text={data.caution || data.risk || data.challenges || data.delay} /></p>
                    </div>
                  </div>

                  {/* guidance */}
                  <div className="rounded-2xl bg-primary/[0.04] border border-primary/10 p-4 va-tile-hover">
                    <h4 className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-primary mb-1.5">
                      <Lightbulb className="w-3.5 h-3.5 text-accent"/> Practical Guidance
                    </h4>
                    <p className="text-primary font-medium text-sm leading-relaxed"><RichText text={data.guidance || data.practical_guidance} /></p>
                  </div>

                  {data.disclaimer && (
                    <p className="text-xs text-muted-foreground italic pt-3 border-t border-dashed">{data.disclaimer}</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
