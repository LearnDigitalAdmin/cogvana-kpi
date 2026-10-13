import { describe, expect, it } from "vitest";
import { DAY, MemoryPayReader, NOW, T_DAY } from "./helpers";
import { createRegisterCollector } from "../src/collectors/register";
import { markingSchools, registerMetrics, toRegisterRow } from "../src/collectors/register/activity";
import { classifyMessage, messageMetrics, providerMetrics, toMessageRow } from "../src/collectors/register/messaging";
import { purchasingSchools, tokensSold } from "../src/collectors/register/purchases";
import { snapshotRegister } from "../src/collectors/register/snapshot";
import { createPayCollector } from "../src/collectors/pay";
import { MemoryKpiStore } from "../src/core/store";
import { runDays } from "../src/jobs/run";
import { dailyPeriod } from "../src/core/period";
import { Collector, KpiValue } from "../src/core/types";
import { DocRecord } from "../src/core/reader";

const ts = (ms: number) => ({ toMillis: () => ms });
const rec = (data: Record<string, unknown>, id = "x"): DocRecord => ({ id, path: `c/${id}`, data });
const find = (vals: KpiValue[], kpiId: string, grain = "daily") => vals.find((v) => v.kpiId === kpiId && v.grain === grain);

const teacherSaved = (schoolId: string, extra: Record<string, unknown> = {}) => ({
  date: DAY, schoolId, locked: true, savedBy: "Mr Otieno", present: 20, late: 2, absent: 3, excused: 1, unmarked: 0, total: 26, ...extra,
});
const systemPlaceholder = (schoolId: string) => ({
  date: DAY, schoolId, locked: false, savedBy: "system", autoUnmarked: true, present: 0, late: 0, absent: 0, excused: 0, unmarked: 30, total: 30,
});

describe("registers: only teacher-saved registers count as activity", () => {
  it("ignores the noon job's placeholder registers", () => {
    const rows = [
      rec(teacherSaved("s1")), rec(teacherSaved("s1", { classCode: "B" })),
      rec(systemPlaceholder("s2")), rec(systemPlaceholder("s3")),
    ].map(toRegisterRow);
    const m = registerMetrics(rows);
    expect(m["register.registers_marked"].value).toBe(2);
    expect(m["register.registers_auto_unmarked"].value).toBe(2);
    expect(m["register.register_marking_rate"]).toMatchObject({ value: 50, numerator: 2, denominator: 4 });
    // s2 and s3 only have placeholders, so they are NOT active schools
    expect([...markingSchools(rows)]).toEqual(["s1"]);
  });

  it("attendance: (present+late) / (present+late+absent+excused), marked registers only", () => {
    const rows = [rec(teacherSaved("s1")), rec(systemPlaceholder("s1"))].map(toRegisterRow);
    const m = registerMetrics(rows);
    expect(m["register.students_attended"].value).toBe(22);
    expect(m["register.students_absent"].value).toBe(3);
    expect(m["register.students_excused"].value).toBe(1);
    expect(m["register.attendance_rate"]).toMatchObject({ value: 84.62, numerator: 22, denominator: 26 });
  });

  it("empty day gives zeros, not NaN", () => {
    const m = registerMetrics([]);
    expect(m["register.register_marking_rate"].value).toBe(0);
    expect(m["register.attendance_rate"].value).toBe(0);
  });
});

describe("messages", () => {
  it("tells a token block apart from a genuine failure", () => {
    const blocked = { status: "failed", smsSegments: 0, tokensUsed: 0, delivered: 0 };
    const genuine = { status: "failed", smsSegments: 2, tokensUsed: 4, delivered: 0 };
    expect(classifyMessage(blocked)).toBe("blocked");
    expect(classifyMessage(genuine)).toBe("failed");
    expect(classifyMessage({ status: "partial", delivered: 3 })).toBe("partial");
  });

  it("computes counts, success rate excluding blocks, recipients, tokens and scheduled sends", () => {
    const docs = [
      { schoolId: "s1", status: "sent", delivered: 40, recipientCount: 40, tokensUsed: 40, smsSegments: 1 },
      { schoolId: "s1", status: "sent", delivered: 10, recipientCount: 10, tokensUsed: 10, smsSegments: 1, scheduleId: "sch1" },
      { schoolId: "s2", status: "partial", delivered: 5, recipientCount: 8, tokensUsed: 8, smsSegments: 1 },
      { schoolId: "s3", status: "failed", delivered: 0, recipientCount: 6, tokensUsed: 6, smsSegments: 1 },
      { schoolId: "s4", status: "failed", delivered: 0, recipientCount: 9, tokensUsed: 0, smsSegments: 0 }, // blocked
    ].map((d) => toMessageRow(rec(d)));
    const m = messageMetrics(docs);
    expect(m["register.sms_messages_sent"].value).toBe(3);
    expect(m["register.sms_messages_failed"].value).toBe(1);
    expect(m["register.sms_blocked_no_tokens"].value).toBe(1);
    // sent=2 of (sent 2 + partial 1 + failed 1) = 50%
    expect(m["register.sms_success_rate"]).toMatchObject({ value: 50, numerator: 2, denominator: 4 });
    expect(m["register.sms_recipients"].value).toBe(55); // 40 + 10 + 5 (delivered on partial)
    expect(m["register.sms_tokens_used"].value).toBe(64);
    expect(m["register.sms_scheduled_messages"].value).toBe(1);
  });

  it("provider log: acceptance rate excludes pending", () => {
    const m = providerMetrics([rec({ status: "sent" }), rec({ status: "sent" }), rec({ status: "failed" }), rec({ status: "pending" })]);
    expect(m["register.sms_log_sent"].value).toBe(2);
    expect(m["register.sms_provider_success_rate"]).toMatchObject({ value: 66.67, numerator: 2, denominator: 3 });
  });
});

