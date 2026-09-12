import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { Check, Star, ChevronRight, Fingerprint, CloudOff, Trash2, Vibrate } from "lucide-react";
import { biometricAvailable, isLockEnabled, setLockEnabled, authenticate } from "@/lib/biometric";
import { clearOfflineCache, offlineCacheInfo } from "@/lib/offline";
import { THEMES, useTheme } from "@/theme";
import { Pressable } from "@/components/mobile/Pressable";
import Switch from "@/components/mobile/Switch";
import { getLang, setLang } from "@/lib/prefs";
import { haptic, isNative, getHapticLevel, setHapticLevel, type HapticLevel } from "@/lib/native";
import { openFeedback } from "@/lib/feedback";
import { useAuth } from "@/auth";
import { useNavigate } from "react-router-dom";

const SELECT_CLS =
  "w-full appearance-none rounded-2xl border border-input bg-card px-4 py-3.5 text-[15px] outline-none transition-colors focus:border-accent disabled:text-muted-foreground";

/*
 * "Light" is the default and now means "only when something happens" — a
 * confirm, a finished report, an error. "Everything" is the old behaviour,
 * where moving around the app buzzes too, kept for people who liked it.
 */
const HAPTIC_CHOICES: { value: HapticLevel; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "light", label: "Only key actions" },
  { value: "full", label: "Everything" },
];

