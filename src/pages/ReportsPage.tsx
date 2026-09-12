import { useParams } from "react-router-dom";
import { useT } from "@/lib/i18n";
import {
  Briefcase, Wallet, Heart, CalendarRange, Clock, ScrollText, ChevronRight,
} from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";

interface RptCard {
  type: string;
  title: string;
  desc: string;
  icon: any;
  tint: string;
  full?: boolean; // links to the existing full Life Report route
}

const REPORTS: RptCard[] = [
  { type: "full", title: "Full Life Report", desc: "All areas — health, wealth, career, marriage", icon: ScrollText, tint: "#E8B44A", full: true },
  { type: "career", title: "Career & Profession", desc: "Work nature, fields, growth timing", icon: Briefcase, tint: "#2563EB" },
  { type: "wealth", title: "Wealth & Finance", desc: "Income, savings, wealth periods", icon: Wallet, tint: "#059669" },
  { type: "marriage", title: "Marriage & Relationship", desc: "Partner, timing, married life", icon: Heart, tint: "#EC4899" },
  { type: "annual", title: "Annual Prediction", desc: "Your year ahead — the coming months", icon: CalendarRange, tint: "#60A5FA" },
  { type: "mahadasha", title: "Mahadasha Deep-Dive", desc: "Your current planetary period", icon: Clock, tint: "#A78BFA" },
];

export default function ReportsPage() {
  const t = useT();
  const { chartId } = useParams();
  return (
    <div className="space-y-4 pt-2">
      <p className="m-enter px-1 text-[13.5px] leading-relaxed text-muted-foreground">
        {t("Detailed AI reports, grounded in your real chart — read, listen, download as PDF or share on WhatsApp.")}
      </p>
      <div className="space-y-2.5">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          const to = r.full ? `/report/${chartId}` : `/reports/${chartId}/${r.type}`;
          return (
            <Pressable key={r.type} to={to} className="m-card m-enter flex items-center gap-3.5 p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ background: `${r.tint}22`, color: r.tint }}>
                <Icon className="h-[21px] w-[21px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold leading-tight">{t(r.title)}</span>
                <span className="mt-0.5 block text-[12.5px] text-muted-foreground">{t(r.desc)}</span>
              </span>
              <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            </Pressable>
          );
        })}
      </div>
    </div>
  );
}
