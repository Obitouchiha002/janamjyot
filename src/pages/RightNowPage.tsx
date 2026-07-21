import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  CheckCircle2, PauseCircle, XCircle, HelpCircle, Clock, RefreshCw, Bell, BellRing,
  Users, Wallet, Plane, GraduationCap, Phone, Sparkles, HeartPulse, CircleDot, MessageCircle,
} from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { LoadError } from '@/components/ErrorState';
import { haptic, isNative } from '@/lib/native';
import { remindAt } from '@/lib/notifications';
import { useVisibleInterval } from '@/lib/useVisibleInterval';
import { getLang } from '@/lib/prefs';

/** The activities people actually check before doing. */
const ACTIVITIES = [
  { key: 'general', label: 'Anything', icon: CircleDot },
  { key: 'meeting', label: 'Meeting', icon: Users },
  { key: 'money', label: 'Money', icon: Wallet },
  { key: 'call', label: 'Call', icon: Phone },
  { key: 'newwork', label: 'New work', icon: Sparkles },
  { key: 'travel', label: 'Travel', icon: Plane },
  { key: 'interview', label: 'Interview', icon: GraduationCap },
  { key: 'health', label: 'Health', icon: HeartPulse },
] as const;

const VERDICT = {
  go:    { tint: '#22C55E', icon: CheckCircle2, label: 'GO' },
  wait:  { tint: '#E8B44A', icon: PauseCircle,  label: 'WAIT' },
  avoid: { tint: '#F87171', icon: XCircle,      label: 'AVOID' },
  // The server sends this where choghadiya can't be computed (no sunrise or
  // sunset that day). Deliberately grey and not a verdict — falling back to
  // 'go' here would be a green light derived from nothing.
  unknown: { tint: '#94A3B8', icon: HelpCircle, label: 'NO DATA' },
} as const;

/** "14:32" → minutes since midnight. */
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Minutes from `from` to `to`, rolling past midnight.
 *
 * Windows late in the day routinely end after midnight, and a plain
 * subtraction there produces a negative countdown.
 */
function minutesUntil(from: string, to: string): number {
  const d = toMin(to) - toMin(from);
  return d < 0 ? d + 1440 : d;
}

