import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Sparkles, Bot } from "lucide-react";
import AnswerText from "@/components/AnswerText";
import SpeakButton from "@/components/SpeakButton";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted px-3 py-2">
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[13px] font-bold leading-snug">{value}</p>
    </div>
  );
}

export default function RemediesPage() {
  const { chartId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chartId) return;
    setLoading(true);
    fetch(`/api/chart/${chartId}/remedies`).then((r) => r.json()).then((j) => { if (!j.error) setData(j); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [chartId]);

  if (loading) {
    return (
      <div className="space-y-3 pt-2">
        <div className="skeleton h-[120px]" />
        <div className="skeleton h-[190px]" />
        <div className="skeleton h-[190px]" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6 pt-2">
      <p className="m-enter px-1 text-[13.5px] leading-relaxed text-muted-foreground">
        Gemstones, mantras and upaay selected from your chart.
      </p>

      {/* how to follow */}
      {data.note && (
        <section className="m-card m-enter p-4">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-accent">
              <Bot className="h-3.5 w-3.5" /> How to follow
            </p>
            <SpeakButton text={data.note} />
          </div>
          <div className="selectable">
            <AnswerText text={data.note} />
          </div>
        </section>
      )}

      {/* focus planets */}
      <section className="m-enter">
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          Your key planets &amp; remedies
        </h3>
        <div className="space-y-3">
          {data.focus.map((f: any, i: number) => (
            <div key={i} className="m-card m-enter p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="flex items-center gap-1.5 text-[17px] font-bold">
                  <Sparkles className="h-4 w-4 text-accent" /> {f.planet}
                </h4>
                {f.strong && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider"
                    style={{ background: "#34D39922", color: "#34D399" }}
                  >
                    Strong
                  </span>
                )}
              </div>
              <p className="selectable mt-1.5 text-[12px] italic leading-relaxed text-muted-foreground">
                {f.reason}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Fact label="Gemstone" value={f.gemstone} />
                <Fact label="Day" value={f.day} />
                <Fact label="Deity" value={f.deity} />
                <Fact label="Colour" value={f.color} />
              </div>
              <div className="mt-2 space-y-2">
                <div className="rounded-xl bg-muted px-3 py-2">
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
                    Mantra
                  </p>
                  <p className="selectable mt-0.5 text-[13px] font-bold leading-snug">{f.mantra}</p>
                </div>
                <div className="rounded-xl bg-muted px-3 py-2">
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
                    Donate
                  </p>
                  <p className="selectable mt-0.5 text-[13px] font-bold leading-snug">{f.donation}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* general upaay */}
      <section className="m-card m-enter p-4">
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          General daily upaay
        </h3>
        <ul className="space-y-2.5">
          {data.general.map((g: string, i: number) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-0.5 text-accent">•</span>
              <span className="selectable text-[13.5px] leading-relaxed">{g}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="selectable px-1 pb-2 text-center text-[11.5px] italic leading-relaxed text-muted-foreground">
        {data.disclaimer}
      </p>
    </div>
  );
}
