import {
  HeartHandshake, LifeBuoy, CalendarDays, Wand2, ChevronRight,
  Settings, Cpu, Share2, Star, LogOut, LogIn, Shield, Code2, Bell, Coins,
} from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { useAuth } from '@/auth';
import { shareText, haptic } from '@/lib/native';
import { openFeedback } from '@/lib/feedback';

interface Row {
  title: string;
  desc: string;
  icon: any;
  to?: string;
  onClick?: () => void;
  tint: string;
}

function RowList({ rows, label }: { rows: Row[]; label: string }) {
  return (
    <section>
      <h3 className="mb-2.5 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </h3>
      <div className="m-card divide-y divide-border">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <Pressable
              key={r.title}
              to={r.to}
              onClick={r.onClick}
              subtle
              className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left"
            >
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                style={{ background: `${r.tint}22`, color: r.tint }}
              >
                <Icon className="h-[19px] w-[19px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold leading-tight">{r.title}</span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{r.desc}</span>
              </span>
              <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            </Pressable>
          );
        })}
      </div>
    </section>
  );
}

export default function MorePage() {
  const { user, logout } = useAuth();

  const features: Row[] = [
    { title: 'Kundli Matching', desc: 'Ashtakoot Guna Milan — 36 points', icon: HeartHandshake, to: '/match', tint: '#F26D9B' },
    { title: 'Daily Panchang', desc: 'Tithi, Nakshatra, Rahu Kaal', icon: CalendarDays, to: '/panchang', tint: '#E8B44A' },
    { title: 'Advanced Tools', desc: 'Muhurat, Yogas, Ashtakavarga, Alerts', icon: Wand2, to: '/tools', tint: '#A78BFA' },
  ];

  const app: Row[] = [
    { title: 'My Plan & Credits', desc: 'Current plan, trial expiry, credits and receipts', icon: Coins, to: '/plan', tint: '#C07A1E' },
    { title: 'Settings', desc: 'Theme, language and preferences', icon: Settings, to: '/settings', tint: '#7DD3C0' },
    { title: 'Notifications', desc: 'Daily guidance & reminders', icon: Bell, to: '/notifications', tint: '#E8B44A' },
    // AI provider/model health is internal — admins only (see /api/ai-status).
    ...(user?.role === 'admin'
      ? [{ title: 'AI Status', desc: 'Provider health & limits (admin)', icon: Cpu, to: '/ai-status', tint: '#60A5FA' } as Row]
      : []),
    { title: 'Help & Support', desc: 'Report a problem or read the FAQ', icon: LifeBuoy, to: '/help', tint: '#34D399' },
    {
      title: 'Rate & Review',
      desc: 'Share your experience — 5-star rating',
      icon: Star,
      tint: '#F26D9B',
      onClick: () => { haptic.tap(); openFeedback('more'); },
    },
    {
      title: 'Share JanamJyot',
      desc: 'Send the app to your friends',
      icon: Share2,
      tint: '#E8B44A',
      // No hardcoded site — share whatever download URL the build was given
      // (VITE_APP_DOWNLOAD_URL), else just the app name.
      onClick: () => shareText(
        'JanamJyot',
        'Try JanamJyot — accurate Vedic astrology, charts and AI guidance.',
        (import.meta as any).env?.VITE_APP_DOWNLOAD_URL || undefined,
      ),
    },
    { title: 'Developer', desc: 'About the developer & contact', icon: Code2, to: '/developer', tint: '#60A5FA' },
  ];

  const account: Row[] = user
    ? [{ title: 'Sign out', desc: user.email, icon: LogOut, tint: '#F87171', onClick: () => { haptic.warning(); logout(); } }]
    : [{ title: 'Sign in', desc: 'Sync your kundlis across all devices', icon: LogIn, to: '/login', tint: '#60A5FA' }];

  const adminRows: Row[] = [
    { title: 'Admin Panel', desc: 'Users, limits, analytics, API keys', icon: Shield, to: '/admin', tint: '#D97706' },
  ];

  return (
    <div className="space-y-6 pt-2">
      {user?.role === 'admin' && <RowList label="Admin" rows={adminRows} />}
      <RowList label="Features" rows={features} />
      <RowList label="App" rows={app} />
      <RowList label="Account" rows={account} />

      <div className="flex flex-col items-center gap-1 pb-2 pt-2 text-center">
        <Star className="h-4 w-4 text-accent" />
        <p className="text-[12px] text-muted-foreground">
          Developed by <span className="font-semibold text-accent">Vansh Kashyap</span>
        </p>
        <p className="text-[11px] text-muted-foreground/70">
          © {new Date().getFullYear()} JanamJyot
        </p>
      </div>
    </div>
  );
}
