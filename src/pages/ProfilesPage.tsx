import { useEffect, useState } from 'react';
import { User, Trash2, Plus, ChevronRight, Sparkles, Pencil } from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { haptic } from '@/lib/native';
import { invalidateProfiles } from '@/pages/HomePage';

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<any[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => r.json())
      .then((d) => setProfiles(Array.isArray(d) ? d : []))
      .catch(() => setProfiles([]));
  }, []);

  const remove = async (id: string) => {
    haptic.warning();
    const before = profiles ?? [];
    setProfiles(before.filter((x) => x.id !== id));
    setConfirmId(null);
    try {
      const r = await fetch(`/api/profiles/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(String(r.status));
      invalidateProfiles();
    } catch {
      // Put the row back rather than let the UI claim a delete that didn't
      // happen — it used to reappear on the next visit with no explanation.
      setProfiles(before);
      setError("Couldn't delete that kundli. Check your connection and try again.");
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
        New Kundli
      </Pressable>

      {error && (
        <p className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-[12.5px] leading-relaxed text-red-300">
          {error}
        </p>
      )}

      {profiles === null && (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[74px]" style={{ opacity: 1 - i * 0.25 }} />
          ))}
        </div>
      )}

      {/* Tappable, not a dead end — this is a whole bottom-nav tab, and for a
          new user it is the first thing they find in it. */}
      {profiles?.length === 0 && (
        <Pressable
          to="/create-chart"
          feedback="medium"
          className="m-card flex w-full flex-col items-center gap-2 px-6 py-14 text-center"
        >
          <Sparkles className="h-8 w-8 text-accent" />
          <span className="text-[15px] font-bold">No kundlis yet</span>
          <span className="text-[13px] leading-relaxed text-muted-foreground">
            Enter your date, time and place of birth to create your first kundli.
          </span>
          <span className="mt-3 rounded-full bg-accent px-5 py-2.5 text-[13.5px] font-bold text-accent-foreground">
            Create my Kundli
          </span>
        </Pressable>
      )}

      <div className="space-y-2.5">
        {profiles?.map((p, i) => (
          <div
            key={p.id}
            className="m-card m-enter overflow-hidden"
            style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}
          >
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Pressable
                to={`/dashboard/${p.id}`}
                subtle
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                  <User className="h-[22px] w-[22px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] font-bold">{p.name}</span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">
                    {p.date}
                    {p.time ? ` · ${p.time}` : ''}
                    {p.place ? ` · ${p.place}` : ''}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Pressable>

              {/* Editing matters more than it looks: a wrong AM/PM moves the
                  Lagna by half a zodiac, and the only fix used to be deleting
                  the kundli and typing everything again. */}
              <Pressable
                to={`/edit-chart/${p.id}`}
                aria-label={`Edit ${p.name}`}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground"
              >
                <Pencil className="h-[17px] w-[17px]" />
              </Pressable>

              <Pressable
                onClick={() => { haptic.tap(); setConfirmId(confirmId === p.id ? null : p.id); }}
                aria-label={`Delete ${p.name}`}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground"
              >
                <Trash2 className="h-[18px] w-[18px]" />
              </Pressable>
            </div>

            {/* Inline confirm — cheaper than a modal and keeps the row in view. */}
            {confirmId === p.id && (
              <div className="flex items-center gap-2 border-t border-border bg-destructive/10 px-4 py-3">
                <p className="flex-1 text-[13px] font-medium">Delete this kundli?</p>
                <Pressable
                  onClick={() => setConfirmId(null)}
                  subtle
                  className="inline-flex min-h-[44px] items-center rounded-full border border-border px-4 text-[13px] font-semibold"
                >
                  Cancel
                </Pressable>
                <Pressable
                  onClick={() => remove(p.id)}
                  feedback="heavy"
                  subtle
                  className="inline-flex min-h-[44px] items-center rounded-full bg-destructive px-4 text-[13px] font-bold text-white"
                >
                  Delete
                </Pressable>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
