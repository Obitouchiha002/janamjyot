/* Ported from VedicAstra (new-vedic-astra/server) to run its chat system inside JanamJyot.
   Core computation (engine, normalize, validate, panchang, transit, llm) is JanamJyot's own,
   verified against Swiss Ephemeris and ProKerala. */
/**
 * Numerology — Life Path (from date of birth) and Name/Destiny number
 * (Chaldean letter values), with static interpretations. Pure arithmetic,
 * no AI call and no external API — always available, always free.
 */

const CHALDEAN: Record<string, number> = {
  A: 1, I: 1, J: 1, Q: 1, Y: 1,
  B: 2, K: 2, R: 2,
  C: 3, G: 3, L: 3, S: 3,
  D: 4, M: 4, T: 4,
  E: 5, H: 5, N: 5, X: 5,
  U: 6, V: 6, W: 6,
  O: 7, Z: 7,
  F: 8, P: 8,
  // Chaldean has no letter mapped to 9 — 9 is considered sacred and only
  // ever appears as a reduced sum, never assigned directly to a letter.
};

/** Digital-root reduction, keeping the master numbers 11, 22, 33 unreduced. */
function reduceKeepMaster(n: number): number {
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = String(n)
      .split("")
      .reduce((sum, d) => sum + Number(d), 0);
  }
  return n;
}

/** Life Path number from "YYYY-MM-DD": sum every digit of the date, reduced. */
export function lifePathNumber(dateOfBirth: string): number {
  const digits = dateOfBirth.replace(/[^0-9]/g, "").split("").map(Number);
  const sum = digits.reduce((a, b) => a + b, 0);
  return reduceKeepMaster(sum);
}

/** Name/Destiny number from the full name, using the Chaldean letter chart. */
export function nameNumber(fullName: string): number {
  const letters = fullName.toUpperCase().replace(/[^A-Z]/g, "").split("");
  const sum = letters.reduce((a, ch) => a + (CHALDEAN[ch] || 0), 0);
  return reduceKeepMaster(sum);
}

interface NumberMeaning {
  title: string;
  summary: string;
  strengths: string;
  watchOut: string;
}

