import { useEffect, useState, useCallback } from "react";
import {
  Shield, Users, FileText, MessageSquare, Sparkles, Activity, KeyRound,
  Power, Megaphone, ToggleLeft, Search, X, Ban, ShieldCheck, UserCog,
  Trash2, Plus, TrendingUp, Gauge, Star, Check, EyeOff, IndianRupee,
} from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";
import Switch from "@/components/mobile/Switch";
import { haptic } from "@/lib/native";

/* ── shared bits ─────────────────────────────────────────────────────────── */

/**
 * Throws on a non-2xx, so a caller cannot report success for a request the
 * server rejected. These mutations gate AI billing, publish reviews to the
 * public site and pause the whole app — and every one of them used to patch
 * local state unconditionally, so "Pause App" could fail silently while the
 * UI said it had worked.
 */
const post = async (url: string, body?: any) => {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => "")}`.trim());
  return r;
};

const SECTIONS = [
  { k: "overview", label: "Overview", icon: TrendingUp },
  { k: "users", label: "Users", icon: Users },
  { k: "reviews", label: "Reviews", icon: Star },
  { k: "keys", label: "API Keys", icon: KeyRound },
  { k: "system", label: "System", icon: Activity },
  { k: "controls", label: "Controls", icon: Power },
] as const;

type SectionKey = (typeof SECTIONS)[number]["k"];

function StatTile({ label, value, sub, tint, icon: Icon }: any) {
  return (
    <div className="m-card p-4">
      <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${tint}22`, color: tint }}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <p className="mt-3 text-[24px] font-bold leading-none">{value ?? "…"}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">{label}</p>
      {sub ? <p className="mt-0.5 text-[11px] font-semibold text-accent">{sub}</p> : null}
    </div>
  );
}

/* ── Overview ────────────────────────────────────────────────────────────── */

function Overview() {
  const [ov, setOv] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  // Previously a failed/401 call was swallowed and the page just sat there
  // showing blanks, which read as "the admin panel doesn't work". Surface it.
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/overview");
        const d = await r.json();
        if (!r.ok || d?.error) throw new Error(d?.error || `Request failed (${r.status})`);
        setOv(d);
      } catch (e: any) {
        setErr(e?.message || "Could not load admin data.");
      } finally {
        setLoading(false);
      }
    })();
    fetch("/api/admin/analytics?days=14")
      .then((r) => r.json())
      .then((d) => !d?.error && setAnalytics(d))
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-[76px]" />)}
        </div>
        <div className="skeleton h-[150px]" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="m-card p-6 text-center">
        <p className="text-[15px] font-bold">Couldn't load admin data</p>
        <p className="mt-1 text-[13px] text-muted-foreground">{err}</p>
        <p className="mt-2 text-[12px] text-muted-foreground">
          If this says 401/403, sign out and sign back in with the admin account.
        </p>
      </div>
    );
  }

  const s = ov?.stats ?? {};
  const series: any[] = analytics?.series ?? [];
  const peak = Math.max(1, ...series.map((d) => d.charts + d.asks + d.reports + d.matches));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Total users" value={s.users} sub={s.signups_today ? `+${s.signups_today} today` : ""} tint="#2563EB" icon={Users} />
        <StatTile label="Active (7d)" value={s.active_7d} tint="#059669" icon={Gauge} />
        <StatTile label="Charts" value={s.charts} sub={s.charts_today ? `+${s.charts_today} today` : ""} tint="#D97706" icon={FileText} />
        <StatTile label="Life reports" value={s.reports} tint="#7C3AED" icon={Sparkles} />
        <StatTile label="Chat messages" value={s.chats} tint="#0891B2" icon={MessageSquare} />
        <StatTile label="Actions today" value={s.actions_today} tint="#DB2777" icon={Activity} />
      </div>

      <Funnel />

      {/* usage over time — stacked mini bars, pure CSS */}
      <div className="m-card p-4">
        <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Usage · last 14 days</h3>
        <div className="flex items-end gap-1" style={{ height: 96 }}>
          {series.map((d, i) => {
            const total = d.charts + d.asks + d.reports + d.matches;
            return (
              <div key={i} className="flex flex-1 flex-col justify-end gap-0.5" title={`${d.day}: ${total}`}>
                <div style={{ height: `${(d.asks / peak) * 100}%`, background: "#2563EB" }} className="rounded-sm" />
                <div style={{ height: `${(d.charts / peak) * 100}%`, background: "#D97706" }} className="rounded-sm" />
                <div style={{ height: `${(d.reports / peak) * 100}%`, background: "#7C3AED" }} className="rounded-sm" />
                <div style={{ height: `${(d.matches / peak) * 100}%`, background: "#DB2777" }} className="rounded-sm" />
              </div>
            );
          })}
          {!series.length && <p className="text-[13px] text-muted-foreground">No usage recorded yet.</p>}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <Legend c="#2563EB" t="Questions" /><Legend c="#D97706" t="Charts" />
          <Legend c="#7C3AED" t="Reports" /><Legend c="#DB2777" t="Matches" />
        </div>
      </div>

      <RecentList title="Recent signups" rows={ov?.recentUsers} render={(u: any) => `${u.name} · ${u.email}`} />
      <RecentList title="Recent charts" rows={ov?.recentCharts} render={(c: any) => `${c.person} · by ${c.owner}`} />
    </div>
  );
}

const Legend = ({ c, t }: { c: string; t: string }) => (
  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{t}</span>
);

