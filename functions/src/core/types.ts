/**
 * Core contracts shared by every collector, rollup and consumer.
 * These types ARE the extension seams: new platforms implement `Collector`,
 * new storage implements `KpiStore` (see store.ts), new KPIs are `KpiDefinition`s.
 */

export type PlatformId = "pms" | "register" | "chama" | "cyber" | "all";
export type Grain = "daily" | "weekly" | "monthly";
export type KpiType = "flow" | "stock" | "ratio";
/** KES_CENTS = integer minor units (1 KES = 100). Never mix with decimal KES. */
export type KpiUnit = "count" | "KES_CENTS" | "percent" | "hours";
export type KpiScope = "company" | "platform" | "cross";
export type KpiDirection = "higher_is_better" | "lower_is_better" | "neutral";
export type KpiStatus = "active" | "planned" | "deprecated";

export interface KpiDefinition {
  /** Stable id, `namespace.name`, e.g. `pay.platform_revenue`. */
  id: string;
  name: string;
  description: string;
  scope: KpiScope;
  /** "all" = computed for every platform (one value per platform, plus rollups). */
  platform: PlatformId;
  type: KpiType;
  unit: KpiUnit;
  /** Finest grain this KPI is computed at. Coarser grains are derived. */
  grain: Grain;
  /**
   * Grains the COLLECTOR writes directly (default ["daily"]). Distinct counts ("active schools") cannot be
   * summed from daily values, so collectors write their weekly and monthly values themselves; derivation
   * layers must skip those grains for those KPIs.
   */
  grains: Grain[];
  /** Plain-language formula: the single source of truth for the definition. */
  formula: string;
  /** Required for ratios. */
  numeratorDesc?: string;
  denominatorDesc?: string;
  direction: KpiDirection;
  /** Dimension keys this KPI may carry besides the un-dimensioned total. */
  dimensions: string[];
  /** Filled in Phase 5 (alerts). Empty in v1. */
  thresholds: { warn?: number; critical?: number };
  owner: string;
  /** Short warning shown next to the number when it is approximate, inferred or lagged. */
  caveat?: string;
  /** The decision someone makes when this number moves. */
  decision: string;
  version: number;
  status: KpiStatus;
}

export interface KpiValue {
  /** Deterministic: see `valueId()`. Re-running a period overwrites, never duplicates. */
  id: string;
  kpiId: string;
  platform: PlatformId;
  grain: Grain;
  /** Africa/Nairobi calendar day, YYYY-MM-DD. */
  periodStart: string;
  /** Inclusive last day of the period, YYYY-MM-DD. */
  periodEnd: string;
  value: number;
  /** Always stored for ratios so coarser grains can be re-derived exactly. */
  numerator: number | null;
  denominator: number | null;
  /** Empty object = the un-dimensioned total. */
  dimensions: Record<string, string>;
  /** Reserved for Customer 360 (Phase 6). Null for aggregates. */
  customerKey: string | null;
  definitionVersion: number;
  /** False while the period is still in progress. */
  complete: boolean;
  computedAt: number;
  runId: string;
}

export interface KpiRun {
  id: string;
  collector: string;
  periodStart: string;
  periodEnd: string;
  status: "success" | "error";
  startedAt: number;
  durationMs: number;
  rowsWritten: number;
  error: string | null;
}

export interface Period {
  grain: Grain;
  /** YYYY-MM-DD (Nairobi). */
  start: string;
  /** Inclusive, YYYY-MM-DD (Nairobi). */
  end: string;
  /** UTC ms, inclusive. */
  startMs: number;
  /** UTC ms, exclusive. */
  endMs: number;
}

export interface CollectContext {
  period: Period;
  runId: string;
  now: number;
}

/** Seam 1: every platform/source implements this. Collectors are read-only. */
export interface Collector {
  id: string;
  /**
   * True when this collector's values feed the company rollup. The runner publishes
   * a day's company rollup only if every such collector succeeded for that day, so
   * a failure elsewhere never blocks it and a failure here never understates it.
   */
  feedsCompanyRollup?: boolean;
  collect(ctx: CollectContext): Promise<KpiValue[]>;
}

/** Deterministic document id. Dimensions are sorted so key order never matters. */
export function dimsKey(dimensions: Record<string, string>): string {
  const keys = Object.keys(dimensions).sort();
  if (keys.length === 0) return "-";
  return keys.map((k) => `${k}=${dimensions[k]}`).join(",");
}

export function valueId(v: Pick<KpiValue, "kpiId" | "platform" | "grain" | "periodStart" | "dimensions">): string {
  return `${v.kpiId}__${v.platform}__${v.grain}__${v.periodStart}__${dimsKey(v.dimensions)}`;
}
