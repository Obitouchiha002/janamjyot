/**
 * Backend-failover check.
 *
 *   npm run check:failover
 *
 * This exists because of a real outage, and it guards the exact mistake that
 * caused it.
 *
 * WHAT WENT WRONG
 *   The Vercel project was given a new primary domain. Vercel then began
 *   redirecting every other domain — including the one baked into every APK
 *   already on a phone — to that primary. A GET followed the hop and returned
 *   200, so the app looked fine. But a login POST carries a JSON body, which
 *   makes it a preflighted request, and per the Fetch spec a redirect in
 *   response to a CORS preflight is a network error the browser refuses to
 *   follow. Every login died as `TypeError: Failed to fetch` while every read
 *   kept working.
 *
 *   The failover layer should have routed around it and did not, because its
 *   health probe was a bare GET — it followed the redirect, saw 200, and
 *   declared the broken host healthy.
 *
 * WHAT THIS PROVES
 *   • a host that redirects to ANOTHER origin is rejected, even on a 200
 *   • a same-origin redirect (trailing slash, etc.) is still accepted
 *   • a plain 200 is accepted, and a 5xx / thrown fetch is rejected
 *   • a hung host is abandoned rather than blocking the app forever
 *
 * WHAT THIS CANNOT PROVE
 *   That the real deployment is not redirecting right now. That is a property
 *   of the hosting configuration, not of this code — check it against the live
 *   host before shipping an APK.
 */
import { isUsable } from "../../src/lib/api";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) {
    console.error(`FAIL  ${name}${detail ? " — " + detail : ""}`);
    failures++;
  }
};

// `isUsable` resolves a redirect target against the document location.
(globalThis as any).location = { href: "https://localhost/" };

type Res = { ok: boolean; status: number; redirected: boolean; url: string };
const realFetch = globalThis.fetch;

/**
 * Install a fetch that answers every call with `make(url)`.
 *
 * The stub REJECTS when the abort signal fires, because that is what a real
 * fetch does — the spec requires it. An earlier version of this stub simply
 * ignored the signal, which made the hung-host case look like a bug in the
 * app when it was only a bug in the test.
 */
function stubFetch(make: (url: string) => Res | Promise<Res> | Error) {
  (globalThis as any).fetch = (url: string, init?: any) => {
    const out = make(String(url));
    if (out instanceof Error) return Promise.reject(out);
    return new Promise<Res>((resolve, reject) => {
      const sig = init?.signal;
      if (sig?.aborted) return reject(new Error("aborted"));
      sig?.addEventListener?.("abort", () => reject(new Error("aborted")));
      Promise.resolve(out).then(resolve, reject);
    });
  };
}

const res = (over: Partial<Res> & { url: string }): Res => ({
  ok: true, status: 200, redirected: false, ...over,
});

(async () => {
  const GOOD = "https://janamjyot.vercel.app";
  const OTHER = "https://janamjyot.lzworth.in";

  // ── the outage itself ────────────────────────────────────────────────────
  stubFetch(() => res({ redirected: true, url: OTHER + "/api/config" }));
  check(
    "a host that redirects to another origin is REJECTED",
    (await isUsable(GOOD)) === false,
    "this is the bug that took logins down — a 200 after a cross-origin hop",
  );

  // ── things that must still pass ──────────────────────────────────────────
  stubFetch((u) => res({ url: u }));
  check("a plain 200 is accepted", (await isUsable(GOOD)) === true);

  stubFetch(() => res({ redirected: true, url: GOOD + "/api/config/" }));
  check(
    "a SAME-origin redirect is still accepted",
    (await isUsable(GOOD)) === true,
    "a trailing-slash hop is harmless and must not disable a healthy host",
  );

  // ── ordinary failures ────────────────────────────────────────────────────
  stubFetch((u) => res({ ok: false, status: 500, url: u }));
  check("a 5xx is rejected", (await isUsable(GOOD)) === false);

  stubFetch(() => new Error("network down"));
  check("a thrown fetch is rejected", (await isUsable(GOOD)) === false);

  // ── a host that hangs must not hang the app ──────────────────────────────
  stubFetch(() => new Promise<Res>(() => { /* never settles */ }) as any);
  const t0 = Date.now();
  const hung = await Promise.race([
    isUsable(GOOD),
    new Promise((r) => setTimeout(() => r("STILL-WAITING"), 6000)),
  ]);
  const waited = Date.now() - t0;
  check(
    "a hung host is abandoned, not waited on forever",
    hung === false && waited < 5500,
    `resolved to ${JSON.stringify(hung)} after ${waited}ms`,
  );

  (globalThis as any).fetch = realFetch;

  if (failures) {
    console.error(`\n${failures} failure(s).`);
    process.exit(1);
  }
  console.log(
    "PASS — a cross-origin redirect disqualifies a backend (the live-login " +
    "outage), same-origin redirects still pass, 5xx / thrown / hung hosts are " +
    "all rejected within the timeout.",
  );
  process.exit(0);
})();
