import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Briefcase, Wallet, Heart, Activity, Clock, AlertTriangle, Lightbulb, Bot,
} from "lucide-react";
import AnswerText from "@/components/AnswerText";
import SpeakButton from "@/components/SpeakButton";
import DayBanner from "@/components/DayBanner";
import DayTimeline from "@/components/DayTimeline";
import { LoadError } from "@/components/ErrorState";
import { getLang } from "@/lib/prefs";

const AREAS = [
  { key: "career", label: "Career", icon: Briefcase, tint: "#2563EB" },
  { key: "money", label: "Money", icon: Wallet, tint: "#059669" },
  { key: "relationship", label: "Relationship", icon: Heart, tint: "#EC4899" },
  { key: "health", label: "Health", icon: Activity, tint: "#D97706" },
] as const;

function fmtDate(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "long",
    });
  } catch { return iso; }
}

export default function DailyGuidancePage() {
  const { chartId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const lang = getLang();

  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!chartId) return;
    setLoading(true); setFailed(false);
    fetch(`/api/chart/${chartId}/daily-guidance?lang=${encodeURIComponent(lang)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => (j?.error ? setFailed(true) : setData(j)))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [chartId, reload]);

  if (loading) {
    return (
      <div className="space-y-3 pt-2">
        <div className="skeleton h-[120px]" />
        <div className="skeleton h-[70px]" />
        <div className="skeleton h-[150px]" />
        <div className="skeleton h-[150px]" />
      </div>
    );
  }
  if (failed || !data) {
    return (
      <LoadError
        title="Couldn't load today's guidance"
        onRetry={() => setReload((n) => n + 1)}
      />
    );
  }

  const g = data.guidance || {};
  const best = (data.best_times || []) as { name: string; start: string; end: string }[];
  const caution = (data.caution_periods || []) as { name: string; start: string; end: string }[];
  const dasha = data.dasha;

  return (
    <div className="space-y-5 pt-2">
      {/* header */}
      <section className="m-card m-enter p-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-accent">Aaj Ka Din · Today</p>
        <h2 className="mt-1 text-[19px] font-bold leading-tight">{fmtDate(data.date)}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {dasha && (
            <span className="rounded-full bg-accent/15 px-3 py-1 text-[12px] font-bold text-accent">
              {dasha.mahadasha}–{dasha.antardasha} Dasha
            </span>
          )}
          {data.moon_transit?.sign && (
            <span className="rounded-full bg-muted px-3 py-1 text-[12px] font-semibold text-muted-foreground">
              Moon in {data.moon_transit.sign}
            </span>
          )}
          {data.panchang?.nakshatra && (
            <span className="rounded-full bg-muted px-3 py-1 text-[12px] font-semibold text-muted-foreground">
              {data.panchang.tithi} · {data.panchang.nakshatra}
            </span>
          )}
        </div>
      </section>

      {/* The whole day in ONE place: the warm summary, every time-block with the
          one you're in right now marked, the real Reason, and the night recap —
          the same calculated reading the morning / night / Rahu-Kaal
          notifications carry. This replaced a stacked banner + a separate
          best/caution grid that said the same windows three times on one screen. */}
      {chartId && <DayTimeline chartId={chartId} />}


      {/* life areas */}
      <section className="m-enter">
        <h3 className="mb-3 px-1 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          <Bot className="h-3.5 w-3.5" /> Your day, area by area
        </h3>
        <div className="space-y-3">
          {AREAS.map(({ key, label, icon: Icon, tint }) =>
            g[key] ? (
              <div key={key} className="m-card m-enter p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h4 className="flex items-center gap-2 text-[15px] font-bold">
                    <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: `${tint}22`, color: tint }}>
                      <Icon className="h-[17px] w-[17px]" />
                    </span>
                    {label}
                  </h4>
                  <SpeakButton text={g[key]} lang={lang} />
                </div>
                <div className="selectable text-[14px] leading-relaxed">
                  <AnswerText text={g[key]} />
                </div>
              </div>
            ) : null,
          )}
        </div>
      </section>

      {/* daily advice */}
      {g.advice && (
        <section className="m-card m-enter p-4" style={{ background: "linear-gradient(180deg, rgba(232,180,74,0.10), transparent)" }}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-accent">
              <Lightbulb className="h-3.5 w-3.5" /> Today's practical advice
            </p>
            <SpeakButton text={g.advice} lang={lang} />
          </div>
          <div className="selectable text-[14.5px] font-medium leading-relaxed">
            <AnswerText text={g.advice} />
          </div>
        </section>
      )}

      <p className="selectable px-1 pb-2 text-center text-[11.5px] italic leading-relaxed text-muted-foreground">
        Guidance is for reflection, not certainty. It refreshes each day from your dasha and today's sky.
      </p>
    </div>
  );
}
