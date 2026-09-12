/**
 * Kundli matching beyond the 36 points.
 *
 * Ashtakoot compares two Moons and nothing else. It is the layer everyone
 * quotes, and on its own it answers the wrong question: a 30/36 score says the
 * two Moons agree, not that either chart supports a marriage at all, nor that
 * the years ahead give them the same opening. Both of those are readable, and
 * both routinely contradict a good score.
 *
 * So this module computes, deterministically and with no AI anywhere in it:
 *   · the 7th house in D1 AND D9 — sign, lord, occupants, and where that lord
 *     itself sits (a 7th lord in 6/8/12 is classically the weak case)
 *   · Venus and Jupiter, the marriage karakas
 *   · each person's OWN marriage promise, independent of who they are matched
 *     with — the thing a score cannot tell you
 *   · the Venus / 7th-lord periods ahead for each of them, and whether those
 *     windows actually overlap
 *   · Manglik, Bhakoot and Nadi with their classical cancellations
 *   · the remedy for a dosha that is genuinely present
 *
 * Everything here is a rule, not a judgement. The one judgement — what a
 * couple should DO about it — is a separate AI call that is handed these
 * numbers, so it can never invent a dosha or a remedy that does not exist.
 */
import { computeChart } from "./engine";
import { normalizeChart, SIGNS } from "./normalize";
import { buildIsoDatetime, type BirthInput } from "./validate";

const SIGN_LORDS = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];

/** Houses 6, 8 and 12 — the dusthanas. */
const DUSTHANA = new Set([6, 8, 12]);

/** Classical planetary friendship, used for the Bhakoot cancellation. */
const FRIENDS: Record<string, string[]> = {
  Sun: ["Moon", "Mars", "Jupiter"],
  Moon: ["Sun", "Mercury"],
  Mars: ["Sun", "Moon", "Jupiter"],
  Mercury: ["Sun", "Venus"],
  Jupiter: ["Sun", "Moon", "Mars"],
  Venus: ["Mercury", "Saturn"],
  Saturn: ["Mercury", "Venus"],
};

function mutualFriends(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return !!FRIENDS[a]?.includes(b) && !!FRIENDS[b]?.includes(a);
}

export interface HouseInfo {
  house: number;
  sign: string;
  lord: string;
  occupants: string[];
}

export interface SeventhInfo {
  sign: string;
  lord: string;
  occupants: string[];
  /** Which house the 7th LORD itself occupies. */
  lord_house: number | null;
  lord_sign: string;
  /** True when that lord sits in 6, 8 or 12 — classically the weaker case. */
  lord_in_dusthana: boolean;
}

export interface PlacementInfo {
  sign: string;
  house: number | null;
  retrograde: boolean;
}

export interface DashaWindow {
  period: string;   // "Venus-Jupiter"
  from: string;     // YYYY-MM-DD
  to: string;
  /** Why this window is marriage-supportive, in plain words. */
  why: string;
}

export interface MarriagePromise {
  level: "strong" | "moderate" | "weak";
  score: number;          // 0-100, so the UI can draw it
  reasons: string[];
}

export interface DeepPerson {
  name: string;
  lagna: string;
  lagna_lord: string;
  moon_sign: string;
  nakshatra: string;
  d1_houses: HouseInfo[];
  d9_houses: HouseInfo[];
  seventh_d1: SeventhInfo;
  seventh_d9: SeventhInfo;
  venus: PlacementInfo;
  jupiter: PlacementInfo;
  planets: Array<{ planet: string; sign: string; house: number; retrograde: boolean; degree: number }>;
  promise: MarriagePromise;
  current_dasha: { mahadasha: string; antardasha: string; from: string; to: string };
  marriage_windows: DashaWindow[];
  /** Every antardasha from today out ~15 years — what the year picker reads. */
  antardasha: Array<{ period: string; from: string; to: string }>;
}

/** The house a planet occupies in a normalized chart, or null if absent. */
function houseOf(planets: any[], name: string): number | null {
  const p = planets.find((x) => x.planet === name);
  return p && Number.isFinite(p.house) ? Number(p.house) : null;
}

function placement(planets: any[], name: string): PlacementInfo {
  const p = planets.find((x) => x.planet === name);
  return {
    sign: p?.sign ?? "",
    house: p && Number.isFinite(p.house) ? Number(p.house) : null,
    retrograde: !!p?.retrograde,
  };
}

