import { KpiValue } from "../../core/types";
import { nairobiDay } from "../../core/period";
import { num } from "../../core/money";
import { valueId } from "../../core/types";
import { definitionVersion } from "../../registry";
import { PayReader } from "./reader";
import { SourceId } from "../../core/sources";

/**
 * PAY keeps running totals in platform_stats/totals but no history. Snapshotting
 * them daily starts the history and doubles as a reconciliation check against
 * the adapters. There are two such documents: the default database (PMS SMS,
 * reports) and Register's database (Register SMS).
 *
 * Revenue counters are in decimal KES, not cents (they are the source's own numbers).
 * Stock semantics: the value for day D is the counter at the time the snapshot ran on D.
 */
const STATS_DBS: { db: "default" | "register"; source: SourceId }[] = [
  { db: "default", source: "default" },
  { db: "register", source: "register" },
];

/** Counter fields belonging to products that are not running are ignored. */
const IGNORED_PREFIXES = ["totalPNS", "lastPNS"];

export async function snapshotPlatformStats(reader: PayReader, now: number, runId: string): Promise<KpiValue[]> {
  const day = nairobiDay(now);
  const out: KpiValue[] = [];

  for (const { db, source } of STATS_DBS) {
    const [doc] = await reader.getDocs(source, ["platform_stats/totals"], []);
    if (!doc) continue;

    for (const [field, raw] of Object.entries(doc.data)) {
      if (IGNORED_PREFIXES.some((p) => field.startsWith(p))) continue;
      const value = num(raw);
      if (value === null) continue; // skips Timestamps like lastSmsTopUpDate

      const base = {
        kpiId: "pay.stats_counter",
        platform: "all" as const,
        grain: "daily" as const,
        periodStart: day,
        dimensions: { db, counter: field },
      };
      out.push({
        id: valueId(base),
        ...base,
        periodEnd: day,
        value,
        numerator: null,
        denominator: null,
        customerKey: null,
        definitionVersion: definitionVersion("pay.stats_counter"),
        complete: false,
        computedAt: now,
        runId,
      });
    }
  }
  return out;
}
