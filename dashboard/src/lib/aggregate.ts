import type { Grain, KpiDefinition, KpiValue } from "./types";
import { expectedPeriods } from "./nairobi";

export interface Point {
  periodStart: string; periodEnd: string; value: number;
  numerator: number | null; denominator: number | null; complete: boolean;
}

/** Ratio KPIs that are point-in-time snapshots (their numerator/denominator are stocks): never summed over days. */
export const SNAPSHOT_RATIOS = new Set(["chama.portfolio_at_risk", "pms.occupancy_rate", "pms.trial_conversion_rate", "pms.collection_rate"]);

export const isTotal = (v: KpiValue): boolean => Object.keys(v.dimensions ?? {}).length === 0;
export const onlyDim = (v: KpiValue, key: string): boolean => {
  const k = Object.keys(v.dimensions ?? {});
  return k.length === 1 && k[0] === key;
};

export function toPoint(v: KpiValue): Point {
  return {
    periodStart: v.periodStart, periodEnd: v.periodEnd, value: v.value,
    numerator: v.numerator ?? null, denominator: v.denominator ?? null, complete: v.complete !== false,
  };
}

/** Sorted by period, one point per periodStart (latest computedAt wins). */
export function toSeries(values: KpiValue[]): Point[] {
  const m = new Map<string, KpiValue>();
  for (const v of values) {
    const cur = m.get(v.periodStart);
    if (!cur || v.computedAt >= cur.computedAt) m.set(v.periodStart, v);
  }
  return [...m.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart)).map(toPoint);
}

export const forKpi = (values: KpiValue[], kpiId: string, platform?: string): KpiValue[] =>
  values.filter((v) => v.kpiId === kpiId && (!platform || v.platform === platform));
export const totalSeries = (values: KpiValue[], kpiId: string, platform?: string): Point[] =>
  toSeries(forKpi(values, kpiId, platform).filter(isTotal));

export function seriesForDimension(values: KpiValue[], key: string | null, dimValue: string | null): Point[] {
  if (!key || dimValue === null) return toSeries(values.filter(isTotal));
  return toSeries(values.filter((v) => onlyDim(v, key) && v.dimensions[key] === dimValue));
}

/** Distinct single-dimension (key, value) pairs present in the values. */
export function dimensionOptions(values: KpiValue[]): { key: string; value: string }[] {
  const seen = new Set<string>();
  const out: { key: string; value: string }[] = [];
  for (const v of values) {
    const keys = Object.keys(v.dimensions ?? {});
    if (keys.length !== 1) continue;
    const id = `${keys[0]}=${v.dimensions[keys[0]]}`;
    if (!seen.has(id)) { seen.add(id); out.push({ key: keys[0], value: v.dimensions[keys[0]] }); }
  }
  return out.sort((a, b) => (a.key + a.value).localeCompare(b.key + b.value));
}

/** Values carrying exactly the single dimension `key`, grouped by its value. */
export function groupByDim(values: KpiValue[], key: string): Map<string, Point[]> {
  const raw = new Map<string, KpiValue[]>();
  for (const v of values) if (onlyDim(v, key)) (raw.get(v.dimensions[key]) ?? raw.set(v.dimensions[key], []).get(v.dimensions[key])!).push(v);
  return new Map([...raw].map(([k, vs]) => [k, toSeries(vs)]));
}

/** Total (no-dimension) values grouped by their `platform` field. */
export function groupByPlatform(values: KpiValue[], kpiId: string): Map<string, Point[]> {
  const raw = new Map<string, KpiValue[]>();
  for (const v of values) if (v.kpiId === kpiId && isTotal(v)) (raw.get(v.platform) ?? raw.set(v.platform, []).get(v.platform)!).push(v);
  return new Map([...raw].map(([k, vs]) => [k, toSeries(vs)]));
}

export const latest = (points: Point[]): Point | null => (points.length ? points[points.length - 1] : null);

/** Latest point per dimension value; `normalise` can merge raw values (e.g. unknown tier → "other", summed). */
export function latestPerDim(values: KpiValue[], key: string, normalise: (v: string) => string = (x) => x): { dim: string; point: Point }[] {
  const out = new Map<string, Point>();
  for (const [raw, pts] of groupByDim(values, key)) {
    const p = latest(pts);
    if (!p) continue;
    const dim = normalise(raw);
    const prev = out.get(dim);
    out.set(dim, prev ? { ...prev, value: prev.value + p.value, complete: prev.complete && p.complete, periodStart: p.periodStart > prev.periodStart ? p.periodStart : prev.periodStart } : p);
  }
  return [...out].map(([dim, point]) => ({ dim, point }));
}

export interface GridRow { periodStart: string; point: Point | null }
/** One row per expected period; absent periods stay null (gaps, never zeros). */
export function fillPeriods(grain: Grain, from: string, to: string, points: Point[]): GridRow[] {
  const byStart = new Map(points.map((p) => [p.periodStart, p]));
  return expectedPeriods(grain, from, to).map((periodStart) => ({ periodStart, point: byStart.get(periodStart) ?? null }));
}

export interface StackRow { periodStart: string; partial: boolean; values: Record<string, number | null> }
export function stackRows(grain: Grain, from: string, to: string, groups: Map<string, Point[]>): StackRow[] {
  const filled = [...groups].map(([k, pts]) => [k, new Map(pts.map((p) => [p.periodStart, p]))] as const);
  const starts = new Set(expectedPeriods(grain, from, to));
  for (const [, m] of filled) for (const s of m.keys()) if (s >= from && s <= to) starts.add(s);
  return [...starts].sort().map((periodStart) => {
    const values: Record<string, number | null> = {};
    let partial = false;
    for (const [k, m] of filled) {
      const p = m.get(periodStart);
      values[k] = p ? p.value : null;
      if (p && !p.complete) partial = true;
    }
    return { periodStart, partial, values };
  });
}

