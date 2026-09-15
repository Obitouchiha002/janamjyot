/**
 * Does a reading say something about the birth chart that is not true?
 *
 * An audit of generated reports found one "<planet> in the Nth house" claim in
 * five was false. None were invented — every one was a real number read from
 * the wrong chart: D10's "Sun, 6th house" written up as if it were the birth
 * chart. The packet now labels every divisional house as its own, which is the
 * prevention. This is the check, so a report that still slips is caught before
 * a person reads it rather than after they compare it with another app.
 *
 * Deliberately conservative: it only flags a claim it is sure about. A clause
 * that names D9/D10/a transit/a lordship/"from the Moon" is not a birth-chart
 * placement claim and is left alone, and a number that is true of the current
 * TRANSIT is not called a lie. A checker that cries wolf gets ignored, or
 * worse, "fixes" a sentence that was right.
 */

const PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"];
const ALIASES: Record<string, string> = {
  surya: "Sun", chandra: "Moon", mangal: "Mars", budh: "Mercury",
  guru: "Jupiter", brihaspati: "Jupiter", shukra: "Venus", shani: "Saturn",
};
const PLANET_RE = new RegExp(`\\b(${[...PLANETS, ...Object.keys(ALIASES)].join("|")})\\b`, "gi");
const HOUSE_RE = /\b(\d{1,2})(?:st|nd|rd|th|va|vein|ve)?\s*(?:house|bhav|bhaav|भाव)/gi;

export interface WrongPlacement {
  planet: string;
  said: number;
  actual: number;
  excerpt: string;
}

function canonical(raw: string): string {
  const k = raw.toLowerCase();
  return ALIASES[k] ?? raw[0].toUpperCase() + raw.slice(1).toLowerCase();
}

/**
 * Every birth-chart placement claim in `text` that contradicts the chart.
 * `transitHouses` (planet → house from lagna, now) excuses a true-but-unlabelled
 * transit reference.
 */
export function wrongPlacements(
  text: string,
  chart: any,
  transitHouses: Record<string, number> = {},
): WrongPlacement[] {
  const truth: Record<string, number> = {};
  for (const p of chart?.planet_positions ?? []) truth[p.planet] = Number(p.house);

  const out: WrongPlacement[] = [];
  for (const m of text.matchAll(HOUSE_RE)) {
    const said = Number(m[1]);
    if (!said || said > 12) continue;
    const at = m.index ?? 0;
    const around = text.slice(Math.max(0, at - 70), at + m[0].length + 25).toLowerCase();
    if (/transit|gochar|guzar|moving through/.test(around)) continue;
    if (/\bd(9|10|6|11|60)\b|navamsa|navamsha|dasamsa|dashamsa|varga/.test(around)) continue;
    if (/lord|swami|svami|adhipati|स्वामी|ruler/.test(around)) continue;
    if (/from (the )?moon|chandra se|moon se/.test(around)) continue;

    // The planet named nearest before the house, within the same clause.
    const clause = text.slice(Math.max(0, at - 45), at).split(/[.;,।!?\n]/).pop() ?? "";
    const names = [...clause.matchAll(PLANET_RE)];
    if (!names.length) continue;
    const planet = canonical(names[names.length - 1][1]);
    const actual = truth[planet];
    if (!actual || actual === said) continue;
    if (transitHouses[planet] === said) continue;
    out.push({
      planet, said, actual,
      excerpt: text.slice(Math.max(0, at - 40), at + m[0].length).replace(/\s+/g, " ").trim(),
    });
  }
  return out;
}

export interface WrongDasha {
  level: "mahadasha" | "antardasha";
  said: string;
  actual: string;
  excerpt: string;
}

/*
 * A running period named wrongly — "aapki Shani mahadasha chal rahi hai" for
 * someone in Venus. The dates and lords are computed, never the model's, but a
 * model can still misread which line is current. Only a claim about NOW is
 * checked (a present-tense marker in the same clause): "Sun mahadasha 2031 se
 * shuru hogi" is about the future and may be perfectly true.
 */
const MAHA_RE = /\b(maha ?dasha|mahadasa)\b/gi;
const ANTAR_RE = /\b(antar ?dasha|antardasa|bhukti)\b/gi;
const IS_PLANET = new RegExp(`^(${[...PLANETS, ...Object.keys(ALIASES)].join("|")})$`, "i");
const NOW_RE = /chal rahi|chal raha|chal rahe|running|\bcurrent|\babhi\b|is samay|is waqt|filhaal|ongoing|you are in|you're in|mein hain/i;

export function wrongDashaClaims(text: string, chart: any): WrongDasha[] {
  const cur = chart?.dasha?.current;
  if (!cur?.mahadasha) return [];
  const out: WrongDasha[] = [];
  const scan = (re: RegExp, level: WrongDasha["level"], actual: string) => {
    if (!actual) return;
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0;
      // The clause the period name sits in, and the planet named just before it.
      const before = text.slice(Math.max(0, at - 40), at).split(/[.;!?\n]/).pop() ?? "";
      // A comma ends the claim going forward: "Rahu antardasha thi, abhi …" is
      // a past period followed by a different sentence about now.
      const after = text.slice(at, at + 60).split(/[,.;!?\n]/)[0] ?? "";
      if (!NOW_RE.test(before + after)) continue;
      const lead = before.match(/([A-Za-z]+)\s*[-–/]\s*([A-Za-z]+)\s*(?:ki|ka|ke|ke\s+)?\s*$/);
      let raw: string | undefined;
      if (lead && IS_PLANET.test(lead[1]) && IS_PLANET.test(lead[2])) {
        // "Venus-Saturn antardasha": the first lord is the mahadasha's.
        raw = level === "mahadasha" ? lead[1] : lead[2];
      } else {
        const names = [...before.matchAll(PLANET_RE)];
        raw = names.at(-1)?.[1];
      }
      if (!raw) continue;
      const said = canonical(raw);
      if (said === actual) continue;
      out.push({ level, said, actual, excerpt: (before + after).replace(/\s+/g, " ").trim() });
    }
  };
  scan(MAHA_RE, "mahadasha", String(cur.mahadasha));
  scan(ANTAR_RE, "antardasha", String(cur.antardasha ?? ""));
  return out;
}

