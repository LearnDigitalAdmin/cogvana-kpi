import { pct } from "../core/money";
import { eachDay, isComplete } from "../core/period";
import { dimsKey, KpiDefinition, KpiUnit, KpiValue, Period } from "../core/types";
import { makeValue, Metric } from "../core/values";
import { NOT_DERIVED_KPI_IDS } from "./config";

export interface DeriveContext {
  now: number;
  runId: string;
}

/** Ratio value from summed parts. Percent = 0-100 with 2 decimals; other units round to an integer. 0 when the denominator is 0. */
export function ratioValue(unit: KpiUnit, numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return unit === "percent" ? pct(numerator, denominator) : Math.round(numerator / denominator);
}

/**
 * Part A. Derives the period's weekly or monthly values from stored DAILY values.
 *  - flow: sum of the days
 *  - ratio: summed numerators / summed denominators (never an average of daily rates)
 *  - stock: the latest snapshot inside the period
 * Skips diagnostics, non-active KPIs and any grain the collector writes itself (distinct counts).
 * A series with no daily value in the period produces nothing (absent is not zero).
 */
export function deriveGrain(
  defs: KpiDefinition[],
  dailyValues: KpiValue[],
  period: Period,
  ctx: DeriveContext
): KpiValue[] {
  if (period.grain === "daily") return [];

  const eligible = new Map<string, KpiDefinition>();
  for (const d of defs) {
    if (d.status !== "active" || NOT_DERIVED_KPI_IDS.has(d.id) || d.grains.includes(period.grain)) continue;
    eligible.set(d.id, d);
  }

  // Group the period's daily values by series, one row per day.
  const series = new Map<string, Map<string, KpiValue>>();
  for (const v of dailyValues) {
    if (v.grain !== "daily" || v.periodStart < period.start || v.periodStart > period.end) continue;
    if (!eligible.has(v.kpiId)) continue;
    const key = `${v.kpiId}|${v.platform}|${dimsKey(v.dimensions)}`;
    let byDay = series.get(key);
    if (!byDay) {
      byDay = new Map();
      series.set(key, byDay);
    }
    byDay.set(v.periodStart, v);
  }

  const days = eachDay(period.start, period.end);
  const ended = isComplete(period, ctx.now);
  const out: KpiValue[] = [];

  for (const byDay of series.values()) {
    const first = byDay.values().next().value as KpiValue;
    const def = eligible.get(first.kpiId)!;
    const present = days.filter((d) => byDay.has(d));
    const everyDay = present.length === days.length;
    const base = {
      platform: first.platform,
      grain: period.grain,
      period,
      now: ctx.now,
      runId: ctx.runId,
      dimensions: first.dimensions,
    };

    if (def.type === "flow") {
      const value = present.reduce((t, d) => t + byDay.get(d)!.value, 0);
      out.push(makeValue(def.id, { value }, { ...base, complete: ended && everyDay }));
    } else if (def.type === "ratio") {
      let numerator = 0;
      let denominator = 0;
      let used = 0;
      for (const d of present) {
        const row = byDay.get(d)!;
        if (row.numerator === null || row.denominator === null) continue;
        numerator += row.numerator;
        denominator += row.denominator;
        used++;
      }
      if (used === 0) continue;
      const metric: Metric = { value: ratioValue(def.unit, numerator, denominator), numerator, denominator };
      out.push(makeValue(def.id, metric, { ...base, complete: ended && everyDay }));
    } else {
      const last = byDay.get(present[present.length - 1])!;
      const metric: Metric = { value: last.value };
      if (last.numerator !== null) metric.numerator = last.numerator;
      if (last.denominator !== null) metric.denominator = last.denominator;
      out.push(makeValue(def.id, metric, { ...base, complete: ended && byDay.has(period.end) }));
    }
  }
  return out;
}
