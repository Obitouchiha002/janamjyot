import { useCallback, useEffect, useState } from "react";
import { Sun, Moon, Clock, ChevronDown, Languages } from "lucide-react";
import AnswerText from "@/components/AnswerText";
import SpeakButton from "@/components/SpeakButton";
import { Pressable } from "@/components/mobile/Pressable";
import { getLang } from "@/lib/prefs";
import { haptic } from "@/lib/native";

const LANGS = [
  { key: "en", label: "EN" },
  { key: "hinglish", label: "Hinglish" },
  { key: "hi", label: "हिंदी" },
] as const;

/**
 * "Today" — a compact daily snapshot that expands on tap.
 *
 * Uses the app's own card styling rather than a hard-coded dark gradient: the
 * old version was a navy block dropped into a cream page, which read as a
 * foreign widget rather than part of the app. Trimmed to the three facts people
 * actually glance at, plus the guidance line.
 */
export default function TodayCard({ chartId, lang }: { chartId?: string; lang?: string }) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<string>(lang || getLang());
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (lg: string) => {
    if (!chartId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/chart/${chartId}/today?lang=${encodeURIComponent(lg)}`);
      const j = await r.json();
      if (!j.error) setD(j);
    } catch { /* leave the previous copy on screen */ }
    finally { setLoading(false); }
  }, [chartId]);

  // Load lazily — only once the card is actually opened.
  useEffect(() => { if (open && !d && !loading) load(language); }, [open, d, loading, language, load]);

  const switchLang = (lg: string) => {
    if (lg === language) return;
    haptic.select();
    setLanguage(lg);
    setD(null);          // force a refetch in the new language
    load(lg);
  };

  const ord = (n: number | null) => (n ? `${n}th house` : "");
  const facts: Array<[any, string, string]> = d ? [
    [Sun, "Dasha", d.dasha ? `${d.dasha.mahadasha}–${d.dasha.antardasha}` : ""],
    [Moon, "Moon", d.moon_transit ? `${d.moon_transit.sign} · ${ord(d.moon_transit.house_from_lagna)}` : ""],
    [Clock, "Rahu Kaal", d.panchang?.rahu_kaal ? `${d.panchang.rahu_kaal.start}–${d.panchang.rahu_kaal.end}` : ""],
  ].filter(([, , v]) => v) as any : [];

  return (
    <div className="m-card overflow-hidden">
      <Pressable
        onClick={() => { haptic.tap(); setOpen((o) => !o); }}
        subtle
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent">
          <Sun className="h-[19px] w-[19px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-bold leading-tight">Today</span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {d?.panchang ? `${d.panchang.weekday} · ${d.panchang.nakshatra}` : "Your day at a glance"}
          </span>
        </span>
        <ChevronDown className={`h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </Pressable>

      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3.5">
          {/* language picker */}
          <div className="mb-3 flex items-center gap-2">
            <Languages className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="flex gap-1.5">
              {LANGS.map((l) => (
                <Pressable
                  key={l.key}
                  onClick={() => switchLang(l.key)}
                  subtle
                  className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${
                    language === l.key ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {l.label}
                </Pressable>
              ))}
            </div>
          </div>

          {loading && !d ? (
            <div className="space-y-2">
              <div className="skeleton h-[52px]" />
              <div className="skeleton h-[70px]" />
            </div>
          ) : d ? (
            <>
              {facts.length > 0 && (
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {facts.map(([Icon, label, value]) => (
                    <div key={label} className="rounded-xl bg-muted px-2.5 py-2">
                      <p className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
                        <Icon className="h-3 w-3" /> {label}
                      </p>
                      <p className="mt-0.5 truncate text-[12.5px] font-bold">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {d.tip && (
                <div className="rounded-2xl border border-accent/25 bg-accent/8 p-3.5">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[10.5px] font-bold uppercase tracking-widest text-accent">
                      Today&apos;s guidance
                    </p>
                    <SpeakButton text={d.tip} lang={language} />
                  </div>
                  <div className="selectable text-[13.5px] leading-relaxed">
                    <AnswerText text={d.tip} />
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="py-2 text-[13px] text-muted-foreground">Couldn&apos;t load today&apos;s guidance.</p>
          )}
        </div>
      )}
    </div>
  );
}