function seventhOf(houses: any[], planets: any[]): SeventhInfo {
  const h7 = houses.find((h) => h.house === 7) ?? {};
  const lord = h7.sign_lord ?? "";
  const lordHouse = houseOf(planets, lord);
  const lordPlanet = planets.find((x) => x.planet === lord);
  return {
    sign: h7.sign ?? "",
    lord,
    occupants: Array.isArray(h7.planets) ? h7.planets : [],
    lord_house: lordHouse,
    lord_sign: lordPlanet?.sign ?? "",
    lord_in_dusthana: lordHouse != null && DUSTHANA.has(lordHouse),
  };
}

/**
 * Does THIS chart, on its own, support marriage?
 *
 * Deliberately a small, explainable score rather than a verdict. Every point
 * comes with the sentence that earned it, because "weak promise" with no reason
 * is the kind of thing that frightens people out of a perfectly good match.
 */
function marriagePromise(seventh: SeventhInfo, seventhD9: SeventhInfo, venus: PlacementInfo, jupiter: PlacementInfo): MarriagePromise {
  let score = 50;
  const reasons: string[] = [];

  if (seventh.lord_house != null) {
    if (seventh.lord_in_dusthana) {
      score -= 20;
      reasons.push(`The 7th lord (${seventh.lord}) sits in the ${ordinal(seventh.lord_house)} house, one of the difficult houses — marriage tends to come later, or ask more work.`);
    } else if ([1, 2, 4, 5, 7, 9, 10, 11].includes(seventh.lord_house)) {
      score += 18;
      reasons.push(`The 7th lord (${seventh.lord}) is well placed in the ${ordinal(seventh.lord_house)} house — the chart supports partnership on its own.`);
    } else {
      reasons.push(`The 7th lord (${seventh.lord}) sits in the ${ordinal(seventh.lord_house)} house.`);
    }
  }

  if (seventhD9.lord_in_dusthana) {
    score -= 10;
    reasons.push(`In the Navamsa — the chart read for marriage itself — the 7th lord is also in a difficult house, so the same theme repeats.`);
  } else if (seventhD9.lord_house != null) {
    score += 8;
    reasons.push(`The Navamsa 7th lord is placed steadily, which is the stronger signal of the two.`);
  }

  if (venus.house != null) {
    if (DUSTHANA.has(venus.house)) {
      score -= 8;
      reasons.push(`Venus, the planet of marriage, is in the ${ordinal(venus.house)} house — affection is real but is rarely straightforward early on.`);
    } else {
      score += 10;
      reasons.push(`Venus is comfortably placed in the ${ordinal(venus.house)} house.`);
    }
    if (venus.retrograde) {
      score -= 5;
      reasons.push(`Venus is retrograde, which usually means love is revisited rather than rushed.`);
    }
  }

  if (jupiter.house != null && [1, 2, 4, 5, 7, 9, 11].includes(jupiter.house)) {
    score += 10;
    reasons.push(`Jupiter's placement in the ${ordinal(jupiter.house)} house protects the marriage area.`);
  }

  score = Math.max(5, Math.min(98, score));
  const level: MarriagePromise["level"] = score >= 65 ? "strong" : score >= 45 ? "moderate" : "weak";
  return { level, score, reasons };
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * The marriage-supportive periods ahead: any antardasha run by Venus or by this
 * person's own 7th lord, within the next ten years. These are the windows that
 * actually matter for timing — a Saturn-Saturn stretch is not one of them, and
 * saying so is more useful than listing every period.
 */
function marriageWindows(dasha: any, seventhLord: string, years = 10): DashaWindow[] {
  const now = Date.now();
  const until = now + years * 365.25 * 24 * 3600 * 1000;
  const rows: any[] = Array.isArray(dasha?.antardasha) ? dasha.antardasha : [];
  const out: DashaWindow[] = [];
  for (const a of rows) {
    const from = new Date(`${String(a.from).slice(0, 10)}T00:00:00`).getTime();
    const to = new Date(`${String(a.to).slice(0, 10)}T00:00:00`).getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (to <= now || from >= until) continue;
    const lords = [a.mahadasha, a.lord];
    const hasVenus = lords.includes("Venus");
    const hasSeventh = !!seventhLord && lords.includes(seventhLord);
    const hasJupiter = lords.includes("Jupiter");
    if (!hasVenus && !hasSeventh && !hasJupiter) continue;
    const why = hasVenus && hasSeventh
      ? `Venus and the 7th lord (${seventhLord}) both run this period — the strongest marriage window in this chart.`
      : hasVenus
      ? "Venus runs this period — the classical marriage karaka."
      : hasSeventh
      ? `The 7th lord (${seventhLord}) runs this period.`
      : "Jupiter runs this period, which supports settling and commitment.";
    out.push({ period: a.label ?? `${a.mahadasha}-${a.lord}`, from: String(a.from).slice(0, 10), to: String(a.to).slice(0, 10), why });
  }
  return out.sort((x, y) => (x.from < y.from ? -1 : 1));
}

/** Every antardasha touching the next ~15 years — the year picker's source. */
function upcomingAntardasha(dasha: any, years = 15): Array<{ period: string; from: string; to: string }> {
  const now = Date.now();
  const until = now + years * 365.25 * 24 * 3600 * 1000;
  const rows: any[] = Array.isArray(dasha?.antardasha) ? dasha.antardasha : [];
  return rows
    .filter((a) => {
      const from = new Date(`${String(a.from).slice(0, 10)}T00:00:00`).getTime();
      const to = new Date(`${String(a.to).slice(0, 10)}T00:00:00`).getTime();
      return Number.isFinite(from) && Number.isFinite(to) && to > now && from < until;
    })
    .map((a) => ({ period: a.label ?? `${a.mahadasha}-${a.lord}`, from: String(a.from).slice(0, 10), to: String(a.to).slice(0, 10) }))
    .sort((x, y) => (x.from < y.from ? -1 : 1));
}

/**
 * The periods a person is actually in during one calendar year.
 *
 * The year picker's answer is only worth reading if it is about that year, and
 * that means handing the model the periods that overlap it rather than the
 * whole timeline and a hope.
 */
export function periodsInYear(person: DeepPerson, year: number): Array<{ period: string; from: string; to: string }> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  return person.antardasha.filter((a) => a.from <= end && a.to >= start);
}

