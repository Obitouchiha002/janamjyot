/*
 * The North Indian birth chart.
 *
 * It was grey lines and tiny text: no mark for the Lagna, all planets in one
 * comma-separated string, every planet the same colour. Now the Lagna house is
 * lit and labelled, sign numbers are bold, and each planet has its own colour
 * and its own line — so a house holding five planets is still readable.
 */

// Centres of the 12 houses in a 400×400 box.
const HOUSE_CENTERS: Record<number, { x: number; y: number }> = {
  1: { x: 200, y: 100 }, 2: { x: 100, y: 50 }, 3: { x: 50, y: 100 }, 4: { x: 100, y: 200 },
  5: { x: 50, y: 300 }, 6: { x: 100, y: 350 }, 7: { x: 200, y: 300 }, 8: { x: 300, y: 350 },
  9: { x: 350, y: 300 }, 10: { x: 300, y: 200 }, 11: { x: 350, y: 100 }, 12: { x: 300, y: 50 },
};
const HOUSES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** The four diamonds have room for full names; the eight triangles do not. */
const DIAMONDS = new Set([1, 4, 7, 10]);

const ZODIAC_NUMBERS: Record<string, number> = {
  Aries: 1, Taurus: 2, Gemini: 3, Cancer: 4, Leo: 5, Virgo: 6,
  Libra: 7, Scorpio: 8, Sagittarius: 9, Capricorn: 10, Aquarius: 11, Pisces: 12,
};

/** One colour per planet, shared with the placements list under the chart. */
export const PLANET_COLOR: Record<string, string> = {
  Sun: "#E07B00", Moon: "#5B7FA6", Mars: "#DC2626", Mercury: "#16A34A", Jupiter: "#B7791F",
  Venus: "#DB2777", Saturn: "#1D4ED8", Rahu: "#7C3AED", Ketu: "#92400E",
  Uranus: "#0891B2", Neptune: "#0E7490", Pluto: "#57534E",
};
const SHORT: Record<string, string> = {
  Sun: "Su", Moon: "Mo", Mars: "Ma", Mercury: "Me", Jupiter: "Ju", Venus: "Ve",
  Saturn: "Sa", Rahu: "Ra", Ketu: "Ke", Uranus: "Ur", Neptune: "Ne", Pluto: "Pl",
};

interface PlanetData {
  planet: string;
  short?: string;
  sign?: string;
  house: number;
  retrograde?: boolean;
}

interface NorthIndianChartProps {
  planets: PlanetData[];
  ascendantSign: string;
  shortNames?: boolean;
}

export function NorthIndianChart({ planets, ascendantSign, shortNames = false }: NorthIndianChartProps) {
  const asc = ZODIAC_NUMBERS[ascendantSign] || 1;
  const signOf = (h: number) => ((asc + h - 2) % 12) + 1;
  const byHouse: Record<number, PlanetData[]> = {};
  for (const h of HOUSES) byHouse[h] = [];
  planets.forEach((p) => byHouse[p.house]?.push(p));

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-accent/25 bg-card">
      <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet" className="h-full w-full" role="img"
        aria-label={`Birth chart, Lagna in ${ascendantSign}`}>
        {/* The Lagna house, lit. */}
        <polygon points="200,4 296,100 200,196 104,100" className="fill-accent/15" />
        <g className="text-accent/50" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round">
          <rect x="2" y="2" width="396" height="396" rx="8" />
          <line x1="2" y1="2" x2="398" y2="398" />
          <line x1="398" y1="2" x2="2" y2="398" />
          <polygon points="200,2 398,200 200,398 2,200" />
        </g>
        <text x={200} y={40} textAnchor="middle" fontSize="11" fontWeight="800" letterSpacing="1.5" className="fill-accent">LAGNA</text>

        {HOUSES.map((h) => {
          const { x, y } = HOUSE_CENTERS[h];
          const list = byHouse[h];
          const useShort = shortNames || list.length > 3 || (!DIAMONDS.has(h) && list.length > 1);
          const lineH = 15;
          const top = y - ((list.length - 1) * lineH) / 2 + 10;
          return (
            <g key={h}>
              <text x={x} y={list.length ? top - 19 : y + 6} textAnchor="middle" fontSize="15" fontWeight="800"
                className="fill-muted-foreground">
                {signOf(h)}
              </text>
              {list.map((p, i) => (
                <text key={p.planet} x={x} y={top + i * lineH} textAnchor="middle" fontSize="13" fontWeight="700"
                  fill={PLANET_COLOR[p.planet] ?? "currentColor"}>
                  {useShort ? (SHORT[p.planet] ?? p.short ?? p.planet.slice(0, 2)) : p.planet}
                  {p.retrograde ? "ᴿ" : ""}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
