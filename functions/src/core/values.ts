import { isComplete } from "./period";
import { Grain, KpiValue, Period, PlatformId, valueId } from "./types";
import { definitionVersion } from "../registry";

export interface Metric {
  value: number;
  numerator?: number;
  denominator?: number;
}

export interface EmitBase {
  platform: PlatformId;
  grain: Grain;
  period: Period;
  now: number;
  runId: string;
  dimensions?: Record<string, string>;
  /** Override for snapshot-style values that are never "complete". */
  complete?: boolean;
}

/** Builds one KPI value with its deterministic id and definition version. */
export function makeValue(kpiId: string, m: Metric, b: EmitBase): KpiValue {
  const dimensions = b.dimensions ?? {};
  const key = { kpiId, platform: b.platform, grain: b.grain, periodStart: b.period.start, dimensions };
  return {
    id: valueId(key),
    ...key,
    periodEnd: b.period.end,
    value: m.value,
    numerator: m.numerator ?? null,
    denominator: m.denominator ?? null,
    customerKey: null,
    definitionVersion: definitionVersion(kpiId),
    complete: b.complete ?? isComplete(b.period, b.now),
    computedAt: b.now,
    runId: b.runId,
  };
}

export function emitMetrics(metrics: Record<string, Metric>, b: EmitBase): KpiValue[] {
  return Object.entries(metrics).map(([kpiId, m]) => makeValue(kpiId, m, b));
}
