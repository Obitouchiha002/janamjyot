/**
 * Feedback / rating flow — state + triggering.
 *
 * A single premium sheet (see `components/mobile/FeedbackSheet.tsx`) asks for a
 * 5-star rating + a short comment after a service completes smoothly. The rules
 * the user asked for:
 *   • Never nag: once the user has given feedback (or tapped "Never"), the
 *     automatic prompt never shows again.
 *   • "Later" defers it — it may reappear at most once per day, and never twice
 *     in the same app session.
 *   • It only auto-appears when a service finished WITHOUT an error (the caller
 *     decides that, e.g. after a chart generates).
 * A positive rating (4-5★) with a real comment is auto-published to the website
 * testimonials by the backend; the admin can still moderate it afterwards.
 */

const KEY = 'jj:feedback';
const DEVICE_KEY = 'va_device'; // shared with auth.tsx

export type FeedbackStatus = 'pending' | 'later' | 'given' | 'never';

export interface FeedbackState {
  status: FeedbackStatus;
  lastShown?: string; // YYYY-MM-DD of the last automatic prompt
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getFeedbackState(): FeedbackState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as FeedbackState;
  } catch { /* ignore */ }
  return { status: 'pending' };
}

function saveState(s: FeedbackState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function deviceId(): string {
  try { return localStorage.getItem(DEVICE_KEY) || 'dev_anon'; } catch { return 'dev_anon'; }
}

// Guard so we never pop the sheet twice inside one session.
let shownThisSession = false;

/**
 * Ask to show the feedback sheet after a smooth, error-free service.
 * Returns true if the request was accepted (the sheet will open).
 * `context` is a short tag stored with the feedback (e.g. "chart", "report").
 */
export function requestFeedback(context: string): boolean {
  if (typeof window === 'undefined') return false;
  const s = getFeedbackState();
  if (s.status === 'given' || s.status === 'never') return false;
  if (shownThisSession) return false;
  // In the "later" state, show at most once per day.
  if (s.status === 'later' && s.lastShown === today()) return false;

  shownThisSession = true;
  saveState({ ...s, lastShown: today() });
  window.dispatchEvent(new CustomEvent('jj-feedback', { detail: { context } }));
  return true;
}

/** Force the sheet open from a manual entry (Settings / More). Always shows. */
export function openFeedback(context = 'manual'): void {
  if (typeof window === 'undefined') return;
  shownThisSession = true;
  window.dispatchEvent(new CustomEvent('jj-feedback', { detail: { context, manual: true } }));
}

/** Persist a submitted rating; positive ones get auto-published server-side. */
export async function submitFeedback(args: {
  rating: number;
  comment?: string;
  context?: string;
  name?: string;
}): Promise<{ published: boolean }> {
  saveState({ status: 'given', lastShown: today() });
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rating: args.rating,
        comment: args.comment ?? '',
        context: args.context ?? null,
        name: args.name ?? null,
        deviceId: deviceId(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    return { published: !!data?.published };
  } catch {
    return { published: false };
  }
}

/** User tapped "Later" — defer; may reappear once tomorrow. */
export function markLater(): void {
  const s = getFeedbackState();
  saveState({ status: 'later', lastShown: today() });
  void s;
}

/** User tapped "Never" — never prompt again. */
export function markNever(): void {
  saveState({ status: 'never', lastShown: today() });
}
