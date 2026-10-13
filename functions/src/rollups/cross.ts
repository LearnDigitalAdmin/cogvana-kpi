import { isComplete, dailyPeriod } from "../core/period";
import { dimsKey, Grain, KpiValue, Period, PlatformId } from "../core/types";
import { makeValue, Metric } from "../core/values";
import {
  ACTIVE_ACCOUNT_COMPONENTS,
  Component,
  NEW_ACCOUNT_COMPONENTS,
  REVENUE_PLATFORMS,
  REVENUE_STREAMS,
  SMS_MARGIN_PLATFORMS,
  SMS_OUTSTANDING_COMPONENTS,
  SMS_USED_COMPONENTS,
  STALE_COLLECTOR_HOURS,
  smsCostCentsPerUnit,
} from "./config";
import { ratioValue } from "./derive";

/** All input values of a run, keyed `kpiId|platform|grain|periodStart|dimsKey`. */
export type ValueIndex = Map<string, KpiValue>;

export function indexKey(
  kpiId: string,
  platform: PlatformId,
  grain: Grain,
  periodStart: string,
  dimensions: Record<string, string> = {}
): string {
  return `${kpiId}|${platform}|${grain}|${periodStart}|${dimsKey(dimensions)}`;
}

export function addToIndex(index: ValueIndex, values: KpiValue[]): void {
  for (const v of values) index.set(indexKey(v.kpiId, v.platform, v.grain, v.periodStart, v.dimensions), v);
}

interface Breakdown {
  total: number;
  inputs: KpiValue[];
}

/**
 * Part B. Computes every cross/company KPI of section 5 for ONE period from same-grain inputs in the index.
 * A KPI whose required inputs are absent is skipped; nothing is invented as zero.
 * Freshness KPIs are separate (`computeFreshness`): they only exist at daily grain.
 */
export function computeCross(index: ValueIndex, period: Period, now: number, runId: string): KpiValue[] {
  const grain = period.grain;
  const ended = isComplete(period, now);
  const out: KpiValue[] = [];

  const get = (kpiId: string, platform: PlatformId, dims: Record<string, string> = {}): KpiValue | undefined =>
    index.get(indexKey(kpiId, platform, grain, period.start, dims));

  /** `stock` outputs follow the collectors' convention: daily snapshots are never complete. */
  const emit = (
    kpiId: string,
    metric: Metric,
    dimensions: Record<string, string>,
    inputs: KpiValue[],
    stock = false
  ): void => {
    const inputsComplete = inputs.every((i) => i.complete);
    const complete = stock ? grain !== "daily" && ended && inputsComplete : ended && inputsComplete;
    out.push(makeValue(kpiId, metric, { platform: "all", grain, period, now, runId, dimensions, complete }));
  };

  /** One value per present component (dimension platform) plus a no-dimension total of those present. */
  const emitBreakdown = (kpiId: string, components: Component[], stock = false): Breakdown | null => {
    const present = components
      .map((c) => ({ platform: c.platform, value: get(c.kpiId, c.platform) }))
      .filter((p): p is { platform: Component["platform"]; value: KpiValue } => p.value !== undefined);
    if (present.length === 0) return null;
    for (const p of present) emit(kpiId, { value: p.value.value }, { platform: p.platform }, [p.value], stock);
    const inputs = present.map((p) => p.value);
    const total = inputs.reduce((t, v) => t + v.value, 0);
    emit(kpiId, { value: total }, {}, inputs, stock);
    return { total, inputs };
  };

  const percentOf = (kpiId: string, part: KpiValue, whole: KpiValue, dims: Record<string, string>): void => {
    emit(
      kpiId,
      { value: ratioValue("percent", part.value, whole.value), numerator: part.value, denominator: whole.value },
      dims,
      [part, whole]
    );
  };

  const netRevenue = get("company.net_revenue", "all");

  // company.active_accounts / company.new_accounts
  const active = emitBreakdown("company.active_accounts", ACTIVE_ACCOUNT_COMPONENTS);
  emitBreakdown("company.new_accounts", NEW_ACCOUNT_COMPONENTS);

  // company.net_revenue_per_active_account (weekly and monthly only)
  if (grain !== "daily" && netRevenue && active && active.total > 0) {
    emit(
      "company.net_revenue_per_active_account",
      {
        value: ratioValue("KES_CENTS", netRevenue.value, active.total),
        numerator: netRevenue.value,
        denominator: active.total,
      },
      {},
      [netRevenue, ...active.inputs]
    );
  }

  // company.unverified_revenue_share
  const unverified = get("company.net_revenue_unverified", "all");
  if (netRevenue && unverified) percentOf("company.unverified_revenue_share", unverified, netRevenue, {});

  // cross.revenue_share (by platform)
  if (netRevenue) {
    for (const platform of REVENUE_PLATFORMS) {
      const part = get("pay.net_revenue", platform);
      if (part) percentOf("cross.revenue_share", part, netRevenue, { platform });
    }
  }

  // cross.stream_share (by stream) and cross.subscription_revenue
  if (netRevenue) {
    for (const stream of REVENUE_STREAMS) {
      const part = get("company.net_revenue", "all", { stream });
      if (part) percentOf("cross.stream_share", part, netRevenue, { stream });
    }
  }
  const subscription = get("company.net_revenue", "all", { stream: "subscription" });
  if (subscription) emit("cross.subscription_revenue", { value: subscription.value }, {}, [subscription]);

  // cross.sms_units_used, cost estimate, margin
  const units = emitBreakdown("cross.sms_units_used", SMS_USED_COMPONENTS);
  const costPerUnit = smsCostCentsPerUnit();
  if (units && costPerUnit > 0) {
    const cost = Math.round(units.total * costPerUnit);
    emit("cross.sms_cost_estimate", { value: cost }, {}, units.inputs);
    const revenue = SMS_MARGIN_PLATFORMS.map((p) => get("pay.net_revenue", p, { stream: "sms" })).filter(
      (v): v is KpiValue => v !== undefined
    );
    if (revenue.length > 0) {
      const margin = revenue.reduce((t, v) => t + v.value, 0) - cost;
      emit("cross.sms_margin", { value: margin }, {}, [...revenue, ...units.inputs]);
    }
  }

  // cross.sms_prepaid_outstanding (stock)
  emitBreakdown("cross.sms_prepaid_outstanding", SMS_OUTSTANDING_COMPONENTS, true);

  // cross.digital_rent_share
  const rent = get("pms.rent_collected", "pms");
  const digitalRent = get("pay.gmv", "pms", { chargeType: "pms_rent" });
  if (rent && rent.value > 0 && digitalRent) percentOf("cross.digital_rent_share", digitalRent, rent, {});

  return out;
}

/**
 * company.data_freshness_max_hours and company.collectors_stale for one day, from that day's
 * company.data_freshness_hours values (one per collector). Nothing for a day without such values.
 */
export function computeFreshness(index: ValueIndex, day: string, now: number, runId: string): KpiValue[] {
  const hours: number[] = [];
  for (const v of index.values()) {
    if (
      v.kpiId === "company.data_freshness_hours" &&
      v.grain === "daily" &&
      v.periodStart === day &&
      v.dimensions.collector !== undefined
    ) {
      hours.push(v.value);
    }
  }
  if (hours.length === 0) return [];
  const base = { platform: "all" as const, grain: "daily" as const, period: dailyPeriod(day), now, runId, complete: false };
  return [
    makeValue("company.data_freshness_max_hours", { value: Math.max(...hours) }, base),
    makeValue("company.collectors_stale", { value: hours.filter((h) => h > STALE_COLLECTOR_HOURS).length }, base),
  ];
}
