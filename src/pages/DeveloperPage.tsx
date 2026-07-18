import { Mail, Globe, Github, Instagram, Phone, Code2, Heart } from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { writeClipboard, shareText } from '@/lib/native';

/**
 * Public "About the developer" screen. The values below are placeholders —
 * edit DEVELOPER to your real details. Any field left blank is hidden, so you
 * can fill in only what you want public. The same content is mirrored on the
 * download website (public/download.html).
 */
const DEVELOPER = {
  name: 'Vansh Kashyap',
  role: 'Founder & Developer, JanamJyot',
  bio: 'Building precise, modern Vedic-astrology tools. Reach out for feedback, collaborations, or support.',
  email: 'vk1234888i@gmail.com',
  phone: '',            // e.g. '+91 90000 00000'
  website: '',          // e.g. 'https://your-site.com'
  github: 'Obitouchiha02',
  instagram: '',        // handle without @
};

interface LinkRow { icon: any; label: string; value: string; href?: string; copy?: string; tint: string; }

export default function DeveloperPage() {
  const d = DEVELOPER;

  const rows: LinkRow[] = [
    d.email ? { icon: Mail, label: 'Email', value: d.email, href: `mailto:${d.email}`, copy: d.email, tint: '#EA4335' } : null,
    d.phone ? { icon: Phone, label: 'Phone', value: d.phone, href: `tel:${d.phone.replace(/\s/g, '')}`, copy: d.phone, tint: '#34A853' } : null,
    d.website ? { icon: Globe, label: 'Website', value: d.website.replace(/^https?:\/\//, ''), href: d.website, tint: '#4285F4' } : null,
    d.github ? { icon: Github, label: 'GitHub', value: d.github, href: `https://github.com/${d.github}`, tint: '#1F2328' } : null,
    d.instagram ? { icon: Instagram, label: 'Instagram', value: `@${d.instagram}`, href: `https://instagram.com/${d.instagram}`, tint: '#E1306C' } : null,
  ].filter(Boolean) as LinkRow[];

  const open = (r: LinkRow) => {
    if (r.href) { window.open(r.href, '_blank'); return; }
    if (r.copy) writeClipboard(r.copy);
  };

  return (
    <div className="space-y-6 pt-2">
      {/* profile */}
      <section className="m-card m-enter flex flex-col items-center p-6 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-3xl bg-accent text-[34px] font-bold text-accent-foreground shadow-lg shadow-accent/25">
          {d.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </span>
        <h2 className="mt-4 text-[22px] font-bold">{d.name}</h2>
        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-accent">
          <Code2 className="h-4 w-4" /> {d.role}
        </p>
        {d.bio && <p className="selectable mt-3 text-[13.5px] leading-relaxed text-muted-foreground">{d.bio}</p>}
      </section>

      {/* contact */}
      {!!rows.length && (
        <section className="m-enter">
          <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Contact</h3>
          <div className="m-card divide-y divide-border">
            {rows.map((r) => {
              const Icon = r.icon;
              return (
                <Pressable key={r.label} onClick={() => open(r)} subtle className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${r.tint}22`, color: r.tint }}>
                    <Icon className="h-[19px] w-[19px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{r.label}</span>
                    <span className="selectable block truncate text-[14.5px] font-semibold">{r.value}</span>
                  </span>
                </Pressable>
              );
            })}
          </div>
          <p className="mt-2 px-1 text-[11.5px] text-muted-foreground">Tap to open · long-press a value to copy.</p>
        </section>
      )}

      <Pressable
        onClick={() => shareText('JanamJyot', `JanamJyot — by ${d.name}.`, (import.meta as any).env?.VITE_APP_DOWNLOAD_URL || undefined)}
        className="m-enter flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
      >
        <Heart className="h-[17px] w-[17px]" /> Share the app
      </Pressable>

      <p className="pb-2 text-center text-[11px] text-muted-foreground">
        © {new Date().getFullYear()} {d.name} · JanamJyot
      </p>
    </div>
  );
}
