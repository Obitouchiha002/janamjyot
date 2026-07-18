/**
 * Authentication — self-contained (no extra npm deps).
 * Passwords hashed with scrypt; sessions are HS256 JWTs signed with AUTH_SECRET.
 */
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { getUserById } from "./db";

const SECRET = (process.env.AUTH_SECRET || "").trim() ||
  // Dev fallback (set AUTH_SECRET in production!). Derived so it's stable per machine.
  crypto.createHash("sha256").update("vedicastra-dev-" + (process.env.GEMINI_API_KEY || "local")).digest("hex");

if (!process.env.AUTH_SECRET) console.warn("[auth] AUTH_SECRET not set — using a dev fallback. Set AUTH_SECRET for production.");

// The email that becomes admin on signup/login.
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "vk1234888i@gmail.com").trim().toLowerCase();

// ---- password hashing (scrypt) -------------------------------------------
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString("hex")}:${dk.toString("hex")}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  try {
    const [s, h] = stored.split(":");
    const dk = crypto.scryptSync(pw, Buffer.from(s, "hex"), 64);
    return crypto.timingSafeEqual(dk, Buffer.from(h, "hex"));
  } catch { return false; }
}

// ---- JWT (HS256) ----------------------------------------------------------
const b64 = (b: Buffer) => b.toString("base64url");
export function signToken(payload: Record<string, any>, days = 30): string {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + days * 86400 };
  const h = b64(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const p = b64(Buffer.from(JSON.stringify(body)));
  const sig = b64(crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}
export function verifyToken(token: string): Record<string, any> | null {
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;
    const expected = b64(crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest());
    const a = Buffer.from(s), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const body = JSON.parse(Buffer.from(p, "base64url").toString());
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch { return null; }
}

// ---- express middleware ---------------------------------------------------
function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (h && h.startsWith("Bearer ")) return h.slice(7).trim();
  return null;
}

/** Attaches req.user if a valid token is present; otherwise 401. */
export async function requireAuth(req: any, res: Response, next: NextFunction) {
  const tok = bearer(req);
  const payload = tok ? verifyToken(tok) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Please sign in." });
  const user = await getUserById(payload.sub);
  if (!user) return res.status(401).json({ error: "Session invalid — sign in again." });
  const status = (user as any).status ?? ((user as any).suspended ? "blocked" : "active");
  if (status !== "active") {
    // Show the admin's reason. "Contact support" with no cause just produces a
    // support ticket asking what happened.
    return res.status(403).json({
      error:
        (user as any).status_reason ||
        (status === "banned"
          ? "This account has been permanently banned."
          : "This account has been suspended."),
      account_status: status,
    });
  }
  req.user = { id: user.id, email: user.email, name: user.name, role: user.role, plan: (user as any).plan, limits_json: (user as any).limits_json };
  next();
}

/** Like requireAuth but never blocks — sets req.user if available. */
export async function optionalAuth(req: any, _res: Response, next: NextFunction) {
  const tok = bearer(req);
  const payload = tok ? verifyToken(tok) : null;
  if (payload?.sub) {
    const user = await getUserById(payload.sub);
    // Carry plan + per-user limit overrides so quota checks on optional-auth
    // routes see the same account the strict middleware would.
    if (user) req.user = { id: user.id, email: user.email, name: user.name, role: user.role, plan: (user as any).plan, limits_json: (user as any).limits_json };
  }
  next();
}

export function requireAdmin(req: any, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only." });
  next();
}
