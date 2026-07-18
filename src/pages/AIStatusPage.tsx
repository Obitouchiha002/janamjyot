import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Circle, RefreshCw, Lock } from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";
import { useAuth } from "@/auth";

interface ProviderStat {
  name: string;
  requests: number;
  success: number;
  failures: number;
  quotaHits: number;
  lastStatus: "ok" | "quota" | "error" | "untested";
  lastError?: string;
  lastUsedAt?: string;
  rateLimit?: Record<string, string>;
}
interface AiStatus {
  order: string[];
  providers: ProviderStat[];
  active: string | null;
}

// Semantic status tints (hex, like the tinted rows on the More screen) so they
// read the same on every theme instead of leaning on hardcoded gray/green utilities.
const STATUS_META: Record<string, { tint: string; label: string; Icon: any }> = {
  ok: { tint: "#34D399", label: "Working", Icon: CheckCircle2 },
  quota: { tint: "#F87171", label: "Limit reached", Icon: XCircle },
  error: { tint: "#E8B44A", label: "Error", Icon: AlertTriangle },
  untested: { tint: "#8A8AA3", label: "Not used yet", Icon: Circle },
};

export default function AIStatusPage() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = user?.role === "admin";
  const [data, setData] = useState<AiStatus | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>("");

  const fetchStatus = () => {
    fetch("/api/ai-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || d.error) return;
        setData(d);
        setUpdatedAt(new Date().toLocaleTimeString());
      })
      .catch(() => {});
  };

  // Live: refresh every 4 seconds. Admins only — the server enforces this too.
  useEffect(() => {
    if (!isAdmin) return;
    fetchStatus();
    const t = setInterval(fetchStatus, 4000);
    return () => clearInterval(t);
  }, [isAdmin]);

  if (authLoading) {
    return (
      <div className="space-y-3 pt-2">
        <div className="skeleton h-[60px]" />
        <div className="skeleton h-[150px]" />
      </div>
    );
  }

  // Provider/model internals are never shown to normal users.
  if (!isAdmin) {
    return (
      <div className="m-card m-enter mt-6 p-6 text-center">
        <Lock className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
        <p className="text-[15px] font-bold">Admins only</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          This page shows internal system health and is not available to app users.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3 pt-2">
        <div className="skeleton h-[60px]" />
        <div className="skeleton h-[150px]" />
        <div className="skeleton h-[150px]" />
      </div>
    );
  }

  if (data.providers.length === 0) {
    return (
      <div className="m-card m-enter mt-6 p-6 text-center">
        <p className="text-[15px] font-bold">No AI providers configured</p>
        <p className="selectable mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5">.env.local</code> add a key
          (GEMINI_API_KEY, GROQ_API_KEY, …).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-2">
      {/* summary */}
      <section className="m-card m-enter p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Active provider
            </p>
            <p className="mt-1 truncate text-[20px] font-bold text-accent">{data.active || "—"}</p>
          </div>
          <Pressable
            onClick={fetchStatus}
            aria-label="Refresh now"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
          >
            <RefreshCw className="h-[18px] w-[18px]" />
          </Pressable>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          Fallback order: {data.order.join(" → ")}
        </p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">Updated {updatedAt}</p>
      </section>

      {/* providers */}
      <section className="space-y-3">
        {data.providers.map((p, i) => {
          const meta = STATUS_META[p.lastStatus] ?? STATUS_META.untested;
          const isActive = p.name === data.active;
          const remaining = p.rateLimit?.["x-ratelimit-remaining-requests"];
          const limit = p.rateLimit?.["x-ratelimit-limit-requests"];
          const reset = p.rateLimit?.["x-ratelimit-reset-requests"];
          return (
            <div
              key={p.name}
              className={`m-card m-enter p-4 ${isActive ? "ring-2 ring-accent" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-[11px] font-bold text-muted-foreground">#{i + 1}</span>
                  <span className="truncate text-[15px] font-bold">{p.name}</span>
                  {isActive && (
                    <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-accent">
                      Active
                    </span>
                  )}
                </div>
                <span
                  className="flex shrink-0 items-center gap-1 text-[11.5px] font-bold"
                  style={{ color: meta.tint }}
                >
                  <meta.Icon className="h-[15px] w-[15px]" /> {meta.label}
                </span>
              </div>

              <div className="mt-3.5 grid grid-cols-3 gap-2">
                <Stat label="Used" value={p.requests} />
                <Stat label="OK" value={p.success} tint="#34D399" />
                <Stat label="Limit hits" value={p.quotaHits} tint="#F87171" />
              </div>

              {remaining !== undefined && (
                <p className="mt-3 text-[12px] text-muted-foreground">
                  Remaining this window: <span className="font-bold text-foreground">{remaining}</span>
                  {limit ? ` / ${limit}` : ""} {reset ? `· reset ${reset}` : ""}
                </p>
              )}

              {p.lastStatus === "quota" && (
                <p className="mt-2 text-[12px] text-destructive">
                  Limit reached — requests are flowing to the next key.
                </p>
              )}
              {p.lastError && p.lastStatus === "error" && (
                <p className="selectable mt-2 break-words text-[12px]" style={{ color: "#E8B44A" }}>
                  Last error: {p.lastError}
                </p>
              )}
              {p.lastUsedAt && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Last used: {new Date(p.lastUsedAt).toLocaleString()}
                </p>
              )}
            </div>
          );
        })}
      </section>

      <p className="selectable px-1 pb-2 text-[11.5px] leading-relaxed text-muted-foreground">
        Note: Gemini does not report exact remaining quota, so usage counts and limit status are shown
        instead. Groq, OpenAI and OpenRouter also report remaining requests from their rate-limit headers.
      </p>
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: number; tint?: string }) {
  return (
    <div className="rounded-2xl bg-muted py-2.5 text-center">
      <p className="text-[18px] font-bold" style={tint ? { color: tint } : undefined}>
        {value}
      </p>
      <p className="mt-0.5 text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
