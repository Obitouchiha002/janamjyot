import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { NorthIndianChart } from "@/components/NorthIndianChart";

interface DivChart {
  chart_type: string;
  label: string;
  ascendant_sign: string;
  houses: any[];
  planets: { planet: string; sign: string; house: number; retrograde?: boolean }[];
}

const ORDER = ["D10", "D6", "D11", "D9"] as const;

export default function DivisionalChartsPage() {
  const { chartId } = useParams();
  const [data, setData] = useState<Record<string, DivChart | null> | null>(null);

  useEffect(() => {
    fetch(`/api/chart/${chartId}/divisional`)
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch(() => setData({}));
  }, [chartId]);

  if (!data) {
    return (
      <div className="space-y-3 pt-2">
        <div className="skeleton aspect-square w-full" />
        <div className="skeleton aspect-square w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      <p className="m-enter px-1 text-[13.5px] leading-relaxed text-muted-foreground">
        Vargas — a closer view of specific life areas, computed from your planetary longitudes.
      </p>

      {ORDER.map((key, i) => {
        const chart = data[key];
        if (!chart) return null;
        const planetsMapped = chart.planets.map((p) => ({ ...p, short: p.planet.substring(0, 2) }));
        return (
          <section
            key={key}
            className="m-card m-enter p-4"
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <h3 className="text-[17px] font-bold">{chart.chart_type}</h3>
              <span className="shrink-0 text-[12px] font-semibold text-muted-foreground">
                Asc: {chart.ascendant_sign}
              </span>
            </div>
            <p className="mb-3.5 text-[12px] text-muted-foreground">{chart.label}</p>

            <NorthIndianChart planets={planetsMapped} ascendantSign={chart.ascendant_sign} />

            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <div className="divide-y divide-border">
                {chart.planets.map((p) => (
                  <div
                    key={p.planet}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                  >
                    <p className="flex items-center gap-1.5 text-[13.5px] font-bold">
                      {p.planet}
                      {p.retrograde && (
                        <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[9.5px] font-bold text-accent">
                          R
                        </span>
                      )}
                    </p>
                    <p className="shrink-0 text-[12.5px] font-semibold text-muted-foreground">
                      {p.sign} · H{p.house}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      <p className="selectable px-1 pb-2 text-[11.5px] leading-relaxed text-muted-foreground">
        D9 and D10 use the classical Parashari (BPHS) division; D6 and D11 use the parivritti (cyclic)
        method. All vargas are derived from the same sidereal longitudes.
      </p>
    </div>
  );
}
