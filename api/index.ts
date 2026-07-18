// Single Vercel serverless entry for the whole Express API.
//
// A rewrite in vercel.json sends every "/api/*" path (any depth) here as
// "/api/index?__p=<original path>", because Vercel's file-based [...catch-all]
// only reliably matched one segment. We rebuild the real URL from __p so Express
// routes it correctly. The app is dynamically imported so a load error is
// catchable and returned as text instead of an opaque FUNCTION_INVOCATION_FAILED.

let cached: { app: any; initDb: any } | null = null;
let dbReady: Promise<void> | null = null;

async function load() {
  if (cached) return cached;
  // @ts-ignore - generated at build time by esbuild
  const mod: any = await import("../server-bundle.mjs");
  cached = { app: mod.app, initDb: mod.initDb };
  return cached;
}

export default async function handler(req: any, res: any) {
  try {
    const { app, initDb } = await load();
    if (!dbReady) dbReady = (initDb as any)().catch((e: any) => console.error("[db] init:", e?.message));
    await dbReady;

    const u = new URL(req.url, "http://local");
    const p = u.searchParams.get("__p");
    if (p !== null) {
      u.searchParams.delete("__p");
      const qs = u.searchParams.toString();
      req.url = "/api/" + p + (qs ? "?" + qs : "");
    } else if (typeof req.url === "string" && !req.url.startsWith("/api")) {
      req.url = "/api" + (req.url.startsWith("/") ? "" : "/") + req.url;
    }
    return (app as any)(req, res);
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain");
    res.end("SERVER ERROR:\n" + (e?.stack || e?.message || String(e)));
  }
}
