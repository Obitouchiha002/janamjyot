import { useCachedFetch } from "@/lib/useCachedFetch";
import { Pressable } from "@/components/mobile/Pressable";
import { getLang } from "@/lib/prefs";

/**
 * The Home top-corner "aaj kya khaas hai" glance.
 *
 * A tiny pill that, the moment you open the app, tells you what today IS in the
 * Hindu calendar — the festival / vrat / Purnima / Sankranti / Sawan Somwar, or
 * simply the tithi on an ordinary day. Same verified engine as the day banner
 * (`/api/panchang-today` → hinduDay), deterministic, no AI, no birth chart
 * needed. Tapping it opens the full Panchang.
 *
 * It uses the person's own chart location when available (shared cache with the
 * Right-Now / day-signals cards, so no extra network), and falls back to Delhi.
 */

type Panchang = {
  weekday: string;
  masa: string;
  paksha: string;
  tithi: string;
  special: { key: string; kind: string; label: string } | null;
};

// One glyph per kind of day, so the festival reads at a glance before the words.
const EMOJI: Record<string, string> = {
  festival: "🪔",
  vrat: "🕉️",
  sankranti: "☀️",
  moon: "🌕",
  month: "📿",
  tithi: "🗓️",
};

export default function TodayChip({ chartId }: { chartId?: string }) {
  const lang = getLang();
  // Chart is already cached by the Right-Now card on Home — this is a cache hit.
  const { data: chart } = useCachedFetch<any>(chartId ? `/api/chart/${chartId}` : null);
  const b = chart?.birth_details;
  const loc =
    b && Number.isFinite(b.latitude) && Number.isFinite(b.longitude)
      ? `&lat=${b.latitude}&lon=${b.longitude}&tz=${encodeURIComponent(b.timezone || "Asia/Kolkata")}`
      : "";
  const { data } = useCachedFetch<Panchang>(
    `/api/panchang-today?lang=${encodeURIComponent(lang)}${loc}`,
  );

  if (!data) return null;

  // Festival/vrat/etc. leads; on a plain day the tithi is the headline.
  const label = data.special?.label || data.tithi;
  const emoji = data.special ? EMOJI[data.special.kind] || "✨" : "🗓️";
  const isSpecial = !!data.special;

  return (
    <Pressable
      to="/panchang"
      feedback="select"
      aria-label={`Today: ${label}`}
      className={`flex max-w-full shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 ${
        isSpecial
          ? "border-accent/45 bg-accent/15"
          : "border-border bg-muted/60"
      }`}
    >
      <span className="text-[12px] leading-none">{emoji}</span>
      <span
        className={`truncate text-[11.5px] font-bold leading-none ${
          isSpecial ? "text-accent" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </Pressable>
  );
}
