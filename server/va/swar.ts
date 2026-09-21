/* Ported from VedicAstra (new-vedic-astra/server) to run its chat system inside JanamJyot.
   Core computation (engine, normalize, validate, panchang, transit, llm) is JanamJyot's own,
   verified against Swiss Ephemeris and ProKerala. */
/**
 * The 108 naming swars: 27 nakshatras × 4 padas. This is the Avakahada / Swar Siddhanta
 * table Indian naming (naamkaran) uses. Labels follow Drik Panchang's published
 * "Nakshatra Pada Swar" list exactly. It was checked row by row. The one correction
 * against the older table: Uttara Bhadrapada pada 4 is "Yna" (ञ), not "Tra".
 *
 * `key` is the internal id (also the key of the baby-names dataset). Retroflex letters
 * get doubled consonants (dda = ड, tta = ट, nna = ण, ttha = ठ, ddha = ढ) so they never
 * collide with the dental ones (da = द, ta = त, na = न, tha = थ, dha = ध).
 * Each pada is 3°20′ of the zodiac, so a swar's rashi is floor(padaIndex / 9).
 */
export interface Swar {
  key: string;
  nak: number;   // 0-26
  pada: number;  // 1-4
  label: string; // Drik Panchang romanisation
  dev: string;   // Devanagari
}

const RAW: Array<[string, string, string]> = [
  // Ashwini
  ["chu", "Chu", "चू"], ["che", "Che", "चे"], ["cho", "Cho", "चो"], ["la", "Laa", "ला"],
  // Bharani
  ["li", "Lee", "ली"], ["lu", "Loo", "लू"], ["le", "Le", "ले"], ["lo", "Lo", "लो"],
  // Krittika
  ["a", "A", "अ"], ["i", "Ee", "ई"], ["u", "U", "उ"], ["e", "E", "ए"],
  // Rohini
  ["o", "O", "ओ"], ["va", "Vaa", "वा"], ["vi", "Vee", "वी"], ["vu", "Vu", "वू"],
  // Mrigashira
  ["ve", "Ve", "वे"], ["vo", "Vo", "वो"], ["ka", "Kaa", "का"], ["ki", "Kee", "की"],
  // Ardra
  ["ku", "Ku", "कू"], ["gha", "Gha", "घ"], ["nga", "Ing", "ङ"], ["chha", "Chha", "छ"],
  // Punarvasu
  ["ke", "Ke", "के"], ["ko", "Ko", "को"], ["ha", "Haa", "हा"], ["hi", "Hee", "ही"],
  // Pushya
  ["hu", "Hu", "हू"], ["he", "He", "हे"], ["ho", "Ho", "हो"], ["dda", "Daa", "डा"],
  // Ashlesha
  ["ddi", "Dee", "डी"], ["ddu", "Doo", "डू"], ["dde", "De", "डे"], ["ddo", "Do", "डो"],
  // Magha
  ["ma", "Maa", "मा"], ["mi", "Mee", "मी"], ["mu", "Moo", "मू"], ["me", "Me", "मे"],
  // Purva Phalguni
  ["mo", "Mo", "मो"], ["tta", "Taa", "टा"], ["tti", "Tee", "टी"], ["ttu", "Too", "टू"],
  // Uttara Phalguni
  ["tte", "Te", "टे"], ["tto", "To", "टो"], ["pa", "Paa", "पा"], ["pi", "Pee", "पी"],
  // Hasta
  ["pu", "Poo", "पू"], ["sha", "Sha", "ष"], ["nna", "Na", "ण"], ["ttha", "Tha", "ठ"],
  // Chitra
  ["pe", "Pe", "पे"], ["po", "Po", "पो"], ["ra", "Raa", "रा"], ["ri", "Ree", "री"],
  // Swati
  ["ru", "Roo", "रू"], ["re", "Re", "रे"], ["ro", "Ro", "रो"], ["ta", "Taa", "ता"],
  // Vishakha
  ["ti", "Tee", "ती"], ["tu", "Too", "तू"], ["te", "Te", "ते"], ["to", "To", "तो"],
  // Anuradha
  ["na", "Naa", "ना"], ["ni", "Nee", "नी"], ["nu", "Noo", "नू"], ["ne", "Ne", "ने"],
  // Jyeshtha
  ["no", "No", "नो"], ["ya", "Yaa", "या"], ["yi", "Yee", "यी"], ["yu", "Yoo", "यू"],
  // Mula
  ["ye", "Ye", "ये"], ["yo", "Yo", "यो"], ["bha", "Bhaa", "भा"], ["bhi", "Bhee", "भी"],
  // Purva Ashadha
  ["bhu", "Bhoo", "भू"], ["dha", "Dhaa", "धा"], ["pha", "Phaa", "फा"], ["ddha", "Dha", "ढा"],
  // Uttara Ashadha
  ["bhe", "Bhe", "भे"], ["bho", "Bho", "भो"], ["ja", "Jaa", "जा"], ["ji", "Jee", "जी"],
  // Shravana
  ["khi", "Khee", "खी"], ["khu", "Khoo", "खू"], ["khe", "Khe", "खे"], ["kho", "Kho", "खो"],
  // Dhanishta
  ["ga", "Gaa", "गा"], ["gi", "Gee", "गी"], ["gu", "Gu", "गू"], ["ge", "Ge", "गे"],
  // Shatabhisha
  ["go", "Go", "गो"], ["sa", "Saa", "सा"], ["si", "See", "सी"], ["su", "Soo", "सू"],
  // Purva Bhadrapada
  ["se", "Se", "से"], ["so", "So", "सो"], ["da", "Daa", "दा"], ["di", "Dee", "दी"],
  // Uttara Bhadrapada
  ["du", "Doo", "दू"], ["tha", "Tha", "थ"], ["jha", "Jha", "झ"], ["yna", "Yna", "ञ"],
  // Revati
  ["de", "De", "दे"], ["do", "Do", "दो"], ["cha", "Cha", "चा"], ["chi", "Chee", "ची"],
];

export const SWARS: Swar[] = RAW.map(([key, label, dev], i) => ({ key, label, dev, nak: Math.floor(i / 4), pada: (i % 4) + 1 }));
export const SWAR_BY_KEY = new Map(SWARS.map((s) => [s.key, s]));
export const padaIndex = (nak: number, pada: number) => nak * 4 + pada - 1;
export const signOfPada = (nak: number, pada: number) => Math.floor(padaIndex(nak, pada) / 9);
