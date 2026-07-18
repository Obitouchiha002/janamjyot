/**
 * Shareable Kundli card.
 *
 * Draws a poster-sized PNG of someone's birth chart that looks good pasted into
 * a WhatsApp chat — the app's own branding, their real D1 diamond, and the four
 * facts people actually quote to each other (lagna, rashi, nakshatra, dasha).
 *
 * Drawn with the plain Canvas API rather than html2canvas: no extra dependency,
 * no surprise layout differences between devices, and the output is sharp
 * because we control the pixel size directly.
 */

const W = 1080;
const H = 1350;

/** North-Indian houses are fixed on screen; only the SIGN in them rotates. */
const SIGN_ORDER = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

const PLANET_SHORT: Record<string, string> = {
  Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me', Jupiter: 'Ju',
  Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke',
};

export interface ShareCardData {
  name: string;
  lagna: string;
  rashi: string;
  nakshatra: string;
  dasha: string;
  /** Planet positions from the normalized chart (planet + house). */
  planets?: Array<{ planet: string; house: number }>;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/**
 * The classic North-Indian diamond: a square, its two diagonals, and a rhombus
 * joining the edge midpoints. House 1 is the top-centre rhombus, then anti-clockwise.
 */
function drawChart(c: CanvasRenderingContext2D, x: number, y: number, size: number, data: ShareCardData) {
  const s = size, h = s / 2;
  c.save();
  c.translate(x, y);

  c.strokeStyle = 'rgba(233,196,106,0.55)';
  c.lineWidth = 2.5;
  c.strokeRect(0, 0, s, s);
  c.beginPath(); c.moveTo(0, 0); c.lineTo(s, s); c.moveTo(s, 0); c.lineTo(0, s); c.stroke();
  c.beginPath(); c.moveTo(h, 0); c.lineTo(s, h); c.lineTo(h, s); c.lineTo(0, h); c.closePath(); c.stroke();

  // Centre of each of the 12 houses in the fixed North-Indian layout: house 1
  // is the top-centre rhombus and the rest run anti-clockwise. These sit inside
  // the actual house regions — an earlier version crowded them near the middle.
  const e = s / 8;
  const centres: Array<[number, number]> = [
    [h, 2 * e],          // 1  top centre
    [2 * e, e],          // 2  top-left
    [e, 2 * e],          // 3  left-top
    [2 * e, h],          // 4  left centre
    [e, 6 * e],          // 5  left-bottom
    [2 * e, 7 * e],      // 6  bottom-left
    [h, 6 * e],          // 7  bottom centre
    [6 * e, 7 * e],      // 8  bottom-right
    [7 * e, 6 * e],      // 9  right-bottom
    [6 * e, h],          // 10 right centre
    [7 * e, 2 * e],      // 11 right-top
    [6 * e, e],          // 12 top-right
  ];

  const lagnaIdx = SIGN_ORDER.indexOf(data.lagna);
  const byHouse = new Map<number, string[]>();
  for (const p of data.planets ?? []) {
    const short = PLANET_SHORT[p.planet];
    if (!short || !p.house) continue;
    byHouse.set(p.house, [...(byHouse.get(p.house) ?? []), short]);
  }

  centres.forEach(([cx, cy], i) => {
    // Sign number for this house (whole-sign: house 1 = lagna sign).
    if (lagnaIdx >= 0) {
      c.fillStyle = 'rgba(233,196,106,0.55)';
      c.font = '500 22px system-ui, -apple-system, sans-serif';
      c.textAlign = 'center';
      c.fillText(String(((lagnaIdx + i) % 12) + 1), cx, cy - 16);
    }
    const list = byHouse.get(i + 1);
    if (list?.length) {
      c.fillStyle = '#F7E3B0';
      c.font = '700 25px system-ui, -apple-system, sans-serif';
      c.textAlign = 'center';
      list.slice(0, 3).forEach((p, j) => c.fillText(p, cx, cy + 16 + j * 27));
    }
  });

  c.restore();
}

/** Load an image, resolving to null instead of throwing if it isn't there. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // card still renders without it
    img.src = src;
  });
}

/** Render the card and return it as a PNG data URL. */
export function renderShareCard(data: ShareCardData): string {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;

  // Background — the app's night-sky navy.
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#12224A');
  bg.addColorStop(0.55, '#0A1836');
  bg.addColorStop(1, '#050B1E');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);

