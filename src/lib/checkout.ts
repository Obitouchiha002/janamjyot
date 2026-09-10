/**
 * Buying, from anywhere in the app.
 *
 * This lived inside the Plan page, so the only place a purchase could start
 * was a screen people had to go looking for. The limit-reached sheet now sells
 * from the exact moment the need appears, and both use this one path.
 */
import { API_BASE } from "@/lib/api";
import { isNative } from "@/lib/native";

export type Lang = "en" | "hi" | "hinglish";
type Tri = { en: string; hi: string; hinglish: string };

export const PACK_NAME: Record<string, string> = { starter: "Starter", popular: "Popular", value: "Value" };

/**
 * Who each pack is for. "165 credits" says what you get, never why you would
 * want it — this is the line that lets someone pick without doing arithmetic.
 */
const WHY: Record<string, Tri> = {
  starter: {
    en: "For a few specific questions",
    hi: "कुछ खास सवालों के लिए",
    hinglish: "Kuch khaas sawaalon ke liye",
  },
  popular: {
    en: "Regular guidance — career, marriage, money",
    hi: "नियमित मार्गदर्शन — करियर, शादी, पैसा",
    hinglish: "Regular guidance — career, shaadi, paisa",
  },
  value: {
    en: "For the whole family — matching and full reports",
    hi: "पूरे परिवार के लिए — मिलान और पूरी रिपोर्ट",
    hinglish: "Poori family ke liye — matching aur full reports",
  },
};

export function packWhy(id: string, lang: Lang, trialDays = 3): string {
  if (id === "trial") {
    return lang === "hi" ? `${trialDays} दिन सब कुछ खुला — सब आज़माइए`
      : lang === "hinglish" ? `${trialDays} din sab kuch unlocked — sab try kariye`
      : `Everything unlocked for ${trialDays} days — try it all`;
  }
  const w = WHY[id];
  return w ? (w[lang] ?? w.en) : "";
}

/**
 * The checkout is a web page, and from inside the app it opens in the system
 * browser with its own storage — so the app hands over a five-minute sign-in
 * first. Without it, buying from inside the app meant signing in again by
 * emailed code at the payment step, which is both the worst moment to add
 * friction and exactly what people are taught to treat as a scam.
 *
 * If the handoff cannot be had, checkout still opens and asks for the code.
 * A failure to smooth the path must never become a failure to buy.
 */
export async function openCheckout(pack: string, email?: string) {
  const q = new URLSearchParams({ pack });
  if (email) q.set("email", email);
  try {
    const r = await fetch("/api/billing/handoff", { method: "POST" });
    if (r.ok) {
      const d = await r.json();
      if (d?.token) q.set("ct", d.token);
    }
  } catch { /* open without it — they can still sign in */ }

  const url = `${API_BASE}/checkout.html?${q.toString()}`;
  if (isNative) {
    import("@capacitor/browser")
      .then(({ Browser }) => Browser.open({ url }))
      .catch(() => window.open(url, "_blank"));
  } else {
    window.location.href = url;
  }
}
