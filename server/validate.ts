/**
 * Input validation for birth details + datetime helpers.
 *
 * Date rule (per spec): date_of_birth MUST be ISO `YYYY-MM-DD`. We never accept
 * ambiguous DD-MM-YYYY / MM-DD-YYYY here; the frontend sends ISO.
 */

export interface BirthInput {
  name: string;
  date_of_birth: string;
  time_of_birth: string;
  place_of_birth: string;
  latitude: number;
  longitude: number;
  timezone: string;
  gender?: string;
  language: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  value?: BirthInput;
}

const SUPPORTED_LANGUAGES = ["en", "hi", "hinglish", "ta", "ml"];

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function validateBirthInput(body: any): ValidationResult {
  const errors: string[] = [];
  const b = body ?? {};

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) errors.push("name is required");

  const date_of_birth = typeof b.date_of_birth === "string" ? b.date_of_birth.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date_of_birth)) {
    errors.push("date_of_birth must be ISO format YYYY-MM-DD (e.g. 1984-11-10)");
  } else {
    const [y, mo, d] = date_of_birth.split("-").map(Number);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) errors.push("date_of_birth has an invalid month/day");
    if (y < 1800 || y > 2200) errors.push("date_of_birth year is out of range");
  }

  const time_of_birth = typeof b.time_of_birth === "string" ? b.time_of_birth.trim() : "";
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time_of_birth)) {
    errors.push("time_of_birth must be HH:MM (24-hour, e.g. 06:40)");
  }

  const place_of_birth = typeof b.place_of_birth === "string" ? b.place_of_birth.trim() : "";
  if (!place_of_birth) errors.push("place_of_birth is required");

  const latitude = Number(b.latitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    errors.push("latitude must be a number between -90 and 90");
  }

  const longitude = Number(b.longitude);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    errors.push("longitude must be a number between -180 and 180");
  }

  const timezone = typeof b.timezone === "string" ? b.timezone.trim() : "";
  if (!timezone || !isValidTimeZone(timezone)) {
    errors.push("timezone must be a valid IANA timezone (e.g. Asia/Kolkata)");
  }

  const gender = typeof b.gender === "string" ? b.gender.trim() : undefined;

  let language = typeof b.language === "string" ? b.language.trim().toLowerCase() : "en";
  if (!SUPPORTED_LANGUAGES.includes(language)) language = "en";

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      name,
      date_of_birth,
      time_of_birth: time_of_birth.length === 5 ? `${time_of_birth}:00` : time_of_birth,
      place_of_birth,
      latitude,
      longitude,
      timezone,
      gender,
      language,
    },
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** UTC offset (e.g. "+05:30") for an IANA timezone at a given instant. */
function tzOffset(instant: Date, timeZone: string): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).format(instant);
  const m = formatted.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return "+00:00";
  const sign = m[1];
  const hh = pad(Number(m[2]));
  const mm = m[3] ?? "00";
  return `${sign}${hh}:${mm}`;
}

/**
 * Builds an ISO-8601 datetime string WITH timezone offset, as required by
 * Prokerala — e.g. ("1984-11-10", "06:40:00", "Asia/Kolkata") ->
 * "1984-11-10T06:40:00+05:30".
 */
export function buildIsoDatetime(
  dateStr: string,
  timeStr: string,
  timeZone: string
): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi, s] = timeStr.split(":").map(Number);
  // Approximate the instant by treating the wall clock as UTC; good enough to
  // resolve the zone's offset (offset is stable within a given day).
  const approx = new Date(Date.UTC(y, mo - 1, d, h, mi, s || 0));
  const offset = tzOffset(approx, timeZone);
  return `${dateStr}T${pad(h)}:${pad(mi)}:${pad(s || 0)}${offset}`;
}
