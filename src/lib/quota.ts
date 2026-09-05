/**
 * Global quota interceptor.
 *
 * Wraps `fetch` so that ANY `/api` response with HTTP 429 (the server's
 * "you've hit your plan limit" signal) is broadcast as a `va-quota` window
 * event carrying the server payload `{ error, limit, used, action, plan }`.
 *
 * It never swallows the response: the body is read from a `clone()`, and the
 * original 429 still flows back to whichever page made the call. A single
 * `<QuotaListener/>` (mounted in the app shell) turns the event into a sheet,
 * so no per-page changes are needed.
 *
 * Imported from `main.tsx` after `./lib/api` so it layers over the API-base
 * rewrite; on the plain web build (no rewrite) it still installs on its own.
 */
export interface QuotaPayload {
  error: string;
  limit: number;
  used: number;
  action: string;
  plan: string;
  /** Set on a 402: the free allowance is gone but credits can buy this. */
  needs_credits?: number;
  balance?: number;
  free_limit?: number;
}

let installed = false;
function installQuotaInterceptor() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: any, init?: any) => {
    const res = await orig(input, init);
    // A successful call to a metered endpoint may have just spent credits, so
    // tell the wallet chip to re-read rather than showing a stale number until
    // the next navigation.
    if (res.ok) {
      const u = typeof input === "string" ? input : input?.url ?? "";
      if (typeof u === "string" && /\/api\/(chat|chat-u|consult|match|create-chart|report|life-report)/.test(u)) {
        window.dispatchEvent(new Event("jj:credits"));
      }
    }
    // 402 means "the free allowance is used up, but credits can buy this" —
    // the same sheet answers both, so it must not slip through as a raw error.
    if (res.status === 429 || res.status === 402) {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (typeof url === "string" && url.includes("/api")) {
        res
          .clone()
          .json()
          .then((payload: QuotaPayload) => {
            window.dispatchEvent(new CustomEvent("va-quota", { detail: payload }));
          })
          .catch(() => {
            /* non-JSON 429 (e.g. an upstream gateway) — nothing to show */
          });
      }
    }
    return res;
  };
}

installQuotaInterceptor();
