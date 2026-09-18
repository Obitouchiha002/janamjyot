import {
  LifeBuoy, ChevronRight, Settings, Cpu, Share2, Star, LogOut, LogIn, Shield, Code2, Bell, Coins,
} from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { useAuth } from '@/auth';
import { shareText, haptic } from '@/lib/native';
import { openFeedback } from '@/lib/feedback';
import { getUiLang } from '@/lib/prefs';

/*
 * More is the account and the app — nothing else.
 *
 * It used to open with the Admin Panel and repeat Matching, Panchang and the
 * tools that already have their own tab, so the same feature lived in three
 * places. Features live under Tools and inside the kundli now; admin rows are
 * shown only to the admin, at the very bottom.
 */
type Tri = { en: string; hi: string; hinglish: string };
const pick = (x: Tri) => { const g = getUiLang(); return (x as any)[g] ?? x.en; };

interface Row {
  title: Tri;
  desc: Tri | string;
  icon: any;
  to?: string;
  onClick?: () => void;
  tint: string;
}

function RowList({ rows, label }: { rows: Row[]; label: Tri }) {
  return (
    <section>
      <h3 className="mb-2.5 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
        {pick(label)}
      </h3>
      <div className="m-card divide-y divide-border">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <Pressable
              key={r.title.en}
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
                <span className="block text-[14.5px] font-bold leading-tight">{pick(r.title)}</span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                  {typeof r.desc === 'string' ? r.desc : pick(r.desc)}
                </span>
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

  const app: Row[] = [
    { title: { en: 'My Plan & Credits', hi: 'मेरा प्लान और क्रेडिट', hinglish: 'Mera plan aur credits' },
      desc: { en: 'Plan, trial, credits and receipts', hi: 'प्लान, ट्रायल, क्रेडिट और रसीदें', hinglish: 'Plan, trial, credits aur receipts' },
      icon: Coins, to: '/plan', tint: '#C07A1E' },
    { title: { en: 'Settings', hi: 'सेटिंग्स', hinglish: 'Settings' },
      desc: { en: 'Theme, language and preferences', hi: 'थीम, भाषा और पसंद', hinglish: 'Theme, bhasha aur pasand' },
      icon: Settings, to: '/settings', tint: '#7DD3C0' },
    { title: { en: 'Notifications', hi: 'सूचनाएँ', hinglish: 'Notifications' },
      desc: { en: 'Your day each morning, reminders', hi: 'हर सुबह आपका दिन, रिमाइंडर', hinglish: 'Har subah aapka din, reminders' },
      icon: Bell, to: '/notifications', tint: '#E8B44A' },
    { title: { en: 'Help & Support', hi: 'मदद और सहायता', hinglish: 'Help & support' },
      desc: { en: 'Report a problem or read the FAQ', hi: 'समस्या बताएँ या सवाल-जवाब पढ़ें', hinglish: 'Problem batayein ya FAQ padhein' },
      icon: LifeBuoy, to: '/help', tint: '#34D399' },
    { title: { en: 'Rate & Review', hi: 'रेटिंग दें', hinglish: 'Rating dein' },
      desc: { en: 'Tell us how it is going', hi: 'बताइए कैसा लग रहा है', hinglish: 'Batayein kaisa lag raha hai' },
      icon: Star, tint: '#F26D9B', onClick: () => { haptic.tap(); openFeedback('more'); } },
    { title: { en: 'Share JanamJyot', hi: 'JanamJyot शेयर करें', hinglish: 'JanamJyot share karein' },
      desc: { en: 'Send the app to your friends', hi: 'दोस्तों को भेजें', hinglish: 'Doston ko bhejein' },
      icon: Share2, tint: '#E8B44A',
      // No hardcoded site — share whatever download URL the build was given.
      onClick: () => shareText(
        'JanamJyot',
        'Try JanamJyot — accurate Vedic astrology, charts and AI guidance.',
        (import.meta as any).env?.VITE_APP_DOWNLOAD_URL || undefined,
      ) },
    { title: { en: 'Developer', hi: 'डेवलपर', hinglish: 'Developer' },
      desc: { en: 'About the developer & contact', hi: 'डेवलपर और संपर्क', hinglish: 'Developer aur contact' },
      icon: Code2, to: '/developer', tint: '#60A5FA' },
  ];

  const account: Row[] = user
    ? [{ title: { en: 'Sign out', hi: 'साइन आउट', hinglish: 'Sign out' }, desc: user.email, icon: LogOut, tint: '#F87171', onClick: () => { haptic.warning(); logout(); } }]
    : [{ title: { en: 'Sign in', hi: 'साइन इन', hinglish: 'Sign in' }, desc: { en: 'Sync your kundlis across devices', hi: 'सभी डिवाइस पर कुंडली', hinglish: 'Sab devices par kundli' }, icon: LogIn, to: '/login', tint: '#60A5FA' }];

  // Internal tools — the admin only, and last.
  const adminRows: Row[] = [
    { title: { en: 'Admin Panel', hi: 'एडमिन पैनल', hinglish: 'Admin panel' }, desc: 'Users, limits, analytics, API keys', icon: Shield, to: '/admin', tint: '#D97706' },
    { title: { en: 'AI Status', hi: 'AI स्टेटस', hinglish: 'AI status' }, desc: 'Provider health & limits', icon: Cpu, to: '/ai-status', tint: '#60A5FA' },
  ];

  return (
    <div className="space-y-6 pt-2">
      <RowList label={{ en: 'App', hi: 'ऐप', hinglish: 'App' }} rows={app} />
      <RowList label={{ en: 'Account', hi: 'अकाउंट', hinglish: 'Account' }} rows={account} />
      {user?.role === 'admin' && <RowList label={{ en: 'Admin', hi: 'एडमिन', hinglish: 'Admin' }} rows={adminRows} />}

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
