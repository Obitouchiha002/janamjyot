/**
 * The deep-matching screen: everything past the 36 points.
 *
 * One design rule runs through all of it, because breaking it is what made the
 * first pass look broken rather than subtle: no washed-out surfaces. A tinted
 * panel is at least /10, its border is a real 2px, and text is full strength.
 * `bg-accent/5` with a hairline border reads on a phone as a component that
 * failed to load.
 */
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, Clock, Send,
  Sparkles, Trash2, CalendarDays, Loader2, ShieldCheck,
} from "lucide-react";
import { NorthIndianChart } from "@/components/NorthIndianChart";
import { Pressable } from "@/components/mobile/Pressable";
import { haptic } from "@/lib/native";
import { useT } from "@/lib/i18n";

/* ── shared bits ─────────────────────────────────────────────────────── */

export function SectionTitle({ icon: Icon, children }: { icon?: any; children: any }) {
  return (
    <h3 className="mb-3 flex flex-wrap items-center gap-1.5 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
      {Icon && <Icon className="h-[15px] w-[15px]" />} {children}
    </h3>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border-2 border-border bg-muted p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-[14px] font-bold leading-tight text-foreground">{value || "—"}</p>
      {sub && <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Red/green status pill. Solid tint, real border — never a 5% wash. */
function Badge({ ok, children }: { ok: boolean; children: any }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border-2 px-2.5 py-1 text-[11.5px] font-bold ${
        ok
          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300"
      }`}
    >
      {ok ? <CheckCircle2 className="h-[13px] w-[13px]" /> : <AlertTriangle className="h-[13px] w-[13px]" />}
      {children}
    </span>
  );
}

/*
 * House numbers, not English ordinals.
 *
 * "5th" inside a Hindi sentence is a language the reader did not choose, and
 * there is no ordinal suffix that works across all three. The number with the
 * translated word for "house" reads correctly in every one of them.
 */
const houseNum = (n: number | null) => (n == null ? "—" : String(n));

/* ── 1. Final verdict — the first thing after the score ──────────────── */

const REC_STYLE: Record<string, { ring: string; chip: string; label: Record<string, string> }> = {
  proceed: {
    ring: "border-emerald-500/50 bg-emerald-500/12",
    chip: "border-emerald-500/50 bg-emerald-500/20 text-emerald-800 dark:text-emerald-200",
    label: { en: "Go ahead", hi: "आगे बढ़ें", hinglish: "Aage badhein" },
  },
  proceed_with_care: {
    ring: "border-amber-500/50 bg-amber-500/12",
    chip: "border-amber-500/50 bg-amber-500/20 text-amber-900 dark:text-amber-200",
    label: { en: "Go ahead, with care", hi: "ध्यान से आगे बढ़ें", hinglish: "Dhyan se aage badhein" },
  },
  consult_astrologer: {
    ring: "border-red-500/50 bg-red-500/12",
    chip: "border-red-500/50 bg-red-500/20 text-red-800 dark:text-red-200",
    label: { en: "Talk to an astrologer first", hi: "पहले ज्योतिषी से मिलें", hinglish: "Pehle jyotishi se milein" },
  },
};

export function FinalVerdict({ v, lang }: { v: any; lang: string }) {
  const t = useT();
  if (!v?.headline) return null;
  const style = REC_STYLE[v.recommendation] ?? REC_STYLE.proceed_with_care;
  const label = style.label[lang] ?? style.label.en;

  return (
    <section className={`m-enter rounded-3xl border-2 p-5 ${style.ring}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-[12px] font-bold ${style.chip}`}>
          <ShieldCheck className="h-[14px] w-[14px]" /> {label}
        </span>
      </div>
      <p className="mt-3 text-[17px] font-bold leading-snug text-foreground">{v.headline}</p>
      {v.will_it_go_well && (
        <p className="selectable mt-2.5 text-[14px] leading-relaxed text-foreground/90">{v.will_it_go_well}</p>
      )}

      {v.problems?.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("What to watch")}
          </p>
          <ul className="mt-2 space-y-1.5">
            {v.problems.map((p: string, i: number) => (
              <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-foreground/90">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <span className="selectable">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {v.solutions?.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("What helps")}
          </p>
          <ul className="mt-2 space-y-1.5">
            {v.solutions.map((p: string, i: number) => (
              <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-foreground/90">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span className="selectable">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ── 2. One person: chart, badges, tiles ─────────────────────────────── */

export function PersonPanel({ p, tint, roleLabel }: { p: any; tint: string; roleLabel: string }) {
  const t = useT();
  if (!p) return null;
  const promiseOk = p.promise?.level !== "weak";
  const promiseWord =
    p.promise?.level === "strong" ? t("Strong") : p.promise?.level === "moderate" ? t("Moderate") : t("Needs care");

  return (
    <div className="m-card overflow-hidden p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[13px] font-bold"
              style={{ background: `${tint}33`, color: tint }}>
          {(p.name || "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold leading-tight">{p.name}</span>
          <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{roleLabel}</span>
        </span>
      </div>

      <div className="mt-3">
        <NorthIndianChart
          planets={(p.planets ?? []).map((x: any) => ({
            planet: x.planet, house: x.house, sign: x.sign, retrograde: x.retrograde,
          }))}
          ascendantSign={p.lagna}
          shortNames
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge ok={promiseOk}>{t("Marriage promise")}: {promiseWord}</Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Tile label={t("Moon sign")} value={p.moon_sign} sub={p.nakshatra} />
        <Tile label={t("Lagna")} value={p.lagna} sub={`${t("Lord")}: ${p.lagna_lord || "—"}`} />
        <Tile
          label={t("7th house (D1)")}
          value={p.seventh_d1?.sign ?? "—"}
          sub={`${t("Lord")} ${p.seventh_d1?.lord} → ${houseNum(p.seventh_d1?.lord_house)} ${t("house")}${p.seventh_d1?.lord_in_dusthana ? ` · ${t("difficult house")}` : ""}`}
        />
        <Tile
          label={t("7th house (D9)")}
          value={p.seventh_d9?.sign ?? "—"}
          sub={`${t("Lord")} ${p.seventh_d9?.lord} → ${houseNum(p.seventh_d9?.lord_house)} ${t("house")}${p.seventh_d9?.lord_in_dusthana ? ` · ${t("difficult house")}` : ""}`}
        />
        <Tile
          label="Venus"
          value={p.venus?.sign ?? "—"}
          sub={`${houseNum(p.venus?.house)} ${t("house")}${p.venus?.retrograde ? " · R" : ""}`}
        />
        <Tile
          label="Jupiter"
          value={p.jupiter?.sign ?? "—"}
          sub={`${houseNum(p.jupiter?.house)} ${t("house")}${p.jupiter?.retrograde ? " · R" : ""}`}
        />
      </div>

      <div className="mt-2">
        <Tile
          label={t("Running now")}
          value={`${p.current_dasha?.mahadasha ?? "—"} – ${p.current_dasha?.antardasha ?? "—"}`}
          sub={p.current_dasha?.to ? `${t("Ends")}: ${p.current_dasha.to}` : undefined}
        />
      </div>

      {p.promise?.reasons?.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {p.promise.reasons.map((r: string, i: number) => (
            <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
              <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── 3. Every planet, both people ────────────────────────────────────── */

export function PlanetTable({ boy, girl }: { boy: any; girl: any }) {
  const t = useT();
  const names = (boy?.planets ?? []).map((p: any) => p.planet);
  const find = (who: any, n: string) => (who?.planets ?? []).find((p: any) => p.planet === n);
  return (
    <div className="m-card overflow-x-auto">
      <table className="w-full min-w-[440px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b-2 border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2.5 text-left">{t("Planet")}</th>
            <th className="px-3 py-2.5 text-left">{boy?.name}</th>
            <th className="px-3 py-2.5 text-left">{girl?.name}</th>
          </tr>
        </thead>
        <tbody>
          {names.map((n: string) => {
            const a = find(boy, n), b = find(girl, n);
            const cell = (x: any) =>
              x ? `${x.sign} · ${t("house")} ${houseNum(x.house)}${x.retrograde ? " · R" : ""}` : "—";
            return (
              <tr key={n} className="border-b border-border last:border-0">
                <td className="px-3 py-2.5 font-bold text-foreground">{n}</td>
                <td className="px-3 py-2.5 text-foreground/90">{cell(a)}</td>
                <td className="px-3 py-2.5 text-foreground/90">{cell(b)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── 4. Timing: each person's windows, and where they meet ───────────── */

export function TimingWindows({ boy, girl, timing }: { boy: any; girl: any; timing: any }) {
  const t = useT();
  if (!timing) return null;
  return (
    <div className="space-y-2.5">
      <div className={`m-card border-2 p-4 ${timing.aligned ? "border-emerald-500/50 bg-emerald-500/12" : "border-amber-500/50 bg-amber-500/12"}`}>
        <p className="text-[14px] font-bold leading-snug text-foreground">{timing.note}</p>
        {timing.overlaps?.length > 0 && (
          <ul className="mt-3 space-y-2">
            {timing.overlaps.map((o: any, i: number) => (
              <li key={i} className="rounded-xl border-2 border-border bg-card px-3 py-2">
                <p className="text-[13.5px] font-bold text-foreground">{o.from} → {o.to}</p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {boy?.name}: {o.boy_period} · {girl?.name}: {o.girl_period}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {[boy, girl].map((p, idx) => (
          <div key={idx} className="m-card p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {p?.name} — {t("supportive periods")}
            </p>
            <ul className="mt-2 space-y-2">
              {(p?.marriage_windows ?? []).slice(0, 4).map((w: any, i: number) => (
                <li key={i}>
                  <p className="text-[13px] font-bold text-foreground">{w.period}</p>
                  <p className="text-[11.5px] text-muted-foreground">{w.from} → {w.to}</p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{w.why}</p>
                </li>
              ))}
              {!(p?.marriage_windows ?? []).length && (
                <li className="text-[12.5px] text-muted-foreground">{t("No strongly supportive period in the next ten years.")}</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 5. Doshas + the remedies that actually apply ────────────────────── */

export function DoshaPanel({ doshas, remedies }: { doshas: any[]; remedies: any[] }) {
  const t = useT();
  return (
    <div className="space-y-2.5">
      {(doshas ?? []).map((d) => (
        <div key={d.name} className="m-card flex gap-3 p-4">
          <span className={`mt-0.5 shrink-0 ${d.active ? "text-red-500" : "text-emerald-500"}`}>
            {d.active ? <AlertTriangle className="h-[18px] w-[18px]" /> : <CheckCircle2 className="h-[18px] w-[18px]" />}
          </span>
          <div className="min-w-0">
            <h4 className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {d.name}
              {d.present && d.cancelled && (
                <span className="rounded-full border-2 border-emerald-500/50 bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
                  {t("cancelled")}
                </span>
              )}
            </h4>
            <p className="selectable mt-1 text-[13.5px] leading-relaxed text-foreground/90">{d.detail}</p>
          </div>
        </div>
      ))}

      {(remedies ?? []).length > 0 && (
        <div className="m-card border-2 border-accent/40 bg-accent/10 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("Remedies")}</p>
          {remedies.map((r: any, i: number) => (
            <div key={i} className={i ? "mt-4" : "mt-2"}>
              <p className="text-[14.5px] font-bold text-foreground">{r.title}</p>
              <ul className="mt-1.5 space-y-1">
                {r.steps.map((s: string, j: number) => (
                  <li key={j} className="flex gap-2 text-[13px] leading-relaxed text-foreground/90">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">{r.note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 6. Ask about this couple ────────────────────────────────────────── */

/**
 * A chat input that grows with the question.
 *
 * A fixed single-line input clipped anything longer than a few words, which on
 * this screen is most real questions — people type a paragraph about their
 * family here. It starts one line, grows to a ceiling, then scrolls. Enter
 * sends; Shift+Enter is a newline, the way every chat box people already use
 * behaves.
 */
function GrowingInput({
  value, onChange, onSend, placeholder, busy,
}: { value: string; onChange: (v: string) => void; onSend: () => void; placeholder: string; busy: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [value]);

  return (
    <div
      className={`flex items-end gap-2 rounded-[26px] border-2 bg-card p-1.5 pl-4 transition-all duration-200 ${
        focused ? "-translate-y-0.5 border-accent/60 shadow-xl shadow-accent/15" : "border-border shadow-md"
      }`}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
        }}
        placeholder={placeholder}
        className="max-h-[132px] min-h-[24px] flex-1 resize-none self-center bg-transparent py-2 text-[15px] leading-snug outline-none placeholder:text-muted-foreground"
      />
      <Pressable
        feedback="medium"
        onClick={onSend}
        disabled={busy || !value.trim()}
        aria-label="Send"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/25 disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Send className="h-[17px] w-[17px]" strokeWidth={2.4} />}
      </Pressable>
    </div>
  );
}

export function MatchChat({
  boyInput, girlInput, lang,
}: { boyInput: any; girlInput: any; lang: string }) {
  const t = useT();
  const [chips, setChips] = useState<string[]>([]);
  const [msgs, setMsgs] = useState<Array<{ role: "user" | "assistant"; text: string; reason?: string }>>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/match/chips?lang=${encodeURIComponent(lang)}`)
      .then((r) => r.json())
      .then((d) => { if (alive && Array.isArray(d.chips)) setChips(d.chips); })
      .catch(() => {});
    return () => { alive = false; };
  }, [lang]);

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    haptic.tap();
    setQ("");
    setErr(null);
    // The history sent along is what was on screen BEFORE this turn, so the
    // model sees the conversation without the question it is being asked.
    const history = msgs.map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/match/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boy: boyInput, girl: girlInput, language: lang, question, history }),
      });
      const d = await res.json();
      if (!res.ok || d.error) { haptic.error(); setErr(d.error || t("Something went wrong")); }
      else { haptic.success(); setMsgs((m) => [...m, { role: "assistant", text: d.answer, reason: d.reason }]); }
    } catch {
      haptic.error(); setErr(t("Network error."));
    } finally { setBusy(false); }
  };

  return (
    <div className="m-card p-4">
      {msgs.length === 0 && (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t("Ask anything about the two of you — children, money, family, work. Both charts are read together.")}
        </p>
      )}

      {msgs.length > 0 && (
        <div className="space-y-3">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
                  m.role === "user"
                    ? "bg-accent text-accent-foreground"
                    : "border-2 border-border bg-muted text-foreground"
                }`}
              >
                <p className="selectable whitespace-pre-wrap">{m.text}</p>
                {m.reason && (
                  <p className="mt-2 border-t-2 border-border pt-2 text-[11.5px] leading-snug text-muted-foreground">
                    {m.reason}
                  </p>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="h-[15px] w-[15px] animate-spin" /> {t("Reading both charts…")}
            </div>
          )}
        </div>
      )}

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <Pressable
              key={c}
              subtle
              onClick={() => ask(c)}
              disabled={busy}
              className="rounded-full border-2 border-border bg-muted px-3 py-1.5 text-[12.5px] font-semibold text-foreground disabled:opacity-50"
            >
              {c}
            </Pressable>
          ))}
        </div>
      )}

      {err && <p className="mt-3 text-[13px] font-medium text-destructive">{err}</p>}

      <div className="mt-3">
        <GrowingInput
          value={q}
          onChange={setQ}
          onSend={() => ask(q)}
          busy={busy}
          placeholder={t("Ask about the two of you…")}
        />
      </div>
    </div>
  );
}

/* ── 7. Year picker with an always-visible answer ────────────────────── */

export function YearOutlook({
  boyInput, girlInput, lang,
}: { boyInput: any; girlInput: any; lang: string }) {
  const t = useT();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setBusy(true); setErr(null);
    fetch("/api/match/year", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boy: boyInput, girl: girlInput, language: lang, year }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.error) setErr(d.error); else setData(d);
      })
      .catch(() => { if (alive) setErr(t("Network error.")); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [year, lang, boyInput, girlInput]);

  return (
    <div className="m-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14.5px] font-bold leading-snug text-foreground">
          {t("How will married life look around")}
        </p>
        <select
          value={year}
          onChange={(e) => { haptic.tap(); setYear(Number(e.target.value)); }}
          className="rounded-full border-2 border-border bg-card px-3.5 py-2 text-[14px] font-bold outline-none focus:border-accent"
        >
          {Array.from({ length: 11 }, (_, i) => thisYear + i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {busy && (
        <div className="mt-3 space-y-2">
          <div className="skeleton h-[16px]" />
          <div className="skeleton h-[16px]" />
          <div className="skeleton h-[16px] w-2/3" />
        </div>
      )}

      {!busy && err && <p className="mt-3 text-[13px] font-medium text-destructive">{err}</p>}

      {!busy && !err && data && (
        <>
          <p className="selectable mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/90">
            {data.answer}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[...(data.boy_periods ?? []), ...(data.girl_periods ?? [])].map((p: any, i: number) => (
              <span key={i} className="rounded-full border-2 border-border bg-muted px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground">
                {p.period}
              </span>
            ))}
          </div>
          {data.reason && (
            <p className="mt-2 border-t-2 border-border pt-2 text-[11.5px] leading-snug text-muted-foreground">
              {data.reason}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ── 8. Wedding dates for THIS couple ────────────────────────────────── */

export function WeddingDates({
  boyInput, girlInput,
}: { boyInput: any; girlInput: any }) {
  const t = useT();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (busy || data) { setOpen((o) => !o); return; }
    setBusy(true); setErr(null); setOpen(true);
    try {
      const res = await fetch("/api/match/muhurat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boy: boyInput, girl: girlInput, months: 8 }),
      });
      const d = await res.json();
      if (!res.ok || d.error) setErr(d.error || t("Something went wrong")); else setData(d);
    } catch { setErr(t("Network error.")); }
    finally { setBusy(false); }
  };

  return (
    <div className="m-card p-4">
      <Pressable
        subtle
        onClick={() => { haptic.tap(); load(); }}
        className="flex w-full flex-wrap items-center gap-2 text-left"
      >
        <CalendarDays className="h-[18px] w-[18px] shrink-0 text-accent" />
        <span className="min-w-0 flex-1 text-[14.5px] font-bold">{t("Wedding dates for the two of you")}</span>
        <ChevronDown className={`h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </Pressable>

      {open && (
        <div className="mt-3">
          {busy && <div className="space-y-2"><div className="skeleton h-[52px]" /><div className="skeleton h-[52px]" /></div>}
          {err && <p className="text-[13px] font-medium text-destructive">{err}</p>}
          {data && (
            <>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                {t("Dates marked with a star are good in the panchang AND fall inside a period both charts support.")}
              </p>
              <ul className="mt-3 space-y-2">
                {data.dates.slice(0, 14).map((d: any) => (
                  <li
                    key={d.date}
                    className={`rounded-2xl border-2 px-3.5 py-2.5 ${
                      d.chart_supported ? "border-accent/50 bg-accent/12" : "border-border bg-muted"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-bold text-foreground">{d.date}</span>
                      <span className="text-[12px] text-muted-foreground">{d.weekday}</span>
                      {d.chart_supported && (
                        <span className="inline-flex items-center gap-1 rounded-full border-2 border-accent/50 bg-accent/20 px-2 py-0.5 text-[10.5px] font-bold text-accent">
                          <Sparkles className="h-[11px] w-[11px]" /> {t("chart-supported")}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {d.nakshatra} · {d.tithi} · {d.paksha}
                    </p>
                  </li>
                ))}
              </ul>
              {data.total === 0 && (
                <p className="text-[13px] text-muted-foreground">{t("No suitable wedding date in the months ahead — Chaturmas or Kharmas may be running.")}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 9. History ──────────────────────────────────────────────────────── */

export function MatchHistory({
  onOpen, signedIn, refreshKey,
}: { onOpen: (row: any) => void; signedIn: boolean; refreshKey: number }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[] | null>(null);

  const load = () => {
    if (!signedIn) return;
    fetch("/api/match/history")
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d.matches) ? d.matches : []))
      .catch(() => setRows([]));
  };
  useEffect(() => { if (open) load(); }, [open, refreshKey]);

  const openOne = async (id: string) => {
    haptic.tap();
    const res = await fetch(`/api/match/history/${id}`);
    const d = await res.json();
    if (!res.ok || d.error) return;
    setOpen(false);
    onOpen(d);
  };

  const remove = async (id: string) => {
    haptic.warning();
    await fetch(`/api/match/history/${id}`, { method: "DELETE" }).catch(() => {});
    setRows((r) => (r ?? []).filter((x) => x.id !== id));
  };

  if (!signedIn) return null;

  return (
    <div className="relative">
      <Pressable
        subtle
        onClick={() => { haptic.tap(); setOpen((o) => !o); }}
        className="flex items-center gap-1.5 rounded-full border-2 border-border bg-card px-3.5 py-2 text-[13px] font-bold"
      >
        <Clock className="h-[15px] w-[15px]" /> {t("History")}
        <ChevronDown className={`h-[15px] w-[15px] transition-transform ${open ? "rotate-180" : ""}`} />
      </Pressable>

      {/*
        Always mounted, animated both ways. Conditionally rendering this panel
        gave it an open animation and no close one — it simply vanished, which
        reads as a glitch. `max-w` keeps it inside a narrow screen no matter
        where the trigger sits.
      */}
      <div
        aria-hidden={!open}
        className={`absolute right-0 z-30 mt-2 w-[280px] max-w-[calc(100vw-2rem)] origin-top-right rounded-2xl border-2 border-border bg-card p-2 shadow-2xl transition-all duration-200 ${
          open ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-1 scale-95 opacity-0"
        }`}
      >
        {rows === null && <p className="px-2 py-3 text-[13px] text-muted-foreground">{t("Loading…")}</p>}
        {rows?.length === 0 && <p className="px-2 py-3 text-[13px] text-muted-foreground">{t("Nothing saved yet.")}</p>}
        {rows?.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-muted">
            <Pressable subtle onClick={() => openOne(r.id)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13.5px] font-bold">{r.boy_name} & {r.girl_name}</span>
              <span className="block text-[11.5px] text-muted-foreground">{r.score}/{r.max_score}</span>
            </Pressable>
            <Pressable
              subtle
              onClick={() => remove(r.id)}
              aria-label={t("Delete")}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground"
            >
              <Trash2 className="h-[15px] w-[15px]" />
            </Pressable>
          </div>
        ))}
      </div>
    </div>
  );
}
