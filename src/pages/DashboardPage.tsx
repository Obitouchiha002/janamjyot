import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  FileText, LayoutGrid, Clock, CircleDot, Heart, Globe2, Layers, Gem,
  MessageCircle, User, MapPin, CalendarDays, Sparkles, ChevronRight, TrendingUp,
} from 'lucide-react';
import TodayCard from '@/components/TodayCard';
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
  const [data, setData] = useState<any>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/chart/${chartId}`)
      .then((r) => r.json())
      .then((d) => (d?.error ? setFailed(true) : setData(d)))
      .catch(() => setFailed(true));
  }, [chartId]);

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
    { to: `/transit/${chartId}`, icon: Globe2, label: 'Live Transit', sub: 'Transits — now' },
    { to: `/sectors/${chartId}`, icon: Layers, label: 'Life Sectors', sub: 'Career, Love…' },
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
            to={`/ask/${chartId}`}
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
      </section>

      {/* daily guidance — the everyday hook */}
      <Pressable
        to={`/daily/${chartId}`}
        feedback="select"
        className="m-card m-enter flex items-center gap-3.5 p-4"
        style={{ animationDelay: '0.04s', background: 'linear-gradient(180deg, rgba(232,180,74,0.12), transparent)' }}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent">
          <Sparkles className="h-[21px] w-[21px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-tight">Today's Guidance</span>
          <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
            Career · Money · Relationship · Health · Best time
          </span>
        </span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
      </Pressable>

      <section className="m-enter" style={{ animationDelay: '0.05s' }}>
        <TodayCard chartId={chartId} lang={b?.language} />
      </section>

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
    </div>
  );
}
