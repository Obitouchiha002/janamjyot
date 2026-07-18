import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, Sparkles, CheckCircle2 } from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";
import { haptic } from "@/lib/native";
import Logo from "@/components/mobile/Logo";

const INPUT_CLS =
  "h-12 w-full rounded-2xl border border-input bg-card px-4 text-[15px] outline-none transition-colors focus:border-accent";

/**
 * Landing page for the emailed reset link: /reset-password?token=…
 * Reachable while signed out (App.tsx lets it through the launch auth gate).
 */
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const nav = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Both passwords must match."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not reset your password.");
      haptic.success();
      setDone(true);
    } catch (err: any) {
      haptic.error();
      setError(err?.message || "Could not reset your password.");
    } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-[78vh] flex-col justify-center">
      <div className="m-enter mb-7 text-center">
        <div className="mx-auto mb-4 h-[68px] w-[68px] overflow-hidden rounded-3xl shadow-lg shadow-accent/25">
          <Logo size={68} />
        </div>
        <h1 className="text-[26px] font-bold leading-tight">
          Janam<span className="font-light text-accent">Jyot</span>
        </h1>
      </div>

      <div className="m-card m-enter p-5">
        {done ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
            <h2 className="text-[17px] font-bold">Password updated</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              You can now sign in with your new password.
            </p>
            <Pressable
              feedback="medium"
              onClick={() => nav("/")}
              className="mt-5 flex w-full items-center justify-center rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
            >
              Go to sign in
            </Pressable>
          </div>
        ) : !token ? (
          <div className="text-center">
            <h2 className="text-[17px] font-bold">Invalid reset link</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              This link is missing its token. Please request a new reset email.
            </p>
            <Pressable
              onClick={() => nav("/")}
              className="mt-5 flex w-full items-center justify-center rounded-full border border-input px-5 py-3.5 text-[14px] font-bold"
            >
              Back to sign in
            </Pressable>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="mb-1 grid h-11 w-11 place-items-center rounded-2xl bg-accent/15 text-accent">
              <KeyRound className="h-[21px] w-[21px]" />
            </div>
            <h2 className="text-[17px] font-bold">Choose a new password</h2>
            <input
              type="password"
              placeholder="New password (6+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT_CLS}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={INPUT_CLS}
            />
            {error && <p className="selectable px-1 text-[13px] font-medium text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="pressable flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25 disabled:opacity-50"
            >
              {busy && <Sparkles className="h-[17px] w-[17px] animate-spin" />}
              Update password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
