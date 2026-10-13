/**
 * Local rollup runner: derives weekly/monthly values and computes the cross-project KPIs for a date
 * range, reading ONLY the KPI store and WRITING to it. Same credentials note as backfill.ts.
 *
 *   KPI_PROJECT_ID=cogvana-kpi npm run rollups -- 2026-09-01 2026-09-29
 */
import * as admin from "firebase-admin";
import { FirestoreKpiStore } from "../core/store";
import { eachDay, nairobiDay } from "../core/period";
import { runRollups } from "../jobs/rollups";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 120;

async function main() {
  const [from, to] = process.argv.slice(2);
  const projectId = process.env.KPI_PROJECT_ID;
  if (!projectId) throw new Error("Set KPI_PROJECT_ID to the KPI project id (e.g. cogvana-kpi).");
  if (!from || !to || !DAY_RE.test(from) || !DAY_RE.test(to)) {
    throw new Error("Usage: KPI_PROJECT_ID=cogvana-kpi npm run rollups -- YYYY-MM-DD YYYY-MM-DD");
  }
  if (to > nairobiDay(Date.now())) throw new Error("`to` cannot be in the future.");
  const days = eachDay(from, to);
  if (days.length === 0) throw new Error("`from` must not be after `to`.");
  if (days.length > MAX_DAYS) throw new Error(`At most ${MAX_DAYS} days per run.`);

  admin.initializeApp({ projectId });
  const store = new FirestoreKpiStore(admin.firestore());

  console.log(`Rolling up ${days.length} day(s) ${from} -> ${to} in project ${projectId} ...`);
  const result = await runRollups({ store, now: Date.now }, days);
  console.log(
    `Wrote ${result.rowsWritten} values (weeks: ${result.periods.weekly.length}, months: ${result.periods.monthly.length}). ok=${result.ok}`
  );
  if (!result.ok) {
    console.error("Errors:\n - " + result.errors.join("\n - "));
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
