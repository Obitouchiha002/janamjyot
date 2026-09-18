/**
 * Small app-wide preferences (persisted in localStorage).
 *
 * Right now this holds the default reading language. Pages that ask the AI seed
 * their language from here so the choice in Settings actually takes effect, and
 * changing it broadcasts a `jj:lang` event so open screens can react live.
 */
const LANG_KEY = "jj:lang";

/** App language code: "en" | "hi" | "hinglish". */
/**
 * The language the app's own labels are shown in — buttons, tabs, headings.
 *
 * Not the same as the reading language. Someone who picks Hinglish wants their
 * astrologer to TALK in Hinglish; they do not want "Kundli milan karein" on a
 * button that everyone else calls "Match". Full Hindi is a different choice —
 * a person reading Devanagari wants the whole app in it — so only Hindi
 * translates the interface. Everything the AI says still follows getLang().
 */
export function getUiLang(): string {
  return getLang() === "hi" ? "hi" : "en";
}

export function getLang(): string {
  try {
    return localStorage.getItem(LANG_KEY) || "en";
  } catch {
    return "en";
  }
}

export function setLang(lang: string): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent("jj:lang", { detail: lang }));
  } catch {
    /* ignore */
  }
}