function RecentList({ title, rows, render }: { title: string; rows: any[]; render: (r: any) => string }) {
  return (
    <div className="m-card p-4">
      <h3 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="divide-y divide-border">
        {(rows ?? []).map((r: any) => (
          <div key={r.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
            <span className="min-w-0 truncate">{render(r)}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{String(r.created_at).slice(0, 10)}</span>
          </div>
        ))}
        {!rows?.length && <p className="py-2 text-[13px] text-muted-foreground">Nothing yet.</p>}
      </div>
    </div>
  );
}

/* ── Users + detail sheet ────────────────────────────────────────────────── */

const PLAN_TINT: Record<string, string> = { free: "#64748B", pro: "#7C3AED", unlimited: "#059669" };

function Users_() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<any[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // The endpoint returns up to 500 accounts and every one of them used to be
  // rendered, which is what made this screen crawl on a phone. Show a page at a
  // time; search reaches the rest, and that is what an admin actually does.
  const PAGE = 40;
  const [shown, setShown] = useState(PAGE);
  const load = useCallback((query = "") => {
    fetch(`/api/admin/users?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => { setUsers(Array.isArray(d) ? d : []); setShown(PAGE); })
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => load(q), 300); return () => clearTimeout(t); }, [q, load]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
        <input
          className="w-full rounded-2xl border border-input bg-card py-3.5 pl-11 pr-4 text-[15px] outline-none focus:border-accent"
          placeholder="Search by name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {users === null && <div className="skeleton h-[72px]" />}
      {users?.length === 0 && <p className="px-1 py-6 text-center text-[13px] text-muted-foreground">No users found.</p>}

      <div className="space-y-2.5">
        {users?.slice(0, shown).map((u) => (
          <Pressable
            key={u.id}
            onClick={() => { haptic.tap(); setOpenId(u.id); }}
            subtle
            className="m-card flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
              <UserCog className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[14.5px] font-bold">{u.name}</span>
                {u.role === "admin" && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" />}
              </span>
              <span className="block truncate text-[12px] text-muted-foreground">{u.email}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: `${PLAN_TINT[u.plan] ?? "#64748B"}22`, color: PLAN_TINT[u.plan] ?? "#64748B" }}>{u.plan}</span>
              <span className="text-[11px] font-bold tabular-nums" style={{ color: u.credits > 0 ? "#C07A1E" : undefined }}>
                {u.credits ?? 0} cr
              </span>
              {u.status !== "active" && <span className="text-[10px] font-bold uppercase text-destructive">{u.status}</span>}
            </span>
          </Pressable>
        ))}
      </div>

      {users && users.length > shown && (
        <Pressable
          onClick={() => setShown((n) => n + PAGE)}
          className="w-full rounded-2xl border border-border py-3 text-center text-[13.5px] font-bold"
        >
          Show more · {shown} of {users.length}
        </Pressable>
      )}

      {openId && <UserSheet id={openId} onClose={() => setOpenId(null)} onChanged={() => load(q)} />}
    </div>
  );
}

/**
 * Where people stop.
 *
 * Totals tell you how busy the app is; this tells you whether it works. Each
 * bar is the share of one signup cohort that got that far, and the drop between
 * two bars is the thing worth fixing next — a launch without this is watching
 * users arrive and never learning which step lost them.
 */
function Funnel() {
  const [days, setDays] = useState(30);
  const [d, setD] = useState<{ signups: number; steps: Array<{ key: string; label: string; users: number }> } | null>(null);

  useEffect(() => {
    setD(null);
    fetch(`/api/admin/funnel?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => x && !x.error && setD(x))
      .catch(() => {});
  }, [days]);

  return (
    <div className="m-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Funnel</h3>
        <div className="flex gap-1">
          {[7, 30, 90].map((n) => (
            <Pressable
              key={n}
              onClick={() => setDays(n)}
              className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${days === n ? "bg-accent/15 text-accent" : "text-muted-foreground"}`}
            >
              {n}d
            </Pressable>
          ))}
        </div>
      </div>

      {!d ? (
        <div className="skeleton h-[150px]" />
      ) : d.signups === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted-foreground">No signups in this window yet.</p>
      ) : (
        <div className="space-y-2">
          {d.steps.map((s, i) => {
            const pct = d.signups ? Math.round((s.users / d.signups) * 100) : 0;
            const prev = i > 0 ? d.steps[i - 1].users : null;
            // The drop from the step before is the number that tells you what to
            // fix; the share of the whole cohort only tells you where you are.
            const dropped = prev !== null && prev > 0 ? prev - s.users : 0;
            return (
              <div key={s.key}>
                <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                  <span className="font-semibold">{s.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    <b className="text-foreground">{s.users}</b> · {pct}%
                    {dropped > 0 && <span className="ml-1.5 text-destructive">−{dropped}</span>}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${Math.max(pct, 1)}%`, background: i === d.steps.length - 1 ? "#34D399" : "var(--color-accent)" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const LIMIT_FIELDS: Array<{ k: string; label: string }> = [
  { k: "chart", label: "Saved kundlis" },
  { k: "report", label: "Life reports / mo" },
  { k: "ask", label: "AI questions / day" },
  { k: "match", label: "Matches / day" },
];

function UserSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [credDelta, setCredDelta] = useState("");
  const [credNote, setCredNote] = useState("");

  const reload = useCallback(() => {
    fetch(`/api/admin/user/${id}`).then((r) => r.json()).then((d) => {
      setData(d);
      const lj = d.user?.limits_json ?? {};
      setLimits(Object.fromEntries(LIMIT_FIELDS.map((f) => [f.k, lj[f.k] != null ? String(lj[f.k]) : ""])));
    }).catch(() => {});
  }, [id]);
  useEffect(() => { reload(); }, [reload]);

  const u = data?.user;

  const act = async (fn: () => Promise<any>, buzz: "success" | "warning" = "success") => {
    haptic[buzz]();
    await fn();
    reload();
    onChanged();
  };

  const saveLimits = () => {
    const body: Record<string, number | null> = {};
    for (const f of LIMIT_FIELDS) {
      const v = limits[f.k]?.trim();
      body[f.k] = v === "" || v == null ? null : Number(v);
    }
    return act(() => post(`/api/admin/user/${id}/limits`, { limits: body }));
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 animate-in fade-in" onClick={onClose} />
      <div
        className="relative z-10 max-h-[86vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-background p-5"
        style={{ paddingBottom: "calc(var(--sab) + 20px)", animation: "m-enter 0.32s var(--spring) both" }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />
        {!u ? (
          <div className="skeleton h-40" />
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-[19px] font-bold">{u.name}</h2>
                <p className="truncate text-[13px] text-muted-foreground">{u.email}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Joined {String(u.created_at).slice(0, 10)} · {u.google ? "Google" : "Email"} · {u.charts?.length ?? 0} charts
                </p>
              </div>
              <Pressable onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-muted">
                <X className="h-5 w-5" />
              </Pressable>
            </div>

            {u.status !== "active" && (
              <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-[13px] text-destructive">
                {u.status === "banned" ? "Banned" : "Blocked"}{u.status_reason ? ` — ${u.status_reason}` : ""}
              </div>
            )}

            {/* live usage */}
            <h3 className="mb-2 mt-5 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Usage now</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {Object.entries(data.usage ?? {}).map(([k, v]: any) => (
                <div key={k} className="rounded-2xl bg-muted p-3">
                  <p className="text-[11px] capitalize text-muted-foreground">{k}</p>
                  <p className="text-[15px] font-bold">{v.used}<span className="text-muted-foreground"> / {v.limit < 0 ? "∞" : v.limit}</span></p>
                </div>
              ))}
            </div>

            {/* money — balance, the trial, what they bought, and every movement.
                Without this an admin answering "why can I not ask a question"
                had to guess whether it was the plan or an empty balance. */}
            <h3 className="mb-2 mt-5 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Credits &amp; money</h3>
            <div className="rounded-2xl border border-border p-3.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-muted-foreground">Balance</span>
                <span className="text-[24px] font-black tabular-nums" style={{ color: "#C07A1E" }}>
                  {data.credits?.balance ?? 0} <span className="text-[13px] font-bold">credits</span>
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
                <span className="text-[12px] text-muted-foreground">Trial</span>
                <span className="text-[12.5px] font-bold">
                  {data.credits?.trial?.active
                    ? `active till ${String(data.credits.trial.ends_at || "").slice(0, 16).replace("T", " ")}`
                    : data.credits?.trial?.used ? "used" : "not used"}
                </span>
              </div>

              {/* Give or take back. Writes a ledger row like every other
                  movement, so an adjustment is as auditable as a purchase. */}
              <div className="mt-3 flex gap-2">
                <input
                  className="w-20 rounded-xl border border-input bg-card px-3 py-2 text-[14px] tabular-nums outline-none focus:border-accent"
                  placeholder="±50"
                  inputMode="numeric"
                  value={credDelta}
                  onChange={(e) => setCredDelta(e.target.value)}
                />
                <input
                  className="min-w-0 flex-1 rounded-xl border border-input bg-card px-3 py-2 text-[13px] outline-none focus:border-accent"
                  placeholder="Reason (kept in the ledger)"
                  value={credNote}
                  onChange={(e) => setCredNote(e.target.value)}
                />
              </div>
              <Pressable
                onClick={() => {
                  const d = Number(credDelta);
                  if (!Number.isFinite(d) || d === 0) return;
                  act(() => post(`/api/admin/user/${id}/credits`, { delta: d, note: credNote }));
                  setCredDelta(""); setCredNote("");
                }}
                subtle
                className="mt-2 w-full rounded-xl bg-accent/15 py-2.5 text-center text-[13.5px] font-bold text-accent"
              >
                Apply adjustment
              </Pressable>

              {!!data.credits?.payments?.length && (
                <>
                  <p className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Purchases</p>
                  {data.credits.payments.slice(0, 6).map((p: any) => (
                    <div key={p.order_id} className="flex justify-between gap-3 border-t border-border py-1.5 text-[12px]">
                      <span className="min-w-0 truncate text-muted-foreground">
                        {p.pack_id} · {String(p.created_at).slice(0, 10)}
                      </span>
                      <span className="shrink-0 font-bold">
                        ₹{p.amount_paise / 100}
                        <span className="ml-1.5" style={{ color: p.status === "paid" ? "#34D399" : "#F87171" }}>{p.status}</span>
                      </span>
                    </div>
                  ))}
                </>
              )}

              {!!data.credits?.ledger?.length && (
                <>
                  <p className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Every movement</p>
                  {data.credits.ledger.slice(0, 8).map((l: any, i: number) => (
                    <div key={i} className="flex justify-between gap-3 border-t border-border py-1.5 text-[12px]">
                      <span className="min-w-0 truncate text-muted-foreground">
                        {l.reason}{l.note ? ` · ${l.note}` : ""} · {String(l.created_at).slice(0, 10)}
                      </span>
                      <span className="shrink-0 font-bold tabular-nums" style={{ color: l.delta > 0 ? "#34D399" : "#F87171" }}>
                        {l.delta > 0 ? "+" : ""}{l.delta}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* plan */}
            <h3 className="mb-2 mt-5 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Plan</h3>
            <div className="grid grid-cols-3 gap-2">
              {(["free", "pro", "unlimited"] as const).map((p) => (
                <Pressable
                  key={p}
                  onClick={() => act(() => post(`/api/admin/user/${id}/plan`, { plan: p }))}
                  subtle
                  className={`rounded-2xl border py-2.5 text-center text-[13px] font-bold capitalize ${u.plan === p ? "border-accent bg-accent/10 text-accent" : "border-border"}`}
                >
                  {p}
                </Pressable>
              ))}
            </div>

            {/* per-user limit overrides */}
            <h3 className="mb-1 mt-5 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Custom limits</h3>
            <p className="mb-2 text-[11px] text-muted-foreground">Blank = use plan default. −1 = unlimited.</p>
            <div className="grid grid-cols-2 gap-2.5">
              {LIMIT_FIELDS.map((f) => (
                <label key={f.k} className="text-[12px]">
                  <span className="text-muted-foreground">{f.label}</span>
                  <input
                    inputMode="numeric"
                    className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-2 text-[14px] outline-none focus:border-accent"
                    value={limits[f.k] ?? ""}
                    onChange={(e) => setLimits((s) => ({ ...s, [f.k]: e.target.value }))}
                    placeholder="default"
                  />
                </label>
              ))}
            </div>
            <Pressable onClick={saveLimits} className="mt-3 w-full rounded-full bg-accent py-3 text-center text-[14px] font-bold text-accent-foreground">
              Save limits
            </Pressable>

            {/* danger + role */}
            <h3 className="mb-2 mt-5 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Account actions</h3>
            <div className="space-y-2">
              <Pressable
                onClick={() => act(() => post(`/api/admin/user/${id}/role`, { role: u.role === "admin" ? "user" : "admin" }))}
                subtle
                className="flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left text-[14px] font-semibold"
              >
                <ShieldCheck className="h-5 w-5 text-accent" />
                {u.role === "admin" ? "Revoke admin" : "Make admin"}
              </Pressable>

              <input
                className="w-full rounded-2xl border border-input bg-card px-4 py-2.5 text-[14px] outline-none focus:border-accent"
                placeholder="Reason (shown to the user)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                {u.status === "active" ? (
                  <>
                    <Pressable onClick={() => act(() => post(`/api/admin/user/${id}/status`, { status: "blocked", reason }), "warning")} subtle className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500/15 py-3 text-[13.5px] font-bold text-amber-600">
                      <Ban className="h-4 w-4" /> Block
                    </Pressable>
                    <Pressable onClick={() => act(() => post(`/api/admin/user/${id}/status`, { status: "banned", reason }), "warning")} subtle className="flex items-center justify-center gap-2 rounded-2xl bg-destructive/15 py-3 text-[13.5px] font-bold text-destructive">
                      <Ban className="h-4 w-4" /> Ban
                    </Pressable>
                  </>
                ) : (
                  <Pressable onClick={() => act(() => post(`/api/admin/user/${id}/status`, { status: "active", reason: "" }))} subtle className="col-span-2 flex items-center justify-center gap-2 rounded-2xl bg-emerald-500/15 py-3 text-[13.5px] font-bold text-emerald-600">
                    <ShieldCheck className="h-4 w-4" /> Reactivate account
                  </Pressable>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── API keys ────────────────────────────────────────────────────────────── */

const PROVIDERS = ["gemini", "groq", "openrouter", "openai", "anthropic", "elevenlabs"];

function Keys() {
  const [keys, setKeys] = useState<any[] | null>(null);
  const [provider, setProvider] = useState("gemini");
  const [secret, setSecret] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/keys").then((r) => r.json()).then((d) => setKeys(Array.isArray(d) ? d : [])).catch(() => setKeys([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!secret.trim()) { haptic.warning(); return; }
    setBusy(true);
    haptic.medium();
    await post("/api/admin/keys", { provider, secret: secret.trim(), label: label.trim() || undefined }).catch(() => {});
    setSecret(""); setLabel(""); setBusy(false);
    load();
  };

  const toggle = async (k: any) => { haptic.tap(); await post(`/api/admin/keys/${k.id}/enabled`, { enabled: !k.enabled }); load(); };
  const remove = async (k: any) => { haptic.warning(); await fetch(`/api/admin/keys/${k.id}`, { method: "DELETE" }); load(); };

  return (
    <div className="space-y-4">
      <div className="m-card p-4">
        <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Add a provider key</h3>
        <div className="mb-2 grid grid-cols-3 gap-2">
          {PROVIDERS.map((p) => (
            <Pressable key={p} onClick={() => { haptic.select(); setProvider(p); }} subtle className={`rounded-xl border py-2 text-center text-[12px] font-bold capitalize ${provider === p ? "border-accent bg-accent/10 text-accent" : "border-border"}`}>
              {p}
            </Pressable>
          ))}
        </div>
        <input className="mb-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-[14px] outline-none focus:border-accent" placeholder="Paste the API key" value={secret} onChange={(e) => setSecret(e.target.value)} />
        <input className="mb-3 w-full rounded-2xl border border-input bg-card px-4 py-3 text-[14px] outline-none focus:border-accent" placeholder="Label (optional, e.g. 'Account 2')" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Pressable onClick={add} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3 text-[14px] font-bold text-accent-foreground">
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} /> {busy ? "Saving…" : "Add key"}
        </Pressable>
        <p className="mt-2 text-[11px] text-muted-foreground">Stored encrypted. Takes effect immediately — no redeploy.</p>
      </div>

      {keys === null && <div className="skeleton h-16" />}
      {keys?.length === 0 && <p className="px-1 py-4 text-center text-[13px] text-muted-foreground">No keys stored. The app falls back to the server's .env keys.</p>}

      <div className="space-y-2.5">
        {keys?.map((k) => (
          <div key={k.id} className="m-card flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[14px] font-bold capitalize">{k.provider}</span>
                {k.label && <span className="text-[11px] text-muted-foreground">{k.label}</span>}
              </span>
              <span className="block font-mono text-[12px] text-muted-foreground">{k.masked}</span>
            </span>
            <Switch on={!!k.enabled} onChange={() => toggle(k)} label={`Toggle ${k.provider} key`} />
            <Pressable onClick={() => remove(k)} subtle aria-label="Delete" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-destructive">
              <Trash2 className="h-[18px] w-[18px]" />
            </Pressable>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── System (read-only AI provider health) ───────────────────────────────── */

function System() {
  const [ov, setOv] = useState<any>(null);
  useEffect(() => { fetch("/api/admin/overview").then((r) => r.json()).then((d) => !d.error && setOv(d)).catch(() => {}); }, []);
  if (!ov) return <div className="skeleton h-40" />;
  return (
    <div className="space-y-4">
      <div className="m-card p-4">
        <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Environment</h3>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            ["Chart engine", ov.system?.engine],
            ["Database", ov.system?.database],
            ["Ayanamsa", ov.system?.ayanamsa === 1 ? "Lahiri" : ov.system?.ayanamsa],
            ["ElevenLabs", ov.system?.elevenlabs ? "On" : "Off"],
            ["Email (SMTP)", ov.system?.email_smtp ? "On" : "Off"],
            ["Local AI", ov.system?.ollama ? "On" : "Off"],
          ].map(([k, v]: any) => (
            <div key={k} className="rounded-2xl bg-muted p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k}</p>
              <p className="text-[14px] font-semibold">{String(v)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="m-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          <Activity className="h-4 w-4" /> AI providers · fallback order
        </h3>
        <div className="space-y-2">
          {(ov.ai?.providers ?? []).map((p: any) => (
            <div key={p.name} className="flex items-center justify-between rounded-2xl bg-muted px-3 py-2.5">
              <span className="flex items-center gap-2">
                <span className="text-[13px] font-semibold">{p.name}</span>
                {ov.ai?.active === p.name && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-600">active</span>}
              </span>
              <span className="flex gap-3 text-[11px] text-muted-foreground">
                <span className="text-emerald-600">{p.success}✓</span>
                <span className="text-destructive">{p.failures}✕</span>
                <span className="text-amber-600">{p.quotaHits} quota</span>
              </span>
            </div>
          ))}
          {!ov.ai?.providers?.length && <p className="text-[13px] text-muted-foreground">No providers configured.</p>}
        </div>
      </div>
    </div>
  );
}

/* ── Controls (maintenance / announcement / feature flags) ───────────────── */

const FEATURE_LABELS: Record<string, string> = {
  chat: "AI Chat (Ask / Sectors / Transit)",
  reports: "Life Reports",
  tts: "Voice (ElevenLabs)",
  horoscope: "Daily Horoscope",
  match: "Match AI summary",
};

function Controls() {
  const [maint, setMaint] = useState({ enabled: false, message: "" });
  const [ann, setAnn] = useState({ enabled: false, message: "" });
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/admin/maintenance").then((r) => r.json()).then((d) => !d.error && setMaint({ enabled: !!d.enabled, message: d.message || "" })).catch(() => {});
    fetch("/api/admin/announcement").then((r) => r.json()).then((d) => !d.error && setAnn({ enabled: !!d.enabled, message: d.message || "" })).catch(() => {});
    fetch("/api/admin/features").then((r) => r.json()).then((d) => !d.error && setFeatures(d || {})).catch(() => {});
  }, []);

  // APK downloads. Kept next to the other system controls because publishing
  // the number to the public site is a real decision, not a display preference.
  const [dl, setDl] = useState<{ total: number; today: number; week: number; public: boolean } | null>(null);
  const [pay, setPay] = useState<{ totals: any; payments: any[] } | null>(null);
  useEffect(() => {
    fetch("/api/admin/downloads").then((r) => r.json()).then((d) => !d.error && setDl(d)).catch(() => {});
    fetch("/api/admin/payments").then((r) => r.json()).then((d) => !d.error && setPay(d)).catch(() => {});
  }, []);

  const featureOn = (k: string) => features[k] !== false;

  // These controls gate AI billing and can pause the whole app, so an optimistic
  // update the server rejected must roll back and say so — not sit there
  // looking applied.
  const [sysError, setSysError] = useState("");
  const commit = async (label: string, call: () => Promise<any>, revert: () => void) => {
    setSysError("");
    try { await call(); }
    catch (e: any) {
      revert();
      haptic.error();
      setSysError(`${label} failed — ${e?.message || "the server rejected it"}. Nothing was changed.`);
    }
  };

  const toggleFeature = (k: string) => {
    haptic.tap();
    const prev = features;
    const next = !featureOn(k);
    setFeatures((f) => ({ ...f, [k]: next }));
    commit(`Toggling ${k}`, () => post("/api/admin/features", { [k]: next }), () => setFeatures(prev));
  };

  return (
    <div className="space-y-4">
      {sysError && (
        <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-[12.5px] leading-relaxed text-destructive">
          {sysError}
        </p>
      )}
      <div className="m-card p-4">
        <h3 className="mb-2 flex items-center gap-2 text-[14px] font-bold">
          <IndianRupee className="h-4 w-4 text-accent" /> Payments
        </h3>
        {pay ? (
          <>
            <div className="grid grid-cols-4 gap-2">
              {([
                ["Earned", "\u20b9" + (pay.totals.paid_paise / 100).toLocaleString("en-IN"), ""],
                ["Paid", pay.totals.paid_count, ""],
                ["Trials", pay.totals.trials, ""],
                ["Failed", pay.totals.failed, ""],
                ["Pending", pay.totals.pending ?? 0, (pay.totals.pending ?? 0) > 0 ? "#E8B44A" : ""],
                // These two must read zero. Anything else is money taken and
                // nothing delivered, so they are coloured to be impossible to
                // scroll past rather than buried in the list below.
                ["Not credited", pay.totals.unhonoured ?? 0, (pay.totals.unhonoured ?? 0) > 0 ? "#F87171" : ""],
                ["Refund due", pay.totals.needs_refund ?? 0, (pay.totals.needs_refund ?? 0) > 0 ? "#F87171" : ""],
                ["Avg", "\u20b9" + (pay.totals.paid_count ? Math.round(pay.totals.paid_paise / 100 / pay.totals.paid_count) : 0), ""],
              ] as const).map(([l, v, tint]) => (
                <div
                  key={l}
                  className={`rounded-2xl px-2 py-2.5 text-center ${tint ? "" : "bg-muted"}`}
                  style={tint ? { background: `${tint}22`, color: tint } : undefined}
                >
                  <p className="text-[16px] font-bold leading-none">{v}</p>
                  <p className={`mt-1 text-[10.5px] ${tint ? "opacity-80" : "text-muted-foreground"}`}>{l}</p>
                </div>
              ))}
            </div>
            {/* Every row names the account, because a dispute is answered with
                "this email, this order, this amount, this time" — not an id. */}
            <div className="mt-3 divide-y divide-border">
              {pay.payments.slice(0, 25).map((p: any) => {
                const owed = p.status === "paid" && !p.credited && p.pack_id !== "trial";
                return (
                  <details key={p.order_id} className="py-2.5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">{p.email}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {p.pack_id} · {String(p.created_at).slice(0, 16).replace("T", " ")}
                          {p.credits ? ` · ${p.credits} cr` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[13px] font-bold">₹{p.amount_paise / 100}</span>
                        <span
                          className="block text-[10.5px] font-bold"
                          style={{
                            color: owed || p.needs_refund ? "#F87171"
                                 : p.status === "paid" ? "#34D399"
                                 : p.status === "created" ? "#E8B44A" : "#F87171",
                          }}
                        >
                          {p.needs_refund ? "refund due" : owed ? "NOT CREDITED" : p.status}
                        </span>
                      </span>
                    </summary>
                    {/* A dispute is answered with facts, so every one of them is
                        here: who, which order, which payment id, what was
                        promised, whether it was actually delivered, and when. */}
                    <dl className="mt-2 space-y-1 rounded-xl bg-muted/60 px-3 py-2.5 text-[11.5px]">
                      {([
                        ["Name", p.name],
                        ["User id", p.user_id],
                        ["Order id", p.order_id],
                        ["Payment id", p.payment_id || "—"],
                        ["Amount", `₹${p.amount_paise / 100} ${p.currency || "INR"} · ${p.provider || "razorpay"}`],
                        ["Buys", p.pack_id === "trial" ? `${p.pack_id} (access, 0 credits)` : `${p.credits} credits`],
                        ["Delivered", p.pack_id === "trial"
                          ? (p.trial_used ? `trial active till ${String(p.trial_ends_at || "").slice(0, 16).replace("T", " ")}` : "NOT started")
                          : (p.credited ? "credits in ledger" : "NOT in ledger")],
                        ["Balance now", `${p.user_balance ?? 0} credits`],
                        ["Created", String(p.created_at).replace("T", " ").slice(0, 19)],
                        ["Updated", String(p.updated_at || p.created_at).replace("T", " ").slice(0, 19)],
                        ["Note", p.failure_reason || "—"],
                      ] as const).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3">
                          <dt className="shrink-0 text-muted-foreground">{k}</dt>
                          <dd className="min-w-0 break-all text-right font-medium">{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                );
              })}
              {!pay.payments.length && (
                <p className="py-2 text-[13px] text-muted-foreground">No payments yet.</p>
              )}
            </div>
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        )}
      </div>

      <div className="m-card p-4">
        <h3 className="mb-2 flex items-center gap-2 text-[14px] font-bold">
          <TrendingUp className="h-4 w-4 text-accent" /> App downloads
        </h3>
        {dl ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {([["Total", dl.total], ["Last 7 days", dl.week], ["Today", dl.today]] as const).map(([l, v]) => (
                <div key={l} className="rounded-2xl bg-muted px-3 py-2.5 text-center">
                  <p className="text-[20px] font-bold leading-none">{v.toLocaleString("en-IN")}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold">Show the count on the website</span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
                  Publishes the total under the download button. Off by default — a
                  low number is worse than no number.
                </span>
              </span>
              <Switch
                on={dl.public}
                label="Show download count publicly"
                onChange={(next) => {
                  const prev = dl;
                  setDl({ ...dl, public: next });
                  commit("Publishing the download count",
                    () => post("/api/admin/downloads/public", { enabled: next }),
                    () => setDl(prev));
                }}
              />
            </div>
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        )}
      </div>

      <div className="m-card p-4">
        <h3 className="mb-2 flex items-center gap-2 text-[14px] font-bold"><Power className="h-4 w-4 text-accent" /> Maintenance mode</h3>
        <p className="mb-3 text-[12px] text-muted-foreground">When paused, regular users see a message; admins keep access.</p>
        <input className="mb-3 w-full rounded-2xl border border-input bg-card px-4 py-3 text-[14px] outline-none focus:border-accent" placeholder="Maintenance message (optional)" value={maint.message} onChange={(e) => setMaint((m) => ({ ...m, message: e.target.value }))} />
        <div className="grid grid-cols-2 gap-2">
          <Pressable onClick={() => { haptic.success(); const p0 = maint; setMaint((m) => ({ ...m, enabled: false })); commit("Going live", () => post("/api/admin/maintenance", { enabled: false, message: maint.message }), () => setMaint(p0)); }} subtle className={`rounded-2xl py-3 text-center text-[13.5px] font-bold ${!maint.enabled ? "bg-emerald-500/15 text-emerald-600" : "border border-border"}`}>App Live</Pressable>
          <Pressable onClick={() => { haptic.warning(); const p0 = maint; setMaint((m) => ({ ...m, enabled: true })); commit("Pausing the app", () => post("/api/admin/maintenance", { enabled: true, message: maint.message }), () => setMaint(p0)); }} subtle className={`rounded-2xl py-3 text-center text-[13.5px] font-bold ${maint.enabled ? "bg-destructive/15 text-destructive" : "border border-border"}`}>Pause App</Pressable>
        </div>
      </div>

      <div className="m-card p-4">
        <h3 className="mb-2 flex items-center gap-2 text-[14px] font-bold"><Megaphone className="h-4 w-4 text-accent" /> Announcement banner</h3>
        <input className="mb-3 w-full rounded-2xl border border-input bg-card px-4 py-3 text-[14px] outline-none focus:border-accent" placeholder="e.g. Kundli Matching is now live!" value={ann.message} onChange={(e) => setAnn((a) => ({ ...a, message: e.target.value }))} />
        <div className="grid grid-cols-2 gap-2">
          <Pressable onClick={() => { haptic.success(); const p0 = ann; setAnn((a) => ({ ...a, enabled: true })); commit("Showing the announcement", () => post("/api/admin/announcement", { enabled: true, message: ann.message }), () => setAnn(p0)); }} subtle className="rounded-2xl bg-accent py-3 text-center text-[13.5px] font-bold text-accent-foreground">Show</Pressable>
          <Pressable onClick={() => { haptic.tap(); const p0 = ann; setAnn((a) => ({ ...a, enabled: false })); commit("Hiding the announcement", () => post("/api/admin/announcement", { enabled: false, message: ann.message }), () => setAnn(p0)); }} subtle className="rounded-2xl border border-border py-3 text-center text-[13.5px] font-bold">Hide</Pressable>
        </div>
      </div>

      <ChangePassword />

      <div className="m-card p-4">
        <h3 className="mb-2 flex items-center gap-2 text-[14px] font-bold"><ToggleLeft className="h-4 w-4 text-accent" /> Feature flags</h3>
        <p className="mb-3 text-[12px] text-muted-foreground">Turn AI features off to save credits. They fail gracefully for users.</p>
        <div className="space-y-2">
          {Object.entries(FEATURE_LABELS).map(([k, label]) => (
            <div key={k} className="flex items-center justify-between rounded-2xl bg-muted px-4 py-3">
              <span className="text-[13.5px] font-medium">{label}</span>
              <Switch on={featureOn(k)} onChange={() => toggleFeature(k)} label={`Toggle ${label}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Shell ───────────────────────────────────────────────────────────────── */

/** Change the signed-in admin's own password. */
function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    setMsg(null);
    if (next.length < 6) return setMsg({ ok: false, text: "New password must be at least 6 characters." });
    if (next !== confirm) return setMsg({ ok: false, text: "Both new passwords must match." });
    setBusy(true);
    try {
      const res = await post("/api/auth/change-password", { currentPassword: current, newPassword: next });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not change the password.");
      haptic.success();
      setMsg({ ok: true, text: "Password updated." });
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e: any) {
      haptic.error();
      setMsg({ ok: false, text: e?.message || "Could not change the password." });
    } finally { setBusy(false); }
  };

  const cls = "w-full rounded-2xl border border-input bg-card px-4 py-3 text-[14px] outline-none focus:border-accent";
  return (
    <div className="m-card p-4">
      <h3 className="mb-2 flex items-center gap-2 text-[14px] font-bold">
        <KeyRound className="h-4 w-4 text-accent" /> Change your password
      </h3>
      <p className="mb-3 text-[12px] text-muted-foreground">
        Updates the password for your admin account ({/* signed-in account */}this login).
      </p>
      <div className="space-y-2">
        <input type="password" className={cls} placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <input type="password" className={cls} placeholder="New password (6+ characters)" value={next} onChange={(e) => setNext(e.target.value)} />
        <input type="password" className={cls} placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {msg && (
        <p className={`mt-2 px-1 text-[12.5px] font-medium ${msg.ok ? "text-emerald-500" : "text-destructive"}`}>{msg.text}</p>
      )}
      <Pressable
        onClick={submit}
        disabled={busy}
        feedback="medium"
        className="mt-3 flex w-full items-center justify-center rounded-2xl bg-accent py-3 text-[13.5px] font-bold text-accent-foreground"
      >
        {busy ? "Updating…" : "Update password"}
      </Pressable>
    </div>
  );
}

function Reviews() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/feedback").then((r) => r.json()).then((d) => setRows(Array.isArray(d) ? d : [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Publishing puts a real person's name and stars on the public website, so
  // the UI must not claim it happened when the request failed — these used to
  // swallow the error and update the list regardless.
  const [rowError, setRowError] = useState("");

  const setApproved = async (id: string, approved: boolean) => {
    setBusy(id); haptic.tap(); setRowError("");
    try {
      await post(`/api/admin/feedback/${id}/approved`, { approved });
      setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, approved } : r)) ?? rs);
    } catch (e: any) {
      haptic.error();
      setRowError(`Couldn't ${approved ? "publish" : "unpublish"} that review — ${e?.message || "the server rejected it"}.`);
    } finally { setBusy(null); }
  };
  const remove = async (id: string) => {
    setBusy(id); haptic.warning(); setRowError("");
    try {
      const r = await fetch(`/api/admin/feedback/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(String(r.status));
      setRows((rs) => rs?.filter((x) => x.id !== id) ?? rs);
    } catch (e: any) {
      haptic.error();
      setRowError(`Couldn't delete that review — ${e?.message || "the server rejected it"}.`);
    } finally { setBusy(null); }
  };

  if (rows === null) return <div className="skeleton h-[200px]" />;
  if (!rows.length) return (
    <div className="m-card p-6 text-center">
      <Star className="mx-auto h-7 w-7 text-accent" />
      <p className="mt-2 text-[14px] font-bold">No feedback yet</p>
      <p className="mt-1 text-[12px] text-muted-foreground">Ratings from the app will show up here for you to publish.</p>
    </div>
  );

  const pending = rows.filter((r) => !r.approved).length;

  return (
    <div className="space-y-3">
      <p className="px-1 text-[12px] text-muted-foreground">
        {rows.length} total · {pending} awaiting review. Approved 4-5★ reviews show on the website.
      </p>
      {rowError && (
        <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-[12.5px] leading-relaxed text-destructive">
          {rowError}
        </p>
      )}
      {rows.map((r) => {
        const rating = Math.max(1, Math.min(5, Number(r.rating) || 0));
        // A silent 4-5★ is publishable — the wall shows the stars and the name.
        // Only the rating decides eligibility; text is optional.
        const positive = rating >= 4;
        return (
          <div key={r.id} className="m-card p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-accent">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-[15px] w-[15px]" fill={i < rating ? "currentColor" : "none"} strokeWidth={1.8} />
                ))}
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${r.approved ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                {r.approved ? "Published" : "Hidden"}
              </span>
            </div>
            {r.comment && <p className="mt-2 text-[13.5px] leading-relaxed">“{r.comment}”</p>}
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              {(r.name || "Anonymous")}{r.context ? ` · ${r.context}` : ""}{r.created_at ? ` · ${String(r.created_at).slice(0, 10)}` : ""}
              {!positive && " · low rating — publish only if you mean to"}
              {positive && !(r.comment ?? "").trim() && " · stars only, no text"}
            </p>
            <div className="mt-3 flex gap-2">
              {r.approved ? (
                <Pressable
                  onClick={() => setApproved(r.id, false)}
                  disabled={busy === r.id}
                  subtle
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border py-2.5 text-[12.5px] font-bold"
                >
                  <EyeOff className="h-4 w-4" /> Unpublish
                </Pressable>
              ) : (
                <Pressable
                  onClick={() => setApproved(r.id, true)}
                  disabled={busy === r.id}
                  feedback="medium"
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-[12.5px] font-bold ${positive ? "bg-accent text-accent-foreground" : "border border-border text-muted-foreground"}`}
                >
                  <Check className="h-4 w-4" /> Publish
                </Pressable>
              )}
              <Pressable
                onClick={() => remove(r.id)}
                disabled={busy === r.id}
                subtle
                aria-label="Delete"
                className="grid h-[38px] w-[42px] shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </Pressable>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminPage() {
  const [section, setSection] = useState<SectionKey>("overview");

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-2 px-1">
        <Shield className="h-6 w-6 text-accent" />
        <h1 className="text-[20px] font-bold">Admin</h1>
      </div>

      {/* section switcher — horizontal scroll chips */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const on = section === s.k;
          return (
            <Pressable
              key={s.k}
              onClick={() => { haptic.select(); setSection(s.k); }}
              subtle
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold ${on ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}
            >
              <Icon className="h-4 w-4" /> {s.label}
            </Pressable>
          );
        })}
      </div>

      <div className="m-enter" key={section}>
        {section === "overview" && <Overview />}
        {section === "users" && <Users_ />}
        {section === "reviews" && <Reviews />}
        {section === "keys" && <Keys />}
        {section === "system" && <System />}
        {section === "controls" && <Controls />}
      </div>
    </div>
  );
}
