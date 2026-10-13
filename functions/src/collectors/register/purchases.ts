import { DocRecord } from "../../core/reader";
import { Metric } from "../../core/values";
import { num } from "../../core/money";
import { statusOf } from "../pay/facts";

/** Register SMS top-ups (written by PAY in Register's database). Money lives in the PAY KPIs. */
export const TOPUP_SELECT = ["schoolId", "status", "tokens"];

export function tokensSold(docs: DocRecord[]): Record<string, Metric> {
  let tokens = 0;
  for (const d of docs) {
    if (statusOf(d.data.status) === "success") tokens += num(d.data.tokens) ?? 0;
  }
  return { "register.tokens_sold": { value: tokens } };
}

/** Schools with at least one successful top-up. */
export function purchasingSchools(docs: DocRecord[]): Set<string> {
  const out = new Set<string>();
  for (const d of docs) {
    const id = d.data.schoolId;
    if (statusOf(d.data.status) === "success" && typeof id === "string" && id) out.add(id);
  }
  return out;
}
