import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useNavigate } from "react-router-dom";
import { Sparkles, LogIn, UserPlus, MailCheck, Star, Sunrise, MessageCircleHeart } from "lucide-react";
import { useAuth } from "@/auth";
import { Pressable } from "@/components/mobile/Pressable";
import Logo from "@/components/mobile/Logo";
import { haptic } from "@/lib/native";

const INPUT_CLS =
  "w-full rounded-2xl border border-input bg-card px-4 py-3.5 text-[15px] outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-accent";

// Remember that this device has had an account, so a returning user lands on
// Sign in while a brand-new user lands on Sign up (and sees what they'll get).
const RETURNING_KEY = "jj:returning";
function isReturning(): boolean {
  try { return !!localStorage.getItem(RETURNING_KEY); } catch { return false; }
}
function markReturning() {
  try { localStorage.setItem(RETURNING_KEY, "1"); } catch { /* ignore */ }
}

/** What a hopeful newcomer gets — shown above the form so the value is clear
 *  BEFORE they're asked to commit an account. */
const PERKS = [
  { icon: Star, text: "Your free Janam Kundli in minutes" },
  { icon: Sunrise, text: "Daily guidance made just for you" },
  { icon: MessageCircleHeart, text: "Ask an astrologer anything, in plain words" },
];

/**
 * Also renders as the launch gate (see App.tsx). There is no guest path:
 * every non-public /api route requires a token, so a guest would have nothing
 * to load.
 * In that mode there is no router history to go "back" to, so we surface a
 * "Continue as guest" escape hatch instead of stranding the user on the screen.
 */
