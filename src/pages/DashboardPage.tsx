import { useState } from 'react';
import { useCachedFetch } from '@/lib/useCachedFetch';
import { ShareCardHost } from '@/components/mobile/ShareCardSheet';
import { haptic } from '@/lib/native';
import { useParams } from 'react-router-dom';
import {
  FileText, LayoutGrid, Clock, CircleDot, Heart, Globe2, Layers, Gem,
  MessageCircle, User, MapPin, CalendarDays, Sparkles, ChevronRight, TrendingUp, Share2, Compass,} from 'lucide-react';
import TodayCard from '@/components/TodayCard';
import YouCard from '@/components/YouCard';
import { Pressable } from '@/components/mobile/Pressable';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="m-card px-3.5 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-[16px] font-bold leading-tight">
        {value}
        {sub && <span className="ml-1 text-[12px] font-medium text-accent">{sub}</span>}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const { chartId } = useParams();
  // Cached-first: reopening a kundli you just viewed paints instantly.
  const { data, error } = useCachedFetch<any>(`/api/chart/${chartId}`);
  const [sharing, setSharing] = useState(false);
  const failed = error && !data;

  if (failed) {
    return (
      <div className="m-card mt-6 p-6 text-center">
        <p className="text-[15px] font-bold">Couldn't load this chart</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Check your connection and try again.</p>
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

  const tools = [
    // Right Now lives here as well as on Home. On Home it is a live card that
    // renders null until /api/right-now answers — so if that call was slow or
    // failed, an entire feature (including its reminder flow) simply did not
    // exist for the user. A tool tile is unconditional.
    { to: `/right-now/${chartId}`, icon: Compass, label: 'Abhi Sahi Hai?', sub: 'Is now a good time?' },
    // Live Transit and Life Sectors used to be separate chats; they now live
    // inside the one Jyotish chat (ask "aaj ke transit" or "career kaisa hai").
    { to: `/chart/${chartId}/d1`, icon: CircleDot, label: 'D1 Chart', sub: 'Lagna kundli' },
    { to: `/chart/${chartId}/d9`, icon: Heart, label: 'D9 Navamsa', sub: 'Marriage & dharma' },
    { to: `/chart/${chartId}/divisional`, icon: LayoutGrid, label: 'Divisional', sub: 'D10, D6, D11' },
    { to: `/timeline/${chartId}`, icon: TrendingUp, label: 'Life Timeline', sub: '30d · 1y · 5y forecast' },
    { to: `/chart/${chartId}/dasha`, icon: Clock, label: 'Dashas', sub: 'Mahadasha periods' },
    { to: `/chart/${chartId}/remedies`, icon: Gem, label: 'Remedies', sub: 'Ratna, mantra' },
    { to: `/reports/${chartId}`, icon: FileText, label: 'Reports', sub: 'Career, wealth, PDF' },
  ];

  return (
    <div className="space-y-6 pt-2">
      {/* identity */}
      <section className="m-card m-enter p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
            <User className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[19px] font-bold leading-tight">{b.name}</h2>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              {b.date_of_birth} · {b.time_of_birth}
            </p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {b.place_of_birth}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Pressable
            to={`/chat/${chartId}`}
            feedback="medium"
            className="flex items-center justify-center gap-1.5 rounded-full bg-accent py-3 text-[13px] font-bold leading-tight text-accent-foreground shadow-lg shadow-accent/25"
          >
            <MessageCircle className="h-[17px] w-[17px] shrink-0" strokeWidth={2.4} /> Talk to Astrologer
          </Pressable>
          <Pressable
            to={`/reports/${chartId}`}
            className="flex items-center justify-center gap-1.5 rounded-full border border-border py-3 text-[13.5px] font-bold"
          >
            <FileText className="h-[17px] w-[17px]" /> Reports
          </Pressable>
        </div>

        {/* Share card — a poster of their own chart, with the site link on it. */}
        <Pressable
          onClick={() => { haptic.tap(); setSharing(true); }}
          subtle
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-accent/50 py-3 text-[13px] font-bold text-accent"
        >
          <Share2 className="h-[16px] w-[16px]" />
          Share my Kundli
        </Pressable>
      </section>

      {/* Plain-language "who you are" — read BEFORE the jargon stat cards, so a
          beginner's first impression is about their life, not Sanskrit terms. */}
      <section className="m-enter" style={{ animationDelay: '0.03s' }}>
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
      <section className="m-enter" style={{ animationDelay: '0.04s' }}>
        <TodayCard chartId={chartId} lang={b?.language} />
      </section>

      <Pressable
        to={`/daily/${chartId}`}
        feedback="select"
        className="m-enter flex w-full items-center gap-3.5 rounded-2xl border border-accent/30 bg-accent/[0.07] p-3.5"
        style={{ animationDelay: '0.05s' }}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground shadow-md shadow-accent/25">
          <Sparkles className="h-[19px] w-[19px]" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[14.5px] font-bold leading-tight">See your full day</span>
          <span className="mt-0.5 block truncate text-[12px] leading-snug text-muted-foreground">
            Career · Money · Love · Health · your best hours
          </span>
        </span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-accent" />
      </Pressable>

      {/* key positions */}
      <section className="m-enter grid grid-cols-2 gap-2.5" style={{ animationDelay: '0.08s' }}>
        <Stat label="Lagna" value={data.ascendant.sign} sub={`${data.ascendant.degree.toFixed(1)}°`} />
        <Stat label="Moon Rashi" value={moon} />
        <Stat label="Sun Sign" value={sun} />
        <Stat
          label="Nakshatra"
          value={data.summary?.nakshatra || data.ascendant.nakshatra}
          sub={`Pada ${data.summary?.nakshatra_pada ?? data.ascendant.pada}`}
        />
      </section>

      {/* current dasha */}
      <section
        className="m-card m-enter relative overflow-hidden p-5"
        style={{ animationDelay: '0.11s' }}
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/10 blur-2xl" />
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> Current Dasha
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-muted p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mahadasha</p>
            <p className="mt-1 text-[20px] font-bold text-accent">{data.dashas.current_mahadasha}</p>
          </div>
          <div className="rounded-2xl bg-muted p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Antardasha</p>
            <p className="mt-1 text-[20px] font-bold">{data.dashas.current_antardasha}</p>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">
          {data.dashas.current_period.from} → {data.dashas.current_period.to}
        </p>
      </section>

      {/* tools */}
      <section className="m-enter" style={{ animationDelay: '0.14s' }}>
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          Chart tools
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {tools.map(({ to, icon: Icon, label, sub }) => (
            <Pressable key={to} to={to} className="m-card block p-4 text-left">
              <Icon className="mb-3 h-[22px] w-[22px] text-accent" />
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
