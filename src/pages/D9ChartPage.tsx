import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { NorthIndianChart } from "@/components/NorthIndianChart";
import { Pressable } from "@/components/mobile/Pressable";
import { LoadError } from "@/components/ErrorState";

export default function D9ChartPage() {
  const { chartId } = useParams();
  const [data, setData] = useState<any>(null);
  const [shortNames, setShortNames] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    fetch(`/api/chart/${chartId}/d9`)
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
        The Navamsa — your inner potential, marriage and spiritual dharma.
      </p>

      {/* chart */}
      <section className="m-card m-enter p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
            Navamsa
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
          D9 placements
        </h3>
        <div className="m-card divide-y divide-border">
          <div className="flex items-center justify-between gap-3 bg-muted px-4 py-3.5">
            <p className="text-[14.5px] font-bold text-accent">Ascendant</p>
            <p className="text-[13px] font-semibold">House 1</p>
          </div>
          {(data.planets ?? []).map((p: any) => (
            <div key={p.planet} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <p className="text-[14.5px] font-bold">{p.planet}</p>
              <p className="shrink-0 text-[13px] font-semibold text-muted-foreground">
                House {p.house}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
