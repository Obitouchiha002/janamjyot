import { useState } from 'react';
import { useT } from "@/lib/i18n";
import { useCachedFetch } from '@/lib/useCachedFetch';
import { ShareCardHost } from '@/components/mobile/ShareCardSheet';
import ChartAvatar from '@/components/ChartAvatar';
import { haptic } from '@/lib/native';
import { useParams } from 'react-router-dom';
import {
  FileText, LayoutGrid, Clock, CircleDot, Heart, Globe2, Layers, Gem,
  MessageCircle, User, MapPin, CalendarDays, Sparkles, ChevronRight, TrendingUp, Share2, Compass, Bell, BarChart3,} from 'lucide-react';
import TodayCard from '@/components/TodayCard';
import YouCard from '@/components/YouCard';
import { Pressable } from '@/components/mobile/Pressable';

/** "2005-01-16", "17:00:00" → "16 Jan 2005 · 5:00 PM" — a birth, not a database row. */
function fmtBirth(date?: string, time?: string): string {
  const d = date ? new Date(`${String(date).slice(0, 10)}T00:00:00`) : null;
  const ds = d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : (date ?? '');
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ''));
  const ts = m ? `${((Number(m[1]) + 11) % 12) + 1}:${m[2]} ${Number(m[1]) < 12 ? 'AM' : 'PM'}` : (time ?? '');
  return [ds, ts].filter(Boolean).join(' · ');
}
import { getLang } from '@/lib/prefs';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="m-card px-3.5 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-[16px] font-bold leading-tight">
        {value}
        {sub && <span className="mt-0.5 block text-[12px] font-medium text-accent">{sub}</span>}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const t = useT();
  const { chartId } = useParams();
  // Cached-first: reopening a kundli you just viewed paints instantly.
  const { data, error } = useCachedFetch<any>(`/api/chart/${chartId}`);
  const [sharing, setSharing] = useState(false);
  const failed = error && !data;

  if (failed) {
    return (
      <div className="m-card mt-6 p-6 text-center">
        <p className="text-[15px] font-bold">{t("Couldn't load this chart")}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">{t("Check your connection and try again.")}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3 pt-2">
        <div className="skeleton h-[120px]" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[70px]" />)}
        </div>
        <div className="skeleton h-[110px]" />
      </div>
    );
  }

  const b = data.birth_details;
  const moon = data.planets.find((p: any) => p.planet === 'Moon')?.sign ?? 'N/A';
  const sun = data.planets.find((p: any) => p.planet === 'Sun')?.sign ?? 'N/A';

  // Everything tied to THIS chart lives here — including Ashtakavarga and
  // transits, which used to be repeated under Tools and More as well.
  const tools = [
    { to: `/chart/${chartId}/d1`, icon: CircleDot, label: 'D1 Chart', sub: 'Lagna kundli', tint: '#E8B44A' },
    { to: `/chart/${chartId}/d9`, icon: Heart, label: 'D9 Navamsa', sub: 'Marriage & dharma', tint: '#F26D9B' },
    { to: `/chart/${chartId}/dasha`, icon: Clock, label: 'Dasha periods', sub: 'Mahadasha timeline', tint: '#7DD3C0' },
    { to: '/alerts', icon: Bell, label: 'Transit alerts', sub: 'What is running now', tint: '#60A5FA' },
    { to: `/chart/${chartId}/divisional`, icon: LayoutGrid, label: 'Divisional', sub: 'D10, D6, D11', tint: '#A78BFA' },
    { to: '/ashtakavarga', icon: BarChart3, label: 'Ashtakavarga', sub: 'Strength of every sign', tint: '#C9A24B' },
    { to: `/timeline/${chartId}`, icon: TrendingUp, label: 'Life Timeline', sub: '30d · 1y · 5y forecast', tint: '#34D399' },
    { to: `/right-now/${chartId}`, icon: Compass, label: 'Abhi Sahi Hai?', sub: 'Is now a good time?', tint: '#F59E0B' },
    { to: `/chart/${chartId}/remedies`, icon: Gem, label: 'Remedies', sub: 'Ratna, mantra', tint: '#EC4899' },
    { to: `/reports/${chartId}`, icon: FileText, label: 'Reports', sub: 'Career, wealth, PDF', tint: '#C07A1E' },
  ];

  return (
    /* One column on a phone; from 1024px the same cards become two columns —
       who they are on the left, their day and the tools on the right
       (.kd-grid in index.css). */
    <div className="kd-grid space-y-6 pt-2">
      {/* ── Who this kundli is ───────────────────────────────────────────
          The one card on this screen that is about a PERSON, so it is the one
          card allowed to carry their colour: a gradient taken from their moon
          sign, an avatar the app draws itself, and their two signs stated
          plainly instead of left to the jargon cards below. */}
      <section className="kd-person m-card m-enter relative overflow-hidden p-5">
        <span className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-accent/20 blur-2xl" />
        <div className="relative flex items-start gap-3.5">
          <ChartAvatar name={b.name} size={58} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[20px] font-bold leading-tight">{b.name}</h2>
            <p className="mt-1 flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              {fmtBirth(b.date_of_birth, b.time_of_birth)}
            </p>
            {/* The whole place, on two lines if it needs them — it was cut to "Mum…". */}
            <p className="mt-0.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-muted-foreground">
              <MapPin className="mt-[2px] h-3.5 w-3.5 shrink-0" />
              {b.place_of_birth}
            </p>
          </div>
        </div>

        {/* Their signs, in colour, where a beginner can actually see them. */}
        <div className="relative mt-3.5 flex flex-wrap gap-2">
          {[[t("Moon"), moon], [t("Sun"), sun], [t("Lagna"), data.summary?.lagna]].map(([label, value]) =>
            value && value !== 'N/A' ? (
              <span
                key={String(label)}
                className="rounded-full bg-accent/12 px-3 py-1.5 text-[12px] font-bold text-accent"
              >
                {label} · {t(String(value))}
              </span>
            ) : null,
          )}
        </div>

        {/* Two buttons, two words each: the label used to wrap onto a second
            line inside a pill, which reads as a broken button. */}
        <div className="relative mt-4 grid grid-cols-2 gap-2.5">
          <Pressable
            to={`/chat/${chartId}`}
            feedback="medium"
            className="flex items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-[14.5px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
          >
            <MessageCircle className="h-[18px] w-[18px] shrink-0" strokeWidth={2.4} />
            <span className="whitespace-nowrap">{t("Ask")}</span>
          </Pressable>
          <Pressable
            to={`/reports/${chartId}`}
            className="flex items-center justify-center gap-2 rounded-full border-2 border-border py-3.5 text-[14.5px] font-bold"
          >
            <FileText className="h-[18px] w-[18px] shrink-0" />
            <span className="whitespace-nowrap">{t("Reports")}</span>
          </Pressable>
        </div>

        {/* Share card — a poster of their own chart, with the site link on it. */}
        <Pressable
          onClick={() => { haptic.tap(); setSharing(true); }}
          subtle
          className="relative mt-2.5 flex w-full items-center justify-center gap-2 rounded-full bg-muted py-3 text-[13.5px] font-bold text-foreground/75"
        >
          <Share2 className="h-[16px] w-[16px]" />
          <span className="whitespace-nowrap">{t("Share my Kundli")}</span>
        </Pressable>
      </section>

      {/* Plain-language "who you are" — read BEFORE the jargon stat cards, so a
          beginner's first impression is about their life, not Sanskrit terms. */}
      <section className="kd-you m-enter" style={{ animationDelay: '0.03s' }}>
        <YouCard
          chartId={chartId}
          name={b.name}
          moonSign={moon}
          dashaLord={data.summary?.current_mahadasha || data.dasha?.current?.mahadasha}
        />
      </section>

      {/* Today's snapshot, then the link into the full day. The card answers
          "what about today?" on its own; the row below is the way deeper in —
          the other order made the screen read as two competing "today" blocks. */}
      <section className="kd-today m-enter" style={{ animationDelay: '0.04s' }}>
        <TodayCard chartId={chartId} lang={b?.language} />
      </section>

      <Pressable
        to={`/daily/${chartId}`}
        feedback="select"
        className="kd-day m-enter flex w-full items-center gap-3.5 rounded-2xl border border-accent/30 bg-accent/[0.07] p-3.5"
        style={{ animationDelay: '0.05s' }}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground shadow-md shadow-accent/25">
          <Sparkles className="h-[19px] w-[19px]" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[14.5px] font-bold leading-tight">{t("See your full day")}</span>
          <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
            Career · Money · Love · Health · your best hours
          </span>
        </span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-accent" />
      </Pressable>

      {/* key positions */}
      <section className="kd-stats m-enter grid grid-cols-2 gap-2.5" style={{ animationDelay: '0.08s' }}>
        <Stat label="Lagna" value={data.ascendant.sign} sub={`${data.ascendant.degree.toFixed(1)}°`} />
        <Stat label={t("Moon Rashi")} value={moon} />
        <Stat label={t("Sun Sign")} value={sun} />
        <Stat
          label="Nakshatra"
          value={data.summary?.nakshatra || data.ascendant.nakshatra}
          sub={`Pada ${data.summary?.nakshatra_pada ?? data.ascendant.pada}`}
        />
      </section>

      {/* current dasha */}
      <section
        className="kd-dasha m-card m-enter relative overflow-hidden p-5"
        style={{ animationDelay: '0.11s' }}
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/10 blur-2xl" />
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> {t("Current Dasha")}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-muted p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("Mahadasha")}</p>
            <p className="mt-1 text-[20px] font-bold text-accent">{data.dashas.current_mahadasha}</p>
          </div>
          <div className="rounded-2xl bg-muted p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("Antardasha")}</p>
            <p className="mt-1 text-[20px] font-bold">{data.dashas.current_antardasha}</p>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">
          {fmtBirth(data.dashas.current_period.from)} → {fmtBirth(data.dashas.current_period.to)}
        </p>
      </section>

      {/* tools */}
      <section className="kd-tools m-enter" style={{ animationDelay: '0.14s' }}>
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          {({ en: 'Chart tools', hi: 'कुंडली टूल्स', hinglish: 'Kundli tools' } as Record<string, string>)[getLang()] ?? 'Chart tools'}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {tools.map(({ to, icon: Icon, label, sub, tint }) => (
            <Pressable key={to} to={to} className="m-card block p-4 text-left">
              <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${tint}22`, color: tint }}>
                <Icon className="h-[20px] w-[20px]" />
              </span>
              <p className="text-[14.5px] font-bold leading-tight">{label}</p>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">{sub}</p>
            </Pressable>
          ))}
        </div>
      </section>

      {/* Animated preview + share sheet for the Kundli card. */}
      <ShareCardHost
        open={sharing}
        onClose={() => setSharing(false)}
        data={{
          name: data.birth_details?.name ?? '',
          lagna: data.ascendant?.sign ?? '',
          rashi: data.planets?.find((p: any) => p.planet === 'Moon')?.sign ?? '',
          nakshatra: data.summary?.nakshatra || data.ascendant?.nakshatra || '',
          dasha: `${data.dashas?.current_mahadasha ?? ''}-${data.dashas?.current_antardasha ?? ''}`.replace(/^-|-$/g, ''),
          planets: (data.planets ?? []).map((p: any) => ({ planet: p.planet, house: p.house })),
        }}
      />
    </div>
  );
}
