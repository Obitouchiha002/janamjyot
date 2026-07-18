import { useEffect, useState } from "react";

export interface ThemeDef {
  key: string;
  label: string;
  desc: string;
  isDark: boolean;
  // small preview swatches for the Settings picker
  swatch: { bg: string; primary: string; accent: string };
}

// 5 professional themes. Each one's full color tokens live in index.css under
// [data-theme="<key>"]; here we keep labels + preview swatches + dark flag.
export const THEMES: ThemeDef[] = [
  { key: "cosmic", label: "Cosmic Night", desc: "Deep night sky with gold — the app default.", isDark: true, swatch: { bg: "#0B0718", primary: "#0B0718", accent: "#E8B44A" } },
  { key: "classic", label: "Classic Cream", desc: "Warm cream, navy & amber.", isDark: false, swatch: { bg: "#F8F5EF", primary: "#1E293B", accent: "#D97706" } },
  { key: "drikpanchang", label: "Vedic Parchment", desc: "Traditional saffron, maroon & sand — Drikpanchang style.", isDark: false, swatch: { bg: "#f3e6c4", primary: "#6e1414", accent: "#c2410c" } },
  { key: "emerald", label: "Emerald Mint", desc: "Fresh mint with emerald & teal.", isDark: false, swatch: { bg: "#eefaf3", primary: "#065f46", accent: "#0d9488" } },
  { key: "midnight", label: "Midnight Slate", desc: "Dark slate with amber accents.", isDark: true, swatch: { bg: "#0b1220", primary: "#0b1220", accent: "#f59e0b" } },
  { key: "royal", label: "Royal Indigo", desc: "Deep indigo night with violet accents.", isDark: true, swatch: { bg: "#0f0a24", primary: "#0f0a24", accent: "#a78bfa" } },
];

// The website's palette — cream, navy and amber. The app ships with the same
// look so both products read as one brand.
export const DEFAULT_THEME = "classic";
const KEYS = new Set(THEMES.map((t) => t.key));

/** Read the saved theme, migrating the old "dark"/"light" values. */
export function getSavedTheme(): string {
  try {
    let v = localStorage.getItem("va_theme") || "";
    if (v === "dark") v = "midnight";
    if (v === "light") v = "classic";
    return KEYS.has(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function isDarkTheme(key: string): boolean {
  return THEMES.find((t) => t.key === key)?.isDark ?? false;
}

// ---- tiny global store so Navbar + Settings stay in sync ------------------
let current = getSavedTheme();
const listeners = new Set<() => void>();

export function applyTheme(key: string) {
  const t = THEMES.find((x) => x.key === key) ?? THEMES[0];
  current = t.key;
  const root = document.documentElement;
  root.dataset.theme = t.key;
  root.classList.toggle("dark", t.isDark);
  try { localStorage.setItem("va_theme", t.key); } catch {}
  listeners.forEach((l) => l());
}

export function getTheme(): string {
  return current;
}

/** React hook: current theme key + setter (shared across components). */
export function useTheme(): [string, (key: string) => void] {
  const [theme, setThemeState] = useState(current);
  useEffect(() => {
    const l = () => setThemeState(current);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return [theme, applyTheme];
}

// Ensure the data-theme attribute + dark class are in sync on first load
// (index.html applies it pre-paint; this keeps the class correct too).
applyTheme(current);
