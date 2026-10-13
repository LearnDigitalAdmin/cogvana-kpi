import { SourceReader } from "../../core/reader";
import { dailyPeriod, nairobiDay } from "../../core/period";
import { makeValue, Metric } from "../../core/values";
import { KpiValue } from "../../core/types";

/**
 * Stock metrics ("how many X exist right now"). They cannot be reconstructed for past
 * days (deleted or archived records are gone), so they are snapshotted at 23:55 Nairobi
 * and history starts at go-live. Uses aggregation queries only: no documents are read.
 */
export async function snapshotRegister(reader: SourceReader, now: number, runId: string): Promise<KpiValue[]> {
  const day = nairobiDay(now);
  const period = dailyPeriod(day);
  const src = "register" as const;

  const [schools, teachers, admins, students, archived, tokens, waiting] = await Promise.all([
    reader.count({ source: src, collection: "schools" }),
    reader.count({ source: src, collection: "users", equals: { field: "role", value: "teacherAdmin" } }),
    reader.count({ source: src, collection: "users", equals: { field: "role", value: "schoolAdmin" } }),
    reader.count({ source: src, collection: "students" }),
    reader.count({ source: src, collection: "students", equals: { field: "archived", value: true } }),
    reader.sum({ source: src, collection: "users" }, "messageTokens"),
    reader.count({ source: src, collection: "scheduledMessages", equals: { field: "status", value: "insufficientTokens" } }),
  ]);

  const metrics: Record<string, Metric> = {
    "register.schools_total": { value: schools },
    "register.teachers_total": { value: teachers },
    "register.school_admins_total": { value: admins },
    "register.students_total": { value: Math.max(0, students - archived) },
    "register.tokens_outstanding": { value: tokens },
    "register.schedules_waiting_tokens": { value: waiting },
  };
  return Object.entries(metrics).map(([kpiId, m]) =>
    makeValue(kpiId, m, { platform: "register", grain: "daily", period, now, runId, complete: false })
  );
}
