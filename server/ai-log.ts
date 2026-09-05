/**
 * What every AI call would cost if nothing were free.
 *
 * The failover chain runs on free tiers today. That is a discount, not a
 * business model: quotas move, terms change, and a product priced against ₹0
 * discovers its real margin on the day the discount stops. So every call is
 * costed at list price whoever actually served it, and the number that matters
 * is written down before it is needed rather than reconstructed after.
 *
 * The question this exists to answer is narrow and specific: a ₹49 pack buys
 * fifty questions, which is about ₹0.96 of revenue per question after the
 * gateway takes its cut. If a normal chat costs more than roughly ₹0.30 of
 * paid-equivalent AI, the pack is a slow leak rather than a product — and
 * nobody would notice until the free tier ended.
 *
 * Writes are fire-and-forget and never block a reply. A missing cost row is a
 * gap in a report; a failed answer is a person who does not come back.
 */
import { pool, USE_PG } from "./db";

export interface AiCall {
  provider: string;
  purpose: string;
  in_tokens: number;
  out_tokens: number;
  cost_paise: number;
  latency_ms: number;
  /** 1 = first provider tried. Higher means the ones before it failed. */
  attempt: number;
  ok: boolean;
}

let warned = false;

export async function logAiCall(c: AiCall): Promise<void> {
  if (!USE_PG || !pool) return;
  try {
    await pool.query(
      `INSERT INTO ai_calls (provider, purpose, in_tokens, out_tokens, cost_paise, latency_ms, attempt, ok)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [c.provider, c.purpose, c.in_tokens, c.out_tokens, c.cost_paise, c.latency_ms, c.attempt, c.ok],
    );
  } catch (e: any) {
    // Say it once. A broken costing table must not fill the logs on every reply.
    if (!warned) { warned = true; console.warn("[ai-log] not recording:", e?.message); }
  }
}

/**
 * Cost and reliability over a window, and the per-chat figure the ₹0.30 alarm
 * is set against.
 */
export async function aiCostStats(days = 30) {
  if (!USE_PG || !pool) return null;
  const [totals, byPurpose, byProvider] = await Promise.all([
    pool.query(
      `SELECT count(*)::int                                            AS calls,
              COALESCE(SUM(cost_paise),0)::int                         AS paise,
              COALESCE(AVG(latency_ms),0)::int                         AS avg_ms,
              count(*) FILTER (WHERE NOT ok)::int                      AS failures,
              count(*) FILTER (WHERE attempt > 1)::int                 AS fallbacks
         FROM ai_calls WHERE created_at > now() - ($1 || ' days')::interval`, [days]),
    pool.query(
      `SELECT purpose,
              count(*) FILTER (WHERE ok)::int                          AS calls,
              COALESCE(SUM(cost_paise) FILTER (WHERE ok),0)::int       AS paise
         FROM ai_calls WHERE created_at > now() - ($1 || ' days')::interval
        GROUP BY purpose ORDER BY paise DESC LIMIT 10`, [days]),
    pool.query(
      `SELECT provider, count(*)::int AS calls,
              count(*) FILTER (WHERE NOT ok)::int AS failures,
              COALESCE(SUM(cost_paise),0)::int    AS paise
         FROM ai_calls WHERE created_at > now() - ($1 || ' days')::interval
        GROUP BY provider ORDER BY calls DESC`, [days]),
  ]);
  const t = totals.rows[0] ?? {};
  const chat = byPurpose.rows.find((r: any) => r.purpose === "chat");
  return {
    days,
    calls: t.calls ?? 0,
    rupees: +(((t.paise ?? 0) / 100).toFixed(2)),
    avg_ms: t.avg_ms ?? 0,
    failures: t.failures ?? 0,
    fallbacks: t.fallbacks ?? 0,
    /** Paise of paid-equivalent AI per successful chat — the number to watch. */
    paise_per_chat: chat?.calls ? +((chat.paise / chat.calls).toFixed(2)) : 0,
    by_purpose: byPurpose.rows,
    by_provider: byProvider.rows,
  };
}
