/**
 * The decision diary.
 *
 * Every decision they worked through, what was advised, and — where they told
 * us — how it actually went. This is the part that cannot be copied by a chat
 * that forgets you: after a dozen entries it is a record of how this person
 * decides, in their own words.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Pressable } from '@/components/mobile/Pressable';

const TINT: Record<string, string> = { yes: '#16A34A', wait: '#B7791F', no: '#DC2626' };
const OUTCOME: Record<string, string> = {
  went_well: 'Went well',
  went_badly: "Didn't go well",
  no_reply: 'No reply',
  did_not_do: "Didn't do it",
  still_waiting: 'Still waiting',
};

export default function DecideHistoryPage() {
  const t = useT();
  const nav = useNavigate();
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    fetch('/api/decide/history')
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d.decisions) ? d.decisions : []))
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="space-y-4 pt-1">
      <div className="flex items-center gap-2">
        <Pressable onClick={() => nav(-1)} subtle className="tap-44 -ml-2 grid h-10 w-10 place-items-center rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Pressable>
        <h1 className="text-[19px] font-bold tracking-tight">{t('Past decisions')}</h1>
      </div>

      {rows === null && <div className="space-y-2.5"><div className="skeleton h-[64px]" /><div className="skeleton h-[64px] opacity-60" /></div>}

      {rows?.length === 0 && (
        <Pressable to="/decide" className="m-card flex w-full flex-col items-center gap-2 border-dashed px-5 py-8 text-center">
          <Sparkles className="h-7 w-7 text-accent" />
          <p className="text-[14px] font-semibold">{t('Nothing here yet')}</p>
          <p className="text-[12.5px] text-muted-foreground">{t('Every decision you work through is saved here.')}</p>
        </Pressable>
      )}

      <div className="space-y-2.5">
        {rows?.map((d) => (
          <div key={d.id} className="m-card border-l-4 p-4" style={{ borderLeftColor: TINT[d.verdict] ?? '#B7791F' }}>
            <p className="text-[14.5px] font-semibold leading-snug">{d.question}</p>
            <p className="mt-1 text-[13.5px] leading-snug text-foreground/80">{d.headline}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] font-semibold">
              <span className="rounded-full px-2.5 py-1 text-white" style={{ background: TINT[d.verdict] ?? '#B7791F' }}>
                {t(d.verdict === 'yes' ? 'Yes' : d.verdict === 'no' ? 'No' : 'Wait')}
              </span>
              {d.outcome && (
                <span className="rounded-full border-2 border-border px-2.5 py-1 text-muted-foreground">
                  {t(OUTCOME[d.outcome] ?? d.outcome)}
                </span>
              )}
              <span className="text-muted-foreground">{String(d.created_at).slice(0, 10)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