/** 94 → "1h 34m", 34 → "34 min". Absolute clock times make people do the maths. */
function human(mins: number): string {
  if (mins < 1) return 'less than a minute';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** A Date for the next occurrence of "HH:MM" — tomorrow if it already passed. */
function nextOccurrence(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

export default function RightNowPage() {
  const { chartId } = useParams();
  const [activity, setActivity] = useState<string>('general');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [place, setPlace] = useState<{ lat: number; lon: number; tz: string } | null>(null);
  const [plan, setPlan] = useState<any>(null);
  const [reminded, setReminded] = useState(false);
  const [failed, setFailed] = useState(false);

  // The friend-voice plan for today: what to do, what to skip, when. Cached
  // server-side per day, so this is cheap to ask for on every open.
  useEffect(() => {
    if (!chartId) return;
    let alive = true;
    fetch(`/api/chart/${chartId}/today-plan?lang=${encodeURIComponent(getLang())}`)
      .then((r) => r.json())
      .then((d) => { if (alive && !d.error) setPlan(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [chartId]);

  // Timing depends on local sunrise, so we use the chart's own place — no
  // location permission prompt, and it's where most people actually are.
  useEffect(() => {
    if (!chartId) return;
    fetch(`/api/chart/${chartId}`)
      .then((r) => r.json())
      .then((c) => {
        const b = c?.birth_details;
        if (b?.latitude != null) {
          setPlace({ lat: b.latitude, lon: b.longitude, tz: b.timezone || 'Asia/Kolkata' });
        } else setPlace({ lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' });
      })
      .catch(() => setPlace({ lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' }));
  }, [chartId]);

  const load = useCallback(async () => {
    if (!place) return;
    setLoading(true);
    try {
      const r = await fetch(
        `/api/right-now?lat=${place.lat}&lon=${place.lon}&tz=${encodeURIComponent(place.tz)}&activity=${activity}`,
      );
      const d = await r.json();
      if (d.error) setFailed(true);
      else { setData(d); setFailed(false); }
    } catch {
      // Keep whatever we last showed, but remember it's stale — see below.
      setFailed(true);
    }
    finally { setLoading(false); }
  }, [place, activity]);

  useEffect(() => { load(); }, [load]);

  // The answer changes as windows roll over, so refresh it while the page is
  // open — and only while it's actually on screen.
  useVisibleInterval(load, 60_000);

  // Never fall through to a default verdict. The `?? 'go'` below is only safe
  // once we know `data` exists — with no data the page rendered a confident
  // green GO on a dropped connection, which is the opposite of "unknown" on
  // the one screen whose entire job is to say whether now is a good moment.
  if (!loading && !data) {
    return (
      <LoadError
        title="Couldn't check right now"
        hint="Check your connection and try again."
        onRetry={load}
      />
    );
  }

  const v = VERDICT[(data?.verdict ?? 'go') as keyof typeof VERDICT];
  const VIcon = v.icon;

  // How long the answer on screen stays true. This is the whole point of the
  // page — "GO" means nothing without "for how long".
  const holdsFor: number | null =
    data?.now && (data.blocking?.end || data.current?.ends)
      ? minutesUntil(data.now, data.blocking?.end || data.current.ends)
      : null;
  const untilGood: number | null =
    data?.now && data.next_good?.start ? minutesUntil(data.now, data.next_good.start) : null;

  const remind = async () => {
    if (!data?.next_good?.start) return;
    haptic.medium();
    const ok = await remindAt(nextOccurrence(data.next_good.start), {
      title: '✅ Good window has started',
      body: `${data.next_good.name} runs until ${data.next_good.end}. Good time to go ahead.`,
      route: chartId ? `/right-now/${chartId}` : '/',
    });
    setReminded(ok);
    if (!ok) haptic.warning();
  };

  return (
    <div className="space-y-5 pt-2">
      {/* What we're answering FOR. This is the input, so it belongs above the
          answer — below it, changing activity silently re-computed a verdict
          that had already scrolled out of view. */}
      <section className="m-enter">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
          {ACTIVITIES.map((a) => {
            const Icon = a.icon;
            const on = activity === a.key;
            return (
              <Pressable
                key={a.key}
                onClick={() => { haptic.select(); setActivity(a.key); setReminded(false); }}
                subtle
                aria-pressed={on}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-bold transition-colors ${
                  on ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="h-4 w-4" /> {a.label}
              </Pressable>
            );
          })}
        </div>
      </section>

      {/* A countdown that stopped updating is worse than no countdown, so say
          so rather than letting a stale "34 min left" tick down to nonsense. */}
      {failed && data && (
        <p className="m-enter rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-center text-[12px] leading-relaxed text-amber-300">
          Couldn&apos;t refresh — showing the last reading. Times may be out of date.
        </p>
      )}

      {/* verdict */}
      <section
        className="m-card m-enter relative overflow-hidden p-6 text-center"
        style={{ borderColor: `${v.tint}55`, background: `linear-gradient(180deg, ${v.tint}1f, transparent)` }}
      >
        {loading && !data ? (
          <div className="skeleton mx-auto h-[130px] w-full" />
        ) : (
          <>
            <span
              className="mx-auto mb-3 grid h-[70px] w-[70px] place-items-center rounded-full"
              style={{ background: `${v.tint}22`, color: v.tint }}
            >
              <VIcon className="h-9 w-9" strokeWidth={2.2} />
            </span>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: v.tint }}>
              {v.label}
            </p>
            <h2 className="mt-1 text-[22px] font-bold leading-tight">{data?.headline}</h2>

            {/* The countdown is the practical half of the answer. */}
            {holdsFor !== null && data?.verdict !== 'unknown' && (
              <p
                className="mx-auto mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold"
                style={{ background: `${v.tint}1f`, color: v.tint }}
              >
                <Clock className="h-3.5 w-3.5" />
                {data.verdict === 'go' ? `${human(holdsFor)} left` : `changes in ${human(holdsFor)}`}
              </p>
            )}

            <p className="mx-auto mt-2.5 max-w-[300px] text-[13.5px] leading-relaxed text-muted-foreground">
              {data?.reason}
            </p>
            <p className="mt-3 text-[12px] text-muted-foreground">
              {data?.now} · {data?.panchang?.weekday} · {data?.panchang?.nakshatra}
            </p>
          </>
        )}
      </section>

      {/* friend's take on the day — plain language, no astrology words */}
      {plan && (
        <section className="m-card m-enter p-4" style={{ background: 'linear-gradient(180deg, rgba(232,180,74,0.10), transparent)' }}>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-accent">
            <MessageCircle className="h-3.5 w-3.5" /> Aaj kya karein
          </p>
          {plan.headline && (
            <p className="mt-2 text-[16px] font-bold leading-snug">{plan.headline}</p>
          )}
          <div className="mt-3 space-y-2.5">
            {plan.do_now && (
              <div className="flex gap-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </span>
                <p className="selectable text-[13.5px] leading-relaxed">{plan.do_now}</p>
              </div>
            )}
            {plan.avoid && (
              <div className="flex gap-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-500/15 text-red-400">
                  <XCircle className="h-3.5 w-3.5" />
                </span>
                <p className="selectable text-[13.5px] leading-relaxed">{plan.avoid}</p>
              </div>
            )}
            {plan.best_time && (
              <div className="flex gap-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                  <Clock className="h-3.5 w-3.5" />
                </span>
                <p className="selectable text-[13.5px] leading-relaxed">{plan.best_time}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {data?.tip && (
        <p className="m-enter px-1 text-[12.5px] leading-relaxed text-muted-foreground">{data.tip}</p>
      )}

      {/* Next good window — with a way to act on it, so a "WAIT" verdict isn't
          a dead end the user has to remember to come back and re-check. */}
      {data?.next_good && (
        <section className="m-card m-enter p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Next good window
          </p>
          <p className="mt-1.5 text-[17px] font-bold">
            {data.next_good.start} – {data.next_good.end}
            <span className="ml-2 text-[13px] font-semibold text-accent">{data.next_good.name}</span>
          </p>
          {untilGood !== null && (
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">opens in {human(untilGood)}</p>
          )}
          {isNative && data.verdict !== 'go' && (
            <Pressable
              onClick={() => { if (!reminded) remind(); }}
              subtle
              className={`mt-3 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-bold ${
                reminded ? 'bg-emerald-500/15 text-emerald-500' : 'bg-accent text-accent-foreground'
              }`}
            >
              {reminded
                ? <><BellRing className="h-4 w-4" /> I&apos;ll remind you at {data.next_good.start}</>
                : <><Bell className="h-4 w-4" /> Remind me when it opens</>}
            </Pressable>
          )}
        </section>
      )}

      {data?.blocking && (
        <section className="m-card m-enter p-4" style={{ borderColor: '#F8717155' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#F87171' }}>
            {data.blocking.name}
          </p>
          <p className="mt-1 text-[15px] font-bold">
            {data.blocking.start} – {data.blocking.end}
          </p>
        </section>
      )}

      <Pressable
        onClick={() => { haptic.tap(); load(); }}
        subtle
        className="m-enter flex w-full items-center justify-center gap-2 rounded-full border border-border py-3 text-[13px] font-bold text-muted-foreground"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Check again
      </Pressable>

      <p className="selectable px-1 pb-2 text-center text-[11.5px] italic leading-relaxed text-muted-foreground">
        Based on today&apos;s choghadiya and Rahu Kaal for your chart&apos;s location. Guidance for timing, not a rule.
      </p>
    </div>
  );
}
