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

  // Clear our slots first so toggling off truly removes them.
  try {
    await LocalNotifications.cancel({ notifications: Object.values(ID).map((id) => ({ id })) });
  } catch { /* nothing scheduled yet */ }

  const notifications: any[] = [];

  if (prefs.daily) {
    notifications.push({
      id: ID.daily,
      title: "🕉️ Your daily guidance is ready",
      body: "Today's career, money, relationships & your best time — tap to read.",
      schedule: { on: { hour: prefs.dailyHour, minute: prefs.dailyMin }, repeats: true, allowWhileIdle: true },
      extra: { route: route(`/daily/${opts.chartId}`) },
    });
  }
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
