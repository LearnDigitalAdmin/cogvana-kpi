import { CollectContext, Collector, KpiValue } from "../../core/types";
import { aggregateFacts } from "./aggregate";
import { ALL_ADAPTERS } from "./adapters";
import { STUCK_PENDING_MS } from "./adapters/config";
import { PayAdapter } from "./adapters/types";
import { PaymentFact } from "./facts";
import { PayReader } from "./reader";

/**
 * Seam 1 in action: the PAY collector reads every charge type through its
 * adapter, normalises to facts, and aggregates. It is read-only.
 *
 * If any adapter fails the whole run fails loudly (recorded in kpi_runs) rather
 * than publishing partial numbers that understate revenue.
 */
export function createPayCollector(reader: PayReader, adapters: PayAdapter[] = ALL_ADAPTERS): Collector {
  return {
    id: "pay",
    feedsCompanyRollup: true,
    async collect(ctx: CollectContext): Promise<KpiValue[]> {
      const window = { startMs: ctx.period.startMs, endMs: ctx.period.endMs };
      const loaded = await Promise.all(adapters.map((a) => a.load(reader, window)));

      // Same (chargeType, reference) can only be one payment; guard against overlapping reads.
      const seen = new Set<string>();
      const facts: PaymentFact[] = [];
      for (const f of loaded.flat()) {
        const key = `${f.chargeType}:${f.reference}`;
        if (seen.has(key)) continue;
        seen.add(key);
        facts.push(f);
      }

      return aggregateFacts(facts, {
        period: ctx.period,
        runId: ctx.runId,
        now: ctx.now,
        stuckMs: STUCK_PENDING_MS,
      });
    },
  };
}
