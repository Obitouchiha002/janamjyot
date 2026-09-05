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
  daily: boolean;      // morning whole-day summary
  dailyHour: number;   // 0–23
  dailyMin: number;    // 0–59
  night: boolean;      // night "how was today" recap
  alert: boolean;      // real-time "this time isn't good" (Rahu Kaal) alert
  remedy: boolean;
  monthly: boolean;
  dasha: boolean;
}

const DEFAULTS: NotifPrefs = { daily: true, dailyHour: 8, dailyMin: 0, night: true, alert: true, remedy: false, monthly: true, dasha: true };

// Stable ids so re-scheduling replaces (never duplicates) each reminder.
const ID = { daily: 1001, remedy: 1002, monthly: 1003, dasha: 1004, window: 1005 };

// The daily experience is a queue of real, day-specific notifications, pre-filled
// with each day's computed content so they fire with the app closed and no
// network. Three reserved id blocks — the morning whole-day summary, the night
// "how was today" recap, and the Rahu-Kaal "this time isn't good" alert — one
// slot per day, 14 days out. The app re-tops-up the queue every launch.
const SPAN = 14;
const MORNING_BASE = 1100;
const NIGHT_BASE = 1120;
const RAHU_BASE = 1140;
const PLAN_IDS = [MORNING_BASE, NIGHT_BASE, RAHU_BASE].flatMap((base) =>
  Array.from({ length: SPAN }, (_, i) => base + i),
);

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
    await scheduleDayPlanQueue(opts.chartId, prefs, route);
  } else {
    // Daily turned off — tear the whole queue down.
    try { await LocalNotifications.cancel({ notifications: PLAN_IDS.map((id) => ({ id })) }); } catch { /* ignore */ }
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

type PlanDay = {
  date: string;
  name?: string | null;
  summary: string[];
  nightRecap: string;
  badWindows: Array<{ name: string; start: string; end: string; alert: string }>;
};

/** Parse "H:MM AM/PM" (the server's clock format) on a calendar date into a
 *  Date in the device's local zone — used to fire the Rahu-Kaal alert on time. */
function atOnDate(dateStr: string, hhmm: string): Date | null {
  const [y, m, dd] = dateStr.split("-").map(Number);
  const mt = /^(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(hhmm.trim());
  if (!mt || !y) return null;
  let h = Number(mt[1]);
  const min = Number(mt[2]);
  const ap = (mt[3] || "").toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  const d = new Date(y, m - 1, dd, h, min, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Fill the daily queue with the real whole-day plan — THREE personal, calculated
 * (no-AI) notifications per day, pre-scheduled 14 days out:
 *   • morning (chosen time) → the 3-4 line whole-day summary;
 *   • night (9:30 PM)       → "how was today" recap;
 *   • at Rahu Kaal start     → "this time isn't good, hold a bit".
 * Fetched in one batch from /day-plan/upcoming (deterministic server-side).
 *
 * Failure-safe: on a fetch failure (offline) we return WITHOUT touching the
 * existing queue, so a whole week of good notifications keeps firing rather than
 * going dark. The queue is only cancelled-and-replaced once fresh content is in.
 */
async function scheduleDayPlanQueue(
  chartId: string,
  prefs: NotifPrefs,
  route: (r: string) => string,
): Promise<void> {
  let plans: PlanDay[] = [];
  try {
    const r = await fetch(
      `/api/chart/${chartId}/day-plan/upcoming?days=${SPAN}&lang=${encodeURIComponent(getLang())}`,
    );
    const j = await r.json();
    if (j?.error || !Array.isArray(j)) return; // leave the existing queue intact
    plans = j;
  } catch {
    return; // offline — do not wipe what's already scheduled
  }
  if (!plans.length) return;

  const first = (name?: string | null) => (name ? name.trim().split(/\s+/)[0] : "");
  const now = Date.now();
  const notifications: any[] = [];

  plans.slice(0, SPAN).forEach((p, i) => {
    if (!p?.date) return;
    const [y, m, dd] = p.date.split("-").map(Number);
    const fn = first(p.name);
    const greet = fn ? fn + ", " : "";

    // 🌅 morning whole-day summary, at the user's chosen time
    const morning = new Date(y, m - 1, dd, prefs.dailyHour, prefs.dailyMin, 0, 0);
    if (morning.getTime() > now && p.summary?.length) {
      notifications.push({
        id: MORNING_BASE + i,
        title: `☀️ ${greet}aaj ka din`.trim(),
        body: p.summary.join("\n"),
        schedule: { at: morning, allowWhileIdle: true },
        extra: { route: route(`/daily/${chartId}`) },
      });
    }
    // 🌙 night recap
    if (prefs.night && p.nightRecap) {
      const night = new Date(y, m - 1, dd, 21, 30, 0, 0);
      if (night.getTime() > now) {
        notifications.push({
          id: NIGHT_BASE + i,
          title: `🌙 ${greet}aaj ka din kaisa tha`.trim(),
          body: p.nightRecap,
          schedule: { at: night, allowWhileIdle: true },
          extra: { route: route(`/daily/${chartId}`) },
        });
      }
    }
    // ⏰ real-time "this time isn't good" alert, at Rahu Kaal start
    if (prefs.alert && p.badWindows?.length) {
      const bw = p.badWindows[0];
      const at = atOnDate(p.date, bw.start);
      if (at && at.getTime() > now) {
        notifications.push({
          id: RAHU_BASE + i,
          title: `⏰ ${greet}dhyan`.trim(),
          body: bw.alert,
          schedule: { at, allowWhileIdle: true },
          extra: { route: route(`/right-now/${chartId}`) },
        });
      }
    }
  });

  // Swap: clear the three blocks, then schedule the fresh set.
  try { await LocalNotifications.cancel({ notifications: PLAN_IDS.map((id) => ({ id })) }); } catch { /* ignore */ }
  if (!notifications.length) return;
  try {
    await LocalNotifications.schedule({ notifications });
  } catch { /* ignore */ }
}