describe("token sales", () => {
  it("counts tokens and schools only for successful top-ups", () => {
    const docs = [
      rec({ status: "success", schoolId: "s1", tokens: 500 }),
      rec({ status: "success", schoolId: "s1", tokens: 100 }),
      rec({ status: "pending", schoolId: "s2", tokens: 900 }),
      rec({ status: "failed", schoolId: "s3", tokens: 50 }),
    ];
    expect(tokensSold(docs)["register.tokens_sold"].value).toBe(600);
    expect([...purchasingSchools(docs)]).toEqual(["s1"]);
  });
});

function seed(): MemoryPayReader {
  const r = new MemoryPayReader();
  // registers for the day: s1 teacher-saved twice, s2 placeholder only
  r.add("register", "registers/s1_A_d", teacherSaved("s1"));
  r.add("register", "registers/s1_B_d", teacherSaved("s1", { classCode: "B" }));
  r.add("register", "registers/s2_A_d", systemPlaceholder("s2"));
  // two days earlier in the same week (Mon 28 Sep is the week start; 27 Sep is the previous week)
  r.add("register", "registers/s3_A_old", { date: "2026-09-28", schoolId: "s3", locked: true, present: 10, late: 0, absent: 0, excused: 0 });
  r.add("register", "registers/s9_A_prevweek", { date: "2026-09-27", schoolId: "s9", locked: true, present: 10, late: 0, absent: 0, excused: 0 });
  // messages
  r.add("register", "messages/m1", { schoolId: "s1", status: "sent", delivered: 30, recipientCount: 30, tokensUsed: 30, smsSegments: 1, sentAt: new Date(T_DAY).toISOString(), content: "SECRET TEXT" });
  r.add("register", "messages/m2", { schoolId: "s4", status: "sent", delivered: 5, recipientCount: 5, tokensUsed: 5, smsSegments: 1, sentAt: new Date(T_DAY - 2 * 86_400_000).toISOString() });
  r.add("register", "sms-logs/SMS_1", { schoolId: "s1", status: "sent", createdAt: ts(T_DAY) });
  r.add("register", "sms-logs/SMS_2", { schoolId: "s1", status: "failed", createdAt: ts(T_DAY) });
  // top-ups
  r.add("register", "sms-topup-transactions/T1", { schoolId: "s1", status: "success", tokens: 500, createdAt: ts(T_DAY) });
  // growth
  r.add("register", "schools/new1", { createdAt: new Date(T_DAY).toISOString() });
  r.add("register", "schools/old1", { createdAt: "2025-01-01T00:00:00.000Z" });
  r.add("register", "students/st1", { createdAt: new Date(T_DAY).toISOString() });
  r.add("register", "students/st2", { createdAt: new Date(T_DAY).toISOString() });
  return r;
}

