/**
 * Read-only dry run against the REAL source databases. Writes nothing.
 *
 *   npm run dry-run -- 2026-09-29            # PAY money KPIs, per charge type
 *   npm run dry-run -- 2026-09-29 register   # Register activity, SMS and token KPIs
 *   npm run dry-run -- 2026-09-29 chama      # Chama ledger, SMS, loans and plan KPIs
 *   npm run dry-run -- 2026-09-29 pms        # Plot Yangu accounts, billing and receivables
 *   npm run dry-run -- 2026-09-29 cyber      # Cyber WhatsApp usage (exact when the meter is live)
 *
 * Needs Application Default Credentials with read access to the source projects
 * (ideally impersonating the kpi-collector service account). Compare what it prints
 * with the apps' own screens before trusting the pipeline.
 */
import { ALL_ADAPTERS } from "../collectors/pay/adapters";
import { STUCK_PENDING_MS } from "../collectors/pay/adapters/config";
import { aggregateFacts } from "../collectors/pay/aggregate";
import { PaymentFact } from "../collectors/pay/facts";
import { createRegisterCollector } from "../collectors/register";
import { createChamaCollector } from "../collectors/chama";
import { snapshotChama } from "../collectors/chama/snapshot";
import { createPmsCollector } from "../collectors/pms";
import { snapshotPms } from "../collectors/pms/snapshot";
import { createCyberCollector, snapshotCyber } from "../collectors/cyber";
import { KpiValue } from "../core/types";
import { snapshotRegister } from "../collectors/register/snapshot";
import { FirestoreSourceReader } from "../core/firestoreReader";
import { dailyPeriod } from "../core/period";
import { fromCents } from "../core/money";

async function dryRunPay(day: string): Promise<void> {
  const period = dailyPeriod(day);
  const reader = new FirestoreSourceReader();
  const now = Date.now();
  const window = { startMs: period.startMs, endMs: period.endMs };

  const facts: PaymentFact[] = [];
  for (const adapter of ALL_ADAPTERS) {
    try {
      facts.push(...(await adapter.load(reader, window)));
    } catch (err) {
      console.error(`ADAPTER FAILED ${adapter.id}:`, err instanceof Error ? err.message : err);
    }
  }

  const rows = ALL_ADAPTERS.map((a) => {
    const mine = facts.filter((f) => f.chargeType === a.id);
    const ok = mine.filter((f) => f.status === "success");
    const sum = (pick: (f: PaymentFact) => number) => fromCents(ok.reduce((t, f) => t + pick(f), 0));
    return {
      chargeType: a.id,
      attempts: mine.length,
      success: ok.length,
      failed: mine.filter((f) => f.status === "failed").length,
      pending: mine.filter((f) => f.status === "pending").length,
      gmv_KES: sum((f) => f.gmvCents),
      revenue_KES: sum((f) => f.platformRevenueCents),
      net_KES: sum((f) => f.netRevenueCents),
      estimated: ok.filter((f) => f.basis === "rate_estimate" || f.basis === "gross_fee_unknown").length,
    };
  });
  console.log(`\nPAY dry run for ${day} (Africa/Nairobi)\n`);
  console.table(rows);

  const values = aggregateFacts(facts, { period, runId: "dry-run", now, stuckMs: STUCK_PENDING_MS });
  console.log(`\n${facts.length} payments -> ${values.length} KPI values (not written).`);
  console.log("Compare 'net_KES' per charge type with the apps' own screens and with the change in platform_stats/totals.\n");
}

