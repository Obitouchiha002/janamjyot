import { useEffect, useState } from 'react';
import { User, Trash2, Plus, ChevronRight, Sparkles } from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { haptic } from '@/lib/native';

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<any[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => r.json())
      .then((d) => setProfiles(Array.isArray(d) ? d : []))
      .catch(() => setProfiles([]));
  }, []);

  const remove = async (id: string) => {
    haptic.warning();
    setProfiles((p) => (p ?? []).filter((x) => x.id !== id));
    setConfirmId(null);
    try {
      await fetch(`/api/profiles/${id}`, { method: 'DELETE' });
    } catch { /* the list refreshes on next visit */ }
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

      {profiles === null && (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[74px]" style={{ opacity: 1 - i * 0.25 }} />
          ))}
        </div>
      )}

      {profiles?.length === 0 && (
        <div className="m-card flex flex-col items-center gap-2 px-6 py-14 text-center">
          <Sparkles className="h-8 w-8 text-accent" />
          <p className="text-[15px] font-bold">No kundlis yet</p>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Enter your date, time and place of birth to create your first kundli.
          </p>
        </div>
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
                  className="rounded-full border border-border px-4 py-1.5 text-[13px] font-semibold"
                >
                  Cancel
                </Pressable>
                <Pressable
                  onClick={() => remove(p.id)}
                  feedback="heavy"
                  subtle
                  className="rounded-full bg-destructive px-4 py-1.5 text-[13px] font-bold text-white"
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
