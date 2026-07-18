/**
 * The JanamJyot logo mark — a navy celestial plate with a gold sacred flame
 * (jyot / diya), a four-point star and a compass arc. Pure SVG so it stays
 * crisp at any size. Same geometry as the Android launcher icon and the
 * download website, so the app and its icon match everywhere.
 *
 * `bg` draws the app-icon's own navy rounded plate. When false, only the
 * flame + star are drawn (transparent) for use on coloured surfaces.
 */
export default function Logo({ size = 72, bg = true }: { size?: number; bg?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 108 108" fill="none" aria-label="JanamJyot">
      <defs>
        <linearGradient id="jj-plate" x1="0" y1="0" x2="108" y2="108" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0D1B3D" />
          <stop offset="1" stopColor="#050B1E" />
        </linearGradient>
        <linearGradient id="jj-gold" x1="42" y1="30" x2="66" y2="92" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F2D17C" />
          <stop offset="0.5" stopColor="#D8AB4E" />
          <stop offset="1" stopColor="#A87522" />
        </linearGradient>
      </defs>

      {bg && (
        <>
          <rect x="2" y="2" width="104" height="104" rx="26" fill="url(#jj-plate)" />
          <rect x="3.4" y="3.4" width="101.2" height="101.2" rx="24" fill="none" stroke="#D8AB4E" strokeWidth="1.3" strokeOpacity="0.9" />
        </>
      )}

      {/* compass arc + points */}
      <path d="M28 58 A28 28 0 0 1 80 58" fill="none" stroke="#D8AB4E" strokeWidth="1.1" strokeOpacity="0.7" />
      <circle cx="30.5" cy="52" r="2.4" fill="#D8AB4E" />
      <circle cx="77.5" cy="52" r="2" fill="#D8AB4E" />

      {/* four-point star */}
      <path d="M54 24 L56 33 L54 35 L52 33 Z M54 24 L52 33 L44 35 L52 37 Z M54 24 L56 33 L64 35 L56 37 Z M54 46 L52 37 L54 35 L56 37 Z" fill="#F2D17C" />

      {/* aura */}
      <ellipse cx="54" cy="72" rx="19" ry="23" fill="#F2D17C" opacity="0.14" />

      {/* sacred flame */}
      <path d="M54 46 C61 55 66 60 66 70 C66 80 60 86 54 86 C48 86 42 80 42 70 C42 62 47 57 51 52 C50 60 53 64 57 66 C58 60 56 52 54 46 Z" fill="url(#jj-gold)" />
      <path d="M54 66 C57 70 58 74 58 78 C58 83 56 86 54 86 C52 86 50 83 50 78 C50 74 51 70 54 66 Z" fill="#F2D17C" />

      {/* diya wick line */}
      <path d="M54 72 L55.4 80 L54 94 L52.6 80 Z" fill="#FDE8B8" />
      <circle cx="54" cy="80" r="1.8" fill="#fff" />
    </svg>
  );
}