async function dryRunRegister(day: string): Promise<void> {
  const period = dailyPeriod(day);
  const reader = new FirestoreSourceReader();
  const now = Date.now();
  const values = await createRegisterCollector(reader).collect({ period, runId: "dry-run", now });

  const pick = (grain: string) =>
    values
      .filter((v) => v.grain === grain)
      .map((v) => ({
        kpi: v.kpiId.replace("register.", ""),
        value: v.value,
        numerator: v.numerator ?? "",
        denominator: v.denominator ?? "",
        ...(grain === "daily" ? {} : { period: `${v.periodStart}..${v.periodEnd}`, complete: v.complete }),
      }));

  console.log(`\nRegister dry run for ${day} (daily)\n`);
  console.table(pick("daily"));
  console.log("\nActive schools: week and month containing that day\n");
  console.table([...pick("weekly"), ...pick("monthly")].map((r, i) => ({ grain: i < pick("weekly").length ? "weekly" : "monthly", ...r })));

  const snap = await snapshotRegister(reader, now, "dry-run");
  console.log("\nStock snapshot (right now)\n");
  console.table(snap.map((v) => ({ kpi: v.kpiId.replace("register.", ""), value: v.value })));
  console.log("\nNothing was written. Compare with the Register app: registers marked today, schools, token balances.\n");
}

async function dryRunChama(day: string): Promise<void> {
  const period = dailyPeriod(day);
  const reader = new FirestoreSourceReader();
  const now = Date.now();
  const values = await createChamaCollector(reader).collect({ period, runId: "dry-run", now });
  const rows = (grain: string) =>
    values
      .filter((v) => v.grain === grain)
      .map((v) => ({
        kpi: v.kpiId.replace("chama.", ""),
        value: v.kpiId.includes("volume") ? v.value / 100 : v.value,
        numerator: v.numerator ?? "",
        denominator: v.denominator ?? "",
        ...(grain === "daily" ? {} : { period: `${v.periodStart}..${v.periodEnd}`, complete: v.complete }),
      }));
  console.log(`\nChama dry run for ${day} (daily; volumes in KES)\n`);
  console.table(rows("daily"));
  console.log("\nActive chamas: week and month containing that day\n");
  console.table([...rows("weekly"), ...rows("monthly")]);
  const snap = await snapshotChama(reader, now, "dry-run");
  console.log("\nStock snapshot (right now; amounts in KES)\n");
  console.table(
    snap.map((v) => ({
      kpi: v.kpiId.replace("chama.", "") + (v.dimensions.plan ? `[${v.dimensions.plan}]` : ""),
      value: ["loans_outstanding_balance", "loans_at_risk_balance", "contributions_overdue_amount", "mgr_pending_shortfall", "mgr_arrears_open_amount"].some((k) => v.kpiId.endsWith(k)) ? v.value / 100 : v.value,
    }))
  );
  console.log("\nNothing was written.\n");
}

function show(values: KpiValue[]): void {
  console.table(
    values.map((v) => ({
      kpi: v.kpiId,
      grain: v.grain,
      period: v.periodStart === v.periodEnd ? v.periodStart : `${v.periodStart}..${v.periodEnd}`,
      dims: Object.entries(v.dimensions).map(([k, x]) => `${k}=${x}`).join(","),
      value: v.value,
      num: v.numerator ?? "",
      den: v.denominator ?? "",
    }))
  );
}

async function dryRunPmsCyber(day: string, which: "pms" | "cyber"): Promise<void> {
  const period = dailyPeriod(day);
  const reader = new FirestoreSourceReader();
  const now = Date.now();
  const collector = which === "pms" ? createPmsCollector(reader) : createCyberCollector(reader);
  console.log(`\n${which.toUpperCase()} dry run for ${day} (money values are integer cents)\n`);
  show(await collector.collect({ period, runId: "dry-run", now }));
  console.log("\nStock snapshot (right now)\n");
  show(which === "pms" ? await snapshotPms(reader, now, "dry-run") : await snapshotCyber(reader, now, "dry-run"));
  if (which === "cyber") console.log("\nNo exact WhatsApp values until the usage meter is deployed (absent, not zero).\n");
  console.log("Nothing was written.\n");
}

async function main() {
  const day = process.argv[2];
  const which = process.argv[3] || "pay";
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !["pay", "register", "chama", "pms", "cyber"].includes(which)) {
    console.error("Usage: npm run dry-run -- YYYY-MM-DD [pay|register|chama|pms|cyber]");
    process.exit(1);
  }
  if (which === "register") await dryRunRegister(day);
  else if (which === "chama") await dryRunChama(day);
  else if (which === "pms" || which === "cyber") await dryRunPmsCyber(day, which);
  else await dryRunPay(day);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
