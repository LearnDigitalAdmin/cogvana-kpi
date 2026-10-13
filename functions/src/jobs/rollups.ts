import { randomUUID } from "crypto";
import { KpiStore } from "../core/store";
import { dailyPeriod, nairobiDay, periodFor, periodStartFor } from "../core/period";
import { Grain, KpiRun, KpiValue, Period } from "../core/types";
import { ALL_DEFINITIONS } from "../registry";
import { CROSS_DEFINITIONS } from "../registry/cross";
import { ROLLUP_COLLECTOR_ID } from "../rollups/config";
import { addToIndex, computeCross, computeFreshness, ValueIndex } from "../rollups/cross";
import { deriveGrain } from "../rollups/derive";

export interface RollupDeps {
  store: KpiStore;
  now: () => number;
}

export interface RollupResult {
  ok: boolean;
  rowsWritten: number;
  errors: string[];
  periods: { weekly: string[]; monthly: string[] };
}

const CROSS_IDS = new Set(CROSS_DEFINITIONS.map((d) => d.id));

/** KPIs whose collector writes `grain` itself (distinct counts). Their stored values are inputs, never overwritten. */
function collectorOwnedIds(grain: Grain): Set<string> {
  return new Set(
    ALL_DEFINITIONS.filter((d) => d.status === "active" && !CROSS_IDS.has(d.id) && d.grains.includes(grain)).map(
      (d) => d.id
    )
  );
}

function uniqueSorted(items: string[]): string[] {
  return [...new Set(items)].sort();
}

/**
 * Refreshes weekly/monthly values (Part A) and cross-project KPIs (Part B) for the periods overlapping `days`.
 * Reads only the KPI store. Idempotent: every value has a deterministic id. Never throws.
 */
export async function runRollups(deps: RollupDeps, days: string[]): Promise<RollupResult> {
  const startedAt = deps.now();
  const today = nairobiDay(startedAt);
  const runId = `${ROLLUP_COLLECTOR_ID}-${today}-${randomUUID().slice(0, 8)}`;
  const sortedDays = uniqueSorted(days);
  const result: RollupResult = { ok: true, rowsWritten: 0, errors: [], periods: { weekly: [], monthly: [] } };
  const run: KpiRun = {
    id: runId,
    collector: ROLLUP_COLLECTOR_ID,
    periodStart: sortedDays[0] ?? today,
    periodEnd: sortedDays[sortedDays.length - 1] ?? today,
    status: "success",
    startedAt,
    durationMs: 0,
    rowsWritten: 0,
    error: null,
  };

  try {
    await deps.store.syncDefinitions(ALL_DEFINITIONS);

    if (sortedDays.length > 0) {
      const periods: Record<"weekly" | "monthly", Period[]> = {
        weekly: uniqueSorted(sortedDays.map((d) => periodStartFor("weekly", d))).map((s) => periodFor("weekly", s)),
        monthly: uniqueSorted(sortedDays.map((d) => periodStartFor("monthly", d))).map((s) => periodFor("monthly", s)),
      };
      result.periods.weekly = periods.weekly.map((p) => p.start);
      result.periods.monthly = periods.monthly.map((p) => p.start);
      const allPeriods = [...periods.weekly, ...periods.monthly];

      // One read of the daily inputs covering every period, today (freshness) and every requested day.
      const from = [...sortedDays, ...allPeriods.map((p) => p.start)].sort()[0];
      const to = [...sortedDays, today, ...allPeriods.map((p) => p.end)].sort().reverse()[0];
      const daily = await deps.store.readValues({ grain: "daily", from, to });

      const index: ValueIndex = new Map();
      addToIndex(index, daily);

      // Weekly/monthly values the collectors own (distinct counts) are inputs for the cross KPIs.
      for (const grain of ["weekly", "monthly"] as const) {
        const list = periods[grain];
        if (list.length === 0) continue;
        const owned = collectorOwnedIds(grain);
        const stored = await deps.store.readValues({ grain, from: list[0].start, to: list[list.length - 1].start });
        addToIndex(
          index,
          stored.filter((v) => owned.has(v.kpiId))
        );
      }

      const toWrite: KpiValue[] = [];

      // Weekly and monthly: Part A first, kept in memory, then Part B from the same-grain inputs.
      for (const period of allPeriods) {
        const derived = deriveGrain(ALL_DEFINITIONS, daily, period, { now: startedAt, runId });
        addToIndex(index, derived);
        toWrite.push(...derived, ...computeCross(index, period, startedAt, runId));
      }

      // Daily cross KPIs for every requested day. Freshness values live on "today", so today is always covered.
      for (const day of sortedDays) {
        toWrite.push(...computeCross(index, dailyPeriod(day), startedAt, runId));
        toWrite.push(...computeFreshness(index, day, startedAt, runId));
      }
      if (!sortedDays.includes(today)) toWrite.push(...computeFreshness(index, today, startedAt, runId));

      await deps.store.writeValues(toWrite);
      run.rowsWritten = toWrite.length;
      result.rowsWritten = toWrite.length;
    }
  } catch (err) {
    run.status = "error";
    run.error = err instanceof Error ? err.message : String(err);
    result.ok = false;
    result.errors.push(`${ROLLUP_COLLECTOR_ID}: ${run.error}`);
  }

  run.durationMs = deps.now() - startedAt;
  try {
    await deps.store.writeRun(run);
  } catch (err) {
    result.ok = false;
    result.errors.push(`${ROLLUP_COLLECTOR_ID}: could not record run: ${err instanceof Error ? err.message : String(err)}`);
  }
  return result;
}
