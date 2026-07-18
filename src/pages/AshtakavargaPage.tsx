import { useEffect, useState } from "react";
import ProfilePicker from "@/components/ProfilePicker";

export default function AshtakavargaPage({ chartId: extId, onChartId }: { chartId?: string; onChartId?: (id: string) => void }) {
  const [intId, setIntId] = useState("");
  const chartId = extId ?? intId;
  const setChartId = onChartId ?? setIntId;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!chartId) return;
    setLoading(true); setData(null);
    fetch(`/api/chart/${chartId}/ashtakavarga`).then((r) => r.json()).then((j) => { if (!j.error) setData(j); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [chartId]);

  const maxBindu = data ? Math.max(...data.sav.map((s: any) => s.bindus)) : 1;
  const barColor = (b: number) => b >= 30 ? "#34D399" : b <= 25 ? "#F87171" : "#E8B44A";

  return (
    <div className="space-y-6 pt-2">
      <section className="m-enter">
        <ProfilePicker value={chartId} onPick={setChartId} />
      </section>

      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-[320px]" />
          <div className="skeleton h-[140px]" />
        </div>
      ) : data && (
        <>
          {/* Sarvashtakavarga — one row per sign, bar sized to its bindus */}
          <section className="m-enter" style={{ animationDelay: '0.06s' }}>
            <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
              Sarvashtakavarga · {data.savTotal} bindus
            </h3>
            <div className="m-card space-y-2 p-4">
              {data.sav.map((s: any, i: number) => {
                const lagna = s.sign === data.ascendant_sign;
                return (
                  <div key={s.sign} className="flex items-center gap-2.5">
                    <span className={`w-[76px] shrink-0 truncate text-[12.5px] ${lagna ? "font-bold text-accent" : "text-muted-foreground"}`}>
                      {s.sign}{lagna ? " ⬆" : ""}
                    </span>
                    <div className="h-7 flex-1 overflow-hidden rounded-lg bg-muted">
                      <div
                        className="va-grow-x flex h-full items-center justify-end rounded-lg pr-2 text-[11px] font-bold text-black/80"
                        style={{ width: `${(s.bindus / maxBindu) * 100}%`, background: barColor(s.bindus), animationDelay: `${i * 0.04}s` }}
                      >
                        {s.bindus}
                      </div>
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                More bindus = stronger sign/house. ⬆ = your Lagna. Green ≥30, Amber 26–29, Red ≤25.
              </p>
            </div>
          </section>

          {/* Bhinnashtakavarga — per planet total */}
          <section className="m-enter" style={{ animationDelay: '0.1s' }}>
            <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
              Bhinnashtakavarga · per planet
            </h3>
            <div className="m-card grid grid-cols-3 gap-2.5 p-3">
              {data.bavTotals.map((b: any) => (
                <div key={b.planet} className="rounded-2xl bg-muted p-3 text-center">
                  <p className="truncate text-[11.5px] text-muted-foreground">{b.planet}</p>
                  <p className="mt-0.5 text-[19px] font-bold leading-tight">{b.total}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
