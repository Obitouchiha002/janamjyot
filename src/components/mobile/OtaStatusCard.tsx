/**
 * Why the update did or did not arrive — on the phone, in plain sight.
 *
 * "OTA kaam nahi karta" was impossible to answer: every branch of the check
 * ended in a silent return, so there was no difference between "you are
 * already current", "the download failed", "this build was rolled back here
 * before" and "the plugin is not in this APK". This shows the build running,
 * the build the server is publishing, and what the last check concluded — and
 * lets you run one on the spot.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ArrowUpCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { haptic } from '@/lib/native';
import { WEB_BUILD, lastOtaStatus, checkWebUpdate, applyWebUpdate, type OtaStatus } from '@/lib/ota';

/** The stages worth calling out, in words rather than slugs. */
const SAY: Record<string, string> = {
  'already-current': 'You are on the newest build',
  'ready-to-apply': 'Downloaded — restart to apply',
  applied: 'The newest build is running',
  applying: 'Restarting into the new build…',
  downloading: 'Downloading…',
  'no-bundle-published': 'No bundle published yet',
  'rollout-paused': 'Roll-out is paused on the server',
  'needs-newer-apk': 'Needs a newer APK first',
  'skipped-failed-here-before': 'That build failed on this phone; waiting for a newer one',
  'rolled-back': 'The last build never started; rolled back',
  'plugin-missing': 'This APK has no updater — install the latest APK',
  failed: 'The check failed',
  'apply-failed': 'Could not restart into the new build',
};

const good = new Set(['already-current', 'applied', 'ready-to-apply', 'downloading', 'applying']);

export default function OtaStatusCard() {
  const [status, setStatus] = useState<OtaStatus | null>(lastOtaStatus());
  const [remote, setRemote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const readServer = useCallback(() => {
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => setRemote(c?.app?.web?.build ? String(c.app.web.build) : null))
      .catch(() => {});
  }, []);

  useEffect(readServer, [readServer]);

  const check = async () => {
    haptic.tap();
    setBusy(true);
    await checkWebUpdate(true);
    setStatus(lastOtaStatus());
    readServer();
    setBusy(false);
  };

  const ready = status?.stage === 'ready-to-apply';
  const Icon = !status ? RefreshCw : good.has(status.stage) ? CheckCircle2 : AlertTriangle;
  const tint = !status ? 'text-muted-foreground' : good.has(status.stage) ? 'text-emerald-600' : 'text-amber-600';

  return (
    <section className="m-card m-enter p-5">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 shrink-0 ${tint}`}><Icon className="h-[19px] w-[19px]" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold leading-tight">App update</h3>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
            {status ? (SAY[status.stage] ?? status.stage) : 'No check has run on this phone yet.'}
            {status?.detail ? ` — ${status.detail}` : ''}
          </p>
        </div>
      </div>

      <dl className="mt-3.5 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-muted px-3 py-2">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Running</dt>
          <dd className="mt-0.5 truncate text-[13px] font-bold tabular-nums">{WEB_BUILD}</dd>
        </div>
        <div className="rounded-xl bg-muted px-3 py-2">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Published</dt>
          <dd className="mt-0.5 truncate text-[13px] font-bold tabular-nums">{remote ?? '—'}</dd>
        </div>
      </dl>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={check}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border py-2.5 text-[13.5px] font-bold disabled:opacity-60"
        >
          <RefreshCw className={`h-[15px] w-[15px] ${busy ? 'animate-spin' : ''}`} /> Check now
        </button>
        {ready && (
          <button
            type="button"
            onClick={() => { haptic.medium(); void applyWebUpdate(); }}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent py-2.5 text-[13.5px] font-bold text-accent-foreground shadow-sm shadow-accent/25"
          >
            <ArrowUpCircle className="h-[15px] w-[15px]" /> Restart into it
          </button>
        )}
      </div>

      {status?.at && (
        <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
          Last checked {new Date(status.at).toLocaleString()}
        </p>
      )}
    </section>
  );
}
