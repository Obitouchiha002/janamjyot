/**
 * Credit double-spend race check — REAL Postgres required.
 *
 *   TEST_DATABASE_URL=postgres://… npm run check:credits-race
 *
 * The pg-mem ledger check (`check:credits`) proves the arithmetic and the
 * unique-index idempotency, but pg-mem is single-threaded, so `SELECT … FOR
 * UPDATE` is a no-op there — the ONE path it cannot prove is the double-spend
 * race: two requests reading the same balance at the same instant and both
 * passing the check. That is the path that costs real rupees, so it gets its
 * own check against a real server that actually takes row locks.
 *
 * WHAT THIS PROVES
 *   • N concurrent spends against a balance that only affords K of them let
 *     EXACTLY K through — no more, no matter the interleaving;
 *   • the balance never goes negative at any point;
 *   • the ledger still reconciles (balance === SUM(delta)) after the storm;
 *   • one delivery row exists per successful spend (no orphan charges).
 *
 * Safety: refuses to run unless TEST_DATABASE_URL is set, and refuses a URL
 * that looks like the live database unless ALLOW_PROD_RACE=1 is also set. It
 * only ever touches the rows of the throwaway user it creates, and deletes them
 * at the end.
 */

const url = (process.env.TEST_DATABASE_URL || "").trim();
if (!url) {
  console.error(
    "SKIP — set TEST_DATABASE_URL to a real Postgres to run this.\n" +
      "       e.g. docker run -d -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16\n" +
      "            TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres \\\n" +
      "            DATABASE_SSL=false npm run check:credits-race",
  );
  process.exit(1);
}
if (/supabase|neon\.tech|rds\.amazonaws/i.test(url) && process.env.ALLOW_PROD_RACE !== "1") {
  console.error(
    "REFUSED — TEST_DATABASE_URL looks like a hosted/live database.\n" +
      "          Re-run with ALLOW_PROD_RACE=1 only if this is a throwaway DB.",
  );
  process.exit(1);
}

// db.ts reads DATABASE_URL at module load, so it must be set before the import.
process.env.DATABASE_URL = url;

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

async function main() {
  const db: any = await import("../db");
  await db.initDb();

  const email = `race_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const user = await db.createUser({ email, name: "Race Test", role: "user" });

  try {
    // ── Round 1: 20 concurrent spends of 1 credit against a balance of 10 ──
    await db.grantCredits({ userId: user.id, credits: 10, reason: "admin", note: "race test" });
    const r1 = await Promise.all(
      Array.from({ length: 20 }, () =>
        db.spendCredits({ userId: user.id, credits: 1, kind: "chat" }).catch(() => null),
      ),
    );
    const ok1 = r1.filter(Boolean).length;
    const bal1 = await db.creditBalance(user.id);
    check("20 concurrent × 1 credit against a balance of 10 → exactly 10 succeed", ok1 === 10, `succeeded: ${ok1}`);
    check("balance lands on exactly 0 (never negative)", bal1 === 0, `balance: ${bal1}`);
    check("no successful spend reported a negative balance", r1.every((r: any) => !r || r.balance >= 0));

    // ── Round 2: uneven cost — 20 concurrent × 3 credits against 10 ──
    await db.grantCredits({ userId: user.id, credits: 10, reason: "admin", note: "race test 2" });
    const r2 = await Promise.all(
      Array.from({ length: 20 }, () =>
        db.spendCredits({ userId: user.id, credits: 3, kind: "report" }).catch(() => null),
      ),
    );
    const ok2 = r2.filter(Boolean).length;
    const bal2 = await db.creditBalance(user.id);
    check("20 concurrent × 3 credits against a balance of 10 → exactly 3 succeed", ok2 === 3, `succeeded: ${ok2}`);
    check("1 credit left over (10 − 3×3)", bal2 === 1, `balance: ${bal2}`);

    // ── The ledger still reconciles, and every charge produced a delivery ──
    const { rows: sum } = await db.pool.query(
      `SELECT COALESCE(SUM(delta),0)::int AS n FROM credit_ledger WHERE user_id = $1`,
      [user.id],
    );
    check("balance === SUM(ledger) after the storm", sum[0].n === bal2, `sum: ${sum[0].n}, balance: ${bal2}`);

    const { rows: dl } = await db.pool.query(
      `SELECT COUNT(*)::int AS n FROM deliveries WHERE user_id = $1`,
      [user.id],
    );
    check("one delivery row per successful spend (no orphan charges)", dl[0].n === ok1 + ok2, `deliveries: ${dl[0].n}, spends: ${ok1 + ok2}`);
  } finally {
    // Only ever this throwaway user's rows.
    try {
      await db.pool.query(`DELETE FROM credit_ledger WHERE user_id = $1`, [user.id]);
      await db.pool.query(`DELETE FROM deliveries WHERE user_id = $1`, [user.id]);
      await db.pool.query(`DELETE FROM app_users WHERE id = $1`, [user.id]);
    } catch { /* best effort */ }
    await db.pool.end?.().catch(() => {});
  }

  if (failures) {
    console.error(`\nFAIL — ${failures} check(s) failed. Do NOT take live payments until this passes.`);
    process.exit(1);
  }
  console.log("\nPASS — concurrent spends serialise correctly on a real Postgres: an affordable number get through, the balance never goes negative, and the ledger reconciles.");
}

main().catch((e) => {
  console.error("FAIL —", e?.message || e);
  process.exit(1);
});
