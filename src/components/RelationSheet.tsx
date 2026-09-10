/**
 * Rishta — link one person's kundli to your chat.
 *
 * Three in four questions people bring to an astrologer are about another
 * person: will they marry me, will they come back, why do we fight. A chart
 * holds one life, so those were answered from half the picture. Linking their
 * kundli lets the chat read both charts and the calculated match.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, Plus, X } from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";
import { haptic } from "@/lib/native";
import { getLang } from "@/lib/prefs";
import type { Lang } from "@/lib/checkout";

export interface Relation { chartId: string; relation: string; name: string }

type Tri = { en: string; hi: string; hinglish: string };
const t = (x: Tri, l: Lang) => x[l] ?? x.en;

const KINDS = ["partner", "spouse", "crush", "ex", "friend", "family"] as const;
const KIND_LABEL: Record<string, Tri> = {
  partner: { en: "Partner", hi: "पार्टनर", hinglish: "Partner" },
  spouse: { en: "Husband / wife", hi: "पति / पत्नी", hinglish: "Pati / patni" },
  crush: { en: "Someone I like", hi: "जिसे पसंद करते हैं", hinglish: "Jise pasand karte hain" },
  ex: { en: "Ex", hi: "पुराना रिश्ता", hinglish: "Ex" },
  friend: { en: "Friend", hi: "दोस्त", hinglish: "Dost" },
  family: { en: "Family", hi: "परिवार", hinglish: "Parivaar" },
};

export function relationLabel(kind: string, lang: Lang): string {
  return t(KIND_LABEL[kind] ?? KIND_LABEL.partner, lang);
}

const L = {
  title: { en: "Who is this about?", hi: "किसके बारे में पूछना है?", hinglish: "Kiske baare mein poochna hai?" },
  sub: {
    en: "Link one person's kundli. Then ask about the two of you — the answer reads both real charts.",
    hi: "एक इंसान की कुंडली जोड़िए। फिर आप दोनों के बारे में पूछिए — जवाब दोनों असली कुंडलियों से आएगा।",
    hinglish: "Ek insaan ki kundli jodiye. Phir aap dono ke baare mein poochiye — jawab dono asli kundliyon se aayega.",
  },
  none: { en: "No other kundli saved yet.", hi: "अभी कोई और कुंडली सेव नहीं है।", hinglish: "Abhi koi aur kundli saved nahi hai." },
  create: { en: "Make their kundli", hi: "उनकी कुंडली बनाएँ", hinglish: "Unki kundli banayein" },
  kindQ: { en: "They are my…", hi: "ये मेरे…", hinglish: "Ye mere…" },
  link: { en: "Link", hi: "जोड़ें", hinglish: "Jodein" },
  unlink: { en: "Unlink", hi: "हटाएँ", hinglish: "Hatayein" },
  free: {
    en: "The free plan includes 2 kundlis — yours and one more.",
    hi: "फ़्री प्लान में 2 कुंडली हैं — आपकी और एक और।",
    hinglish: "Free plan mein 2 kundli hain — aapki aur ek aur.",
  },
  privacy: {
    en: "Their birth details stay in your account. Only calculated positions reach the AI.",
    hi: "उनकी जन्म जानकारी आपके अकाउंट में रहती है। AI तक सिर्फ़ गणना की हुई स्थितियाँ जाती हैं।",
    hinglish: "Unki birth details aapke account mein rehti hain. AI tak sirf calculated positions jaati hain.",
  },
} satisfies Record<string, Tri>;

const SPRING = { type: "spring" as const, stiffness: 420, damping: 40, mass: 0.9 };

export default function RelationSheet({
  open, chartId, current, preselect, onClose, onLinked, onUnlinked,
}: {
  open: boolean;
  chartId: string;
  current: Relation | null;
  preselect?: string;
  onClose: () => void;
  onLinked: (r: Relation) => void;
  onUnlinked: () => void;
}) {
  const g = getLang();
  const lang = (g === "hi" || g === "hinglish" ? g : "en") as Lang;
  const navigate = useNavigate();
  const [people, setPeople] = useState<Array<{ id: string; name: string }> | null>(null);
  const [pick, setPick] = useState<string | undefined>();
  const [kind, setKind] = useState<string>("partner");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr("");
    setPick(preselect ?? current?.chartId);
    setKind(current?.relation ?? "partner");
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((d) => setPeople((Array.isArray(d) ? d : [])
        .filter((p: any) => p.id !== chartId)
        .map((p: any) => ({ id: p.id, name: String(p.name || "") }))))
      .catch(() => setPeople([]));
  }, [open, chartId, preselect, current?.chartId, current?.relation]);

  const link = async () => {
    if (!pick || busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/chat/relation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartId, otherChartId: pick, relation: kind }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.linked) throw new Error(d.error || "Could not link.");
      haptic.success();
      onLinked({ chartId: d.chartId, relation: d.relation, name: d.name });
    } catch (e: any) {
      haptic.error();
      setErr(e?.message || "Could not link.");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (busy) return;
    setBusy(true);
    try { await fetch(`/api/chat/relation/${chartId}`, { method: "DELETE" }); onUnlinked(); }
    finally { setBusy(false); }
  };

  const create = () => {
    onClose();
    navigate(`/create-chart?return=${encodeURIComponent(`/chat/${chartId}`)}`);
  };

  // Portalled: the chat lives inside a transformed, animating element, and a
  // fixed sheet inside one anchors to it instead of the screen.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog" aria-modal="true" aria-label={t(L.title, lang)}
        >
          <button aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full bg-black/50" />
          <motion.div
            className="relative max-h-[88vh] w-full max-w-[520px] overflow-y-auto rounded-t-[28px] border border-border bg-card px-5 pt-3 text-card-foreground shadow-2xl"
            style={{ paddingBottom: "calc(var(--sab, 0px) + 20px)" }}
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={SPRING}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />
            <Pressable onClick={onClose} feedback="tap" aria-label="Close"
              className="tap-44 absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-foreground">
              <X className="h-[18px] w-[18px]" strokeWidth={2.4} />
            </Pressable>

            <h2 className="pr-8 text-[19px] font-bold leading-tight">💞 {t(L.title, lang)}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{t(L.sub, lang)}</p>

            <div className="mt-4 space-y-2">
              {people === null && <div className="skeleton h-14" />}
              {people?.length === 0 && (
                <p className="rounded-2xl bg-muted px-4 py-3 text-[13px] text-muted-foreground">{t(L.none, lang)}</p>
              )}
              {people?.map((p) => (
                <Pressable key={p.id} onClick={() => { haptic.select(); setPick(p.id); }} feedback="tap"
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left ${pick === p.id ? "border-accent bg-accent/10" : "border-border"}`}>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${pick === p.id ? "border-accent bg-accent text-accent-foreground" : "border-border"}`}>
                    {pick === p.id && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{p.name}</span>
                </Pressable>
              ))}
              <Pressable onClick={create} feedback="tap"
                className="flex w-full items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3 text-[13.5px] font-bold text-muted-foreground">
                <Plus className="h-4 w-4" strokeWidth={2.6} /> {t(L.create, lang)}
              </Pressable>
              <p className="px-1 text-[11.5px] text-muted-foreground">{t(L.free, lang)}</p>
            </div>

            {!!people?.length && (
              <div className="mt-4">
                <p className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{t(L.kindQ, lang)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {KINDS.map((k) => (
                    <button key={k} type="button" onClick={() => { haptic.select(); setKind(k); }}
                      className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold ${kind === k ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                      {relationLabel(k, lang)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {err && <p className="mt-3 text-[12.5px] font-semibold text-destructive">{err}</p>}

            <div className="mt-5 space-y-2">
              <Pressable onClick={link} feedback="medium"
                className={`flex w-full items-center justify-center rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25 ${!pick || busy ? "opacity-50" : ""}`}>
                {t(L.link, lang)}
              </Pressable>
              {current && (
                <Pressable onClick={unlink} feedback="tap"
                  className="flex w-full items-center justify-center rounded-full px-5 py-2.5 text-[13px] font-semibold text-muted-foreground">
                  {t(L.unlink, lang)} {current.name}
                </Pressable>
              )}
              <p className="px-1 pt-1 text-center text-[11px] text-muted-foreground">{t(L.privacy, lang)}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
