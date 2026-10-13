import { randomUUID } from "crypto";
import { KpiStore } from "../core/store";
import { CollectContext, Collector, KpiRun, KpiValue, valueId } from "../core/types";
import { dailyPeriod, nairobiDay } from "../core/period";
import { ALL_DEFINITIONS, definitionVersion } from "../registry";
import { rollupCompany } from "../rollups/company";

export interface RunDeps {
  store: KpiStore;
  collectors: Collector[];
  now: () => number;
}

export interface RunResult {
  ok: boolean;
  rowsWritten: number;
  errors: string[];
}

/**
 * Computes and stores KPI values for the given Nairobi days.
 * Idempotent: values have deterministic ids, so re-running a day overwrites it.
 * A failing day/collector is recorded in kpi_runs and does not stop the others.
 */
export async function runDays(deps: RunDeps, days: string[]): Promise<RunResult> {
  const result: RunResult = { ok: true, rowsWritten: 0, errors: [] };
  await deps.store.syncDefinitions(ALL_DEFINITIONS);

  for (const day of days) {
    const period = dailyPeriod(day);
    const collected: KpiValue[] = [];
    const feeders = new Set(deps.collectors.filter((c) => c.feedsCompanyRollup).map((c) => c.id));
    const failedFeeders = new Set<string>();

    for (const collector of deps.collectors) {
      const startedAt = deps.now();
      const runId = `${collector.id}-${day}-${randomUUID().slice(0, 8)}`;
      const ctx: CollectContext = { period, runId, now: startedAt };
      const run: KpiRun = {
        id: runId,
        collector: collector.id,
        periodStart: period.start,
        periodEnd: period.end,
        status: "success",
        startedAt,
        durationMs: 0,
        rowsWritten: 0,
        error: null,
      };
      try {
        const values = await collector.collect(ctx);
        await deps.store.writeValues(values);
        collected.push(...values);
        run.rowsWritten = values.length;
        result.rowsWritten += values.length;
      } catch (err) {
        run.status = "error";
        run.error = err instanceof Error ? err.message : String(err);
        result.ok = false;
        result.errors.push(`${collector.id} ${day}: ${run.error}`);
        if (feeders.has(collector.id)) failedFeeders.add(collector.id);
      }
      run.durationMs = deps.now() - startedAt;
      await deps.store.writeRun(run);
    }

    // Company rollup only when every collector that FEEDS it succeeded for the day, so a
    // partial failure can never publish a company total that silently understates revenue,
    // and an unrelated collector failing never blocks it.
    if (failedFeeders.size === 0) {
      const now = deps.now();
      const rollup = rollupCompany(collected, { period, runId: `rollup-${day}-${randomUUID().slice(0, 8)}`, now });
      await deps.store.writeValues(rollup);
      result.rowsWritten += rollup.length;
    }
  }
  return result;
}

/** One value per collector: hours since it last succeeded. Written for today (Nairobi). */
export async function writeFreshness(store: KpiStore, collectorIds: string[], now: number): Promise<KpiValue[]> {
  const day = nairobiDay(now);
  const out: KpiValue[] = [];
  for (const collector of collectorIds) {
    const last = await store.lastSuccessfulRun(collector);
    if (!last) continue; // never succeeded: no number is better than a wrong one
    const base = {
      kpiId: "company.data_freshness_hours",
      platform: "all" as const,
      grain: "daily" as const,
      periodStart: day,
      dimensions: { collector },
    };
    out.push({
      id: valueId(base),
      ...base,
      periodEnd: day,
      value: Math.round(((now - last.startedAt) / 3_600_000) * 10) / 10,
      numerator: null,
      denominator: null,
      customerKey: null,
      definitionVersion: definitionVersion("company.data_freshness_hours"),
      complete: false,
      computedAt: now,
      runId: last.id,
    });
  }
  await store.writeValues(out);
  return out;
}

/** Runs a stats-snapshot style job (values for "today") with the same run logging. */
export async function runSnapshot(
  store: KpiStore,
  collectorId: string,
  produce: (now: number, runId: string) => Promise<KpiValue[]>,
  now: () => number
): Promise<RunResult> {
  const startedAt = now();
  const day = nairobiDay(startedAt);
  const runId = `${collectorId}-${day}-${randomUUID().slice(0, 8)}`;
  const run: KpiRun = {
    id: runId,
    collector: collectorId,
    periodStart: day,
    periodEnd: day,
    status: "success",
    startedAt,
    durationMs: 0,
    rowsWritten: 0,
    error: null,
  };
  const result: RunResult = { ok: true, rowsWritten: 0, errors: [] };
  try {
    await store.syncDefinitions(ALL_DEFINITIONS);
    const values = await produce(startedAt, runId);
    await store.writeValues(values);
    run.rowsWritten = values.length;
    result.rowsWritten = values.length;
  } catch (err) {
    run.status = "error";
    run.error = err instanceof Error ? err.message : String(err);
    result.ok = false;
    result.errors.push(`${collectorId}: ${run.error}`);
  }
  run.durationMs = now() - startedAt;
  await store.writeRun(run);
  return result;
}
