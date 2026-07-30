/**
 * Local scheduled notifications (on-device, no server / FCM needed).
 *
 * v1 covers the retention hooks that can be scheduled without a push server:
 *   • Daily guidance   — repeats every day at the user's chosen time
 *   • Remedy reminder  — repeats every evening
 *   • Monthly forecast — repeats on the 1st of each month
 *   • Dasha change     — a one-off alert when the current antardasha ends
 *
 * Each notification carries an `extra.route` so tapping it deep-links into the
 * right screen (handled in App.tsx). Server-pushed transit/dasha alerts (FCM)
 * are a later step — this ships value today with zero external setup.
 */
import { LocalNotifications } from "@capacitor/local-notifications";
import { isNative } from "./native";
import { getLang } from "./prefs";

const PREF_KEY = "jj:notif";

export interface NotifPrefs {
  daily: boolean;
  dailyHour: number;   // 0–23
  dailyMin: number;    // 0–59
  remedy: boolean;
  monthly: boolean;
  dasha: boolean;
}

const DEFAULTS: NotifPrefs = { daily: true, dailyHour: 8, dailyMin: 0, remedy: false, monthly: true, dasha: true };

// Stable ids so re-scheduling replaces (never duplicates) each reminder.
const ID = { daily: 1001, remedy: 1002, monthly: 1003, dasha: 1004, window: 1005 };

// The daily message is not one repeating reminder any more — it is a queue of
// real, day-specific predictions. Each day gets its own one-off notification in
// this reserved id block, pre-filled with that day's computed line so it fires
// with the app closed and no network. The app re-tops-up the queue every launch.
const DAILY_BASE = 1100;
const DAILY_SPAN = 14; // days pre-scheduled; the server caps the batch at 14 too
const DAILY_IDS = Array.from({ length: DAILY_SPAN }, (_, i) => DAILY_BASE + i);

/**
 * One-off "ping me when the good window opens", used by Right Now.
 *
 * Reuses a single id on purpose: asking for a second reminder replaces the
 * first rather than stacking buzzes the user never asked for.
 */
export async function remindAt(
  at: Date,
  opts: { title: string; body: string; route?: string },
): Promise<boolean> {
  if (!isNative) return false;
  if (at.getTime() <= Date.now()) return false;
  if (!(await ensureNotifPermission())) return false;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: ID.window }] });
    await LocalNotifications.schedule({
      notifications: [{
        id: ID.window,
        title: opts.title,
        body: opts.body,
        schedule: { at, allowWhileIdle: true },
        extra: opts.route ? { route: opts.route } : undefined,
      }],
    });
    return true;
  } catch {
    return false;
  }
}

export function getNotifPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveNotifPrefs(p: NotifPrefs) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

/** Ask for the OS notification permission. Returns true if granted. */
export async function ensureNotifPermission(): Promise<boolean> {
  if (!isNative) return false;
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== "granted") p = await LocalNotifications.requestPermissions();
    return p.display === "granted";
  } catch {
    return false;
  }
}

/**
 * (Re)schedule all reminders from the current prefs. Call after prefs change and
 * on app start. `dasha` (current antardasha + its end ISO date) enables the
 * one-off dasha-change alert.
 */
