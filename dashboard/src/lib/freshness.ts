import type { KpiValue } from "./types";

export const COLLECTORS = ["pay", "pay_stats", "register", "register_stats", "chama", "chama_stats", "pms", "pms_stats", "cyber", "cyber_stats", "rollups"] as const;
/** Collectors whose absence turns the banner red. */
export const REQUIRED_COLLECTORS = ["pay", "register", "chama", "pms", "cyber", "rollups"];

export type Status = "green" | "amber" | "red";
export interface FreshnessRow { collector: string; hours: number | null; status: Status }

export function statusFor(hours: number | null): Status {
  if (hours === null) return "red";
  if (hours > 26) return "red";
  if (hours >= 12) return "amber";
  return "green";
}

/** Latest daily `company.data_freshness_hours` value per `collector` dimension. */
export function freshnessRows(values: KpiValue[]): FreshnessRow[] {
  const latest = new Map<string, KpiValue>();
  for (const v of values) {
    if (v.kpiId !== "company.data_freshness_hours") continue;
    const c = v.dimensions?.collector;
    if (!c) continue;
    const cur = latest.get(c);
    if (!cur || v.periodStart > cur.periodStart || (v.periodStart === cur.periodStart && v.computedAt > cur.computedAt)) latest.set(c, v);
  }
  return COLLECTORS.map((collector) => {
    const hours = latest.get(collector)?.value ?? null;
    return { collector, hours, status: statusFor(hours) };
  });
}

export type Level = "ok" | "amber" | "red";
export function freshnessLevel(rows: FreshnessRow[]): Level {
  const byName = new Map(rows.map((r) => [r.collector, r]));
  if (REQUIRED_COLLECTORS.some((c) => byName.get(c)?.hours == null)) return "red";
  if (rows.some((r) => r.hours !== null && r.hours > 26)) return "red";
  if (rows.some((r) => r.hours !== null && r.hours >= 12)) return "amber";
  return "ok";
}
