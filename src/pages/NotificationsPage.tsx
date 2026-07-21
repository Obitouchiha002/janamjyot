import { useEffect, useState } from "react";
import { Sparkles, Gem, CalendarClock, Orbit, Check } from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";
import { isNative } from "@/lib/native";
import Switch from "@/components/mobile/Switch";
import {
  getNotifPrefs, saveNotifPrefs, ensureNotifPermission, applyNotifications, type NotifPrefs,
} from "@/lib/notifications";

interface Row {
  key: keyof NotifPrefs;
  label: string;
  desc: string;
  icon: any;
  tint: string;
}

const ROWS: Row[] = [
  { key: "daily", label: "Daily guidance", desc: "Your personalised guidance, every morning", icon: Sparkles, tint: "#E8B44A" },
  { key: "dasha", label: "Dasha change alert", desc: "When your sub-period (antardasha) shifts", icon: CalendarClock, tint: "#A78BFA" },
  { key: "monthly", label: "Monthly forecast", desc: "A fresh outlook on the 1st of each month", icon: Orbit, tint: "#60A5FA" },
  { key: "remedy", label: "Remedy reminder", desc: "An evening nudge to follow your upaay", icon: Gem, tint: "#7DD3C0" },
];

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<NotifPrefs>(getNotifPrefs());
  const [chartId, setChartId] = useState<string | undefined>();
  const [dasha, setDasha] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((d) => {
        const id = Array.isArray(d) && d[0]?.id;
        if (id) {
          setChartId(id);
          fetch(`/api/chart/${id}`).then((r) => r.json()).then((c) => setDasha(c?.dasha?.current ?? null)).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const commit = async (next: NotifPrefs) => {
    const previous = prefs;
    setPrefs(next); // optimistic, so the toggle responds instantly
    const anyOn = next.daily || next.dasha || next.monthly || next.remedy;

    // Don't claim "Saved" when Android refused the permission — the reminders
    // simply will not arrive. The old code discarded this result and showed
    // the switch on regardless. Roll the toggle back so the UI never sits in a
    // state the OS won't honour, and only persist once it's real.
    if (anyOn && !(await ensureNotifPermission())) {
      setPrefs(previous);
      setDenied(true);
      return;
    }
    saveNotifPrefs(next);
    setDenied(false);
    await applyNotifications({ chartId, dasha });
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  };

  const toggle = (key: keyof NotifPrefs) => commit({ ...prefs, [key]: !prefs[key] } as NotifPrefs);

  const timeValue = `${String(prefs.dailyHour).padStart(2, "0")}:${String(prefs.dailyMin).padStart(2, "0")}`;
  const onTime = (v: string) => {
    const [h, m] = v.split(":").map((n) => parseInt(n, 10));
    if (Number.isFinite(h) && Number.isFinite(m)) commit({ ...prefs, dailyHour: h, dailyMin: m });
  };

  return (
    <div className="space-y-6 pt-2">
      <p className="m-enter px-1 text-[13.5px] leading-relaxed text-muted-foreground">
        Gentle reminders so you never miss your daily guidance or an important shift.
      </p>

      <section className="m-card m-enter divide-y divide-border">
        {ROWS.map(({ key, label, desc, icon: Icon, tint }) => (
          <div key={key} className="flex items-center gap-3.5 px-4 py-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${tint}22`, color: tint }}>
              <Icon className="h-[19px] w-[19px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-bold leading-tight">{label}</span>
              <span className="mt-0.5 block text-[12px] text-muted-foreground">{desc}</span>
            </span>
            <Switch label={label} on={!!prefs[key]} onChange={() => toggle(key)} />
          </div>
        ))}
      </section>

      {/* daily time */}
      {prefs.daily && (
        <section className="m-card m-enter flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-[14px] font-bold">Daily guidance time</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">When your morning reminder arrives</p>
          </div>
          <input
            type="time"
            value={timeValue}
            onChange={(e) => onTime(e.target.value)}
            className="rounded-xl border border-input bg-card px-3 py-2 text-[15px] font-bold outline-none focus:border-accent"
          />
        </section>
      )}

      {denied && (
        <p className="m-enter rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-[12.5px] leading-relaxed text-amber-300">
          Notifications are blocked for JanamJyot. Turn them on in your phone's
          Settings &rarr; Apps &rarr; JanamJyot &rarr; Notifications, then try again.
        </p>
      )}

      {saved && (
        <p className="m-enter flex items-center justify-center gap-1.5 text-[13px] font-semibold text-accent">
          <Check className="h-4 w-4" strokeWidth={3} /> Saved
        </p>
      )}

      {!isNative && (
        <p className="px-1 text-center text-[11.5px] italic leading-relaxed text-muted-foreground">
          Reminders are delivered on the app — install JanamJyot on your phone to receive them.
        </p>
      )}
    </div>
  );
}
