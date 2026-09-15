import { useCallback, useEffect, useState } from "react";
import { Sun, Moon, Clock, ChevronDown, Languages } from "lucide-react";
import AnswerText from "@/components/AnswerText";
import SpeakButton from "@/components/SpeakButton";
import { Pressable } from "@/components/mobile/Pressable";
import { getLang } from "@/lib/prefs";
import { haptic } from "@/lib/native";
import { useT } from "@/lib/i18n";

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
/*
 * Two looks, one component.
 *
 * "card" is the app's own surface, used on the kundli dashboard. "dark" is the
 * navy bar the Home screen launched with — asked for back by name, because on a
 * cream page it is the one element that reads as "today" at a glance. Only the
 * bar itself goes dark; the expanded body stays on the card surface so the
 * timings inside it are never grey-on-navy.
 */
export default function TodayCard(
  { chartId, lang, variant = "card" }: { chartId?: string; lang?: string; variant?: "card" | "dark" },
) {
  const t = useT();
  const dark = variant === "dark";
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<string>(lang || getLang());
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  // Guards the lazy-load effect below. Without it a failed request leaves
  // `d` null and `loading` false, which is exactly the condition that fires
  // the effect again — an unbounded request loop on the Home screen.
  const [tried, setTried] = useState(false);

  const load = useCallback(async (lg: string) => {
    if (!chartId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/chart/${chartId}/today?lang=${encodeURIComponent(lg)}`);
      const j = await r.json();
      if (!j.error) setD(j);
    } catch { /* leave the previous copy on screen */ }
    finally { setLoading(false); setTried(true); }
  }, [chartId]);

  // Load lazily — only once the card is actually opened.
  useEffect(() => {
    if (open && !d && !loading && !tried) load(language);
  }, [open, d, loading, tried, language, load]);

  const switchLang = (lg: string) => {
    if (lg === language) return;
    haptic.select();
    setLanguage(lg);
    setD(null);          // force a refetch in the new language
    setTried(false);
    load(lg);
  };

  const ord = (n: number | null) => (n ? `${n}th house` : "");
  const facts: Array<[any, string, string]> = d ? [
    [Sun, "Dasha", d.dasha ? `${d.dasha.mahadasha}–${d.dasha.antardasha}` : ""],
    [Moon, "Moon", d.moon_transit ? `${d.moon_transit.sign} · ${ord(d.moon_transit.house_from_lagna)}` : ""],
    [Clock, "Rahu Kaal", d.panchang?.rahu_kaal ? `${d.panchang.rahu_kaal.start}–${d.panchang.rahu_kaal.end}` : ""],
  ].filter(([, , v]) => v) as any : [];

  return (
    <div className={dark ? "overflow-hidden rounded-2xl shadow-lg" : "m-card overflow-hidden"}>
      <Pressable
        onClick={() => { haptic.tap(); setOpen((o) => !o); }}
        subtle
        className={`flex w-full items-center gap-3 text-left ${dark ? "px-5 py-4 text-white" : "px-4 py-3.5"}`}
        style={dark ? { background: "linear-gradient(135deg,#1E293B,#0f172a)" } : undefined}
      >
        {dark ? (
          <Sun className="h-5 w-5 shrink-0 text-amber-300" />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent">
            <Sun className="h-[19px] w-[19px]" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={`block font-bold leading-tight ${dark ? "text-[16px]" : "text-[14.5px]"}`}>{t("Today")}</span>
          {!dark && (
            <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
              {d?.panchang ? `${d.panchang.weekday} · ${d.panchang.nakshatra}` : t("Your day at a glance")}
            </span>
          )}
        </span>
        <ChevronDown className={`h-[18px] w-[18px] shrink-0 transition-transform ${dark ? "text-white/70" : "text-muted-foreground"} ${open ? "rotate-180" : ""}`} />
      </Pressable>

      {open && (
        <div className={`border-t border-border px-4 pb-4 pt-3.5 ${dark ? "bg-card" : ""}`}>
          {/* language picker */}
          <div className="mb-3 flex items-center gap-2">
            <Languages className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="flex gap-1.5">
              {LANGS.map((l) => (
                <Pressable
                  key={l.key}
                  onClick={() => switchLang(l.key)}
                  subtle
                  className={`tap-44 relative rounded-full px-2.5 py-1.5 text-[11.5px] font-bold ${
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
                        <Icon className="h-3 w-3" /> {t(label)}
                      </p>
                      {/* Wraps, never truncates. Three tiles on a phone are
                          ~100px each, and "Rahu–Mercury" or a Rahu Kaal range
                          cut to "Rahu–Merc…" / "03:21 PM–0…" hid the one
                          number the tile exists to show. */}
                      <p className="mt-0.5 break-words text-[12.5px] font-bold leading-snug">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {d.tip && (
                <div className="rounded-2xl border border-accent/25 bg-accent/8 p-3.5">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[10.5px] font-bold uppercase tracking-widest text-accent">
                      {t("Today's Guidance")}
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
