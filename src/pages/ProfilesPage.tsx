import { useEffect, useState } from 'react';
import { User, Trash2, Plus, ChevronRight, Sparkles, Pencil, MoreHorizontal, Star } from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { haptic } from '@/lib/native';
import { invalidateProfiles } from '@/pages/HomePage';
import { useAuth } from '@/auth';
import { getLang } from '@/lib/prefs';
import { pickPrimary, setPrimary } from '@/lib/primary';

type Tri = { en: string; hi: string; hinglish: string };
const T = {
  newK: { en: 'New Kundli', hi: 'नई कुंडली', hinglish: 'Nayi kundli' },
  mine: { en: 'Mine', hi: 'मेरी', hinglish: 'Meri' },
  edit: { en: 'Edit details', hi: 'जानकारी बदलें', hinglish: 'Details badlein' },
  makeMine: { en: 'This is my kundli', hi: 'यह मेरी कुंडली है', hinglish: 'Ye meri kundli hai' },
  del: { en: 'Delete', hi: 'हटाएँ', hinglish: 'Delete' },
  confirm: {
    en: "Delete this kundli? Its reports and chat go with it, and the free slot doesn't come back.",
    hi: 'यह कुंडली हटाएँ? इसकी रिपोर्ट और चैट भी हट जाएँगी, और फ़्री जगह वापस नहीं मिलेगी।',
    hinglish: 'Ye kundli delete karein? Iski reports aur chat bhi hat jayengi, aur free slot wapas nahi milega.',
  },
  cancel: { en: 'Cancel', hi: 'रहने दें', hinglish: 'Rehne dein' },
  empty: { en: 'No kundlis yet', hi: 'अभी कोई कुंडली नहीं', hinglish: 'Abhi koi kundli nahi' },
  emptySub: {
    en: 'Enter your date, time and place of birth to create your first kundli.',
    hi: 'अपनी जन्म तारीख, समय और जगह डालकर पहली कुंडली बनाइए।',
    hinglish: 'Apni janam tareekh, samay aur jagah daal ke pehli kundli banaiye.',
  },
  create: { en: 'Create my Kundli', hi: 'मेरी कुंडली बनाएँ', hinglish: 'Meri kundli banayein' },
  err: {
    en: "Couldn't delete that kundli. Check your connection and try again.",
    hi: 'कुंडली नहीं हटी। इंटरनेट देखकर फिर कोशिश करें।',
    hinglish: 'Kundli delete nahi hui. Internet check karke dobara koshish karein.',
  },
} satisfies Record<string, Tri>;

/** "2005-01-16" → "16 Jan 2005" — a date, not a database value. */
function fmtDate(s?: string): string {
  if (!s) return '';
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime()) ? String(s) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ProfilesPage() {
  const { user } = useAuth();
  const g = getLang();
  const L = (g === 'hi' || g === 'hinglish' ? g : 'en') as keyof Tri;
  const [profiles, setProfiles] = useState<any[] | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [, bump] = useState(0);

  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => r.json())
      .then((d) => setProfiles(Array.isArray(d) ? d : []))
      .catch(() => setProfiles([]));
  }, []);

  const mine = pickPrimary(profiles, user?.name)?.id;

  const remove = async (id: string) => {
    haptic.warning();
    const before = profiles ?? [];
    setProfiles(before.filter((x) => x.id !== id));
    setConfirmId(null);
    setMenuId(null);
    try {
      const r = await fetch(`/api/profiles/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(String(r.status));
      invalidateProfiles();
    } catch {
      // Put the row back rather than let the UI claim a delete that didn't happen.
      setProfiles(before);
      setError(T.err[L]);
      haptic.error();
    }
  };

  return (
    <div className="space-y-5 pt-2">
      <Pressable
        to="/create-chart"
        feedback="medium"
        className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
      >
        <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} />
        {T.newK[L]}
      </Pressable>

      {error && (
        <p className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-[12.5px] leading-relaxed text-red-600">{error}</p>
      )}

      {profiles === null && (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[74px]" style={{ opacity: 1 - i * 0.25 }} />)}
        </div>
      )}

      {profiles?.length === 0 && (
        <Pressable to="/create-chart" feedback="medium" className="m-card flex w-full flex-col items-center gap-2 px-6 py-14 text-center">
          <Sparkles className="h-8 w-8 text-accent" />
          <span className="text-[15px] font-bold">{T.empty[L]}</span>
          <span className="text-[13px] leading-relaxed text-muted-foreground">{T.emptySub[L]}</span>
          <span className="mt-3 rounded-full bg-accent px-5 py-2.5 text-[13.5px] font-bold text-accent-foreground">{T.create[L]}</span>
        </Pressable>
      )}

      <div className="space-y-2.5">
        {profiles?.map((p, i) => (
          <div key={p.id} className="m-card m-enter overflow-hidden" style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}>
            <div className="flex items-center gap-2 py-3 pl-4 pr-2">
              <Pressable to={`/dashboard/${p.id}`} subtle className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                  <User className="h-[22px] w-[22px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15.5px] font-bold">{p.name}</span>
                    {p.id === mine && (
                      <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">{T.mine[L]}</span>
                    )}
                  </span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">{fmtDate(p.date)}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Pressable>

              {/* Edit and delete live behind one "more" button: sitting beside
                  the arrow on every row, one mis-tap could delete a kundli. */}
              <Pressable
                onClick={() => { haptic.tap(); setConfirmId(null); setMenuId(menuId === p.id ? null : p.id); }}
                aria-label={`More options for ${p.name}`}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground"
              >
                <MoreHorizontal className="h-[19px] w-[19px]" />
              </Pressable>
            </div>

            {menuId === p.id && confirmId !== p.id && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-4 py-2.5">
                <Pressable to={`/edit-chart/${p.id}`} subtle className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[12.5px] font-semibold">
                  <Pencil className="h-[14px] w-[14px]" /> {T.edit[L]}
                </Pressable>
                {p.id !== mine && (
                  <Pressable
                    onClick={() => { haptic.success(); setPrimary(p.id); invalidateProfiles(); setMenuId(null); bump((n) => n + 1); }}
                    subtle
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[12.5px] font-semibold"
                  >
                    <Star className="h-[14px] w-[14px]" /> {T.makeMine[L]}
                  </Pressable>
                )}
                <Pressable
                  onClick={() => { haptic.tap(); setConfirmId(p.id); }}
                  subtle
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold text-destructive"
                >
                  <Trash2 className="h-[14px] w-[14px]" /> {T.del[L]}
                </Pressable>
              </div>
            )}

            {confirmId === p.id && (
              <div className="border-t border-border bg-destructive/10 px-4 py-3">
                <p className="text-[13px] font-medium leading-snug">{T.confirm[L]}</p>
                <div className="mt-2.5 flex justify-end gap-2">
                  <Pressable onClick={() => { setConfirmId(null); setMenuId(null); }} subtle
                    className="inline-flex min-h-[44px] items-center rounded-full border border-border bg-card px-4 text-[13px] font-semibold">
                    {T.cancel[L]}
                  </Pressable>
                  <Pressable onClick={() => remove(p.id)} feedback="heavy" subtle
                    className="inline-flex min-h-[44px] items-center rounded-full bg-destructive px-4 text-[13px] font-bold text-white">
                    {T.del[L]}
                  </Pressable>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
