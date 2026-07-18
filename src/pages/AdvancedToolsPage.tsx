import { Clock4, Sparkles, BarChart3, Bell, ChevronRight } from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";

interface Tool {
  title: string;
  desc: string;
  icon: any;
  to: string;
  tint: string;
}

const TOOLS: Tool[] = [
  { title: "Muhurat", desc: "Auspicious timings for any event", icon: Clock4, to: "/muhurat", tint: "#A78BFA" },
  { title: "Yogas", desc: "Classical yogas in the chart, explained", icon: Sparkles, to: "/yogas", tint: "#7DD3C0" },
  { title: "Ashtakavarga", desc: "Bindu strength of every sign", icon: BarChart3, to: "/ashtakavarga", tint: "#E8B44A" },
  { title: "Dasha & Transit", desc: "What is running now and what is next", icon: Bell, to: "/alerts", tint: "#60A5FA" },
];

export default function AdvancedToolsPage() {
  return (
    <div className="space-y-6 pt-2">
      <section className="m-enter">
        <h3 className="mb-2.5 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          Tools
        </h3>
        <div className="m-card divide-y divide-border">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <Pressable
                key={t.to}
                to={t.to}
                subtle
                className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left"
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                  style={{ background: `${t.tint}22`, color: t.tint }}
                >
                  <Icon className="h-[19px] w-[19px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-bold leading-tight">{t.title}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{t.desc}</span>
                </span>
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
              </Pressable>
            );
          })}
        </div>
      </section>

      <p className="px-2 text-center text-[11.5px] text-muted-foreground">
        Muhurat timings, chart yogas, Ashtakavarga strength and dasha/transit alerts.
      </p>
    </div>
  );
}
