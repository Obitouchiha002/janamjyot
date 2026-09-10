import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { NorthIndianChart, PLANET_COLOR } from "@/components/NorthIndianChart";
import { Pressable } from "@/components/mobile/Pressable";
import { LoadError } from "@/components/ErrorState";

export default function D1ChartPage() {
  const { chartId } = useParams();
  const [data, setData] = useState<any>(null);
  const [shortNames, setShortNames] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  // An error body is JSON too: storing it as data used to throw on
  // `data.planets.map` below, and a network failure left the skeleton forever.
  useEffect(() => {
    let alive = true;
    setFailed(false);
    fetch(`/api/chart/${chartId}/d1`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(d => { if (alive) (d?.error ? setFailed(true) : setData(d)); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [chartId, reload]);

  if (failed) {
    return <LoadError title="Couldn't load this chart" onRetry={() => setReload(n => n + 1)} />;
  }

  if (!data) {
    return (
      <div className="space-y-3 pt-2">
        <div className="skeleton aspect-square w-full" />
        <div className="skeleton h-[240px]" />
      </div>
    );
  }

  const planetsMapped = (data.planets ?? []).map((p: any) => ({
    ...p,
    short: p.planet.substring(0, 2)
  }));

  return (
    <div className="space-y-6 pt-2">
      <p className="m-enter px-1 text-[13.5px] leading-relaxed text-muted-foreground">
        The Rashi chart — the blueprint of your overall life path.
      </p>

      {/* chart */}
      <section className="m-card m-enter p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
            Birth Chart
          </h3>
          <Pressable
            feedback="select"
            onClick={() => setShortNames(!shortNames)}
            className={`rounded-full px-3.5 py-2 text-[12px] font-bold ${
              shortNames ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            Short names
          </Pressable>
        </div>
        <NorthIndianChart
          planets={planetsMapped}
          ascendantSign={data.ascendant.sign}
          shortNames={shortNames}
        />
      </section>

      {/* placements */}
      <section className="m-enter">
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          Planetary placements
        </h3>
        <div className="m-card divide-y divide-border">
          {/* ascendant */}
          <div className="bg-muted px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14.5px] font-bold text-accent">Ascendant</p>
              <p className="text-[13px] font-semibold">
                {data.ascendant.sign} · H1
              </p>
            </div>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              {data.ascendant?.degree?.toFixed(2)}° · {data.ascendant.nakshatra} (Pada {data.ascendant.pada})
            </p>
          </div>

          {(data.planets ?? []).map((p: any) => (
            <div key={p.planet} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-[14.5px] font-bold">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PLANET_COLOR[p.planet] ?? "currentColor" }} />
                  {p.planet}
                  {p.retrograde && (
                    <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[9.5px] font-bold text-accent">
                      R
                    </span>
                  )}
                </p>
                <p className="shrink-0 text-[13px] font-semibold text-muted-foreground">
                  {p.sign} · H{p.house}
                </p>
              </div>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                {p.degree.toFixed(2)}° · {p.nakshatra} (Pada {p.pada})
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