  // Soft gold glow behind the chart.
  const glow = c.createRadialGradient(W / 2, 590, 40, W / 2, 590, 430);
  glow.addColorStop(0, 'rgba(216,171,78,0.16)');
  glow.addColorStop(1, 'rgba(216,171,78,0)');
  c.fillStyle = glow;
  c.fillRect(0, 200, W, 900);

  // Brand
  c.textAlign = 'center';
  c.fillStyle = '#F7E3B0';
  c.font = '700 46px Georgia, "Times New Roman", serif';
  c.fillText('JanamJyot', W / 2, 182);
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.font = '500 22px system-ui, -apple-system, sans-serif';
  c.fillText('VEDIC  ·  JANAM  KUNDLI', W / 2, 218);

  // Name
  c.fillStyle = '#FFFFFF';
  c.font = '700 62px Georgia, "Times New Roman", serif';
  c.fillText(data.name || 'My Kundli', W / 2, 296);

  // Chart
  const size = 500;
  drawChart(c, (W - size) / 2, 340, size, data);

  // Fact chips — 2×2 grid
  const chips: Array<[string, string]> = [
    ['LAGNA', data.lagna], ['MOON · RASHI', data.rashi],
    ['NAKSHATRA', data.nakshatra], ['DASHA', data.dasha],
  ];
  const cw = 452, ch = 116, gap = 26;
  const x0 = (W - (cw * 2 + gap)) / 2;
  const y0 = 880;
  chips.forEach(([label, value], i) => {
    const x = x0 + (i % 2) * (cw + gap);
    const y = y0 + Math.floor(i / 2) * (ch + gap);
    c.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(c, x, y, cw, ch, 22);
    c.fill();
    c.strokeStyle = 'rgba(233,196,106,0.28)';
    c.lineWidth = 1.5;
    c.stroke();

    c.textAlign = 'left';
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.font = '600 20px system-ui, -apple-system, sans-serif';
    c.fillText(label, x + 28, y + 44);
    c.fillStyle = '#F7E3B0';
    c.font = '700 36px system-ui, -apple-system, sans-serif';
    // Long values (e.g. "Uttara Bhadrapada") must not spill out of the chip.
    let v = value || '—';
    while (c.measureText(v).width > cw - 56 && v.length > 4) v = v.slice(0, -2);
    if (v !== (value || '—')) v = v.trimEnd() + '…';
    c.fillText(v, x + 28, y + 88);
  });

  return canvas.toDataURL('image/png');
}

/**
 * The full premium card: everything above plus the app icon, a gold frame and a
 * scannable QR. Async because the logo/QR are real image files.
 */
export async function renderShareCardPremium(data: ShareCardData): Promise<string> {
  const base = renderShareCard(data);
  const [bgImg, logo, qr] = await Promise.all([
    loadImage(base),
    loadImage('/apple-touch-icon.png'),
    loadImage('/janamjyot-qr.png'),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;
  if (bgImg) c.drawImage(bgImg, 0, 0, W, H);

  // Gold hairline frame — makes it read as a card rather than a screenshot.
  c.strokeStyle = 'rgba(233,196,106,0.45)';
  c.lineWidth = 3;
  roundRect(c, 22, 22, W - 44, H - 44, 34);
  c.stroke();

  // App icon above the wordmark.
  if (logo) {
    const ls = 88;
    c.save();
    roundRect(c, (W - ls) / 2, 34, ls, ls, 22);
    c.clip();
    c.drawImage(logo, (W - ls) / 2, 34, ls, ls);
    c.restore();
  }

  // Footer: QR on the left, the call to action beside it.
  const qs = 124;
  const qx = 104, qy = 1160;
  if (qr) {
    c.fillStyle = '#FFFFFF';
    roundRect(c, qx - 12, qy - 12, qs + 24, qs + 24, 16);
    c.fill();
    c.drawImage(qr, qx, qy, qs, qs);
  }

  c.textAlign = 'left';
  const tx = qr ? qx + qs + 44 : 96;
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.font = '500 24px system-ui, -apple-system, sans-serif';
  c.fillText(qr ? 'Scan to get your own' : 'Make your free Kundli at', tx, qy + 46);
  c.fillStyle = '#F7E3B0';
  c.font = '700 34px system-ui, -apple-system, sans-serif';
  c.fillText('free Janam Kundli', tx, qy + 88);
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.font = '500 22px system-ui, -apple-system, sans-serif';
  c.fillText('janamjyot.vercel.app', tx, qy + 124);

  return canvas.toDataURL('image/png');
}
