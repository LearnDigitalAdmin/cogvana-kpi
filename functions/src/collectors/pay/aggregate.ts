import { pct } from "../../core/money";
import { KpiValue, Period, PlatformId, valueId } from "../../core/types";
import { isComplete } from "../../core/period";
import { definitionVersion } from "../../registry";
import { ChargeType, PaymentFact, PLATFORM_BY_CHARGE_TYPE, PLATFORMS, RevenueStream, STREAM_BY_CHARGE_TYPE } from "./facts";

export interface AggregateContext {
  period: Period;
  runId: string;
  now: number;
  /** Pending longer than this after initiation counts as stuck. */
  stuckMs: number;
}

interface Metric {
  value: number;
  numerator?: number;
  denominator?: number;
}

function sum(facts: PaymentFact[], pick: (f: PaymentFact) => number): number {
  let total = 0;
  for (const f of facts) total += pick(f);
  return total;
}

/** All PAY KPIs for one group of facts. */
export function metricsFor(facts: PaymentFact[], now: number, stuckMs: number): Record<string, Metric> {
  const ok = facts.filter((f) => f.status === "success");
  const attempts = facts.length;
  const success = ok.length;
  return {
    "pay.attempts": { value: attempts },
    "pay.success": { value: success },
    "pay.failed": { value: facts.filter((f) => f.status === "failed").length },
    "pay.stuck_pending": {
      value: facts.filter((f) => f.status === "pending" && now - f.createdAtMs > stuckMs).length,
    },
    "pay.success_rate": { value: pct(success, attempts), numerator: success, denominator: attempts },
    "pay.gmv": { value: sum(ok, (f) => f.gmvCents) },
    "pay.gateway_fees": { value: sum(ok, (f) => f.gatewayFeeCents ?? 0) },
    "pay.platform_revenue": { value: sum(ok, (f) => f.platformRevenueCents) },
    "pay.pass_through": { value: sum(ok, (f) => f.passThroughCents) },
    "pay.net_revenue": { value: sum(ok, (f) => f.netRevenueCents) },
    "pay.net_revenue_unverified": {
      value: sum(ok.filter((f) => f.basis === "rate_estimate" || f.basis === "gross_fee_unknown"), (f) => f.netRevenueCents),
    },
  };
}

function emit(
  out: KpiValue[],
  ctx: AggregateContext,
  platform: PlatformId,
  dimensions: Record<string, string>,
  metrics: Record<string, Metric>
): void {
  for (const [kpiId, m] of Object.entries(metrics)) {
    const base = {
      kpiId,
      platform,
      grain: "daily" as const,
      periodStart: ctx.period.start,
      dimensions,
    };
    out.push({
      id: valueId(base),
      ...base,
      periodEnd: ctx.period.end,
      value: m.value,
      numerator: m.numerator ?? null,
      denominator: m.denominator ?? null,
      customerKey: null,
      definitionVersion: definitionVersion(kpiId),
      complete: isComplete(ctx.period, ctx.now),
      computedAt: ctx.now,
      runId: ctx.runId,
    });
  }
}

/**
 * Turns normalised payment facts into KPI values for one day.
 * Emits a value for EVERY platform, charge type and stream even when there were
 * no payments, so series never have holes (a zero is information, a gap is not).
 */
export function aggregateFacts(facts: PaymentFact[], ctx: AggregateContext): KpiValue[] {
  const out: KpiValue[] = [];
  const chargeTypes = Object.keys(PLATFORM_BY_CHARGE_TYPE) as ChargeType[];

  for (const platform of PLATFORMS) {
    const mine = facts.filter((f) => f.platform === platform);
    emit(out, ctx, platform, {}, metricsFor(mine, ctx.now, ctx.stuckMs));

    for (const ct of chargeTypes.filter((c) => PLATFORM_BY_CHARGE_TYPE[c] === platform)) {
      emit(out, ctx, platform, { chargeType: ct }, metricsFor(mine.filter((f) => f.chargeType === ct), ctx.now, ctx.stuckMs));
    }

    const streams = new Set<RevenueStream>(
      chargeTypes.filter((c) => PLATFORM_BY_CHARGE_TYPE[c] === platform).map((c) => STREAM_BY_CHARGE_TYPE[c])
    );
    for (const stream of streams) {
      emit(out, ctx, platform, { stream }, metricsFor(mine.filter((f) => f.stream === stream), ctx.now, ctx.stuckMs));
    }
  }
  return out;
}
