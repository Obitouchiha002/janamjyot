import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import ProfilePicker from "@/components/ProfilePicker";
import { LoadError } from "@/components/ErrorState";

export default function YogasPage({ chartId: extId, onChartId }: { chartId?: string; onChartId?: (id: string) => void } = {}) {
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
    fetch(`/api/chart/${chartId}/yogas`)
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
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[110px]" />)}
        </div>
      ) : failed ? (
        <LoadError title="Couldn't load your yogas" onRetry={() => setReload((n) => n + 1)} />
      ) : data && (
        <>
          <p className="m-enter px-1 text-[13px] text-muted-foreground" style={{ animationDelay: '0.06s' }}>
            <b className="text-foreground">{data.count}</b> notable yoga{data.count === 1 ? "" : "s"} detected.
          </p>

          {data.count === 0 ? (
            <div className="m-card m-enter p-6 text-center" style={{ animationDelay: '0.08s' }}>
              <p className="text-[15px] font-bold">No major yogas found</p>
              <p className="mt-1 text-[13px] text-muted-foreground">No major classical yogas were detected in this chart.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.yogas.map((y: any, i: number) => (
                <div
                  key={i}
                  className="m-card m-enter border-l-4 border-l-accent p-4"
                  style={{ animationDelay: `${0.08 + i * 0.05}s` }}
                >
                  <h3 className="flex items-center gap-2 text-[15.5px] font-bold">
                    <Star className="h-[16px] w-[16px] shrink-0 text-accent" /> {y.name}
                  </h3>
                  <div className="my-2 flex flex-wrap gap-1.5">
                    {y.planets.map((p: string) => (
                      <span key={p} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{p}</span>
                    ))}
                  </div>
                  <p className="selectable text-[13px] leading-relaxed text-foreground/85">{y.summary}</p>
                </div>
              ))}
            </div>
          )}

          <p className="px-2 pb-2 text-center text-[11.5px] text-muted-foreground">
            Yogas describe tendencies; their results depend on dasha, transit and overall chart strength.
          </p>
        </>
      )}
    </div>
  );
}
