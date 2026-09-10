/**
 * The Chat tab.
 *
 * A chat belongs to a kundli, so this finds theirs and opens it — the centre
 * of the tab bar must never be a picker. `replace` keeps the back stack clean:
 * going back from the chat never lands here only to be bounced forward again.
 */
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { MessageCircle, Plus } from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";
import { getLang } from "@/lib/prefs";

const T = {
  en: ["Your astrologer is waiting", "Make your kundli first — then ask anything on your mind.", "Create my kundli"],
  hinglish: ["Aapka jyotishi intezaar kar raha hai", "Pehle apni kundli banaiye — phir jo mann mein ho poochiye.", "Meri kundli banayein"],
  hi: ["आपका ज्योतिषी इंतज़ार कर रहा है", "पहले अपनी कुंडली बनाइए — फिर जो मन में हो पूछिए।", "मेरी कुंडली बनाएँ"],
} as Record<string, string[]>;

export default function ChatHome() {
  const { search } = useLocation();
  const [id, setId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((d) => setId(Array.isArray(d) && d[0]?.id ? d[0].id : null))
      .catch(() => setId(null));
  }, []);

  if (id) return <Navigate to={`/chat/${id}${search}`} replace />;
  if (id === undefined) return <div className="skeleton mt-4 h-40" />;

  const s = T[getLang()] ?? T.en;
  return (
    <section className="m-card m-enter mt-4 px-5 py-7 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
        <MessageCircle className="h-7 w-7" />
      </div>
      <h2 className="mt-3 text-[19px] font-bold">{s[0]}</h2>
      <p className="mx-auto mt-1.5 max-w-[300px] text-[13.5px] leading-relaxed text-muted-foreground">{s[1]}</p>
      <Pressable to="/create-chart" feedback="medium"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25">
        <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} /> {s[2]}
      </Pressable>
    </section>
  );
}