const MEANINGS: Record<number, NumberMeaning> = {
  1: {
    title: "The Leader",
    summary: "Independent, driven, and happiest when charting your own path rather than following someone else's.",
    strengths: "Natural initiative, self-reliance, and the courage to start things nobody else will.",
    watchOut: "Can tip into stubbornness or impatience with slower collaborators — remember not everyone moves at your pace.",
  },
  2: {
    title: "The Peacemaker",
    summary: "Sensitive, cooperative, and gifted at reading a room — you thrive in partnership, not solo spotlight.",
    strengths: "Diplomacy, patience, and a genuine gift for making others feel heard.",
    watchOut: "Can over-accommodate and lose your own voice trying to keep everyone comfortable.",
  },
  3: {
    title: "The Communicator",
    summary: "Expressive, creative, and socially magnetic — words, art, or performance come naturally to you.",
    strengths: "Charisma, optimism, and the ability to lift a room's mood just by being in it.",
    watchOut: "Scattering your energy across too many ideas at once instead of finishing what you start.",
  },
  4: {
    title: "The Builder",
    summary: "Practical, disciplined, and reliable — you build things that last through steady, unglamorous effort.",
    strengths: "Structure, honesty, and a work ethic others quietly depend on.",
    watchOut: "Rigidity — holding so tightly to \"the right way\" that you miss a faster or kinder one.",
  },
  5: {
    title: "The Free Spirit",
    summary: "Adaptable, curious, and pulled toward change, travel, and new experience over routine.",
    strengths: "Versatility and a fearless willingness to try what others won't.",
    watchOut: "Restlessness that shows up as commitment issues — in work, relationships, or plans.",
  },
  6: {
    title: "The Caretaker",
    summary: "Responsible, warm, and naturally protective of family and community.",
    strengths: "Loyalty, nurturing instinct, and a genuine talent for making others feel safe.",
    watchOut: "Overextending yourself for others until your own needs quietly go unmet.",
  },
  7: {
    title: "The Seeker",
    summary: "Introspective, analytical, and drawn to the \"why\" behind things — spiritual or intellectual depth over small talk.",
    strengths: "Deep focus, sharp intuition, and comfort with solitude that others find hard to sit with.",
    watchOut: "Isolating too much or overthinking a decision until the moment to act has passed.",
  },
  8: {
    title: "The Achiever",
    summary: "Ambitious and business-minded, with a natural instinct for power, money, and how systems work.",
    strengths: "Executive drive, financial instinct, and the discipline to see big goals through.",
    watchOut: "Letting achievement crowd out relationships or rest — success at the cost of everything else.",
  },
  9: {
    title: "The Humanitarian",
    summary: "Compassionate and big-picture, with a pull toward causes larger than yourself.",
    strengths: "Generosity, idealism, and an ability to forgive and move forward.",
    watchOut: "Martyrdom — giving so much away that you leave nothing for yourself.",
  },
  11: {
    title: "The Intuitive (Master Number)",
    summary: "A heightened version of 2 — highly intuitive, idealistic, and sensitive to things others don't notice.",
    strengths: "Inspirational insight and the ability to see what's coming before others do.",
    watchOut: "Nervous energy and self-doubt — the gift is real, but it's easy to talk yourself out of trusting it.",
  },
  22: {
    title: "The Master Builder (Master Number)",
    summary: "A heightened version of 4 — practical vision at scale, capable of turning big dreams into real, lasting structures.",
    strengths: "Rare combination of grand vision and the discipline to actually execute it.",
    watchOut: "The pressure of high potential — it can feel paralyzing if you compare yourself to what you \"should\" achieve.",
  },
  33: {
    title: "The Master Teacher (Master Number)",
    summary: "A heightened version of 6 — selfless care for others, often expressed through teaching, healing, or guidance.",
    strengths: "Compassion at a level that genuinely uplifts the people around you.",
    watchOut: "Self-sacrifice taken too far — you can't pour from an empty cup.",
  },
};

export interface NumerologyReading {
  lifePath: { number: number } & NumberMeaning;
  nameNumber: { number: number } & NumberMeaning;
  synergy: string;
  disclaimer: string;
}

/** A short, rule-based note on how the two numbers interact — no AI needed. */
function synergyNote(life: number, name: number): string {
  if (life === name) {
    return `Your Life Path and Name numbers are both **${life}** — your inner nature and the way you present yourself are unusually aligned. What you feel on the inside is what people actually see, which tends to make trust come easily.`;
  }
  const isMaster = (n: number) => n === 11 || n === 22 || n === 33;
  if (isMaster(life) || isMaster(name)) {
    return `Life Path **${life}** and Name Number **${name}** together carry a master-number influence — expect a life that feels a little more intense than average, with higher highs and a stronger pull toward purpose, but also more pressure to live up to your own potential.`;
  }
  const diff = Math.abs(life - name);
  if (diff <= 2) {
    return `Life Path **${life}** and Name Number **${name}** are close in energy — the way you were built (Life Path) and the way you show up in the world (Name Number) work with each other more often than against, giving you a fairly consistent sense of self.`;
  }
  return `Life Path **${life}** and Name Number **${name}** pull in noticeably different directions — your deeper nature wants one thing while how you present yourself often leans another way. That's not a conflict to fix; it just means your growth usually comes from consciously balancing both sides rather than picking one.`;
}

export function computeNumerology(fullName: string, dateOfBirth: string): NumerologyReading {
  const life = lifePathNumber(dateOfBirth);
  const name = nameNumber(fullName);
  return {
    lifePath: { number: life, ...MEANINGS[life] },
    nameNumber: { number: name, ...MEANINGS[name] },
    synergy: synergyNote(life, name),
    disclaimer: "Numerology offers a lens for self-reflection, not a fixed verdict — your choices still shape the outcome.",
  };
}
