/**
 * Prokerala Astrology API client (server-side only).
 *
 * Security: PROKERALA_CLIENT_ID / PROKERALA_CLIENT_SECRET are read from the
 * process environment and never leave the server. The browser only ever talks
 * to our own /api/* routes, which call into this module.
 *
 * Auth: OAuth2 Client Credentials. The access token is cached in memory until
 * shortly before it expires, then transparently refreshed.
 */

const TOKEN_ENDPOINT = "https://api.prokerala.com/token";
const BASE_URI = "https://api.prokerala.com/v2";

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cached: CachedToken | null = null;
// De-duplicate concurrent refreshes so we never request two tokens at once.
let inflight: Promise<string> | null = null;

function requireCredentials(): { id: string; secret: string } {
  // .trim() guards against accidental spaces in .env.local values.
  const id = process.env.PROKERALA_CLIENT_ID?.trim();
  const secret = process.env.PROKERALA_CLIENT_SECRET?.trim();
  if (!id || !secret) {
    throw new Error(
      "Prokerala credentials missing: set PROKERALA_CLIENT_ID and PROKERALA_CLIENT_SECRET in .env.local"
    );
  }
  return { id, secret };
}

/**
 * Returns a valid Prokerala access token, fetching a new one only when the
 * cache is empty or within 60s of expiry.
 */
export async function getProkeralaAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && now < cached.expiresAt - 60_000) {
    return cached.accessToken;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const { id, secret } = requireCredentials();
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
    });

    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Prokerala token request failed (${res.status}): ${text.slice(0, 300)}`
      );
    }

    const json: any = await res.json();
    if (!json.access_token) {
      throw new Error("Prokerala token response did not contain access_token");
    }
    const expiresInSec = Number(json.expires_in) || 3600;
    cached = {
      accessToken: json.access_token,
      expiresAt: Date.now() + expiresInSec * 1000,
    };
    return cached.accessToken;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * Low-level GET against a Prokerala v2 astrology endpoint. Automatically
 * attaches the bearer token, and retries once on a 401 (expired token).
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function prokeralaGet(
  slug: string,
  params: Record<string, string | number | undefined>,
  opts: { authRetry?: boolean; rateRetriesLeft?: number } = {}
): Promise<any> {
  const { authRetry = true, rateRetriesLeft = 3 } = opts;
  const token = await getProkeralaAccessToken();
  const url = new URL(BASE_URI + slug);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (res.status === 401 && authRetry) {
    // Token rejected — force a refresh and try once more.
    cached = null;
    return prokeralaGet(slug, params, { authRetry: false, rateRetriesLeft });
  }

  // Rate limited (5 req / 60s) or temporarily unavailable — wait and retry so a
  // burst of chart creations never produces a failed/partial chart.
  if ((res.status === 429 || res.status === 503) && rateRetriesLeft > 0) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 13_000;
    console.warn(`[prokerala] ${slug} -> ${res.status}; waiting ${waitMs}ms then retrying (${rateRetriesLeft} left)`);
    await sleep(waitMs);
    return prokeralaGet(slug, params, { authRetry, rateRetriesLeft: rateRetriesLeft - 1 });
  }

  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      json?.errors?.[0]?.detail || json?.message || JSON.stringify(json)?.slice(0, 300);
    throw new Error(`Prokerala ${slug} failed (${res.status}): ${detail}`);
  }
  return json;
}

export interface ProkeralaQuery {
  /** ISO-8601 datetime WITH offset, e.g. "1984-11-10T06:40:00+05:30". */
  datetime: string;
  /** "lat,long" string, e.g. "27.5530,76.6346". */
  coordinates: string;
  ayanamsa: number;
  la: string;
}

/** /v2/astrology/planet-position — D1 planet placements incl. Ascendant. */
export function fetchPlanetPosition(q: ProkeralaQuery) {
  return prokeralaGet("/astrology/planet-position", {
    datetime: q.datetime,
    coordinates: q.coordinates,
    ayanamsa: q.ayanamsa,
    la: q.la,
  });
}

/** /v2/astrology/birth-details — nakshatra, chandra (moon) rasi, soorya (sun) rasi. */
export function fetchBirthDetails(q: ProkeralaQuery) {
  return prokeralaGet("/astrology/birth-details", {
    datetime: q.datetime,
    coordinates: q.coordinates,
    ayanamsa: q.ayanamsa,
    la: q.la,
  });
}

/** /v2/astrology/dasha-periods — Vimshottari mahadasha/antardasha timeline. */
export function fetchDashaPeriods(q: ProkeralaQuery) {
  return prokeralaGet("/astrology/dasha-periods", {
    datetime: q.datetime,
    coordinates: q.coordinates,
    ayanamsa: q.ayanamsa,
    la: q.la,
  });
}
