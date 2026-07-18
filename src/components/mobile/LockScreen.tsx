import { useEffect, useState } from 'react';
import { Lock, Fingerprint } from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { authenticate } from '@/lib/biometric';
import { haptic } from '@/lib/native';
import Logo from '@/components/mobile/Logo';

/**
 * Full-screen gate shown when App Lock is on. Nothing behind it is rendered
 * until the OS confirms the user, so a shoulder-surfer or a borrowed phone
 * can't read someone's chart or chat history.
 */
export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const tryUnlock = async () => {
    if (busy) return;
    setBusy(true); setFailed(false);
    const ok = await authenticate('Unlock JanamJyot');
    setBusy(false);
    if (ok) { haptic.success(); onUnlock(); }
    else { haptic.error(); setFailed(true); }
  };

  // Prompt immediately — most users expect the sheet without an extra tap.
  useEffect(() => { void tryUnlock(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="app-shell bg-background text-foreground">
      <div className="flex min-h-full flex-col items-center justify-center px-8 text-center">
        <div className="mb-5 h-[68px] w-[68px] overflow-hidden rounded-3xl shadow-lg shadow-accent/25">
          <Logo size={68} />
        </div>
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-accent">
          <Lock className="h-6 w-6" />
        </span>
        <h1 className="text-[19px] font-bold">JanamJyot is locked</h1>
        <p className="mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-muted-foreground">
          {failed
            ? 'Could not verify you. Try again to open your kundlis.'
            : 'Unlock with your fingerprint or screen lock to continue.'}
        </p>
        <Pressable
          feedback="medium"
          onClick={tryUnlock}
          disabled={busy}
          className="mt-6 flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
        >
          <Fingerprint className="h-[18px] w-[18px]" />
          {busy ? 'Waiting…' : 'Unlock'}
        </Pressable>
      </div>
    </div>
  );
}
