export type Grain = "daily" | "weekly" | "monthly";
export type KpiType = "flow" | "stock" | "ratio";
export type KpiUnit = "count" | "KES_CENTS" | "percent" | "hours";
export type PlatformId = "pms" | "register" | "chama" | "cyber" | "all";
export interface KpiDefinition {
  id: string; name: string; description: string;
  scope: "company" | "platform" | "cross";
  platform: PlatformId;
  type: KpiType; unit: KpiUnit;
  grain: Grain;          // finest grain
  grains: Grain[];       // grains written directly by the backend; "distinct count" KPIs list daily+weekly+monthly
  formula: string; numeratorDesc?: string; denominatorDesc?: string;
  direction: "higher_is_better" | "lower_is_better" | "neutral";
  dimensions: string[];  // dimension keys this KPI may carry
  thresholds: { warn?: number; critical?: number };
  owner: string; caveat?: string; decision: string;
  version: number; status: "active" | "planned" | "deprecated";
}
export interface KpiValue {
  id: string; kpiId: string; platform: PlatformId; grain: Grain;
  periodStart: string;   // YYYY-MM-DD, Africa/Nairobi
  periodEnd: string;     // inclusive
  value: number;
  numerator: number | null; denominator: number | null;   // always set for ratios
  dimensions: Record<string, string>;                      // {} = the un-dimensioned total
  customerKey: null; definitionVersion: number;
  complete: boolean;     // false while the period is still running (or inputs are partial)
  computedAt: number; runId: string;
}
export interface KpiRun {
  id: string; collector: string; periodStart: string; periodEnd: string;
  status: "success" | "error"; startedAt: number; durationMs: number; rowsWritten: number; error: string | null;
}
