/**
 * "Should I do this right now?"
 *
 * The everyday question people actually have — before a call, a purchase, an
 * interview, leaving the house. Answered from the panchang we already compute,
 * with NO AI call: it must be instant and identical every time you check, which
 * a language model can't promise.
 *
 * Verdict comes from three real signals, in priority order:
 *   1. Rahu Kaal / Yamaganda / Gulika — the classic "don't start now" windows
 *   2. The current choghadiya (Amrit/Shubh/Labh good, Rog/Kaal/Udveg bad)
 *   3. What the activity is (some are more sensitive to a bad window)
 */

export type Verdict = "go" | "wait" | "avoid";

export interface RightNowResult {
  verdict: Verdict;
  headline: string;
  reason: string;
  now: string;
  current: { name: string; quality: string; ends: string } | null;
  blocking: { name: string; start: string; end: string } | null;
  next_good: { name: string; start: string; end: string } | null;
  activity: string;
  tip: string;
}

/** Activities we tailor the wording for. */
export const ACTIVITIES: Record<string, { label: string; strict: boolean; tip: string }> = {
  general:  { label: "this",              strict: false, tip: "Small routine things are fine in most windows." },
  meeting:  { label: "a meeting",         strict: false, tip: "Aim for a Shubh or Labh window for talks that matter." },
  money:    { label: "a payment or purchase", strict: true,  tip: "Money decisions are worth waiting for a clean window." },
  travel:   { label: "starting travel",   strict: true,  tip: "For journeys, avoid Rahu Kaal even if you're running late." },
  interview:{ label: "an interview or exam", strict: true, tip: "Amrit and Shubh windows suit anything you're judged in." },
  call:     { label: "an important call", strict: false, tip: "A Labh window helps conversations that need a yes." },
  newwork:  { label: "starting new work", strict: true,  tip: "New beginnings deserve the best window you can wait for." },
  health:   { label: "a medical visit",   strict: false, tip: "Routine care is fine; elective procedures prefer Amrit/Shubh." },
};

const toMin = (hhmm: string): number => {
  // Accepts "09:41" and "09:41 AM"
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(hhmm).trim());
  if (!m) return -1;
  let h = Number(m[1]);
  const mins = Number(m[2]);
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + mins;
};

/** Is `now` inside [start,end)? Handles windows that cross midnight. */
function within(nowMin: number, start: string, end: string): boolean {
  const s = toMin(start), e = toMin(end);
  if (s < 0 || e < 0) return false;
  return s <= e ? nowMin >= s && nowMin < e : nowMin >= s || nowMin < e;
}

function fmt(mins: number): string {
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

export function buildRightNow(panchang: any, nowHHMM: string, activityKey: string): RightNowResult {
  const activity = ACTIVITIES[activityKey] ? activityKey : "general";
  const act = ACTIVITIES[activity];
  const nowMin = toMin(nowHHMM);

  const slots: any[] = [
    ...(panchang.day_choghadiya ?? []),
    ...(panchang.night_choghadiya ?? []),
  ];

  const current = slots.find((s) => within(nowMin, s.start, s.end)) ?? null;

  // A blocking period beats a good choghadiya — these are the windows people
  // are actually told to avoid starting anything in.
  const blocks = [
    ["Rahu Kaal", panchang.periods?.rahu_kaal],
    ["Yamaganda", panchang.periods?.yamaganda],
    ["Gulika", panchang.periods?.gulika],
  ] as const;
  let blocking: RightNowResult["blocking"] = null;
  for (const [name, p] of blocks) {
    if (p?.start && p?.end && within(nowMin, p.start, p.end)) {
      blocking = { name, start: p.start, end: p.end };
      break;
    }
  }

  // Next good choghadiya starting from now (today, then tonight).
  const nextGood = slots
    .filter((s) => s.quality === "good" && toMin(s.start) > nowMin)
    .sort((a, b) => toMin(a.start) - toMin(b.start))[0] ?? null;

  let verdict: Verdict;
  let reason: string;

  if (blocking) {
    verdict = act.strict ? "avoid" : "wait";
    reason = `${blocking.name} is running until ${blocking.end}. Traditionally nothing new is started in this window.`;
  } else if (current?.quality === "good") {
    verdict = "go";
    reason = `${current.name} is running until ${current.end} — one of the favourable choghadiya windows.`;
  } else if (current?.quality === "bad") {
    verdict = act.strict ? "avoid" : "wait";
    reason = `${current.name} is running until ${current.end}, which is not considered a supportive window.`;
  } else if (current) {
    verdict = act.strict ? "wait" : "go";
    reason = `${current.name} is a neutral window until ${current.end} — fine for routine things.`;
  } else {
    verdict = "go";
    reason = "No inauspicious period is running right now.";
  }

  const headline =
    verdict === "go" ? "Yes — go ahead"
    : verdict === "wait" ? "Better to wait a bit"
    : "Avoid starting now";

  return {
    verdict,
    headline,
    reason,
    now: nowMin >= 0 ? fmt(nowMin) : nowHHMM,
    current: current ? { name: current.name, quality: current.quality, ends: current.end } : null,
    blocking,
    next_good: nextGood ? { name: nextGood.name, start: nextGood.start, end: nextGood.end } : null,
    activity,
    tip: act.tip,
  };
}
