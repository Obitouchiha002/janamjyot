/**
 * The face of a kundli, when there is no photo.
 *
 * A grey outline of a generic person is what every form on the internet shows
 * you, and it made the one screen that is supposed to be ABOUT someone look
 * like a database row. Nobody is going to upload a photo to an astrology app
 * either — so the app draws one: their initials, in the app's own accent.
 *
 * The colour is the THEME's accent, not a per-person one. A sign-coloured
 * avatar looked good and looked like a different app on every chart: the blue
 * of an air sign next to an orange app is someone else's design.
 *
 * Deterministic, offline, and free: no upload, no avatar service, no request.
 */

/** Their initials — one word gives one letter, two or more give two. */
function initialsOf(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '\u2605';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ChartAvatar({
  name, size = 56, className = '',
}: { name: string; size?: number; className?: string }) {
  return (
    <span
      // The inner light edge is a ring, not a boxShadow: an inline boxShadow
      // would replace the accent-tinted drop shadow instead of joining it.
      className={`grid shrink-0 place-items-center rounded-full bg-accent font-bold text-accent-foreground shadow-lg shadow-accent/30 ring-1 ring-inset ring-white/25 ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        letterSpacing: '0.02em',
      }}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}
