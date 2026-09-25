import { useState } from "react";
import { AlertTriangle, CheckCircle2, Brain, ChevronDown, Calculator } from "lucide-react";

/**
 * The summary that opens a Life Report: what this chart is actually shouting about.
 *
 * Every line comes from the calculation engines (server/va/highlights.ts and psyche.ts) and
 * arrives on `key_points` — no model wrote it, so nothing in it can be invented, and it is
 * on screen before the first section has even been written. The dates are recomputed on
 * every read, so an old report still opens with a current "kab tak".
 *
 * Built phone-first: one column, full-width rows, nothing that needs sideways scrolling.
 */
export interface KeyPoint {
  says: string;
  because: string;
  until?: string | null;
  background_until?: string | null;
  active_now: boolean;
  theme: string;
}
export interface KeyPattern {
  pattern: string;
  shows_up_as: string;
  gift: string;
  because: string;
}
export interface KeyPointsData {
  problems?: KeyPoint[];
  strengths?: KeyPoint[];
  patterns?: KeyPattern[];
}

function PointRow({ point, tone }: { point: KeyPoint; tone: "problem" | "strength" }) {
  const [open, setOpen] = useState(false);
  /* The tint box stays light in every theme (midnight and royal are dark), so its text is
     given an explicit dark tone rather than the theme's foreground — the same thing the
     report's own positive/caution boxes do. */
  const c =
    tone === "problem"
      ? { box: "border-rose-200 bg-rose-50/70", icon: "text-rose-600", chip: "bg-rose-100 text-rose-800", text: "text-rose-950", sub: "text-rose-900/70" }
      : { box: "border-emerald-200 bg-emerald-50/70", icon: "text-emerald-600", chip: "bg-emerald-100 text-emerald-800", text: "text-emerald-950", sub: "text-emerald-900/70" };
  const Icon = tone === "problem" ? AlertTriangle : CheckCircle2;

  return (
    <div className={`rounded-2xl border p-3 sm:p-3.5 ${c.box}`}>
      <div className="flex gap-2.5">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${c.icon}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-[15px] leading-relaxed font-medium break-words ${c.text}`}>{point.says}</p>

          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {point.active_now && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${c.chip}`}>Abhi chal raha hai</span>
            )}
            {point.until && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/70 text-slate-700 border">
                {point.until} tak
              </span>
            )}
            {!point.until && point.background_until && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/70 text-slate-700 border">
                background: {point.background_until} tak
              </span>
            )}
          </div>

          {point.because && (
            <>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold active:opacity-70 ${c.sub}`}
              >
                Kyun? <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <p className={`mt-1.5 pt-1.5 border-t border-black/5 text-[13px] leading-relaxed break-words ${c.sub}`}>
                  {point.because}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function KeyPointsCard({ data }: { data: KeyPointsData }) {
  const problems = data?.problems ?? [];
  const strengths = data?.strengths ?? [];
  const patterns = data?.patterns ?? [];
  if (!problems.length && !strengths.length && !patterns.length) return null;

  return (
    <section className="rounded-3xl border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-3.5 border-b bg-secondary/30">
        <h2 className="text-base sm:text-lg font-bold text-foreground">Aapki kundli abhi kya keh rahi hai</h2>
        <p className="text-[11px] sm:text-xs text-muted-foreground flex items-start gap-1.5 mt-1">
          <Calculator className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Ye hissa seedha calculation se banta hai — dates aur wajah, dono asli hisaab se.</span>
        </p>
      </div>

      <div className="p-3 sm:p-5 space-y-4">
        {problems.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Sabse badi dikkatein</p>
            {problems.map((p, i) => <PointRow key={`p${i}`} point={p} tone="problem" />)}
          </div>
        )}

        {strengths.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Aapki asli taakat</p>
            {strengths.map((p, i) => <PointRow key={`s${i}`} point={p} tone="strength" />)}
          </div>
        )}

        {patterns.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Aapka swabhav — jo baar baar dohrata hai
            </p>
            {patterns.map((t, i) => (
              <div key={`t${i}`} className="rounded-2xl border bg-secondary/20 p-3 sm:p-3.5">
                <div className="flex gap-2.5">
                  <Brain className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-[15px] leading-relaxed font-medium text-foreground break-words">{t.pattern}</p>
                    {t.shows_up_as && (
                      <p className="text-[13px] leading-relaxed text-muted-foreground break-words">
                        <span className="font-semibold text-foreground">Dikhta hai: </span>{t.shows_up_as}
                      </p>
                    )}
                    {t.gift && (
                      <p className="text-[13px] leading-relaxed text-emerald-900 break-words">
                        <span className="font-semibold">Isi ka accha pehlu: </span>{t.gift}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
