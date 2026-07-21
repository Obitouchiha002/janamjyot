/**
 * Personalised remedies from the chart — original rule-based engine.
 * Picks the planets that most need strengthening/pacifying (running dasha lord,
 * Lagna lord, debilitated planets, malefics in dusthana houses) and returns the
 * classical remedy set for each: gemstone, beej mantra, day, deity, donation, colour.
 */
const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const SIGN_LORDS = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];
const EXALT: Record<string, number> = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };
const DEBIL: Record<string, number> = { Sun: 6, Moon: 7, Mars: 3, Mercury: 11, Jupiter: 9, Venus: 5, Saturn: 0 };

const REMEDY: Record<string, any> = {
  Sun: { gemstone: "Ruby (Manik)", mantra: "Om Suryaya Namaha", day: "Sunday", deity: "Lord Surya / Vishnu", donation: "wheat, jaggery, copper", color: "Red / Orange" },
  Moon: { gemstone: "Pearl (Moti)", mantra: "Om Chandraya Namaha", day: "Monday", deity: "Lord Shiva", donation: "rice, milk, silver, white cloth", color: "White" },
  Mars: { gemstone: "Red Coral (Moonga)", mantra: "Om Mangalaya Namaha", day: "Tuesday", deity: "Lord Hanuman / Kartikeya", donation: "masoor dal, red cloth, jaggery", color: "Red" },
  Mercury: { gemstone: "Emerald (Panna)", mantra: "Om Budhaya Namaha", day: "Wednesday", deity: "Lord Vishnu / Ganesha", donation: "green moong, green cloth", color: "Green" },
  Jupiter: { gemstone: "Yellow Sapphire (Pukhraj)", mantra: "Om Gurave Namaha", day: "Thursday", deity: "Lord Vishnu / Brihaspati", donation: "chana dal, turmeric, books", color: "Yellow" },
  Venus: { gemstone: "Diamond / White Sapphire", mantra: "Om Shukraya Namaha", day: "Friday", deity: "Goddess Lakshmi", donation: "sugar, curd, white sweets", color: "White / Pastel" },
  Saturn: { gemstone: "Blue Sapphire (Neelam) / Amethyst", mantra: "Om Shanecharaya Namaha", day: "Saturday", deity: "Lord Shani / Hanuman", donation: "black sesame, mustard oil, iron", color: "Dark Blue / Black" },
  Rahu: { gemstone: "Hessonite (Gomed)", mantra: "Om Rahave Namaha", day: "Saturday", deity: "Goddess Durga", donation: "blanket, coconut, mixed grains", color: "Smoky / Grey" },
  Ketu: { gemstone: "Cat's Eye (Lehsunia)", mantra: "Om Ketave Namaha", day: "Tuesday", deity: "Lord Ganesha", donation: "sesame, multicolour cloth", color: "Grey / Brown" },
};

const DUSTHANA = [6, 8, 12];

export function computeRemedies(chart: any) {
  const planets: any[] = chart?.planet_positions ?? [];
  const P = (n: string) => planets.find((p) => p.planet === n);
  const ascIdx = SIGNS.indexOf(chart?.ascendant?.sign ?? chart?.d1_chart?.ascendant_sign ?? "");
  const dashaLord = chart?.dasha?.current?.mahadasha || "";
  const antarLord = chart?.dasha?.current?.antardasha || "";
  const lagnaLord = ascIdx >= 0 ? SIGN_LORDS[ascIdx] : "";

  // A remedy is not one thing. Classically a gemstone STRENGTHENS a planet, so
  // it belongs to the lagna lord and the running dasha lord — never to a
  // malefic already afflicting the chart from a dusthana. Recommending Neelam
  // because Saturn sits in the 8th, or Gomed because Rahu is in the 12th, is
  // the opposite of the classical prescription: those placements call for
  // pacification (mantra, daan, vrat), not amplification.
  type Mode = "strengthen" | "pacify";
  const reasons = new Map<string, { why: string[]; mode: Mode }>();
  const addReason = (planet: string, why: string, mode: Mode) => {
    if (!REMEDY[planet]) return;
    const cur = reasons.get(planet) ?? { why: [], mode };
    if (!cur.why.includes(why)) cur.why.push(why);
    // Pacification wins a tie: if a planet is both the dasha lord and
    // afflicted, strengthening the affliction is the worse mistake.
    if (mode === "pacify") cur.mode = "pacify";
    reasons.set(planet, cur);
  };

  // Running dasha & antardasha lord — strengthen the active period.
  if (dashaLord) addReason(dashaLord, `currently running your ${dashaLord} Mahadasha`, "strengthen");
  if (antarLord && antarLord !== dashaLord) addReason(antarLord, `running ${antarLord} Antardasha now`, "strengthen");
  // Lagna lord — strengthens overall self/health.
  if (lagnaLord) addReason(lagnaLord, "your Lagna (ascendant) lord — supports health & confidence", "strengthen");

  // Debilitated planets, and malefics in dusthana houses.
  for (const p of planets) {
    // Whether a gemstone helps a *debilitated* planet is genuinely contested
    // among authorities, so that case stays on the strengthening side.
    if (DEBIL[p.planet] === p.sign_id) addReason(p.planet, `debilitated in ${p.sign}`, "strengthen");
    if (["Saturn", "Mars", "Rahu", "Ketu", "Sun"].includes(p.planet) && DUSTHANA.includes(p.house)) {
      addReason(p.planet, `placed in the ${p.house}th house (a challenging house)`, "pacify");
    }
  }

  const focus = [...reasons.entries()].map(([planet, { why, mode }]) => {
    const r = REMEDY[planet];
    const exalted = EXALT[planet] === P(planet)?.sign_id;
    return {
      planet,
      reason: why.join("; "),
      strong: exalted,
      mode,
      gemstone: mode === "strengthen" ? r.gemstone : null,
      pacify: mode === "pacify"
        ? `Pacify rather than strengthen: ${r.mantra}, donate ${r.donation} on ${r.day}.`
        : null,
      mantra: r.mantra,
      day: r.day,
      deity: r.deity,
      donation: r.donation,
      color: r.color,
    };
  });

  const general = [
    "Chant your key planet's beej mantra 108 times on its weekday.",
    "Offer water to the Sun (Surya Arghya) at sunrise for vitality & confidence.",
    "Light a diya and keep a calm daily routine to strengthen the Moon (mind).",
    "Feed stray dogs/crows and help the needy on Saturdays to ease Saturn & Rahu.",
    "Wear a gemstone ONLY after a qualified astrologer confirms it for your chart.",
  ];

  return {
    dasha_lord: dashaLord,
    lagna_lord: lagnaLord,
    focus,
    general,
    disclaimer: "Remedies support a positive mindset and discipline — they are guidance, not guarantees. Always consult a qualified jyotishi before wearing any gemstone.",
  };
}
