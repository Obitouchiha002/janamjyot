/**
 * The Reports destination.
 *
 * Reports belong to a kundli, and the desktop sidebar needs somewhere to send
 * "Reports" without first asking WHOSE. Same shape as ChatHome: find their own
 * kundli and open its reports, or — if they have none yet — say so and offer
 * the one thing that fixes it.
 */
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { FileText, Plus } from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";
import { getLang } from "@/lib/prefs";
import { pickPrimary } from "@/lib/primary";
import { useAuth } from "@/auth";

const T = {
  en: ["Your reports live here", "Make your kundli first — then your full life report is one tap away.", "Create my kundli"],
  hinglish: ["Aapki reports yahan milengi", "Pehle apni kundli banaiye — phir poori life report ek tap door hai.", "Meri kundli banayein"],
  hi: ["आपकी रिपोर्ट यहाँ मिलेंगी", "पहले अपनी कुंडली बनाइए — फिर पूरी जीवन रिपोर्ट एक टैप दूर है।", "मेरी कुंडली बनाएँ"],
} as Record<string, string[]>;

export default function ReportsHome() {
  const { user } = useAuth();
  const [id, setId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((d) => setId(pickPrimary(Array.isArray(d) ? d : [], user?.name)?.id ?? null))
      .catch(() => setId(null));
  }, []);

  if (id) return <Navigate to={`/reports/${id}`} replace />;
  if (id === undefined) return <div className="skeleton mt-4 h-40" />;

  const s = T[getLang()] ?? T.en;
  return (
    <section className="m-card m-enter mt-4 px-5 py-7 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
        <FileText className="h-7 w-7" />
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
