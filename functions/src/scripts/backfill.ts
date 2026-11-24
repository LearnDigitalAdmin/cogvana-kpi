/**
 * Local backfill: computes KPI values for a date range and WRITES them to the KPI
 * project. Reads the sources read-only. Uses whatever Application Default
 * Credentials are active (ideally impersonating the kpi-collector service account,
 * so you test exactly the permissions the deployed functions will have).
 *
 *   KPI_PROJECT_ID=cogvana-kpi npm run backfill -- 2026-09-01 2026-09-29
 */
import * as admin from "firebase-admin";
import { FirestoreKpiStore } from "../core/store";
import { eachDay, nairobiDay } from "../core/period";
import { createPayCollector } from "../collectors/pay";
import { createRegisterCollector } from "../collectors/register";
import { createChamaCollector } from "../collectors/chama";
import { createPmsCollector } from "../collectors/pms";
import { createCyberCollector } from "../collectors/cyber";
import { createDeskCollector } from "../collectors/desk";
import { FirestoreSourceReader } from "../core/firestoreReader";
import { runDays, writeFreshness } from "../jobs/run";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 120;

async function main() {
  const [from, to] = process.argv.slice(2);
  const projectId = process.env.KPI_PROJECT_ID;
  if (!projectId) throw new Error("Set KPI_PROJECT_ID to the KPI project id (e.g. cogvana-kpi).");
  if (!from || !to || !DAY_RE.test(from) || !DAY_RE.test(to)) {
    throw new Error("Usage: KPI_PROJECT_ID=cogvana-kpi npm run backfill -- YYYY-MM-DD YYYY-MM-DD");
  }
  if (to > nairobiDay(Date.now())) throw new Error("`to` cannot be in the future.");
  const days = eachDay(from, to);
  if (days.length === 0) throw new Error("`from` must not be after `to`.");
  if (days.length > MAX_DAYS) throw new Error(`At most ${MAX_DAYS} days per run.`);

  admin.initializeApp({ projectId });
  const store = new FirestoreKpiStore(admin.firestore());
  const reader = new FirestoreSourceReader();
  const collectors = [createPayCollector(reader), createRegisterCollector(reader), createChamaCollector(reader), createPmsCollector(reader), createCyberCollector(reader), createDeskCollector(reader)];

  console.log(`Backfilling ${days.length} day(s) ${from} -> ${to} into project ${projectId} ...`);
  const result = await runDays({ store, collectors, now: Date.now }, days);
  await writeFreshness(store, ["pay", "register", "chama", "pms", "cyber", "desk"], Date.now());

  console.log(`Wrote ${result.rowsWritten} values. ok=${result.ok}`);
  if (!result.ok) {
    console.error("Errors:\n - " + result.errors.join("\n - "));
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
