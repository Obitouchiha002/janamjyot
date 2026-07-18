/**
 * Illustrated portrait avatars for the AI astrologers.
 *
 * These are warm, human-looking ILLUSTRATIONS — not photos of real people.
 * Because every astrologer is explicitly an AI, using a real person's photo
 * would misrepresent them; a friendly illustrated portrait gives the human feel
 * without pretending to be someone real. Each persona gets its own look (skin
 * tone, hair/beard, attire, accessory) so they read as distinct people.
 */
interface Look {
  bg: [string, string]; // background gradient
  skin: string;
  hair: string;
  attire: string;
  beard?: boolean;
  glasses?: boolean;
  bindi?: boolean;   // for the female persona
  tilak?: boolean;   // forehead mark for the elder gurus
}

const LOOKS: Record<string, Look> = {
  ved:    { bg: ['#F7E3BE', '#E9C583'], skin: '#E7B58C', hair: '#EAEAEA', attire: '#C4462F', beard: true, tilak: true },
  career: { bg: ['#CFE0FF', '#9DBEF5'], skin: '#E9B78E', hair: '#2A2A33', attire: '#1F3A6E', glasses: true },
  prem:   { bg: ['#FBD5E6', '#F4A6C6'], skin: '#F0C29B', hair: '#3A2A28', attire: '#B83E73', bindi: true },
  dhan:   { bg: ['#CFEEDD', '#8FD3B0'], skin: '#E4AE86', hair: '#20201F', attire: '#0E5C3C', glasses: true, beard: true },
  upaya:  { bg: ['#E6DAFB', '#C3A6F2'], skin: '#E7B58C', hair: '#F2F2F2', attire: '#5B3EA6', beard: true, tilak: true },
};

export default function AstrologerAvatar({ id, size = 56 }: { id: string; size?: number }) {
  const L = LOOKS[id] ?? LOOKS.ved;
  const gid = `ava-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor={L.bg[0]} />
          <stop offset="1" stopColor={L.bg[1]} />
        </linearGradient>
        <clipPath id={`${gid}-c`}><rect width="100" height="100" rx="26" /></clipPath>
      </defs>

      <g clipPath={`url(#${gid}-c)`}>
        <rect width="100" height="100" fill={`url(#${gid})`} />

        {/* shoulders / attire */}
        <path d="M18 100 C18 80 30 72 50 72 C70 72 82 80 82 100 Z" fill={L.attire} />
        <path d="M50 72 L44 100 L56 100 Z" fill="#FFFFFF" opacity="0.14" />

        {/* neck */}
        <rect x="44" y="60" width="12" height="16" rx="6" fill={L.skin} />

        {/* head */}
        <ellipse cx="50" cy="46" rx="18" ry="20" fill={L.skin} />

        {/* hair */}
        <path d="M31 44 C31 27 42 22 50 22 C58 22 69 27 69 44 C69 38 63 33 50 33 C37 33 31 38 31 44 Z" fill={L.hair} />

        {/* beard */}
        {L.beard && (
          <path d="M34 48 C34 64 42 70 50 70 C58 70 66 64 66 48 C66 58 58 62 50 62 C42 62 34 58 34 48 Z" fill={L.hair} opacity="0.95" />
        )}

        {/* forehead mark */}
        {L.tilak && <path d="M50 30 L52 39 L50 41 L48 39 Z" fill="#C4462F" />}
        {L.bindi && <circle cx="50" cy="33" r="1.8" fill="#B83E73" />}

        {/* eyes */}
        <circle cx="43" cy="45" r="1.9" fill="#2A2320" />
        <circle cx="57" cy="45" r="1.9" fill="#2A2320" />

        {/* glasses */}
        {L.glasses && (
          <g stroke="#2A2320" strokeWidth="1.4" fill="none" opacity="0.8">
            <circle cx="43" cy="45" r="5" /><circle cx="57" cy="45" r="5" />
            <line x1="48" y1="45" x2="52" y2="45" />
          </g>
        )}

        {/* smile */}
        <path d="M45 53 Q50 57 55 53" stroke="#8A5A3C" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
