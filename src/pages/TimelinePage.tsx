import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Briefcase, Wallet, Heart, Activity, TrendingUp, Minus, TrendingDown,
  CalendarRange, Sparkles,
} from "lucide-react";
import AnswerText from "@/components/AnswerText";
import SpeakButton from "@/components/SpeakButton";
import { Pressable } from "@/components/mobile/Pressable";
import { haptic } from "@/lib/native";
import { getLang } from "@/lib/prefs";

const RANGES = [
  { key: "month", label: "30 Days" },
  { key: "quarter", label: "3 Months" },
  { key: "year", label: "1 Year" },
  { key: "long", label: "3–5 Years" },
] as const;

const AREA_META: Record<string, { icon: any; tint: string }> = {
  Career: { icon: Briefcase, tint: "#2563EB" },
  Money: { icon: Wallet, tint: "#059669" },
  Relationships: { icon: Heart, tint: "#EC4899" },
  Health: { icon: Activity, tint: "#D97706" },
};

const TREND: Record<string, { icon: any; tint: string; label: string }> = {
  rising: { icon: TrendingUp, tint: "#34D399", label: "Rising" },
  steady: { icon: Minus, tint: "#E8B44A", label: "Steady" },
  testing: { icon: TrendingDown, tint: "#F87171", label: "Testing" },
};

const TONE: Record<string, string> = {
  supportive: "#34D399",
  mixed: "#E8B44A",
  challenging: "#F87171",
};

function fmtRange(from?: string, to?: string) {
  const f = (iso?: string) => {
    if (!iso) return "";
    try {
      return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" });
    } catch { return iso; }
  };
  const a = f(from), b = f(to);
  if (a && b) return `${a} → ${b}`;
  return a || b || "";
}

export default function TimelinePage() {
  const { chartId } = useParams();
  const [range, setRange] = useState<string>("year");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const lang = getLang();

  useEffect(() => {
    if (!chartId) return;
    setLoading(true);
    setData(null);
    fetch(`/api/chart/${chartId}/timeline?range=${range}`)
      .then((r) => r.json())
      .then((j) => { if (!j.error) setData(j); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [chartId, range]);

  const areas = (data?.areas || []) as { area: string; outlook: string; trend: string }[];
  const periods = (data?.key_periods || []) as { from: string; to: string; label: string; title: string; prediction: string; tone: string }[];

  return (
    <div className="space-y-5 pt-2">
      {/* horizon selector */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
        {RANGES.map((r) => {
          const on = range === r.key;
          return (
            <Pressable
              key={r.key}
              onClick={() => { haptic.select(); setRange(r.key); }}
              subtle
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold ${on ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}
            >
              <CalendarRange className="h-4 w-4" /> {r.label}
            </Pressable>
          );
        })}
      </div>

      {loading && (
        <div className="space-y-3">
          <div className="skeleton h-[130px]" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[120px]" />)}
          </div>
          <div className="skeleton h-[160px]" />
        </div>
      )}

      {!loading && !data && (
        <div className="m-card p-6 text-center">
          <p className="text-[15px] font-bold">Couldn't load the forecast</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Please try again in a moment.</p>
        </div>
      )}

      {!loading && data && (
        <>
          {/* headline + summary */}
          <section className="m-card m-enter relative overflow-hidden p-5">
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/10 blur-2xl" />
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-accent">
              <Sparkles className="h-3.5 w-3.5" /> {data.range_label}
            </p>
            {data.headline && (
              <h2 className="mt-2 text-[19px] font-bold leading-snug">
                <AnswerText text={data.headline} />
              </h2>
            )}
            {data.summary && (
              <div className="mt-2 flex items-start justify-between gap-3">
                <div className="selectable text-[14px] leading-relaxed text-muted-foreground">
                  <AnswerText text={data.summary} />
                </div>
                <SpeakButton text={`${data.headline}. ${data.summary}`} lang={lang} />
              </div>
            )}
          </section>

          {/* life areas */}
          {areas.length > 0 && (
            <section className="m-enter">
              <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                Area by area
              </h3>
              <div className="space-y-3">
                {areas.map((a, i) => {
                  const meta = AREA_META[a.area] || { icon: Sparkles, tint: "#A78BFA" };
                  const Icon = meta.icon;
                  const tr = TREND[a.trend] || TREND.steady;
                  const TrIcon = tr.icon;
                  return (
                    <div key={i} className="m-card m-enter p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h4 className="flex items-center gap-2 text-[15px] font-bold">
                          <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: `${meta.tint}22`, color: meta.tint }}>
                            <Icon className="h-[17px] w-[17px]" />
                          </span>
                          {a.area}
                        </h4>
                        <span
                          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
                          style={{ background: `${tr.tint}1f`, color: tr.tint }}
                        >
                          <TrIcon className="h-3.5 w-3.5" /> {tr.label}
                        </span>
                      </div>
                      <div className="mb-1 flex justify-end">
                        <SpeakButton text={a.outlook} lang={lang} />
                      </div>
                      <div className="selectable text-[14px] leading-relaxed">
                        <AnswerText text={a.outlook} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* key periods — the timeline */}
          {periods.length > 0 && (
            <section className="m-enter">
              <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                Key periods ahead
              </h3>
              <div className="relative space-y-3 pl-6">
                {/* spine */}
                <div className="absolute bottom-2 left-[7px] top-2 w-px bg-border" />
                {periods.map((p, i) => {
                  const tone = TONE[p.tone] || TONE.mixed;
                  return (
                    <div key={i} className="relative m-card m-enter p-4">
                      {/* node */}
                      <span
                        className="absolute -left-[22px] top-5 grid h-3.5 w-3.5 place-items-center rounded-full ring-4 ring-background"
                        style={{ background: tone }}
                      />
                      <div className="flex items-center justify-between gap-2">
                        {fmtRange(p.from, p.to) && (
                          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                            {fmtRange(p.from, p.to)}
                          </span>
                        )}
                        {p.label && (
                          <span className="text-[11px] font-bold" style={{ color: tone }}>{p.label}</span>
                        )}
                      </div>
                      {p.title && (
                        <h4 className="mt-2 text-[15px] font-bold leading-tight">
                          <AnswerText text={p.title} />
                        </h4>
                      )}
                      <div className="mt-1.5 flex items-start justify-between gap-3">
                        <div className="selectable text-[13.5px] leading-relaxed text-muted-foreground">
                          <AnswerText text={p.prediction} />
                        </div>
                        <SpeakButton text={`${p.title}. ${p.prediction}`} lang={lang} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <p className="selectable px-1 pb-2 text-center text-[11.5px] italic leading-relaxed text-muted-foreground">
            A forecast for reflection, not certainty. Dates come from your dasha timeline; the outlook refreshes over time.
          </p>
        </>
      )}
    </div>
  );
}
