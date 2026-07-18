import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sparkles, MessageCircle } from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import AstrologerAvatar from '@/components/mobile/AstrologerAvatar';

/** One AI-astrologer persona as returned by GET /api/astrologers (display data). */
interface Astrologer {
  id: string;
  name: string;
  title: string;
  emoji: string;
  tint: string;
  expertise: string[];
  style: string;
  languages: string[];
  focusCategory: string;
  suggested: string[];
  disclaimer?: string;
}

export default function AstrologersPage() {
  const { chartId } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState<Astrologer[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Retry a few times — the serverless backend can cold-start after being idle,
    // so the first request may fail before it's warm.
    (async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const r = await fetch('/api/astrologers');
          if (r.ok) {
            const rows = await r.json();
            if (!cancelled) setList(Array.isArray(rows) ? rows : []);
            return;
          }
        } catch {
          /* network hiccup — retry */
        }
        await new Promise((res) => setTimeout(res, 900 * (attempt + 1)));
      }
      if (!cancelled) setFailed(true);
    })();
    return () => { cancelled = true; };
  }, []);

  if (failed) {
    return (
      <div className="m-card mt-6 p-6 text-center">
        <p className="text-[15px] font-bold">Couldn't load the astrologers</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Check your connection and try again.</p>
      </div>
    );
  }

  return (
    <div className="pt-2">
      {/* Intro — the "AI, not a person" note lives here ONCE instead of as a
          badge repeated on every card, which was both noisy and cramped. */}
      <div className="mb-5">
        <h1 className="text-[22px] font-bold leading-tight">Talk to an Astrologer</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Pick a specialist — each one reads your real kundli.
        </p>
        <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-[11.5px] font-semibold text-accent">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2.4} />
          AI astrologers · available any time
        </p>
      </div>

      {/* Loading skeletons */}
      {!list && (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-[80px]" />
          ))}
        </div>
      )}

      {/* Cards — clean, compact horizontal rows */}
      {list && (
        <div className="space-y-3">
          {list.map((a, i) => (
            <Pressable
              key={a.id}
              onClick={() => navigate(`/ask/${chartId}/${a.id}`)}
              feedback="medium"
              className="m-card m-enter flex w-full items-center gap-4 p-4 text-left"
              style={{ animationDelay: `${Math.min(i, 6) * 0.05}s` }}
            >
              {/* Illustrated portrait. No green "online" dot — these are AI
                  personas, and a presence light made them read as fake people. */}
              <div className="shrink-0">
                <AstrologerAvatar id={a.id} size={54} />
              </div>

              <div className="min-w-0 flex-1">
                {/* Names are no longer truncated — "Career Acharya" and
                    "Dhan Margdarshak" were being cut to "Career Ach…". */}
                <h2 className="text-[15.5px] font-bold leading-snug">{a.name}</h2>
                <p className="mt-0.5 text-[12px] font-semibold text-accent">{a.title}</p>
                {a.expertise?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {a.expertise.slice(0, 2).map((e) => (
                      <span key={e} className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                        {e}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Accent "Chat" affordance */}
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground shadow-md shadow-accent/25"
                aria-hidden
              >
                <MessageCircle className="h-[18px] w-[18px]" strokeWidth={2.3} />
              </span>
            </Pressable>
          ))}
        </div>
      )}
    </div>
  );
}
