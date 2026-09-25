/* Ported from VedicAstra (new-vedic-astra/server) to run its chat system inside JanamJyot.
   Self-contained rules — no JanamJyot module is changed by this file. */
/**
 * The behavioural layer: HOW this person thinks, decides, trusts, fights and sabotages
 * themselves — computed from the chart instead of being improvised by the AI.
 *
 * Why: the readings felt fake because the factual layer (yogas, dashas, timing) was
 * calculated while the human layer was left to the model, so everyone got the same
 * "aap mehnati hain, thoda dhyan dijiye". A pandit's edge is exactly this layer: "aap
 * har baar shuru zor se karte ho, beech mein mann ut jaata hai" — and it comes from
 * classical, checkable places: the Moon (mann), Mercury (soch), the lagna lord (khud ka
 * roop), the Sun (pehchaan ki bhookh), Saturn (dar aur zimmedari), Mars (gussa), and the
 * Rahu-Ketu axis (bechaini aur khaalipan).
 *
 * Every pattern carries BOTH sides: the same placement that makes someone over-think
 * also makes them careful. A reading that only lists faults is as useless as one that
 * only flatters.
 */

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];
const ELEMENT: Record<string, "fire" | "earth" | "air" | "water"> = {
  Aries: "fire", Leo: "fire", Sagittarius: "fire",
  Taurus: "earth", Virgo: "earth", Capricorn: "earth",
  Gemini: "air", Libra: "air", Aquarius: "air",
  Cancer: "water", Scorpio: "water", Pisces: "water",
};
const ord = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 - 20) % 10] ?? ["th", "st", "nd", "rd"][n] ?? "th"}`;
const SIGN_LORDS = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];

export type PsycheArea =
  | "mind" | "thinking" | "identity" | "fear" | "control"
  | "trust" | "conflict" | "self_sabotage" | "validation" | "decision";

export interface PsychePattern {
  id: string;
  area: PsycheArea;
  /** What they actually do — the sentence they should recognise themselves in. */
  pattern: string;
  /** Where it shows up in real life. */
  shows_up_as: string;
  /** The same placement's good side, so the reading is not a list of faults. */
  gift: string;
  /** The chart evidence. */
  because: string;
  weight: number;
}

interface P {
  sign: string; house: number; dignity: string; retrograde: boolean; combust: boolean;
  conjunct_with: string[]; nakshatra?: string;
}

interface Ctx {
  p: (name: string) => P;
  has: (name: string) => boolean;
  with: (a: string, b: string) => boolean;
  aspectedBy: (house: number) => string[];
  hitBy: (planet: string, by: string) => boolean;
  lordOf: (h: number) => string;
  lagnaLord: string;
  /** A Moon close to the Sun is "kshin" (dark, weak) — classical paksha bala. */
  moonWeak: boolean | null;
  sadeSati: boolean;
}

type Rule = (c: Ctx) => Omit<PsychePattern, "id"> & { id: string } | null;

const RULES: Rule[] = [
  // ---- mann (Moon) -----------------------------------------------------------------
  (c) => {
    const m = c.p("Moon");
    if (!m) return null;
    const el = ELEMENT[m.sign];
    const text: Record<string, [string, string, string]> = {
      water: [
        "Aap dil se chalte hain — faisla logic se nahi, feeling se hota hai, aur puraani baatein bhool nahi paate.",
        "Kisi ki kahi hui baat mahino tak chubhti rehti hai; mood par kaam ki speed badalti hai.",
        "Logon ko padh lete hain aur unka dard samajh jaate hain — isi wajah se log aap par bharosa karte hain.",
      ],
      fire: [
        "Aapka mann jaldi garam hota hai — jo theek lagta hai wahi turant kar dete hain, baad mein sochte hain.",
        "Nayi cheez shuru karne mein sabse aage, par lambi khinchne wali cheez mein mann ut jaata hai.",
        "Himmat aur pehal — jahan doosre soch rahe hote hain, aap shuru kar dete hain.",
      ],
      earth: [
        "Aap tab tak nahi hilte jab tak cheez pakki na lage — risk lene se pehle zameen dekhte hain.",
        "Badlav mein waqt lagta hai; log kehte hain aap zidd karte hain, par aap bas pakka karna chahte hain.",
        "Jo pakad lete hain use nibhate hain — lambe samay mein aapki jama-poonji doosron se zyada hoti hai.",
      ],
      air: [
        "Aapka dimaag ek jagah tikta nahi — ek saath kai cheezein chalti rehti hain.",
        "Baat karne mein aage, par ek hi kaam par mahino tikne mein mushkil.",
        "Naye vichaar aur logon se judaav — aap kisi se bhi baat shuru kar sakte hain.",
      ],
    };
    const [pattern, shows, gift] = text[el] ?? text.air;
    return {
      id: `mind-${el}`, area: "mind", pattern, shows_up_as: shows, gift,
      because: `Moon ${m.sign} (${el} sign) mein hai — mann ka swabhav isi se banta hai.`,
      weight: 3,
    };
  },
  (c) => {
    if (!c.hitBy("Moon", "Saturn")) return null;
    return {
      id: "mind-saturn", area: "fear",
      pattern: "Aap khush hone se pehle hi soch lete hain ki kya galat ho sakta hai — mann par ek halka bojh hamesha rehta hai.",
      shows_up_as: "Akela mehsoos karna bhari bheed mein bhi, neend ya mood ka upar-neeche hona, aur apni khushi ko baad ke liye taal dena.",
      gift: "Mushkil waqt aap sabse achha nibhate hain — jahan doosre toot jaate hain, aap tik jaate hain.",
      because: "Moon par Saturn ka prabhav (saath ya drishti) hai.",
      weight: 3,
    };
  },
  (c) => {
    if (!c.hitBy("Moon", "Rahu") && !c.with("Moon", "Rahu")) return null;
    return {
      id: "mind-rahu", area: "fear",
      pattern: "Mann mein ek bechaini rehti hai — jo mila hai wo kam lagta hai, aur jo nahi mila uski soch chalti rehti hai.",
      shows_up_as: "Raat mein phone par ghanton nikal jaana, doosron se apni tulna, aur achanak bada faisla le lena.",
      gift: "Aap wahan pahunch sakte hain jahan aapke ghar mein koi nahi pahuncha — yahi bechaini aage bhi dhakelti hai.",
      because: "Moon par Rahu ka prabhav hai.",
      weight: 3,
    };
  },
  (c) => {
    if (!c.with("Moon", "Ketu") && !c.hitBy("Moon", "Ketu")) return null;
    return {
      id: "mind-ketu", area: "trust",
      pattern: "Beech-beech mein sab kuch bemaani lagne lagta hai — jise sabse zyada chahte hain, usi se door hone ka mann karta hai.",
      shows_up_as: "Rishte mein rehkar bhi akela lagna, achanak baat karna band kar dena, aur phir pachtaana.",
      gift: "Cheezon se lagav kam hai, isliye nuksaan aapko doosron jitna nahi todta — aur adhyatmik taraf gehrai aati hai.",
      because: "Moon par Ketu ka prabhav hai.",
      weight: 3,
    };
  },
  (c) => {
    if (c.moonWeak !== true) return null;
    return {
      id: "mind-waning", area: "identity",
      pattern: "Aap apne aap ko kam aank lete hain — kaam accha karke bhi lagta hai ki ' itna kaafi nahi hai'.",
      shows_up_as: "Tareef sunkar asahaj hona, apni jeet chhota bata dena, aur nayi jagah par pehle chup rehna.",
      gift: "Ghamand nahi aata, aur log aapki vinamrata ki wajah se pass aate hain.",
      because: "Janm ke samay Chandrama kshin (waning) tha — paksha bala kam hai.",
      weight: 2,
    };
  },

  // ---- soch (Mercury) ---------------------------------------------------------------
  (c) => {
    const me = c.p("Mercury");
    if (!me) return null;
    const slow = me.retrograde || c.hitBy("Mercury", "Saturn");
    if (!slow) return null;
    return {
      id: "think-loop", area: "decision",
      pattern: "Ek hi baat ko baar-baar sochte hain — faisla lene se pehle har taraf se ghuma kar dekhte hain, aur isi mein samay nikal jaata hai.",
      shows_up_as: "Message type karke mitana, mauka nikal jaane ke baad 'haan kar dena chahiye tha' lagna.",
      gift: "Aapke faisle mein galti kam nikalti hai — jo aap soch kar karte hain wo tikta hai.",
      because: me.retrograde ? "Mercury vakri (retrograde) hai." : "Mercury par Saturn ka prabhav hai.",
      weight: 3,
    };
  },
  (c) => {
    const me = c.p("Mercury");
    if (!me?.combust) return null;
    return {
      id: "think-fused", area: "thinking",
      pattern: "Apni baat par aapko itna yakeen hota hai ki doosre ki alag raay sunna mushkil ho jaata hai.",
      shows_up_as: "Bahas mein apni baat manwa lena, aur baad mein lagna ki shayad samne wala bhi sahi tha.",
      gift: "Aap confidence se bolte hain, isliye log aapki baat maan lete hain.",
      because: "Mercury Sun ke bahut paas hai (ast/combust) — soch aur khud ki pehchaan ek ho jaati hai.",
      weight: 2,
    };
  },
  (c) => {
    if (!c.with("Mercury", "Rahu") && !c.hitBy("Mercury", "Rahu")) return null;
    return {
      id: "think-shortcut", area: "thinking",
      pattern: "Aapka dimaag shortcut dhoondhta hai — seedha raasta chhodkar chalaak raasta pehle dikhta hai.",
      shows_up_as: "Naye idea par jaldi kood jaana, aur baad mein detail mein uljhan.",
      gift: "Jahan doosre atak jaate hain, wahan aap koi na koi raasta nikaal lete hain.",
      because: "Mercury par Rahu ka prabhav hai.",
      weight: 2,
    };
  },

  // ---- pehchaan (Sun, lagna lord) ---------------------------------------------------
  (c) => {
    const s = c.p("Sun");
    if (!s) return null;
    const weak = /debilit|enemy/i.test(s.dignity) || c.hitBy("Sun", "Saturn");
    if (!weak) return null;
    return {
      id: "identity-approval", area: "validation",
      pattern: "Andar se ek sawal rehta hai — 'kya main kaafi hoon?' Isliye doosron ki haan aur tareef zaroori lagti hai.",
      shows_up_as: "Bade logon ya boss ke saamne asahaj hona, na keh paana, aur apna kaam kam karke batana.",
      gift: "Aap ahankaar se nahi, kaam se jagah banate hain — isi wajah se log aapko sachcha maante hain.",
      because: /debilit|enemy/i.test(s.dignity) ? `Sun ${s.dignity} mein hai.` : "Sun par Saturn ka prabhav hai (authority se takraav).",
      weight: 3,
    };
  },
  (c) => {
    const s = c.p("Sun");
    if (!s) return null;
    if (![1, 10, 11].includes(s.house) && !/exalt|own/i.test(s.dignity)) return null;
    return {
      id: "identity-recognition", area: "validation",
      pattern: "Aapko kaam se zyada uski pehchaan chahiye — naam na mile to sabse achha kaam bhi khali lagta hai.",
      shows_up_as: "Aise kaam mein mann nahi lagta jahan credit kisi aur ko jaaye; peeche rehkar kaam karna bhaari lagta hai.",
      gift: "Zimmedari aur leadership aapko suit karti hai — log aapko aage rakhte hain.",
      because: `Sun ${ord(s.house)} house mein${/exalt|own/i.test(s.dignity) ? ` aur ${s.dignity} mein` : ""} hai.`,
      weight: 2,
    };
  },
  (c) => {
    const l = c.p(c.lagnaLord);
    if (!l) return null;
    if (![6, 8, 12].includes(l.house)) return null;
    return {
      id: "identity-hidden", area: "self_sabotage",
      pattern: "Aap khud ko peeche rakh dete hain — mauka saamne hote hue bhi 'abhi nahi' keh dete hain.",
      shows_up_as: "Apni kaabiliyat kam batana, mauka kisi aur ko chale jaana, aur baad mein khud par gussa.",
      gift: "Dikhawe se door rehkar aap gehrai mein kaam karte hain — isi se aisi samajh aati hai jo dikhne wale logon mein nahi hoti.",
      because: `Lagna ka swami ${c.lagnaLord} ${ord(l.house)} house mein hai.`,
      weight: 3,
    };
  },

  // ---- dar, control, bharosa --------------------------------------------------------
  (c) => {
    const sa = c.p("Saturn");
    if (!sa) return null;
    if (![1, 4, 10].includes(sa.house) && !c.sadeSati) return null;
    return {
      id: "control-duty", area: "control",
      pattern: "Aap sab kuch apne haath mein rakhna chahte hain — kisi aur par chhodne se dar lagta hai ki bigad jayega.",
      shows_up_as: "Kaam doosron ko dene ke baad bhi khud check karna, aur zimmedari ke bojh se thakan.",
      gift: "Log aankh band karke aap par bharosa karte hain, kyunki aap kaam adhoora nahi chhodte.",
      because: c.sadeSati ? "Sade Sati chal rahi hai aur Saturn zimmedari ke ghar se juda hai." : `Saturn ${ord(sa.house)} house mein hai.`,
      weight: 2,
    };
  },
  (c) => {
    const ra = c.p("Rahu");
    if (!ra) return null;
    const free = [1, 9, 11].includes(ra.house);
    const sa = c.p("Saturn");
    const bound = sa && [1, 2, 4, 10].includes(sa.house);
    if (!free || !bound) return null;
    return {
      id: "control-vs-freedom", area: "control",
      pattern: "Andar do cheezein ladti rehti hain — azadi chahiye, par surakshit raasta chhodne mein dar lagta hai. Isliye bada faisla taalte rehte hain.",
      shows_up_as: "Naukri chhodne ka mann par na chhodna, naya kaam shuru karne ka plan banakar rakh dena.",
      gift: "Jab aap kood'te hain to bina tayyari ke nahi kood'te — isliye aapka risk doosron se kam bigadta hai.",
      because: `Rahu ${ord(ra.house)} (azadi/bade sapne) aur Saturn ${ord(sa!.house)} (suraksha/zimmedari) mein hai.`,
      weight: 3,
    };
  },
  (c) => {
    const h4 = c.aspectedBy(4).filter((p) => ["Saturn", "Mars", "Rahu", "Ketu"].includes(p));
    const moonHouse = c.p("Moon")?.house;
    if (!h4.length && ![8, 12].includes(moonHouse ?? 0)) return null;
    return {
      id: "trust-guarded", area: "trust",
      pattern: "Aap jaldi khulte nahi — apni asli baat sirf ek-do logon tak rakhte hain, aur wo bhi poori nahi.",
      shows_up_as: "Sab theek hai keh dena jab theek na ho, aur madad maangne mein jhijhak.",
      gift: "Aap kisi ka bharosa nahi todte — jo aapne suna hai wo aap tak hi rehta hai.",
      because: h4.length ? `4th house (mann ki jad, ghar) par ${h4.join(", ")} ka prabhav hai.` : `Moon ${ord(moonHouse!)} house (chhupi bhavnaayein) mein hai.`,
      weight: 2,
    };
  },

  // ---- gussa aur takraar -------------------------------------------------------------
  (c) => {
    const ma = c.p("Mars");
    if (!ma) return null;
    const suppressed = c.hitBy("Mars", "Saturn") || [8, 12].includes(ma.house);
    return {
      id: suppressed ? "conflict-hold" : "conflict-direct",
      area: "conflict",
      pattern: suppressed
        ? "Gussa aap turant nahi nikalte — andar jama karte hain, aur ek din chhoti si baat par sab ek saath nikal jaata hai."
        : "Baat seedhi bolte hain — takraar ke waqt sach kehna zaroori lagta hai, chahe rishta bigad jaye.",
      shows_up_as: suppressed
        ? "Dino tak chup rehna, phir achanak tez bol dena — aur baad mein guilt."
        : "Bahas mein aapka lahja tez ho jaana, aur samne wale ka chup ho jaana.",
      gift: suppressed
        ? "Aap jaldi nahi bharakte — isliye log aapko shaant aur sambhala hua maante hain."
        : "Aapke saath koi dhoka nahi hota — jo hai wo saamne bol dete hain.",
      because: suppressed
        ? (c.hitBy("Mars", "Saturn") ? "Mars par Saturn ka prabhav hai." : `Mars ${ord(ma.house)} house mein hai.`)
        : `Mars ${ma.sign} mein ${ord(ma.house)} house mein hai.`,
      weight: 2,
    };
  },

  // ---- khud ko rokne wali aadat ------------------------------------------------------
  (c) => {
    const ra = c.p("Rahu");
    if (!ra || ![5, 8].includes(ra.house)) return null;
    return {
      id: "impulse", area: "self_sabotage",
      pattern: "Jab mann bharta hai to aap ek jhatke mein bada faisla le lete hain — aur jab mann ut'ta hai to utni hi jaldi chhod dete hain.",
      shows_up_as: "Achanak kaam/course/rishta shuru karna aur beech mein rok dena; paisa ek dum laga dena.",
      gift: "Aap wo mauke pakad lete hain jinhe sochne wale ganwa dete hain.",
      because: `Rahu ${ord(ra.house)} house mein hai.`,
      weight: 2,
    };
  },
  (c) => {
    const ke = c.p("Ketu");
    if (!ke || ![1, 10, 11].includes(ke.house)) return null;
    return {
      id: "unfinished", area: "self_sabotage",
      pattern: "Shuruaat zabardast hoti hai, par jaise hi cheez routine banti hai, mann ut jaata hai — kaam 80% par chhoot jaata hai.",
      shows_up_as: "Kai adhoore project, course ya plan; aur phir 'main consistent nahi hoon' wala guilt.",
      gift: "Aapke paas kai cheezon ka anubhav hai — jab koi ek cheez dil se lag jaati hai, usme aap bahut gehre chale jaate hain.",
      because: `Ketu ${ord(ke.house)} house mein hai.`,
      weight: 3,
    };
  },
];

export function psychePatterns(chart: any, facts: any): PsychePattern[] {
  const lagnaIdx = SIGNS.indexOf(facts?.lagna ?? chart?.d1_chart?.ascendant_sign ?? "");
  if (lagnaIdx < 0) return [];
  const byName = new Map<string, any>((facts?.planets ?? []).map((x: any) => [x.planet, x]));
  const hl = new Map<number, any>((facts?.house_lords ?? []).map((h: any) => [h.house, h]));
  const p = (n: string) => byName.get(n) as P;
  const aspectedBy = (h: number) => (hl.get(h)?.aspected_by ?? []) as string[];
  const withP = (a: string, b: string) => {
    const x = byName.get(a), y = byName.get(b);
    return !!x && !!y && x.sign === y.sign;
  };
  /** Conjunct, or the house the planet sits in is aspected by the other planet. */
  const hitBy = (planet: string, by: string) => {
    const x = byName.get(planet);
    if (!x) return false;
    return withP(planet, by) || aspectedBy(x.house).includes(by);
  };

  // Paksha bala: the Moon is weak when it is within 72° of the Sun on either side —
  // that is the dark Moon around amavasya, whichever fortnight it falls in.
  let moonWeak: boolean | null = null;
  const pos = (chart?.planet_positions ?? []) as any[];
  const sunL = pos.find((x) => x.planet === "Sun")?.longitude;
  const moonL = pos.find((x) => x.planet === "Moon")?.longitude;
  if (Number.isFinite(sunL) && Number.isFinite(moonL)) {
    const d = ((moonL - sunL) % 360 + 360) % 360;
    moonWeak = d < 72 || d > 288;
  }
  const sadeSati = /Sade Sati/i.test(JSON.stringify(facts?.saturn_cycles ?? {}));

  const ctx: Ctx = {
    p, has: (n) => byName.has(n), with: withP, aspectedBy, hitBy,
    lordOf: (h) => SIGN_LORDS[(lagnaIdx + h - 1) % 12],
    lagnaLord: SIGN_LORDS[lagnaIdx],
    moonWeak, sadeSati,
  };

  const out: PsychePattern[] = [];
  for (const rule of RULES) {
    let r: any = null;
    try { r = rule(ctx); } catch { r = null; }
    if (r) out.push(r);
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, 7);
}
