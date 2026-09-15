import { useEffect, useState } from "react";
import { ReportProgress } from "@/components/ReportProgress";
import { useParams } from "react-router-dom";
import { Download, Share2, Sparkles, Loader2 } from "lucide-react";
import AnswerText from "@/components/AnswerText";
import SpeakButton from "@/components/SpeakButton";
import { Pressable } from "@/components/mobile/Pressable";
import { LoadError } from "@/components/ErrorState";
import { isNative, saveToDownloads, shareFile, shareText } from "@/lib/native";
import { getLang } from "@/lib/prefs";

const md = (s?: string) => (s || "").replace(/\*\*/g, "");

export default function ReportViewPage() {
  const { chartId, type } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "pdf" | "share">("");
  const lang = getLang();

  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!chartId || !type) return;
    setLoading(true); setFailed(false);
    fetch(`/api/chart/${chartId}/report/${type}?lang=${encodeURIComponent(lang)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => (j?.error ? setFailed(true) : setData(j)))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [chartId, type, reload]);

  const fileName = () => `JanamJyot-${md(data?.title || "Report").replace(/[^a-z0-9]+/gi, "-")}.pdf`;

  const buildPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const M = 48, PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), maxW = PW - M * 2;
    let y = 66;
    const b = data.birth_details || {};

    const wrap = (text: string, size: number, color: number[], gap = 14, font = "helvetica", style = "normal") => {
      doc.setFont(font, style); doc.setFontSize(size); doc.setTextColor(color[0], color[1], color[2]);
      for (const ln of doc.splitTextToSize(md(text), maxW)) {
        if (y > PH - 60) { doc.addPage(); y = 66; }
        doc.text(ln, M, y); y += gap;
      }
    };

    doc.setFont("times", "bold"); doc.setFontSize(22); doc.setTextColor(20, 30, 60);
    doc.text(md(data.title || "Report"), M, y); y += 24;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(120, 120, 120);
    doc.text(`${b.name || ""}  ·  ${b.date_of_birth || ""} ${b.time_of_birth || ""}  ·  ${b.place_of_birth || ""}`, M, y);
    y += 10;
    doc.setDrawColor(216, 171, 78); doc.setLineWidth(1.2); doc.line(M, y, PW - M, y); y += 24;

    if (data.intro) { wrap(data.intro, 12, [70, 70, 82], 16); y += 8; }
    for (const s of data.sections || []) {
      if (y > PH - 110) { doc.addPage(); y = 66; }
      wrap(s.heading, 14, [176, 117, 16], 18, "times", "bold");
      wrap(s.body, 11, [50, 50, 62], 15); y += 12;
    }
    if (data.disclaimer) { y += 4; wrap(data.disclaimer, 9.5, [150, 150, 150], 12, "helvetica", "italic"); }

    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(180, 150, 80);
    doc.text("JanamJyot · janamjyot.lzworth.in", M, PH - 28);
    return doc;
  };

  const onDownload = async () => {
    if (!data) return;
    setBusy("pdf");
    try {
      const doc = await buildPdf();
      const uri = await saveToDownloads(fileName(), doc.output("datauristring"), { notifyTitle: data.title, notifyBody: "Report PDF ready" });
      // Android scoped storage saves into an app-private folder the user can't
      // browse to — so open the system sheet to let them keep it (Files, Drive,
      // WhatsApp…). This is the reliable "download" on modern Android.
      if (isNative && uri) await shareFile(uri, data.title);
    } catch (e: any) {
      alert("Couldn't create the PDF. Please try again.");
    } finally { setBusy(""); }
  };

  const onShare = async () => {
    if (!data) return;
    setBusy("share");
    try {
      const doc = await buildPdf();
      if (isNative) {
        const uri = await saveToDownloads(fileName(), doc.output("datauristring"));
        if (uri) await shareFile(uri, data.title);
      } else {
        const text = `*${md(data.title)}*\n\n${md(data.intro)}\n\n` +
          (data.sections || []).map((s: any) => `*${md(s.heading)}*\n${md(s.body)}`).join("\n\n");
        await shareText(data.title, text, "https://janamjyot.lzworth.in");
      }
    } catch { /* ignore */ } finally { setBusy(""); }
  };

  if (loading) {
    return <ReportProgress />;
  }
  if (failed || !data) {
    return (
      <LoadError
        title="Couldn't load this report"
        onRetry={() => setReload((n) => n + 1)}
      />
    );
  }

  return (
    <div className="space-y-5 pt-2">
      <section className="m-card m-enter p-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-accent">Premium Report</p>
        <h2 className="mt-1 text-[21px] font-bold leading-tight">{md(data.title)}</h2>
        {data.intro && (
          <div className="mt-2 text-[14px] leading-relaxed text-muted-foreground selectable">
            <AnswerText text={data.intro} />
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Pressable
            onClick={onDownload}
            disabled={!!busy}
            feedback="medium"
            className="flex items-center justify-center gap-2 rounded-full bg-accent py-3 text-[13.5px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
          >
            {busy === "pdf" ? <Loader2 className="h-[17px] w-[17px] animate-spin" /> : <Download className="h-[17px] w-[17px]" />} Download PDF
          </Pressable>
          <Pressable
            onClick={onShare}
            disabled={!!busy}
            className="flex items-center justify-center gap-2 rounded-full border border-border py-3 text-[13.5px] font-bold"
          >
            {busy === "share" ? <Loader2 className="h-[17px] w-[17px] animate-spin" /> : <Share2 className="h-[17px] w-[17px]" />} Share
          </Pressable>
        </div>
      </section>

      {(data.sections || []).map((s: any, i: number) => (
        <section key={i} className="m-card m-enter p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
              <Sparkles className="h-4 w-4 shrink-0 text-accent" /> {md(s.heading)}
            </h3>
            <SpeakButton text={s.body} lang={lang} />
          </div>
          <div className="selectable text-[14px] leading-relaxed">
            <AnswerText text={s.body} />
          </div>
        </section>
      ))}

      {data.disclaimer && (
        <p className="selectable px-1 pb-2 text-center text-[11.5px] italic leading-relaxed text-muted-foreground">
          {md(data.disclaimer)}
        </p>
      )}
    </div>
  );
}