/** A read-only "current method" row — honest about what the engine actually uses. */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-[13px] font-semibold">{label}</span>
      <span className="text-[13px] text-muted-foreground">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const t = useT();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [theme] = useTheme();
  const activeTheme = THEMES.find((t) => t.key === theme);
  const [lang, setLangState] = useState<string>(getLang());
  const [saved, setSaved] = useState(false);

  // App Lock — only offered where the hardware actually supports it.
  const [lockSupported, setLockSupported] = useState(false);
  const [lockOn, setLockOn] = useState(isLockEnabled());
  const [haptics, setHaptics] = useState<HapticLevel>(getHapticLevel());
  const [cache, setCache] = useState(offlineCacheInfo());

  useEffect(() => { biometricAvailable().then(setLockSupported); }, []);

  // Account deletion (irreversible → typed confirmation).
  const [delStage, setDelStage] = useState<"idle" | "confirm">("idle");
  const [delConfirm, setDelConfirm] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  const deleteAccount = async () => {
    if (delBusy) return;
    setDelBusy(true); setDelError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not delete the account.");
      // Server data is gone — now wipe every local trace too, so nothing of
      // theirs is left cached on the device either.
      clearOfflineCache();
      // Enumerate rather than list keys by hand — the hand-written list had
      // already drifted and was leaving `va_device` behind, which is the
      // identifier anonymous feedback is tied to. A deleted account must not
      // stay re-identifiable on the device.
      try {
        Object.keys(localStorage)
          .filter((k) => /^(jj:|va_)/.test(k))
          .forEach((k) => localStorage.removeItem(k));
      } catch { /* ignore */ }
      haptic.success();
      logout();
      nav("/");
    } catch (e: any) {
      haptic.error();
      setDelError(e?.message || "Could not delete the account.");
    } finally { setDelBusy(false); }
  };

  const toggleLock = async () => {
    haptic.tap();
    if (lockOn) { setLockEnabled(false); setLockOn(false); return; }
    // Verify BEFORE enabling, so we never lock someone out of their own app
    // with a sensor that turns out not to work.
    const ok = await authenticate('Enable App Lock');
    if (ok) { setLockEnabled(true); setLockOn(true); haptic.success(); }
    else haptic.error();
  };

  const save = () => { setLang(lang); haptic.success(); setSaved(true); setTimeout(() => setSaved(false), 1600); };
  const reset = () => { setLangState("en"); setLang("en"); haptic.tap(); };

  return (
    <div className="space-y-7 pt-2">
      {/* appearance — the swatch wall now lives on its own screen */}
      <section className="m-enter">
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          {t("Appearance")}
        </h3>
        <Pressable
          to="/theme"
          subtle
          className="m-card flex w-full items-center gap-3.5 px-4 py-3.5 text-left"
        >
          <span className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-border">
            <span className="w-1/2" style={{ background: activeTheme?.swatch.bg }} />
            <span className="flex w-1/2 flex-col">
              <span className="h-1/2" style={{ background: activeTheme?.swatch.primary }} />
              <span className="h-1/2" style={{ background: activeTheme?.swatch.accent }} />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-bold leading-tight">{t("Theme")}</span>
            <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
              {activeTheme?.label ?? t("Choose a look")}
            </span>
          </span>
          <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
        </Pressable>
      </section>

      {/* calculation engine — honest, read-only (these are what the engine really uses) */}
      <section className="m-enter">
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          {t("Calculation Method")}
        </h3>
        <div className="m-card divide-y divide-border">
          <InfoRow label={t("Zodiac System")} value="Sidereal (Vedic)" />
          <InfoRow label={t("Ayanamsa")} value="Lahiri (Chitra Paksha)" />
          <InfoRow label={t("House System")} value="Whole Sign" />
          <InfoRow label={t("Ephemeris")} value="High-precision (local)" />
        </div>
        <p className="mt-2.5 px-1 text-[12px] text-muted-foreground">
          {t("Every chart in JanamJyot is calculated with these classical methods, validated to sub-degree accuracy.")}
        </p>
      </section>

      {/* preferences */}
      <section className="m-enter">
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          {t("Preferences")}
        </h3>
        <div className="m-card space-y-4 p-4">
          <div className="space-y-1.5">
            <label className="px-1 text-[13px] font-semibold">{t("Reading Language")}</label>
            <select className={SELECT_CLS} value={lang} onChange={(e) => setLangState(e.target.value)}>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="hinglish">Hinglish</option>
            </select>
            <p className="px-1 text-[12px] text-muted-foreground">
              {t("Default language for AI answers, reports and voice.")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <Pressable onClick={reset} className="rounded-full border border-border py-3.5 text-[14px] font-bold">
              {t("Reset")}
            </Pressable>
            <Pressable
              feedback="medium"
              onClick={save}
              className="flex items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
            >
              {saved ? (<><Check className="h-[15px] w-[15px]" strokeWidth={3} /> {t("Saved")}</>) : t("Save")}
            </Pressable>
          </div>
        </div>
      </section>

      {/* privacy & offline */}
      <section className="m-enter">
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          {t("Privacy & data")}
        </h3>
        <div className="m-card divide-y divide-border">
          {lockSupported && (
            <div className="flex items-center gap-3.5 px-4 py-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                <Fingerprint className="h-[19px] w-[19px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold leading-tight">{t("App Lock")}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                  {t("Ask for fingerprint or screen lock before opening the app")}
                </span>
              </span>
              <Switch on={lockOn} onChange={toggleLock} label="Toggle app lock" />
            </div>
          )}

          {isNative && (
            <div className="flex items-center gap-3.5 px-4 py-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                <Vibrate className="h-[19px] w-[19px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold leading-tight">{t("Vibration")}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                  {t("When the phone should buzz")}
                </span>
                <span className="mt-2 flex gap-1.5">
                  {HAPTIC_CHOICES.map((c) => (
                    <Pressable
                      key={c.value}
                      subtle
                      onClick={() => {
                        setHapticLevel(c.value);
                        setHaptics(c.value);
                        haptic.medium(); // let them feel the new strength immediately
                      }}
                      className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${
                        haptics === c.value
                          ? "bg-accent text-accent-foreground"
                          : "bg-muted-foreground/10 text-muted-foreground"
                      }`}
                    >
                      {t(c.label)}
                    </Pressable>
                  ))}
                </span>
              </span>
            </div>
          )}

          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
              <CloudOff className="h-[19px] w-[19px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-bold leading-tight">{t("Offline data")}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                {cache.entries > 0
                  ? `${cache.entries} screens saved (${cache.kb} KB) — these open without internet`
                  : t("Screens you open are saved so they work without internet")}
              </span>
            </span>
            {cache.entries > 0 && (
              <Pressable
                onClick={() => { haptic.warning(); clearOfflineCache(); setCache(offlineCacheInfo()); }}
                subtle
                className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[12px] font-bold text-muted-foreground"
              >
                {t("Clear")}
              </Pressable>
            )}
          </div>
        </div>
      </section>

      {/* danger zone — only meaningful when signed in */}
      {user && (
        <section className="m-enter">
          <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("Account")}
          </h3>
          <div className="m-card p-4">
            <h4 className="flex items-center gap-2 text-[14.5px] font-bold text-destructive">
              <Trash2 className="h-[17px] w-[17px]" /> {t("Delete my account")}
            </h4>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {t("Permanently erases your account, every saved kundli and chart, your reports, chat history and any feedback you left. This cannot be undone.")}
            </p>
            {delStage === "idle" ? (
              <Pressable
                onClick={() => { haptic.warning(); setDelStage("confirm"); }}
                subtle
                className="mt-3 w-full rounded-full border border-destructive/40 py-3 text-center text-[13.5px] font-bold text-destructive"
              >
                {t("Delete my account")}
              </Pressable>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="text-[12.5px] font-semibold">
                  Type <span className="font-mono text-destructive">DELETE</span> to confirm:
                </p>
                <input
                  value={delConfirm}
                  onChange={(e) => setDelConfirm(e.target.value)}
                  placeholder="DELETE"
                  className="w-full rounded-2xl border border-input bg-card px-4 py-3 text-[15px] outline-none focus:border-destructive"
                />
                {delError && <p className="px-1 text-[12.5px] font-medium text-destructive">{delError}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <Pressable
                    onClick={() => { haptic.tap(); setDelStage("idle"); setDelConfirm(""); setDelError(null); }}
                    subtle
                    className="rounded-full border border-border py-3 text-center text-[13.5px] font-bold"
                  >
                    {t("Cancel")}
                  </Pressable>
                  <Pressable
                    onClick={deleteAccount}
                    disabled={delConfirm.trim().toUpperCase() !== "DELETE" || delBusy}
                    feedback="medium"
                    className="rounded-full bg-destructive py-3 text-center text-[13.5px] font-bold text-white disabled:opacity-50"
                  >
                    {delBusy ? t("Deleting…") : t("Delete forever")}
                  </Pressable>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* feedback */}
      <section className="m-enter">
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          {t("Feedback")}
        </h3>
        <Pressable
          onClick={() => { haptic.tap(); openFeedback('settings'); }}
          subtle
          className="m-card flex w-full items-center gap-3.5 px-4 py-3.5 text-left"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
            <Star className="h-[19px] w-[19px]" fill="currentColor" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-bold leading-tight">{t("Rate & Review")}</span>
            <span className="mt-0.5 block text-[12px] text-muted-foreground">
              {t("5-star rating & a quick comment")}
            </span>
          </span>
          <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
        </Pressable>
      </section>

      <p className="selectable px-2 pb-2 text-center text-[11.5px] leading-relaxed text-muted-foreground">
        {t("Disclaimer: for spiritual guidance and entertainment only. Do not rely on AI for medical diagnosis or financial planning.")}
      </p>
    </div>
  );
}
