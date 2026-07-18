/**
 * Small app-wide preferences (persisted in localStorage).
 *
 * Right now this holds the default reading language. Pages that ask the AI seed
 * their language from here so the choice in Settings actually takes effect, and
 * changing it broadcasts a `jj:lang` event so open screens can react live.
 */
const LANG_KEY = "jj:lang";

/** App language code: "en" | "hi" | "hinglish". */
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