describe("Register collector", () => {
  it("emits the full daily set, including zero-valued KPIs", async () => {
    const vals = await createRegisterCollector(seed()).collect({ period: dailyPeriod(DAY), runId: "t", now: NOW });
    const daily = vals.filter((v) => v.grain === "daily");
    expect(daily).toHaveLength(23); // 2 growth + 7 activity + 3 distinct + 7 sms + 3 provider + 1 tokens sold
    expect(vals).toHaveLength(29); // + 3 weekly + 3 monthly distinct
    expect(find(vals, "register.schools_new")!.value).toBe(1);
    expect(find(vals, "register.students_new")!.value).toBe(2);
    expect(find(vals, "register.registers_marked")!.value).toBe(2);
    expect(find(vals, "register.tokens_sold")!.value).toBe(500);
    expect(find(vals, "register.sms_log_failed")!.value).toBe(1);
  });

  it("day, week and month 'active schools' use the right windows", async () => {
    const vals = await createRegisterCollector(seed()).collect({ period: dailyPeriod(DAY), runId: "t", now: NOW });
    expect(find(vals, "register.schools_marking", "daily")!.value).toBe(1); // s1 only (s2 is a placeholder)
    // week Mon 28 Sep - Sun 4 Oct: s1 (29th) and s3 (28th); s9 is last week
    const week = find(vals, "register.schools_marking", "weekly")!;
    expect(week).toMatchObject({ value: 2, periodStart: "2026-09-28", periodEnd: "2026-10-04", complete: false });
    // month September: s1, s3, s9
    const month = find(vals, "register.schools_marking", "monthly")!;
    expect(month).toMatchObject({ value: 3, periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    // messaging: week includes s1 (29th) and s4 (27th is last week) -> only s1
    expect(find(vals, "register.schools_messaging", "weekly")!.value).toBe(1);
    expect(find(vals, "register.schools_messaging", "monthly")!.value).toBe(2);
  });

  it("scans each week/month once per run even when several days are recomputed", async () => {
    const reader = seed();
    const collector = createRegisterCollector(reader);
    for (const day of ["2026-09-28", "2026-09-29"]) {
      await collector.collect({ period: dailyPeriod(day), runId: "t", now: NOW });
    }
    const weeklyRegisterScans = reader.queries.filter(
      (q) => q.collection === "registers" && q.endMs - q.startMs === 7 * 86_400_000
    );
    expect(weeklyRegisterScans).toHaveLength(1);
  });

  it("never selects message text, recipients or phone numbers", async () => {
    const reader = seed();
    await createRegisterCollector(reader).collect({ period: dailyPeriod(DAY), runId: "t", now: NOW });
    await snapshotRegister(reader, NOW, "t");
    const selected = reader.queries.flatMap((q) => q.select).join(",");
    expect(selected).not.toMatch(/content|rawContent|recipients\b|phone|phones|message\b|email|password|hash/i);
  });

  it("uses the right time representation per collection", async () => {
    const reader = seed();
    await createRegisterCollector(reader).collect({ period: dailyPeriod(DAY), runId: "t", now: NOW });
    const type = (c: string) => reader.queries.find((q) => q.collection === c)!.timeType;
    expect(type("registers")).toBe("dateString");
    expect(type("messages")).toBe("isoString");
    expect(type("sms-logs")).toBe("timestamp");
    expect(type("sms-topup-transactions")).toBe("timestamp");
  });
});

describe("Register stock snapshot", () => {
  it("counts schools, roles, active students, unspent tokens and stalled schedules with aggregates only", async () => {
    const r = new MemoryPayReader()
      .add("register", "schools/a", {}).add("register", "schools/b", {})
      .add("register", "users/u1", { role: "teacherAdmin", messageTokens: 100 })
      .add("register", "users/u2", { role: "teacherAdmin", messageTokens: 50 })
      .add("register", "users/u3", { role: "schoolAdmin", messageTokens: 400 })
      .add("register", "students/s1", {}).add("register", "students/s2", {}).add("register", "students/s3", { archived: true })
      .add("register", "scheduledMessages/m1", { status: "insufficientTokens" })
      .add("register", "scheduledMessages/m2", { status: "active" });
    const vals = await snapshotRegister(r, NOW, "snap");
    const get = (id: string) => vals.find((v) => v.kpiId === id)!.value;
    expect(get("register.schools_total")).toBe(2);
    expect(get("register.teachers_total")).toBe(2);
    expect(get("register.school_admins_total")).toBe(1);
    expect(get("register.students_total")).toBe(2); // 3 records minus 1 archived
    expect(get("register.tokens_outstanding")).toBe(550);
    expect(get("register.schedules_waiting_tokens")).toBe(1);
    expect(vals.every((v) => v.complete === false && v.periodStart === "2026-09-30")).toBe(true);
    expect(r.queries).toHaveLength(0); // no documents read at all
  });
});

describe("running Register and PAY together", () => {
  it("a Register failure is logged but does not block the company revenue rollup", async () => {
    const store = new MemoryKpiStore();
    const broken: Collector = { id: "register", collect: async () => { throw new Error("register down"); } };
    const res = await runDays({ store, collectors: [createPayCollector(new MemoryPayReader()), broken], now: () => NOW }, [DAY]);
    expect(res.ok).toBe(false);
    const vals = [...store.values.values()];
    expect(vals.some((v) => v.kpiId === "company.net_revenue")).toBe(true);
    expect(store.runs.find((r) => r.collector === "register")).toMatchObject({ status: "error" });
  });

  it("re-running a day overwrites, it does not duplicate", async () => {
    const store = new MemoryKpiStore();
    const deps = { store, collectors: [createRegisterCollector(seed())], now: () => NOW };
    await runDays(deps, [DAY]);
    const size = store.values.size;
    await runDays({ ...deps, collectors: [createRegisterCollector(seed())] }, [DAY]);
    expect(store.values.size).toBe(size);
  });
});
