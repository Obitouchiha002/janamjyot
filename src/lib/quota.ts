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
}

let installed = false;
function installQuotaInterceptor() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: any, init?: any) => {
    const res = await orig(input, init);
    if (res.status === 429) {
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