export const sumPoints = (points: Point[]): number | null => (points.length ? points.reduce((s, p) => s + p.value, 0) : null);

/** Recomputed ratio: sum(numerator) / sum(denominator); null if inputs are missing or the denominator sums to 0. */
export function ratioOfSums(points: Point[], scale = 1): number | null {
  if (!points.length || points.some((p) => p.numerator === null || p.denominator === null)) return null;
  const n = points.reduce((s, p) => s + (p.numerator as number), 0);
  const d = points.reduce((s, p) => s + (p.denominator as number), 0);
  return d === 0 ? null : (n / d) * scale;
}

export type HeadlineKind = "sum" | "ratio" | "latest" | "stock";
export interface Headline {
  kind: HeadlineKind;
  value: number | null;
  partial: boolean;
  /** stock: date of the snapshot ("as of") */
  asOf?: string;
  /** latest: periodStart of the distinct-count period */
  period?: string;
  /** stock: set when the earliest snapshot is later than the range start */
  historyStart?: string;
}

/** Headline of a KPI's un-dimensioned series for the selected range at the selected grain (rule 4 and 3). */
export function computeHeadline(def: KpiDefinition, points: Point[], from: string): Headline {
  const empty = (kind: HeadlineKind): Headline => ({ kind, value: null, partial: false });
  const last = latest(points);
  const asStock = (): Headline => {
    if (!last) return empty("stock");
    const h: Headline = { kind: "stock", value: last.value, partial: !last.complete, asOf: last.periodEnd };
    if (points[0].periodStart > from) h.historyStart = points[0].periodStart;
    return h;
  };
  const asLatest = (): Headline => (last ? { kind: "latest", value: last.value, partial: !last.complete, period: last.periodStart } : empty("latest"));

  if (def.type === "ratio") {
    if (SNAPSHOT_RATIOS.has(def.id)) return asStock();
    if (!points.length) return empty("ratio");
    if (points.some((p) => p.numerator === null || p.denominator === null)) return asLatest();
    const r = ratioOfSums(points, def.unit === "percent" ? 100 : 1);
    if (r === null) return empty("ratio");
    const value = def.unit === "percent" ? Math.round(r * 10) / 10 : Math.round(r);
    return { kind: "ratio", value, partial: points.some((p) => !p.complete) };
  }
  if (def.type === "stock") return asStock();
  if (def.grains.some((g) => g !== "daily")) return asLatest(); // distinct counts: never summed
  if (!points.length) return empty("sum");
  return { kind: "sum", value: sumPoints(points), partial: points.some((p) => !p.complete) };
}

export type Tone = "good" | "bad" | "neutral";
export interface Delta { pct: number; dir: "up" | "down" | "flat"; tone: Tone }

export function toneFor(dir: Delta["dir"], direction: KpiDefinition["direction"]): Tone {
  if (dir === "flat" || direction === "neutral") return "neutral";
  if (direction === "higher_is_better") return dir === "up" ? "good" : "bad";
  return dir === "up" ? "bad" : "good";
}

/** Percentage change; hidden (null) when either side is absent or the previous value is 0. */
export function computeDelta(cur: Headline, prev: Headline, direction: KpiDefinition["direction"]): Delta | null {
  if (cur.value === null || prev.value === null || prev.value === 0) return null;
  const pct = ((cur.value - prev.value) / Math.abs(prev.value)) * 100;
  const dir = Math.abs(pct) < 0.05 ? "flat" : pct > 0 ? "up" : "down";
  return { pct, dir, tone: toneFor(dir, direction) };
}

export interface KpiSummary { points: Point[]; headline: Headline; prevHeadline: Headline; delta: Delta | null }

/** Everything a tile needs. The previous side never uses `complete: false` periods. */
export function summarise(def: KpiDefinition, values: KpiValue[], prevValues: KpiValue[], from: string, prevFrom: string): KpiSummary {
  const points = toSeries(values.filter(isTotal));
  const prevPoints = toSeries(prevValues.filter(isTotal)).filter((p) => p.complete);
  const headline = computeHeadline(def, points, from);
  const prevHeadline = computeHeadline(def, prevPoints, prevFrom);
  return { points, headline, prevHeadline, delta: computeDelta(headline, prevHeadline, def.direction) };
}

export interface BreakdownMetrics {
  attempts: number | null; success: number | null; rate: number | null;
  gmv: number | null; platformRevenue: number | null; netRevenue: number | null; unverified: number | null;
}
/** One table row: range totals for (platform, dimKey = dimValue) from pay.* values at the selected grain. */
export function breakdownRow(values: KpiValue[], platform: string, dimKey: string, dimValue: string): BreakdownMetrics {
  const pts = (kpiId: string) => toSeries(values.filter((v) => v.kpiId === kpiId && v.platform === platform && onlyDim(v, dimKey) && v.dimensions[dimKey] === dimValue));
  const rate = ratioOfSums(pts("pay.success_rate"), 100);
  return {
    attempts: sumPoints(pts("pay.attempts")), success: sumPoints(pts("pay.success")),
    rate: rate === null ? null : Math.round(rate * 10) / 10,
    gmv: sumPoints(pts("pay.gmv")), platformRevenue: sumPoints(pts("pay.platform_revenue")),
    netRevenue: sumPoints(pts("pay.net_revenue")), unverified: sumPoints(pts("pay.net_revenue_unverified")),
  };
}
