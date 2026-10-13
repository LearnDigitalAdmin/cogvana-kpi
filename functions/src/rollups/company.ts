import { pct } from "../core/money";
import { isComplete } from "../core/period";
import { dimsKey, KpiValue, Period, valueId } from "../core/types";
import { definitionVersion } from "../registry";

/**
 * Company-level rollup: sums the per-platform PAY values. It never reads sources,
 * so company totals can only disagree with platform totals if this file is wrong
 * (tests/reconcile.test.ts guards that).
 */
const SUMMED: Record<string, string> = {
  "pay.attempts": "company.attempts",
  "pay.success": "company.success",
  "pay.gmv": "company.gmv",
  "pay.gateway_fees": "company.gateway_fees",
  "pay.platform_revenue": "company.platform_revenue",
  "pay.pass_through": "company.pass_through",
  "pay.net_revenue": "company.net_revenue",
  "pay.net_revenue_unverified": "company.net_revenue_unverified",
};

/** Company KPIs carry only the `stream` dimension; `chargeType` is platform-level detail. */
function companyDimensions(dims: Record<string, string>): Record<string, string> | null {
  const keys = Object.keys(dims);
  if (keys.length === 0) return {};
  if (keys.length === 1 && keys[0] === "stream") return { stream: dims.stream };
  return null;
}

export interface RollupContext {
  period: Period;
  runId: string;
  now: number;
}

export function rollupCompany(platformValues: KpiValue[], ctx: RollupContext): KpiValue[] {
  const totals = new Map<string, { kpiId: string; dimensions: Record<string, string>; value: number }>();

  for (const v of platformValues) {
    const target = SUMMED[v.kpiId];
    if (!target || v.platform === "all") continue;
    const dimensions = companyDimensions(v.dimensions);
    if (!dimensions) continue;
    const key = `${target}|${dimsKey(dimensions)}`;
    const cur = totals.get(key) ?? { kpiId: target, dimensions, value: 0 };
    cur.value += v.value;
    totals.set(key, cur);
  }

  const complete = isComplete(ctx.period, ctx.now);
  const out: KpiValue[] = [];
  const push = (kpiId: string, dimensions: Record<string, string>, value: number, numerator: number | null, denominator: number | null) => {
    const base = { kpiId, platform: "all" as const, grain: "daily" as const, periodStart: ctx.period.start, dimensions };
    out.push({
      id: valueId(base),
      ...base,
      periodEnd: ctx.period.end,
      value,
      numerator,
      denominator,
      customerKey: null,
      definitionVersion: definitionVersion(kpiId),
      complete,
      computedAt: ctx.now,
      runId: ctx.runId,
    });
  };

  for (const t of totals.values()) push(t.kpiId, t.dimensions, t.value, null, null);

  // Success rate is recomputed from the summed counts, never averaged from platform rates.
  for (const t of totals.values()) {
    if (t.kpiId !== "company.attempts") continue;
    const success = totals.get(`company.success|${dimsKey(t.dimensions)}`)?.value ?? 0;
    push("company.success_rate", t.dimensions, pct(success, t.value), success, t.value);
  }
  return out;
}