/** Build every deterministic layer for one person. */
export function deepPerson(birth: BirthInput, ayanamsa: number): DeepPerson {
  const isoDatetime = buildIsoDatetime(birth.date_of_birth, birth.time_of_birth, birth.timezone);
  const local = computeChart({
    datetime: isoDatetime,
    latitude: birth.latitude,
    longitude: birth.longitude,
    ayanamsa,
  });
  const { normalized } = normalizeChart({
    birth,
    isoDatetime,
    ayanamsa,
    planetPositionData: local.planetPositionData,
    birthDetailsData: undefined,
    dashaData: local.dashaData,
    raw: undefined,
    provider: "local",
  });

  const planets = normalized.planet_positions ?? [];
  const d1 = normalized.d1_chart?.houses ?? [];
  const d9 = normalized.d9_chart?.houses ?? [];

  // The D9 planet list is not in `planet_positions`, so the Navamsa 7th lord's
  // own house is read from the D9 houses themselves.
  const d9Planets = d9.flatMap((h: any) =>
    (h.planets ?? []).map((p: string) => ({ planet: p, house: h.house, sign: h.sign, retrograde: false })),
  );

  const seventh_d1 = seventhOf(d1, planets);
  const seventh_d9 = seventhOf(d9, d9Planets);
  const venus = placement(planets, "Venus");
  const jupiter = placement(planets, "Jupiter");

  const toHouseInfo = (rows: any[]): HouseInfo[] =>
    rows.map((h) => ({ house: h.house, sign: h.sign, lord: h.sign_lord, occupants: h.planets ?? [] }));

  return {
    name: birth.name,
    lagna: normalized.summary?.lagna ?? "",
    lagna_lord: SIGN_LORDS[SIGNS.indexOf(normalized.summary?.lagna ?? "")] ?? "",
    moon_sign: normalized.summary?.rashi ?? "",
    nakshatra: normalized.summary?.nakshatra ?? "",
    d1_houses: toHouseInfo(d1),
    d9_houses: toHouseInfo(d9),
    seventh_d1,
    seventh_d9,
    venus,
    jupiter,
    planets: planets.map((p: any) => ({
      planet: p.planet, sign: p.sign, house: p.house, retrograde: !!p.retrograde, degree: p.degree,
    })),
    promise: marriagePromise(seventh_d1, seventh_d9, venus, jupiter),
    current_dasha: {
      mahadasha: normalized.dasha?.current?.mahadasha ?? "",
      antardasha: normalized.dasha?.current?.antardasha ?? "",
      from: normalized.dasha?.current?.antardasha_from ?? "",
      to: normalized.dasha?.current?.antardasha_to ?? "",
    },
    marriage_windows: marriageWindows(normalized.dasha, seventh_d1.lord),
    antardasha: upcomingAntardasha(normalized.dasha),
  };
}

