import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getGoogleIdToken, googleConfigured, initGoogleAuth } from "@/lib/googleAuth";

export interface User { id: string; name: string; email: string; role: "admin" | "user"; }
interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  /** Passwordless: verify an e-mailed 6-digit code (also creates the account). */
  loginWithOtp: (email: string, code: string, name?: string) => Promise<void>;
  /** True when a Google client id is configured; the Google button gates on it. */
  googleReady: boolean;
  logout: () => void;
}

const TOKEN_KEY = "va_token";
const DEVICE_KEY = "va_device";
const AuthCtx = createContext<AuthState>(null as any);
export const useAuth = () => useContext(AuthCtx);

// A stable per-browser id so anonymous users still keep their OWN charts
// private (without needing to log in).
function deviceId(): string {
  try {
    let d = localStorage.getItem(DEVICE_KEY);
    if (!d) { d = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(DEVICE_KEY, d); }
    return d;
  } catch { return "dev_anon"; }
}

// ── Install a one-time fetch interceptor so EVERY /api call carries the token,
//    and a 401 clears the session. (Avoids editing dozens of fetch calls.)
let installed = false;
function installFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (typeof url === "string" && url.startsWith("/api")) {
      const token = localStorage.getItem(TOKEN_KEY);
      init = { ...init, headers: { ...(init.headers || {}), "X-Device-Id": deviceId(), ...(token ? { Authorization: `Bearer ${token}` } : {}) } };
    }
    const res = await orig(input, init);
    if (res.status === 401 && typeof url === "string" && url.startsWith("/api") && !url.includes("/api/auth/")) {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("va-unauth"));
    }
    return res;
  };
}
installFetch();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setUser(null); setLoading(false); return; }
    try {
      const res = await fetch("/api/auth/me");
      const d = await res.json();
      setUser(res.ok ? d.user : null);
    } catch { setUser(null); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    loadMe();
    // One-time native Google Auth init (no-op on web / when unconfigured).
    initGoogleAuth();
    const onUnauth = () => setUser(null);
    window.addEventListener("va-unauth", onUnauth);
    return () => window.removeEventListener("va-unauth", onUnauth);
  }, []);

  const handle = async (path: string, body: any) => {
    const res = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Something went wrong.");
    localStorage.setItem(TOKEN_KEY, d.token);
    setUser(d.user);
  };

  // Google Sign-In: get an ID token for the platform, then exchange it at
  // `/api/auth/google` for our own session token — same storage + setUser path
  // as `handle()` above.
  // Passwordless: exchange the e-mailed 6-digit code for a session. Creates the
  // account on first use, so it doubles as sign-up.
  const loginWithOtp = async (email: string, code: string, name?: string) => {
    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, name }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Could not verify that code.");
    localStorage.setItem(TOKEN_KEY, d.token);
    setUser(d.user);
  };

  const loginWithGoogle = async () => {
    const idToken = await getGoogleIdToken();
    const res = await fetch("/api/auth/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id_token: idToken }) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Google sign-in failed.");
    localStorage.setItem(TOKEN_KEY, d.token);
    setUser(d.user);
  };

  const value: AuthState = {
    user, loading,
    login: (email, password) => handle("login", { email, password }),
    signup: (name, email, password) => handle("signup", { name, email, password }),
    loginWithGoogle,
    loginWithOtp,
    googleReady: googleConfigured,
    logout: () => { localStorage.removeItem(TOKEN_KEY); setUser(null); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
