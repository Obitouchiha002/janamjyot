import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Clock } from "lucide-react";

export default function DashaPage() {
  const { chartId } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/chart/${chartId}/dasha`)
      .then(res => res.json())
      .then(d => setData(d));
  }, [chartId]);

  if (!data) {
    return (
      <div className="space-y-3 pt-2">
        <div className="skeleton h-[170px]" />
        <div className="skeleton h-[260px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      <p className="m-enter px-1 text-[13.5px] leading-relaxed text-muted-foreground">
        Vimshottari Dasha — the timing of events in your life.
      </p>

      {/* current period */}
      <section className="m-card m-enter relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/10 blur-2xl" />
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> Current period
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-muted p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Mahadasha
            </p>
            <p className="mt-1 text-[22px] font-bold leading-tight text-accent">
              {data.current_mahadasha}
            </p>
          </div>
          <div className="rounded-2xl bg-muted p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Antardasha
            </p>
            <p className="mt-1 text-[22px] font-bold leading-tight">{data.current_antardasha}</p>
          </div>
        </div>

        <p className="mt-3 text-[12.5px] text-muted-foreground">
          Valid until: <span className="font-semibold text-foreground">{data.current_period.to}</span>
        </p>
      </section>

      {/* timeline */}
      <section className="m-enter">
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          Upcoming Antardashas
        </h3>
        <div className="m-card p-4">
          {data.next_7_years?.map((period: any, idx: number) => (
            <div key={idx} className="flex gap-3.5">
              {/* rail */}
              <div className="flex flex-col items-center">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-accent/15" />
                {idx !== data.next_7_years.length - 1 && (
                  <div className="mt-1 w-px flex-1 bg-border" />
                )}
              </div>
              <div className={idx !== data.next_7_years.length - 1 ? "pb-5" : ""}>
                <p className="text-[15px] font-bold leading-tight">{period.period}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {period.from} — {period.to}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