/*
 * A Date back to YYYY-MM-DD, in the same local day it was built from.
 *
 * `toISOString()` would answer in UTC, which in IST is the day before — the
 * overlap starting 11 September was being printed as the 10th. Dates a person
 * plans a wedding around are not the place to be a day out.
 */
function ymd(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface TimingAlignment {
  aligned: boolean;
  /** Windows where BOTH charts are marriage-supportive at the same time. */
  overlaps: Array<{ from: string; to: string; boy_period: string; girl_period: string }>;
  note: string;
}

/**
 * Where the two sets of windows actually overlap.
 *
 * A couple can each have strong marriage periods and still never share one; the
 * overlap is the thing worth knowing, and it is arithmetic, not interpretation.
 */
export function timingAlignment(boy: DeepPerson, girl: DeepPerson): TimingAlignment {
  const overlaps: TimingAlignment["overlaps"] = [];
  const ms = (s: string) => new Date(`${s}T00:00:00`).getTime();
  for (const b of boy.marriage_windows) {
    for (const g of girl.marriage_windows) {
      const from = Math.max(ms(b.from), ms(g.from));
      const to = Math.min(ms(b.to), ms(g.to));
      // Anything under a month is a technical overlap, not a usable window.
      if (to - from < 30 * 24 * 3600 * 1000) continue;
      overlaps.push({
        from: ymd(from),
        to: ymd(to),
        boy_period: b.period,
        girl_period: g.period,
      });
    }
  }
  overlaps.sort((a, b) => (a.from < b.from ? -1 : 1));
  const aligned = overlaps.length > 0;
  return {
    aligned,
    overlaps: overlaps.slice(0, 6),
    note: aligned
      ? `Both charts open a marriage-supportive period together — the first from ${overlaps[0].from}.`
      : "Their supportive periods do not overlap in the next ten years, so timing will need more care than the score suggests.",
  };
}

export interface DoshaDetail {
  name: "Manglik" | "Bhakoot" | "Nadi";
  present: boolean;
  cancelled: boolean;
  /** present && !cancelled — the only state that needs a remedy. */
  active: boolean;
  detail: string;
}

/**
 * The three doshas, with the cancellations that classical texts actually give.
 *
 * Reported as three separate booleans rather than a sentence, because the UI,
 * the remedies and the verdict all branch on them — and a translated sentence
 * cannot be branched on. That mistake once turned every icon red the moment
 * someone switched to Hindi.
 */
export function doshaDetails(
  boyManglik: boolean,
  girlManglik: boolean,
  boyMoonSignIdx: number,
  girlMoonSignIdx: number,
  boyRasiLord: string,
  girlRasiLord: string,
  boyNakIdx: number,
  girlNakIdx: number,
  boyNadi: string,
  girlNadi: string,
): DoshaDetail[] {
  // --- Manglik ---
  const manglikPresent = boyManglik || girlManglik;
  const manglikCancelled = boyManglik && girlManglik;
  const manglik: DoshaDetail = {
    name: "Manglik",
    present: manglikPresent,
    cancelled: manglikCancelled,
    active: manglikPresent && !manglikCancelled,
    detail: manglikCancelled
      ? "Both are Manglik, so the dosha cancels itself — this is the classical exception, and no remedy is needed."
      : manglikPresent
      ? `${boyManglik ? "The groom" : "The bride"} is Manglik and the other is not. Traditionally this asks for a Mangal Shanti before the wedding.`
      : "Neither chart is Manglik.",
  };

  // --- Bhakoot ---
  // The same 6-8 / 2-12 / 5-9 rule the Ashtakoot scorer uses. Two different
  // answers to "is there a Bhakoot dosha?" on one screen would be worse than
  // either answer alone, so this reads from the same rule rather than its own.
  const d1 = ((girlMoonSignIdx - boyMoonSignIdx + 12) % 12) + 1;
  const d2 = ((boyMoonSignIdx - girlMoonSignIdx + 12) % 12) + 1;
  const pairKey = [d1, d2].sort((a, b) => a - b).join("-");
  const bhakootPresent = ["6-8", "2-12", "5-9"].includes(pairKey);
  const bhakootCancelled = bhakootPresent
    && (boyRasiLord === girlRasiLord || mutualFriends(boyRasiLord, girlRasiLord));
  const bhakoot: DoshaDetail = {
    name: "Bhakoot",
    present: bhakootPresent,
    cancelled: bhakootCancelled,
    active: bhakootPresent && !bhakootCancelled,
    detail: !bhakootPresent
      ? "The Moon signs do not form a Bhakoot dosha."
      : bhakootCancelled
      ? `Bhakoot is present but cancelled — the two Moon-sign lords (${boyRasiLord} and ${girlRasiLord}) are the same or mutual friends.`
      : `The Moon signs fall in a ${pairKey} relationship, which classically touches health and prosperity together.`,
  };

  // --- Nadi ---
  const nadiPresent = boyNadi === girlNadi;
  // Same nakshatra but different rasi is the standard exception.
  const nadiCancelled = nadiPresent && boyNakIdx === girlNakIdx && boyMoonSignIdx !== girlMoonSignIdx;
  const nadi: DoshaDetail = {
    name: "Nadi",
    present: nadiPresent,
    cancelled: nadiCancelled,
    active: nadiPresent && !nadiCancelled,
    detail: !nadiPresent
      ? `The Nadi differs (${boyNadi} and ${girlNadi}), which is what the texts ask for.`
      : nadiCancelled
      ? "Nadi matches, but both share a nakshatra in different Moon signs — the classical cancellation applies."
      : `Both share the ${boyNadi} Nadi, which is the one koota traditionally weighed most heavily.`,
  };

  return [manglik, bhakoot, nadi];
}

export interface Remedy {
  dosha: string;
  title: string;
  steps: string[];
  note: string;
}

/**
 * Remedies for the doshas that are genuinely ACTIVE in this match.
 *
 * Rule-based on purpose. A model asked for remedies will produce fluent,
 * plausible ones for a dosha that is not there — and a family may spend real
 * money on a puja for a problem the chart does not have. A table cannot do
 * that.
 */
export function remediesFor(doshas: DoshaDetail[]): Remedy[] {
  const out: Remedy[] = [];
  for (const d of doshas) {
    if (!d.active) continue;
    if (d.name === "Manglik") {
      out.push({
        dosha: "Manglik",
        title: "Mangal Shanti",
        steps: [
          "Mangal Shanti Puja before the wedding date is fixed.",
          "Hanuman Chalisa on Tuesdays, and a red-lentil or red-cloth daan.",
          "Where the family follows it, Kumbh Vivah is performed first.",
        ],
        note: "Only one of the two is Manglik here. Had both been, nothing would be needed.",
      });
    }
    if (d.name === "Bhakoot") {
      out.push({
        dosha: "Bhakoot",
        title: "Vishnu-Lakshmi Puja",
        steps: [
          "Vishnu-Lakshmi Puja performed together by the couple.",
          "Shri Suktam or Vishnu Sahasranama recited on Thursdays.",
          "Feeding or clothing donated as a couple on a Thursday.",
        ],
        note: "Bhakoot touches health and household prosperity, so the remedy is done jointly.",
      });
    }
    if (d.name === "Nadi") {
      out.push({
        dosha: "Nadi",
        title: "Nadi Nivarana",
        steps: [
          "Nadi Nivarana Puja before the marriage.",
          "Maha Mrityunjaya mantra, traditionally 108 repetitions daily for a fixed period.",
          "Grain and gold daan in the couple's name.",
        ],
        note: "Nadi is weighed most heavily of the three, so this one is worth doing properly.",
      });
    }
  }
  return out;
}
