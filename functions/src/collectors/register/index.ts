import { CollectContext, Collector, Grain, KpiValue, Period } from "../../core/types";
import { periodFor } from "../../core/period";
import { SourceReader } from "../../core/reader";
import { emitMetrics, makeValue } from "../../core/values";
import { markingSchools, registerMetrics, REGISTER_SELECT, toRegisterRow } from "./activity";
import {
  MESSAGE_SELECT,
  messageMetrics,
  messagingSchools,
  providerMetrics,
  SMS_LOG_SELECT,
  toMessageRow,
} from "./messaging";
import { purchasingSchools, tokensSold, TOPUP_SELECT } from "./purchases";

type DistinctKind = "marking" | "messaging" | "purchasing";

const DISTINCT_KPI: Record<DistinctKind, string> = {
  marking: "register.schools_marking",
  messaging: "register.schools_messaging",
  purchasing: "register.schools_purchasing",
};

/**
 * Register collector (read-only). For each day it emits daily KPIs, and for the week
 * and month containing that day it emits the distinct-school KPIs ("active schools"),
 * which cannot be derived by adding up daily counts.
 *
 * Create ONE collector instance per job run: period scans are memoised for the life of
 * the instance, so recomputing three days of the same week scans that week once.
 */
export function createRegisterCollector(reader: SourceReader): Collector {
  const memo = new Map<string, Promise<Set<string>>>();

  function distinctFor(kind: DistinctKind, period: Period): Promise<Set<string>> {
    const key = `${kind}|${period.grain}|${period.start}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const p = scanDistinct(reader, kind, period);
    memo.set(key, p);
    return p;
  }

  return {
    id: "register",
    async collect(ctx: CollectContext): Promise<KpiValue[]> {
      const { period, now, runId } = ctx;
      const src = "register" as const;
      const base = { platform: "register" as const, grain: "daily" as const, period, now, runId };

      const [registerDocs, messageDocs, logDocs, topupDocs, schoolsNew, studentsNew] = await Promise.all([
        reader.queryRange({ source: src, collection: "registers", timeField: "date", timeType: "dateString", startMs: period.startMs, endMs: period.endMs, select: REGISTER_SELECT }),
        reader.queryRange({ source: src, collection: "messages", timeField: "sentAt", timeType: "isoString", startMs: period.startMs, endMs: period.endMs, select: MESSAGE_SELECT }),
        reader.queryRange({ source: src, collection: "sms-logs", timeField: "createdAt", timeType: "timestamp", startMs: period.startMs, endMs: period.endMs, select: SMS_LOG_SELECT }),
        reader.queryRange({ source: src, collection: "sms-topup-transactions", timeField: "createdAt", timeType: "timestamp", startMs: period.startMs, endMs: period.endMs, select: TOPUP_SELECT }),
        reader.count({ source: src, collection: "schools", time: { field: "createdAt", type: "isoString", startMs: period.startMs, endMs: period.endMs } }),
        reader.count({ source: src, collection: "students", time: { field: "createdAt", type: "isoString", startMs: period.startMs, endMs: period.endMs } }),
      ]);

      const registers = registerDocs.map(toRegisterRow);
      const messages = messageDocs.map(toMessageRow);

      const out: KpiValue[] = [
        ...emitMetrics(
          {
            "register.schools_new": { value: schoolsNew },
            "register.students_new": { value: studentsNew },
            ...registerMetrics(registers),
            ...messageMetrics(messages),
            ...providerMetrics(logDocs),
            ...tokensSold(topupDocs),
          },
          base
        ),
        // Daily distinct counts come from the documents already loaded above.
        makeValue(DISTINCT_KPI.marking, { value: markingSchools(registers).size }, base),
        makeValue(DISTINCT_KPI.messaging, { value: messagingSchools(messages).size }, base),
        makeValue(DISTINCT_KPI.purchasing, { value: purchasingSchools(topupDocs).size }, base),
      ];

      // Weekly and monthly distinct counts for the periods that contain this day.
      for (const grain of ["weekly", "monthly"] as Grain[]) {
        const wide = periodFor(grain, period.start);
        for (const kind of Object.keys(DISTINCT_KPI) as DistinctKind[]) {
          const set = await distinctFor(kind, wide);
          out.push(makeValue(DISTINCT_KPI[kind], { value: set.size }, { platform: "register", grain, period: wide, now, runId }));
        }
      }
      return out;
    },
  };
}

/** One scan of a whole week or month, selecting only the fields needed to count schools. */
async function scanDistinct(reader: SourceReader, kind: DistinctKind, period: Period): Promise<Set<string>> {
  const window = { startMs: period.startMs, endMs: period.endMs };
  const src = "register" as const;
  if (kind === "marking") {
    const docs = await reader.queryRange({ source: src, collection: "registers", timeField: "date", timeType: "dateString", ...window, select: ["schoolId", "locked", "autoUnmarked"] });
    return markingSchools(docs.map(toRegisterRow));
  }
  if (kind === "messaging") {
    const docs = await reader.queryRange({ source: src, collection: "messages", timeField: "sentAt", timeType: "isoString", ...window, select: ["schoolId", "status"] });
    return messagingSchools(docs.map(toMessageRow));
  }
  const docs = await reader.queryRange({ source: src, collection: "sms-topup-transactions", timeField: "createdAt", timeType: "timestamp", ...window, select: ["schoolId", "status"] });
  return purchasingSchools(docs);
}