export default function LoginPage() {
  const t = useT();
  const { login, signup, loginWithOtp } = useAuth();
  const nav = useNavigate();
  // New user → Sign up (with the perks visible); returning user → Sign in.
  const [mode, setMode] = useState<"login" | "signup">(isReturning() ? "login" : "signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Forgot-password sub-flow (email → reset link).
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [forgotBusy, setForgotBusy] = useState(false);
  // Passwordless e-mail code flow.
  const [otpMode, setOtpMode] = useState(false);
  const [otpStage, setOtpStage] = useState<"email" | "code">("email");
  const [otpCode, setOtpCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpBusy) return;
    setOtpBusy(true); setError(null); setSent(null);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not send the code.");
      haptic.success();
      setSent(d.message || "Code sent. Please check your email.");
      setOtpStage("code");
    } catch (err: any) {
      haptic.error();
      setError(err?.message || "Could not send the code.");
    } finally { setOtpBusy(false); }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpBusy) return;
    setOtpBusy(true); setError(null);
    try {
      await loginWithOtp(email.trim(), otpCode.trim(), name.trim());
      markReturning();
      haptic.success();
      nav("/");
    } catch (err: any) {
      haptic.error();
      setError(err?.message || "Could not verify that code.");
    } finally { setOtpBusy(false); }
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotBusy) return;
    setForgotBusy(true); setError(null); setSent(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not send the reset link.");
      haptic.success();
      setSent(d.message || "If that email has an account, a reset link is on its way.");
    } catch (err: any) {
      haptic.error();
      setError(err?.message || "Could not send the reset link.");
    } finally { setForgotBusy(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (mode === "login") {
        await login(email, password);
        markReturning();
        nav("/");
      } else {
        await signup(name, email, password);
        markReturning();
        // New account → straight into onboarding: build the first kundli
        // (name / date / time / place), the way astrology apps start.
        haptic.success();
        nav("/create-chart");
      }
    } catch (err: any) {
      haptic.error();
      setError(err?.message || "Something went wrong. Please try again.");
    }
    finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-[78vh] flex-col justify-center">
      {/* brand */}
      <div className="m-enter mb-7 text-center">
        <div className="mx-auto mb-4 h-[68px] w-[68px] overflow-hidden rounded-3xl shadow-lg shadow-accent/25">
          <Logo size={68} />
        </div>
        <h1 className="text-[26px] font-bold leading-tight">
          Janam<span className="font-light text-accent">Jyot</span>
        </h1>
        <p className="mx-auto mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-muted-foreground">
          {mode === "login"
            ? t("Welcome back — sign in to your account.")
            : t("Your birth chart, read in plain words. Free to start.")}
        </p>
      </div>

      {/* What a newcomer gets — shown before the form so the value is clear
          BEFORE we ask for an account. Hidden for returning users signing in. */}
      {mode === "signup" && !otpMode && !forgot && (
        <div className="m-enter mb-5 space-y-2.5 px-1">
          {PERKS.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
                <Icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
              </span>
              <span className="text-[13.5px] font-semibold leading-snug">{t(text)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="m-card m-enter p-4">
        {/* One-tap sign-in: a code e-mailed to you. No password to remember,
            and unlike SMS OTP it costs nothing to run. */}
        <Pressable
          feedback="medium"
          onClick={() => { haptic.tap(); setOtpMode(true); setOtpStage("email"); setError(null); setSent(null); }}
          aria-label="Continue with email code"
          className="flex w-full items-center justify-center gap-2.5 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
        >
          <MailCheck className="h-[18px] w-[18px]" strokeWidth={2.3} />
          {t("Continue with Email code")}
        </Pressable>
        <p className="mt-2 text-center text-[11.5px] font-medium text-muted-foreground">
          {t("We'll email you a 6-digit code — no password needed")}
        </p>

        {/* or divider */}
        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {otpMode ? (
          /* ── Passwordless: e-mailed code ─────────────────────────────── */
          <form onSubmit={otpStage === "email" ? sendOtp : verifyOtp} className="space-y-3">
            <h2 className="text-[16px] font-bold">
              {otpStage === "email" ? t("Sign in with your email") : t("Enter your code")}
            </h2>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              {otpStage === "email"
                ? t("We'll send a 6-digit code to your email. New here? This creates your account too.")
                : `We sent a 6-digit code to ${email}. It expires in 10 minutes.`}
            </p>

            {otpStage === "email" ? (
              <input
                type="email"
                placeholder={t("Email")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_CLS}
              />
            ) : (
              <>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder={t("6-digit code")}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className={`${INPUT_CLS} text-center text-[20px] font-bold tracking-[0.4em]`}
                />
                <input
                  placeholder={t("Your name (new accounts only)")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={INPUT_CLS}
                />
              </>
            )}

            {error && <p className="selectable px-1 text-[13px] font-medium text-destructive">{error}</p>}
            {sent && otpStage === "code" && (
              <p className="selectable px-1 text-[13px] font-medium text-emerald-600">{sent}</p>
            )}

            <button
              type="submit"
              disabled={otpBusy || (otpStage === "email" ? !email.trim() : otpCode.length < 6)}
              className="pressable flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25 disabled:opacity-50"
            >
              {otpBusy && <Sparkles className="h-[17px] w-[17px] animate-spin" />}
              {otpStage === "email" ? t("Send code") : t("Verify & sign in")}
            </button>

            {otpStage === "code" && (
              <Pressable
                subtle
                onClick={() => { haptic.tap(); setOtpStage("email"); setOtpCode(""); setError(null); }}
                className="block w-full py-1 text-center text-[13px] font-semibold text-muted-foreground"
              >
                {t("Use a different email")}
              </Pressable>
            )}
            <Pressable
              subtle
              onClick={() => { haptic.tap(); setOtpMode(false); setOtpStage("email"); setOtpCode(""); setSent(null); setError(null); }}
              className="block w-full py-1 text-center text-[13px] font-semibold text-muted-foreground"
            >
              Back
            </Pressable>
          </form>
        ) : forgot ? (
          /* ── Forgot password ─────────────────────────────────────────── */
          <form onSubmit={sendReset} className="space-y-3">
            <h2 className="text-[16px] font-bold">{t("Reset your password")}</h2>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              Enter your account email — we&apos;ll send you a link to choose a new password.
            </p>
            <input
              type="email"
              placeholder={t("Email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLS}
            />
            {error && <p className="selectable px-1 text-[13px] font-medium text-destructive">{error}</p>}
            {sent && <p className="selectable px-1 text-[13px] font-medium text-emerald-600">{sent}</p>}
            <button
              type="submit"
              disabled={forgotBusy || !email.trim()}
              className="pressable flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25 disabled:opacity-50"
            >
              {forgotBusy && <Sparkles className="h-[17px] w-[17px] animate-spin" />}
              Send reset link
            </button>
            <Pressable
              subtle
              onClick={() => { haptic.tap(); setForgot(false); setSent(null); setError(null); }}
              className="block w-full py-1 text-center text-[13px] font-semibold text-muted-foreground"
            >
              {t("Back to sign in")}
            </Pressable>
          </form>
        ) : (
        <>
        {/* mode switch */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
          {(["login", "signup"] as const).map((m) => (
            <Pressable
              key={m}
              feedback="select"
              subtle
              onClick={() => setMode(m)}
              className={`rounded-full py-2.5 text-[13.5px] font-bold transition-colors ${
                mode === m
                  ? "bg-accent text-accent-foreground shadow-lg shadow-accent/25"
                  : "text-muted-foreground"
              }`}
            >
              {m === "login" ? t("Sign in") : t("Sign up")}
            </Pressable>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <input
              placeholder={t("Full name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLS}
            />
          )}
          <input
            type="email"
            placeholder={t("Email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT_CLS}
          />
          <input
            type="password"
            placeholder={t("Password (6+ characters)")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT_CLS}
          />

          {error && (
            <p className="selectable px-1 text-[13px] font-medium text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="pressable flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25 disabled:opacity-50"
          >
            {busy ? (
              <Sparkles className="h-[17px] w-[17px] animate-spin" />
            ) : mode === "login" ? (
              <LogIn className="h-[17px] w-[17px]" strokeWidth={2.4} />
            ) : (
              <UserPlus className="h-[17px] w-[17px]" strokeWidth={2.4} />
            )}
            {mode === "login" ? t("Sign in") : t("Create account")}
          </button>

          {mode === "login" && (
            <Pressable
              subtle
              onClick={() => { haptic.tap(); setForgot(true); setError(null); }}
              className="block w-full pt-1 text-center text-[13px] font-semibold text-accent"
            >
              {t("Forgot password?")}
            </Pressable>
          )}
        </form>
        </>
        )}
      </div>


      <p className="m-enter mt-5 px-4 text-center text-[11.5px] leading-relaxed text-muted-foreground">
        {t("By continuing you agree this app is for spiritual guidance and entertainment.")}
      </p>
    </div>
  );
}
