import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as logger from "firebase-functions/logger";
import { FirestoreKpiStore } from "./core/store";
import { eachDay, nairobiDay, recentDays } from "./core/period";
import { Grain, PlatformId } from "./core/types";
import { createPayCollector } from "./collectors/pay";
import { FirestorePayReader } from "./collectors/pay/firestoreReader";
import { snapshotPlatformStats } from "./collectors/pay/snapshotStats";
import { createRegisterCollector } from "./collectors/register";
import { snapshotRegister } from "./collectors/register/snapshot";
import { createChamaCollector } from "./collectors/chama";
import { snapshotChama } from "./collectors/chama/snapshot";
import { createPmsCollector } from "./collectors/pms";
import { snapshotPms } from "./collectors/pms/snapshot";
import { createCyberCollector, snapshotCyber } from "./collectors/cyber";
import { createDeskCollector, snapshotDesk } from "./collectors/desk";
import { runDays, runSnapshot, writeFreshness } from "./jobs/run";
import { runRollups } from "./jobs/rollups";
import { assertDay, assertRole } from "./http/auth";

if (!admin.apps.length) admin.initializeApp();
// Runtime identity: a dedicated service account (KPI_SERVICE_ACCOUNT) so the functions hold ONLY
// the permissions in docs/SETUP.md, instead of the project's broad default account.
setGlobalOptions({
  region: process.env.KPI_REGION || "us-central1",
  maxInstances: 2,
  ...(process.env.KPI_SERVICE_ACCOUNT ? { serviceAccount: process.env.KPI_SERVICE_ACCOUNT } : {}),
});

const store = () => new FirestoreKpiStore(admin.firestore());
const reader = new FirestorePayReader();
const payCollector = () => createPayCollector(reader);
// One instance per job run: the Register collector memoises week/month scans per instance.
const registerCollector = () => createRegisterCollector(reader);
const chamaCollector = () => createChamaCollector(reader);
const pmsCollector = () => createPmsCollector(reader);
const cyberCollector = () => createCyberCollector(reader);
const deskCollector = () => createDeskCollector(reader);
const collectors = () => [payCollector(), registerCollector(), chamaCollector(), pmsCollector(), cyberCollector(), deskCollector()];
const COLLECTOR_IDS = ["pay", "pay_stats", "register", "register_stats", "chama", "chama_stats", "pms", "pms_stats", "cyber", "cyber_stats", "desk", "desk_stats", "rollups"];

/** Days recomputed each night so payments that settle late correct earlier figures. */
const LOOKBACK_DAYS = 3;
const MAX_BACKFILL_DAYS = 31;
/** Days re-derived by the nightly rollup job (weekly/monthly values and cross KPIs). */
const ROLLUP_LOOKBACK_DAYS = 35;

/** 02:00 Nairobi: recompute yesterday and the two days before it, then publish freshness. */
export const kpiDaily = onSchedule(
  { schedule: "0 2 * * *", timeZone: "Africa/Nairobi", timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    const s = store();
    const now = Date.now();
    const result = await runDays({ store: s, collectors: collectors(), now: Date.now }, recentDays(now, LOOKBACK_DAYS));
    await writeFreshness(s, COLLECTOR_IDS, Date.now());
    logger.info("kpiDaily finished", { rows: result.rowsWritten, ok: result.ok });
    if (!result.ok) throw new Error(result.errors.join(" | "));
  }
);

/** Mondays 03:30 Nairobi: Plot Yangu devices sync late, so recompute the last 21 days of PMS values. */
export const kpiPmsRefresh = onSchedule(
  { schedule: "30 3 * * 1", timeZone: "Africa/Nairobi", timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    const result = await runDays({ store: store(), collectors: [pmsCollector()], now: Date.now }, recentDays(Date.now(), 21));
    logger.info("kpiPmsRefresh finished", { rows: result.rowsWritten, ok: result.ok });
    if (!result.ok) throw new Error(result.errors.join(" | "));
  }
);