export async function applyNotifications(opts: {
  chartId?: string;
  dasha?: { antardasha?: string; end?: string } | null;
} = {}): Promise<void> {
  if (!isNative) return;
  const prefs = getNotifPrefs();
  const route = (r: string) => (opts.chartId ? r : "/");

  // Clear our fixed slots first so toggling off truly removes them. The daily
  // QUEUE (below) is handled separately: we only clear it once we have fresh
  // content to replace it with, so a transient offline failure never wipes a
  // week of good notifications and leaves the user with silence.
  try {
    await LocalNotifications.cancel({ notifications: Object.values(ID).map((id) => ({ id })) });
  } catch { /* nothing scheduled yet */ }

  if (prefs.daily && opts.chartId) {
    await scheduleDailyQueue(opts.chartId, prefs, route);
  } else {
    // Daily turned off — tear the whole queue down.
    try { await LocalNotifications.cancel({ notifications: DAILY_IDS.map((id) => ({ id })) }); } catch { /* ignore */ }
  }

  const notifications: any[] = [];
  if (prefs.remedy) {
    notifications.push({
      id: ID.remedy,
      title: "🪔 Remedy reminder",
      body: "A small daily upaay keeps the momentum going. Tap to see yours.",
      schedule: { on: { hour: 19, minute: 0 }, repeats: true, allowWhileIdle: true },
      extra: { route: route(`/chart/${opts.chartId}/remedies`) },
    });
  }
  if (prefs.monthly) {
    notifications.push({
      id: ID.monthly,
      title: "🌙 Your month ahead",
      body: "A new month begins — see what the stars hold for you.",
      schedule: { on: { day: 1, hour: 9, minute: 0 }, repeats: true, allowWhileIdle: true },
      extra: { route: route(`/daily/${opts.chartId}`) },
    });
  }
  if (prefs.dasha && opts.dasha?.end) {
    const at = new Date(opts.dasha.end);
    if (!isNaN(at.getTime()) && at.getTime() > Date.now()) {
      notifications.push({
        id: ID.dasha,
        title: "🔮 Your Dasha is changing",
        body: `Your ${opts.dasha.antardasha || "current"} sub-period is ending — a new phase begins.`,
        schedule: { at, allowWhileIdle: true },
        extra: { route: route(`/chart/${opts.chartId}/dasha`) },
      });
    }
  }

  if (notifications.length) {
    try { await LocalNotifications.schedule({ notifications }); } catch { /* ignore */ }
  }
}

type DaySig = { date: string; short: string; tone: "good" | "advice" | "warn"; name?: string | null };

/**
 * Fill the daily queue with real, day-specific lines.
 *
 * Fetches the coming ~2 weeks of computed day-signals in one call (deterministic
 * server-side, no AI), then schedules one notification per day AT the user's
 * chosen hour with that day's actual message as the body. The whole point is
 * that the 8 AM buzz already contains the prediction — the user gets value
 * without opening the app, which a generic "your guidance is ready" never did.
 *
 * Failure-safe: if the fetch fails (offline), we return WITHOUT touching the
 * existing queue, so yesterday's fetched week keeps firing rather than going
 * dark. The queue is only cancelled-and-replaced once fresh content is in hand.
 */
async function scheduleDailyQueue(
  chartId: string,
  prefs: NotifPrefs,
  route: (r: string) => string,
): Promise<void> {
  let days: DaySig[] = [];
  try {
    const r = await fetch(
      `/api/chart/${chartId}/day-signals/upcoming?days=${DAILY_SPAN}&lang=${encodeURIComponent(getLang())}`,
    );
    const j = await r.json();
    if (j?.error || !Array.isArray(j?.days)) return; // leave the existing queue intact
    days = j.days;
  } catch {
    return; // offline — do not wipe what's already scheduled
  }
  if (!days.length) return;

  const icon = (t: DaySig["tone"]) => (t === "warn" ? "⚠️" : t === "good" ? "☀️" : "🕉️");
  const first = (name?: string | null) => (name ? name.trim().split(/\s+/)[0] : "");

  const now = Date.now();
  const notifications = days.slice(0, DAILY_SPAN).map((d, i) => {
    // Fire at the chosen time on that calendar date, in the DEVICE's local zone
    // (which is the user's zone in practice). Date-only string → no tz parsing.
    const [y, m, dd] = d.date.split("-").map(Number);
    const at = new Date(y, m - 1, dd, prefs.dailyHour, prefs.dailyMin, 0, 0);
    return {
      id: DAILY_BASE + i,
      at,
      title: `${icon(d.tone)} ${first(d.name) ? first(d.name) + ", " : ""}aaj ka din`.trim(),
      body: d.short,
      route: route(`/daily/${chartId}`),
    };
  }).filter((n) => n.at.getTime() > now); // today's slot may already be past

  // Swap atomically-ish: clear the block, then schedule the fresh set.
  try { await LocalNotifications.cancel({ notifications: DAILY_IDS.map((id) => ({ id })) }); } catch { /* ignore */ }
  if (!notifications.length) return;
  try {
    await LocalNotifications.schedule({
      notifications: notifications.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: n.at, allowWhileIdle: true },
        extra: { route: n.route },
      })),
    });
  } catch { /* ignore */ }
}
