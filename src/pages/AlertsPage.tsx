import { useEffect, useState } from "react";
import { Clock, Sparkles } from "lucide-react";
import ProfilePicker from "@/components/ProfilePicker";
import { LoadError } from "@/components/ErrorState";

export default function AlertsPage({ chartId: extId, onChartId }: { chartId?: string; onChartId?: (id: string) => void }) {
  const [intId, setIntId] = useState("");
  const chartId = extId ?? intId;
  const setChartId = onChartId ?? setIntId;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!chartId) return;
    setLoading(true); setData(null); setFailed(false);
    // A swallowed error used to leave the picker above an empty screen
    // forever, with nothing to tap and no way to tell failure from "empty".
    fetch(`/api/chart/${chartId}/alerts`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => (j?.error ? setFailed(true) : setData(j)))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [chartId, reload]);

  return (
    <div className="space-y-6 pt-2">
      <section className="m-enter">
        <ProfilePicker value={chartId} onPick={setChartId} />
      </section>

      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-[150px]" />
          <div className="skeleton h-[120px]" />
          <div className="skeleton h-[120px]" />
        </div>
      ) : failed ? (
        <LoadError title="Couldn't load your alerts" onRetry={() => setReload((n) => n + 1)} />
      ) : data && (
        <>
          {data.current && (
            <section className="m-card m-enter relative overflow-hidden p-5" style={{ animationDelay: '0.04s' }}>
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/10 blur-2xl" />
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Running now
              </p>
              <div className="mt-3 space-y-2.5">
                <div className="rounded-2xl bg-muted p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current Mahadasha</p>
                  <p className="mt-1 text-[20px] font-bold leading-tight text-accent">{data.current.mahadasha}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{data.current.mahadasha_from} → {data.current.mahadasha_to}</p>
                </div>
                <div className="rounded-2xl bg-muted p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current Antardasha</p>
                  <p className="mt-1 text-[20px] font-bold leading-tight">{data.current.antardasha}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{data.current.antardasha_from} → {data.current.antardasha_to}</p>
                </div>
              </div>
            </section>
          )}

          {data.transit_highlights?.length > 0 && (
            <section className="m-enter" style={{ animationDelay: '0.08s' }}>
              <h3 className="mb-3 flex items-center gap-1.5 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-[15px] w-[15px] text-accent" /> Right now in the sky
              </h3>
              <div className="m-card border-accent/25 bg-accent/[0.06] p-4">
                <ul className="space-y-2.5">
                  {data.transit_highlights.map((h: string, i: number) => (
                    <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
                      <span className="mt-0.5 shrink-0 text-accent">•</span>
                      <span className="selectable">{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {data.upcoming?.length > 0 && (
            <section className="m-enter" style={{ animationDelay: '0.12s' }}>
              <h3 className="mb-3 flex items-center gap-1.5 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-[15px] w-[15px]" /> Upcoming Antardasha periods
              </h3>
              <div className="m-card divide-y divide-border">
                {data.upcoming.map((a: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <span className="text-[14px] font-bold">{a.period}</span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">{a.from} → {a.to}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="px-2 pb-2 text-center text-[11.5px] text-muted-foreground">
            Based on your natal chart and the live sky. Astrology offers guidance, not certainty.
          </p>
        </>
      )}
    </div>
  );
}
