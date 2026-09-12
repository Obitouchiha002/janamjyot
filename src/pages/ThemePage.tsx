import { Check } from "lucide-react";
import { THEMES, useTheme } from "@/theme";
import { Pressable } from "@/components/mobile/Pressable";
import { haptic } from "@/lib/native";
import { useT } from "@/lib/i18n";

/**
 * Appearance picker on its own screen.
 *
 * The six theme cards used to sit at the top of Settings, which made that page
 * feel scattered — a wall of swatches before any actual setting. Giving them a
 * dedicated screen keeps Settings to a tidy list of rows.
 */
export default function ThemePage() {
  const t = useT();
  const [theme, setTheme] = useTheme();

  return (
    <div className="space-y-5 pt-2">
      <p className="px-1 text-[13px] leading-relaxed text-muted-foreground">
        {t("Pick a look for the whole app. Colours and text adjust automatically for contrast.")}
      </p>

      <div className="grid grid-cols-2 gap-3">
        {THEMES.map((t, i) => {
          const active = theme === t.key;
          return (
            <Pressable
              key={t.key}
              feedback="select"
              onClick={() => { haptic.select(); setTheme(t.key); }}
              aria-label={t.label}
              className={`m-card m-enter block p-3 text-left ${active ? "ring-2 ring-accent" : ""}`}
              style={{ animationDelay: `${i * 0.04}s` }}
            >
              <span className="relative flex h-[68px] w-full overflow-hidden rounded-xl border border-border">
                <span className="w-1/2" style={{ background: t.swatch.bg }} />
                <span className="flex w-1/2 flex-col">
                  <span className="h-1/2" style={{ background: t.swatch.primary }} />
                  <span className="h-1/2" style={{ background: t.swatch.accent }} />
                </span>
                {active && (
                  <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/25">
                    <Check className="h-[14px] w-[14px]" strokeWidth={3} />
                  </span>
                )}
              </span>

              <span className="mt-2.5 flex items-center gap-1.5">
                <span className="text-[13.5px] font-bold leading-tight">{t.label}</span>
                {t.isDark && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-muted-foreground">
                    dark
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
                {t.desc}
              </span>
            </Pressable>
          );
        })}
      </div>
    </div>
  );
}
