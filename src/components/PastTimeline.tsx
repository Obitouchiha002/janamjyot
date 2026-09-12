/**
 * "Here is what already happened."
 *
 * Placed ABOVE the forecast on purpose. A reading that opens with 2029 asks for
 * trust it has not earned; one that opens with a stretch the reader recognises
 * has earned it by the time they reach 2029. It is also the only part of a
 * report that can be wrong in a way the reader can see — which is the point,
 * and why the note at the end says so out loud instead of hiding it.
 */
import { useEffect, useState } from "react";
import { Loader2, History, Sparkles } from "lucide-react";
import { useT, formatDate, currentLang } from "@/lib/i18n";
import { Pressable } from "@/components/mobile/Pressable";
import { haptic } from "@/lib/native";

/** One plain colour per life area, so a run of periods is scannable. */
const AREA_TINT: Record<string, string> = {
  career: "#2563EB", money: "#B7791F", family: "#DB2777", home: "#7C3AED",
  study: "#0891B2", health: "#DC2626", relationship: "#DB2777", travel: "#16A34A",
};

export function PastTimeline({ chartId, lang }: { chartId: string; lang?: string }) {
  const t = useT();
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);

  const load = async () => {
    if (busy) return;
    haptic.tap();
    setAsked(true); setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/chart/${chartId}/past?lang=${encodeURIComponent(lang || currentLang())}`);
      const d = await res.json();
      if (!res.ok || d.error) { setErr(d.error || t("Something went wrong")); }
      else { setRows(d.timeline ?? []); setNote(d.note ?? null); }
    } catch { setErr(t("Network error.")); }
    finally { setBusy(false); }
  };

  return (
    <section className="rounded-3xl border-2 border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
          <History className="h-[18px] w-[18px]" />
        </span>
        <h2 className="min-w-0 flex-1 text-[17px] font-bold leading-tight">{t("Your past, period by period")}</h2>
      </div>

      {!asked && (
        <>
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted-foreground">
            {t("Check the reading against a life you already lived. If these stretches match, the years ahead are worth reading.")}
          </p>
          <Pressable
            feedback="medium"
            onClick={load}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
          >
            <Sparkles className="h-[17px] w-[17px]" strokeWidth={2.4} /> {t("Show my past")}
          </Pressable>
        </>
      )}

      {busy && (
        <div className="mt-4 flex items-center gap-2 text-[13.5px] text-muted-foreground">
          <Loader2 className="h-[16px] w-[16px] animate-spin" /> {t("Reading the years you have lived…")}
        </div>
      )}

      {err && (
        <div className="mt-4">
          <p className="text-[13.5px] font-medium text-destructive">{err}</p>
          <Pressable subtle onClick={load} className="mt-2 rounded-full border-2 border-border px-4 py-2 text-[13px] font-bold">
            {t("Try again")}
          </Pressable>
        </div>
      )}

      {note && <p className="mt-4 text-[13.5px] text-muted-foreground">{note}</p>}

      {rows && rows.length > 0 && (
        <>
          <ol className="mt-4">
            {rows.map((r, i) => {
              const tint = AREA_TINT[r.areas?.[0]] ?? "#B7791F";
              const last = i === rows.length - 1;
              return (
                <li key={r.from} className="relative flex gap-3 pb-5 last:pb-0">
                  {/* The spine. Drawn per-row so the last one stops at its dot. */}
                  {!last && <span className="absolute left-[7px] top-4 h-full w-[2px] bg-border" aria-hidden />}
                  <span
                    className="relative mt-1.5 h-4 w-4 shrink-0 rounded-full border-2 border-card"
                    style={{ background: tint }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-[13.5px] font-bold text-foreground">
                        {formatDate(r.from, undefined, { weekday: false })} — {formatDate(r.to, undefined, { weekday: false })}
                      </span>
                      <span className="text-[11.5px] font-semibold text-muted-foreground">
                        {t("age")} {r.age}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[15px] font-bold leading-snug" style={{ color: tint }}>
                      {r.headline}
                    </p>
                    <p className="selectable mt-1 text-[13.5px] leading-relaxed text-foreground/90">{r.what}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(r.areas ?? []).map((a: string) => (
                        <span key={a} className="rounded-full border-2 border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          {t(a)}
                        </span>
                      ))}
                      <span className="rounded-full border-2 border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {r.period}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 border-t-2 border-border pt-3 text-[12px] leading-relaxed text-muted-foreground">
            {t("These are tendencies of each period, not certainties — you may have lived one of them differently. The dates are calculated from your birth moment and do not change.")}
          </p>
        </>
      )}
    </section>
  );
}
