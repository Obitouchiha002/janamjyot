import { Clock4, Sparkles, HeartHandshake, CalendarDays, ChevronRight } from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";
import { getUiLang } from "@/lib/prefs";

/*
 * Tools: the four things that are not about one kundli.
 *
 * Muhurat, Yogas, Ashtakavarga and Dasha each used to appear here, under More,
 * and again inside the kundli. Each lives in one place now — the chart-bound
 * ones (Ashtakavarga, dasha, transits) inside the kundli.
 */
type Tri = { en: string; hi: string; hinglish: string };

const TOOLS: Array<{ title: Tri; desc: Tri; icon: any; to: string; tint: string }> = [
  { title: { en: "Kundli Milan", hi: "कुंडली मिलान", hinglish: "Kundli Milan" },
    desc: { en: "36-guna match for two people", hi: "दो लोगों का 36 गुण मिलान", hinglish: "Do logon ka 36 guna milan" },
    icon: HeartHandshake, to: "/match", tint: "#F26D9B" },
  { title: { en: "Panchang", hi: "पंचांग", hinglish: "Panchang" },
    desc: { en: "Tithi, nakshatra, Rahu Kaal", hi: "तिथि, नक्षत्र, राहु काल", hinglish: "Tithi, nakshatra, Rahu Kaal" },
    icon: CalendarDays, to: "/panchang", tint: "#E8B44A" },
  { title: { en: "Muhurat", hi: "मुहूर्त", hinglish: "Muhurat" },
    desc: { en: "Good timings for any event", hi: "किसी भी काम का शुभ समय", hinglish: "Kisi bhi kaam ka shubh samay" },
    icon: Clock4, to: "/muhurat", tint: "#A78BFA" },
  { title: { en: "Yogas", hi: "योग", hinglish: "Yogas" },
    desc: { en: "Classical yogas, explained", hi: "कुंडली के योग, सरल भाषा में", hinglish: "Kundli ke yog, aasaan bhasha mein" },
    icon: Sparkles, to: "/yogas", tint: "#7DD3C0" },
];

export default function AdvancedToolsPage() {
  const g = getUiLang();
  const L = (g === "hi" || g === "hinglish" ? g : "en") as keyof Tri;
  return (
    <div className="space-y-6 pt-2">
      <section className="m-enter">
        <h3 className="mb-2.5 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          {{ en: "Tools", hi: "टूल्स", hinglish: "Tools" }[L]}
        </h3>
        <div className="m-card divide-y divide-border">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <Pressable key={t.to} to={t.to} subtle className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${t.tint}22`, color: t.tint }}>
                  <Icon className="h-[19px] w-[19px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-bold leading-tight">{t.title[L]}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{t.desc[L]}</span>
                </span>
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
              </Pressable>
            );
          })}
        </div>
      </section>
    </div>
  );
}
