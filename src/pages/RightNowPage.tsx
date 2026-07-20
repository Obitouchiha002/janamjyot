import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  CheckCircle2, PauseCircle, XCircle, Clock, RefreshCw,
  Users, Wallet, Plane, GraduationCap, Phone, Sparkles, HeartPulse, CircleDot, MessageCircle,
} from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { haptic } from '@/lib/native';
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
} as const;

export default function RightNowPage() {
  const { chartId } = useParams();
  const [activity, setActivity] = useState<string>('general');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [place, setPlace] = useState<{ lat: number; lon: number; tz: string } | null>(null);
  const [plan, setPlan] = useState<any>(null);

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
      if (!d.error) setData(d);
    } catch { /* keep whatever we last showed */ }
    finally { setLoading(false); }
  }, [place, activity]);

  useEffect(() => { load(); }, [load]);

  // The answer changes as windows roll over, so refresh it while the page is open.
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const v = VERDICT[(data?.verdict ?? 'go') as keyof typeof VERDICT];
  const VIcon = v.icon;

  return (
    <div className="space-y-5 pt-2">
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
            <p className="mx-auto mt-2 max-w-[300px] text-[13.5px] leading-relaxed text-muted-foreground">
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

      {/* activity chips */}
      <section className="m-enter">
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          Checking for…
        </h3>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
          {ACTIVITIES.map((a) => {
            const Icon = a.icon;
            const on = activity === a.key;
            return (
              <Pressable
                key={a.key}
                onClick={() => { haptic.select(); setActivity(a.key); }}
                subtle
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-bold ${
                  on ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="h-4 w-4" /> {a.label}
              </Pressable>
            );
          })}
        </div>
        {data?.tip && (
          <p className="mt-3 px-1 text-[12.5px] leading-relaxed text-muted-foreground">{data.tip}</p>
        )}
      </section>

      {/* next good window */}
      {data?.next_good && (
        <section className="m-card m-enter p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Next good window
          </p>
          <p className="mt-1.5 text-[17px] font-bold">
            {data.next_good.start} – {data.next_good.end}
            <span className="ml-2 text-[13px] font-semibold text-accent">{data.next_good.name}</span>
          </p>
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
