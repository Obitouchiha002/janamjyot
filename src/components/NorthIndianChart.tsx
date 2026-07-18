import React from 'react';

// Centers of the 12 houses to position the text
// Assuming a viewBox of 0 0 400 400
const HOUSE_CENTERS: Record<number, {x: number, y: number}> = {
  1: { x: 200, y: 100 },
  2: { x: 100, y: 50 },
  3: { x: 50, y: 100 },
  4: { x: 100, y: 200 },
  5: { x: 50, y: 300 },
  6: { x: 100, y: 350 },
  7: { x: 200, y: 300 },
  8: { x: 300, y: 350 },
  9: { x: 350, y: 300 },
  10: { x: 300, y: 200 },
  11: { x: 350, y: 100 },
  12: { x: 300, y: 50 }
};

interface PlanetData {
  planet: string;
  short: string;
  sign: string;
  house: number;
}

interface NorthIndianChartProps {
  planets: PlanetData[];
  ascendantSign: string;
  shortNames?: boolean;
}

// ZODIAC SIGNS starting from Aries=1
const ZODIAC_NUMBERS: Record<string, number> = {
  Aries: 1, Taurus: 2, Gemini: 3, Cancer: 4, Leo: 5, Virgo: 6,
  Libra: 7, Scorpio: 8, Sagittarius: 9, Capricorn: 10, Aquarius: 11, Pisces: 12
};

export function NorthIndianChart({ planets, ascendantSign, shortNames = false }: NorthIndianChartProps) {
  const ascNumber = ZODIAC_NUMBERS[ascendantSign] || 1;

  // Render planet strings per house
  const houseLabels: Record<number, string[]> = {};
  for (let i = 1; i <= 12; i++) {
    houseLabels[i] = [];
  }

  planets.forEach(p => {
    if (houseLabels[p.house]) {
      houseLabels[p.house].push(shortNames ? p.short : p.planet);
    }
  });

  // Numbers in corners: House 1 gets the ascendant zodiac number
  const houseZodiacs: Record<number, number> = {};
  for (let i = 1; i <= 12; i++) {
    let num = ascNumber + (i - 1);
    if (num > 12) num -= 12;
    houseZodiacs[i] = num;
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-muted">
      <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet" className="h-full w-full text-foreground/30">
        {/* Outer Box */}
        <rect x="0" y="0" width="400" height="400" fill="none" stroke="currentColor" strokeWidth="2" />
        {/* Diagonals */}
        <line x1="0" y1="0" x2="400" y2="400" stroke="currentColor" strokeWidth="2" />
        <line x1="400" y1="0" x2="0" y2="400" stroke="currentColor" strokeWidth="2" />
        
        {/* Inner Diamond */}
        <line x1="200" y1="0" x2="0" y2="200" stroke="currentColor" strokeWidth="2" />
        <line x1="200" y1="0" x2="400" y2="200" stroke="currentColor" strokeWidth="2" />
        <line x1="0" y1="200" x2="200" y2="400" stroke="currentColor" strokeWidth="2" />
        <line x1="400" y1="200" x2="200" y2="400" stroke="currentColor" strokeWidth="2" />

        {/* Placing house numbers and planets */}
        {[1,2,3,4,5,6,7,8,9,10,11,12].map(h => {
          const cx = HOUSE_CENTERS[h].x;
          const cy = HOUSE_CENTERS[h].y;

          return (
            <g key={h}>
               {/* Zodiac Number */}
               <text 
                 x={cx} y={cy - 16} 
                 textAnchor="middle" 
                 fontSize="14" 
                 className="fill-muted-foreground font-semibold"
               >
                 {houseZodiacs[h]}
               </text>
               {/* Planets */}
               <text
                 x={cx} y={cy + 6}
                 textAnchor="middle"
                 fontSize="12"
                 className="fill-foreground font-medium"
               >
                 {houseLabels[h].join(', ')}
               </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