export interface WrongLordship {
  planet: string;
  house: number;
  actual: string;
  excerpt: string;
}

/*
 * "Venus aapke 10th house ka lord hai" for a Gemini lagna, where the 10th is
 * Pisces and its lord is Jupiter. A live test caught two of these in six
 * answers, and neither the placement nor the dasha check could see them: the
 * lordship is not in the packet as a sentence, so the model counts signs and
 * miscounts.
 *
 * Same discipline as the others — only a claim bound unambiguously to a house
 * number is checked, divisional and Moon-relative ones are left alone, and
 * Rahu/Ketu (lords of nothing in this system) are never argued with.
 */
const LORD_BIND_RE = /\b(\d{1,2})(?:st|nd|rd|th|va|ve|vein)?\s*(?:house|bhav|bhaav|ghar)?\s*(?:ka|ke|ki|kaa)?\s*(?:lord|swami|svami|adhipati|ruler)\b|\b(?:lord|ruler) of (?:the |your )?(\d{1,2})(?:st|nd|rd|th)?\b/gi;

export function wrongLordships(text: string, chart: any): WrongLordship[] {
  const lordOf: Record<number, string> = {};
  for (const h of chart?.d1_chart?.houses ?? []) {
    if (h?.house && h?.sign_lord) lordOf[Number(h.house)] = String(h.sign_lord);
  }
  if (Object.keys(lordOf).length < 12) return [];
  const out: WrongLordship[] = [];
  for (const m of text.matchAll(LORD_BIND_RE)) {
    const house = Number(m[1] ?? m[2]);
    if (!house || house > 12) continue;
    const at = m.index ?? 0;
    const end = at + m[0].length;
    const around = text.slice(Math.max(0, at - 60), end + 30).toLowerCase();
    if (/\bd(9|10|6|11|60)\b|navamsa|navamsha|dasamsa|dashamsa|varga/.test(around)) continue;
    if (/from (the )?moon|chandra se|moon se|rashi se|chandra lagna/.test(around)) continue;
    // "and 5th" — a planet ruling two houses named together; the pair is not
    // parsed, so neither number is argued with.
    if (/\d{1,2}(st|nd|rd|th)?\s*(aur|and|&|,)\s*$/.test(text.slice(Math.max(0, at - 12), at).toLowerCase())) continue;

    // The planet: right after ("10th house ke lord Jupiter"), else right before
    // with nothing but a few filler words between ("Venus aapke 10th house ka lord").
    const afterTxt = text.slice(end, end + 14);
    const afterName = afterTxt.match(/^\s*[,:(]?\s*(?:hai\s+|hain\s+|is\s+)?([A-Za-z]+)/)?.[1];
    let raw = afterName && IS_PLANET.test(afterName) ? afterName : undefined;
    if (!raw) {
      const beforeTxt = text.slice(Math.max(0, at - 30), at);
      const b = beforeTxt.match(/([A-Za-z]+)\s*,?\s*(?:(?:aapke|aapka|your|jo|which is|is the|is)\s+)?$/);
      if (b && IS_PLANET.test(b[1])) raw = b[1];
    }
    if (!raw) continue;
    const planet = canonical(raw);
    if (planet === "Rahu" || planet === "Ketu") continue;
    const actual = lordOf[house];
    if (!actual || actual === planet) continue;
    out.push({ planet, house, actual, excerpt: text.slice(Math.max(0, at - 30), end + 14).replace(/\s+/g, " ").trim() });
  }
  return out;
}

/** Every checkable false chart claim in `text`, and a note correcting them. */
export function chartClaimErrors(text: string, chart: any, transitHouses: Record<string, number> = {}) {
  const placements = wrongPlacements(text, chart, transitHouses);
  const dasha = wrongDashaClaims(text, chart);
  const lords = wrongLordships(text, chart);
  return {
    count: placements.length + dasha.length + lords.length,
    summary: `${placements.length} placement / ${dasha.length} dasha / ${lords.length} lordship`,
    note: () => correctionNote(placements, dasha, lords),
  };
}

/** The correction a regeneration is sent, naming exactly what was wrong. */
export function correctionNote(wrong: WrongPlacement[], dasha: WrongDasha[] = [], lords: WrongLordship[] = []): string {
  const uniq = new Map<string, WrongPlacement>();
  for (const w of wrong) uniq.set(`${w.planet}:${w.said}`, w);
  const lines = [...uniq.values()].map(
    (w) => `- You wrote ${w.planet} in the ${w.said} house. In the BIRTH CHART it is in the ${w.actual} house.`,
  );
  for (const l of lords) {
    lines.push(`- You wrote ${l.planet} as lord of the ${l.house} house. The ${l.house} house's lord is ${l.actual}.`);
  }
  for (const d of dasha) {
    lines.push(`- You wrote that the running ${d.level} is ${d.said}'s. It is ${d.actual}'s — see dasha.current.`);
  }
  return (
    "\n\nCORRECTION — your previous draft stated chart facts that are false:\n" +
    lines.join("\n") +
    "\nThose numbers came from a divisional chart or a transit. Every plain \"Nth house\" you write must " +
    "match birth_chart_facts. If you mean a D9/D10 or transit placement, say so in the same sentence. " +
    "Rewrite the whole reading with this fixed.\n"
  );
}