/** 02:45 Nairobi (after kpiDaily): derive weekly/monthly values and compute cross-project KPIs from stored values. */
export const kpiRollups = onSchedule(
  { schedule: "45 2 * * *", timeZone: "Africa/Nairobi", timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    const s = store();
    const now = Date.now();
    const result = await runRollups({ store: s, now: Date.now }, recentDays(now, ROLLUP_LOOKBACK_DAYS));
    await writeFreshness(s, COLLECTOR_IDS, Date.now());
    logger.info("kpiRollups finished", { rows: result.rowsWritten, ok: result.ok });
    if (!result.ok) throw new Error(result.errors.join(" | "));
  }
);

/** 23:55 Nairobi: snapshot PAY's running counters plus Register, Chama, Plot Yangu, Cyber and Samuhia Desk stock counts (none keeps history). */
export const kpiStatsSnapshot = onSchedule(
  { schedule: "55 23 * * *", timeZone: "Africa/Nairobi", timeoutSeconds: 120 },
  async () => {
    const s = store();
    const results = [
      await runSnapshot(s, "pay_stats", (now, runId) => snapshotPlatformStats(reader, now, runId), Date.now),
      await runSnapshot(s, "register_stats", (now, runId) => snapshotRegister(reader, now, runId), Date.now),
      await runSnapshot(s, "chama_stats", (now, runId) => snapshotChama(reader, now, runId), Date.now),
      await runSnapshot(s, "pms_stats", (now, runId) => snapshotPms(reader, now, runId), Date.now),
      await runSnapshot(s, "cyber_stats", (now, runId) => snapshotCyber(reader, now, runId), Date.now),
      await runSnapshot(s, "desk_stats", (now, runId) => snapshotDesk(reader, now, runId), Date.now),
    ];
    await writeFreshness(s, COLLECTOR_IDS, Date.now());
    const errors = results.flatMap((r) => r.errors);
    logger.info("kpiStatsSnapshot finished", { rows: results.reduce((t, r) => t + r.rowsWritten, 0), ok: errors.length === 0 });
    if (errors.length) throw new Error(errors.join(" | "));
  }
);

/** Admin-only backfill for a date range (Nairobi days, inclusive, max 31 days per call). */
export const kpiBackfill = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
  assertRole(request, ["admin"]);
  const data = (request.data || {}) as { from?: unknown; to?: unknown };
  const from = assertDay(data.from, "from");
  const to = assertDay(data.to, "to");
  const days = eachDay(from, to);
  if (days.length === 0) throw new HttpsError("invalid-argument", "`from` must not be after `to`.");
  if (days.length > MAX_BACKFILL_DAYS) {
    throw new HttpsError("invalid-argument", `At most ${MAX_BACKFILL_DAYS} days per call.`);
  }
  if (to > nairobiDay(Date.now())) {
    throw new HttpsError("invalid-argument", "`to` cannot be in the future.");
  }
  const result = await runDays({ store: store(), collectors: collectors(), now: Date.now }, days);
  return { ok: result.ok, days: days.length, rowsWritten: result.rowsWritten, errors: result.errors };
});

/** Read-only KPI API (seam 4). Dashboards call this, never the sources. */
export const kpiGetValues = onCall(async (request) => {
  assertRole(request, ["admin", "analyst", "finance"]);
  const d = (request.data || {}) as { grain?: unknown; from?: unknown; to?: unknown; kpiIds?: unknown; platform?: unknown };
  const grain = (d.grain ?? "daily") as Grain;
  if (!["daily", "weekly", "monthly"].includes(grain)) throw new HttpsError("invalid-argument", "Invalid grain.");
  const from = assertDay(d.from, "from");
  const to = assertDay(d.to, "to");
  if (eachDay(from, to).length > 400) throw new HttpsError("invalid-argument", "Range too large (max 400 days).");
  const kpiIds = Array.isArray(d.kpiIds) ? d.kpiIds.filter((k): k is string => typeof k === "string") : undefined;
  const platform = typeof d.platform === "string" ? (d.platform as PlatformId) : undefined;
  const values = await store().readValues({ grain, from, to, kpiIds, platform });
  return { values };
});
