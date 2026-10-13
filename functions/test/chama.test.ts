import { describe, expect, it } from "vitest";
import { DAY, MemoryPayReader, NOW, T_DAY } from "./helpers";
import { createChamaCollector } from "../src/collectors/chama";
import { activeChamas, chamaIdOf, ledgerMetrics, toLedgerRow } from "../src/collectors/chama/ledger";
import { smsMetrics, toSmsRow } from "../src/collectors/chama/messaging";
import { loanPosition, snapshotChama } from "../src/collectors/chama/snapshot";
import { MemoryKpiStore } from "../src/core/store";
import { runDays } from "../src/jobs/run";
import { createPayCollector } from "../src/collectors/pay";
import { dailyPeriod } from "../src/core/period";
import { Collector, KpiValue } from "../src/core/types";
import { DocRecord } from "../src/core/reader";

const rec = (path: string, data: Record<string, unknown>): DocRecord => ({ id: path.split("/").pop()!, path, data });
const find = (vals: KpiValue[], kpiId: string, grain = "daily") => vals.find((v) => v.kpiId === kpiId && v.grain === grain);

describe("ledger", () => {
  it("only accepts rows under chamas/{id}/transactions", () => {
    expect(chamaIdOf("chamas/c1/transactions/t1")).toBe("c1");
    expect(chamaIdOf("users/u1/transactions/t1")).toBeNull();
    expect(toLedgerRow(rec("users/u1/transactions/t1", { type: "contribution", direction: "in", amount: 5 }))).toBeNull();
  });

  it("computes volumes by type, digital share and WhatsApp share", () => {
    const rows = [
      rec("chamas/c1/transactions/a", { type: "contribution", direction: "in", amount: 1000, method: "paystack", channel: "whatsapp" }),
      rec("chamas/c1/transactions/b", { type: "contribution", direction: "in", amount: 500, method: "manual", channel: "app" }),
      rec("chamas/c2/transactions/c", { type: "loan_repayment", direction: "in", amount: 2000, method: "paystack", channel: "app" }),
      rec("chamas/c2/transactions/d", { type: "loan_disbursement", direction: "out", amount: 5000, method: "manual" }),
      rec("chamas/c3/transactions/e", { type: "mgr_contribution", direction: "in", amount: 300, method: "paystack", channel: "whatsapp" }),
      rec("chamas/c3/transactions/f", { type: "mgr_payout", direction: "out", amount: 900, method: "paystack" }),
    ].map(toLedgerRow).filter((r) => r !== null);
    const m = ledgerMetrics(rows);
    expect(m["chama.contribution_volume"].value).toBe(150000);
    expect(m["chama.contribution_count"].value).toBe(2);
    expect(m["chama.loan_repayment_volume"].value).toBe(200000);
    expect(m["chama.loans_disbursed_volume"].value).toBe(500000);
    expect(m["chama.mgr_contribution_volume"].value).toBe(30000);
    expect(m["chama.mgr_payout_volume"].value).toBe(90000);
    expect(m["chama.money_in_volume"].value).toBe(380000);
    // paystack money in: 1000 + 2000 + 300 = 3300 of 3800
    expect(m["chama.digital_payment_share"]).toMatchObject({ value: 86.84, numerator: 330000, denominator: 380000 });
    // paystack rows in: 3, whatsapp: 2
    expect(m["chama.whatsapp_payment_share"]).toMatchObject({ value: 66.67, numerator: 2, denominator: 3 });
    expect(activeChamas(rows as never).size).toBe(3);
  });

  it("empty day gives zeros, not NaN", () => {
    const m = ledgerMetrics([]);
    expect(m["chama.digital_payment_share"].value).toBe(0);
    expect(m["chama.money_in_volume"].value).toBe(0);
  });
});

describe("sms", () => {
  it("sums sends, accepted recipients, credits and acceptance rate", () => {
    const rows = [
      rec("chamas/c1/smsLog/a", { recipientCount: 10, sentCount: 9, creditsUsed: 9 }),
      rec("chamas/c2/smsLog/b", { recipientCount: 10, sentCount: 10, creditsUsed: 10 }),
    ].map(toSmsRow).filter((r) => r !== null);
    const m = smsMetrics(rows as never);
    expect(m["chama.sms_messages"].value).toBe(2);
    expect(m["chama.sms_recipients_sent"].value).toBe(19);
    expect(m["chama.sms_credits_used"].value).toBe(19);
    expect(m["chama.sms_delivery_rate"]).toMatchObject({ value: 95, numerator: 19, denominator: 20 });
  });
});

describe("loan position", () => {
  const schedule = [
    { n: 1, due: 1000, paid: true, paidAmount: 1000, dueDate: "2026-08-01" },
    { n: 2, due: 1000, paid: false, paidAmount: 400, dueDate: "2026-09-01" }, // past due, 600 left
    { n: 3, due: 1000, paid: false, paidAmount: 0, dueDate: "2026-11-01" }, // future, 1000
  ];
  it("sums unpaid installments and the past-due part", () => {
    expect(loanPosition(schedule, "2026-09-30")).toEqual({ outstanding: 160000, pastDue: 60000 });
  });
  it("handles missing or malformed schedules", () => {
    expect(loanPosition(undefined, "2026-09-30")).toEqual({ outstanding: 0, pastDue: 0 });
    expect(loanPosition([null, "x", { paid: false }], "2026-09-30")).toEqual({ outstanding: 0, pastDue: 0 });
  });
});

function seed(): MemoryPayReader {
  const r = new MemoryPayReader();
  r.add("chama", "chamas/c1/transactions/t1", { type: "contribution", direction: "in", amount: 1000, method: "paystack", channel: "whatsapp", createdAt: T_DAY, memberName: "SECRET NAME" });
  r.add("chama", "chamas/c1/transactions/t2", { type: "contribution", direction: "in", amount: 500, method: "manual", channel: "app", createdAt: T_DAY });
  r.add("chama", "chamas/c2/transactions/t3", { type: "loan_repayment", direction: "in", amount: 200, method: "paystack", channel: "app", createdAt: T_DAY });
  // two days earlier, same week (Monday 28 Sep is week start)
  r.add("chama", "chamas/c3/transactions/t4", { type: "contribution", direction: "in", amount: 100, method: "manual", createdAt: T_DAY - 1 * 86_400_000 });
  // previous week
  r.add("chama", "chamas/c4/transactions/t5", { type: "contribution", direction: "in", amount: 100, method: "manual", createdAt: T_DAY - 3 * 86_400_000 });
  r.add("chama", "chamas/c1/smsLog/s1", { recipientCount: 10, sentCount: 10, creditsUsed: 10, createdAt: T_DAY, message: "SECRET TEXT", recipientIds: ["a"] });
  r.add("chama", "chamas/c1/members/m1", { createdAt: T_DAY, name: "SECRET", phone: "0700" });
  r.add("chama", "chamas/c1/members/m2", { createdAt: T_DAY - 10 * 86_400_000 });
  r.add("chama", "chamas/new1", {});
  r.add("chama", "chamas/c1", { createdAt: T_DAY });
  return r;
}

describe("Chama collector", () => {
  it("emits the full daily set (21 values) and uses group queries with a parent fallback", async () => {
    const reader = seed();
    const vals = await createChamaCollector(reader).collect({ period: dailyPeriod(DAY), runId: "t", now: NOW });
    expect(vals).toHaveLength(21);
    expect(vals.filter((v) => v.grain === "daily")).toHaveLength(17);
    expect(find(vals, "chama.contribution_volume")!.value).toBe(150000);
    expect(find(vals, "chama.chamas_new")!.value).toBe(1); // c1 only; "new1" has no createdAt
    expect(find(vals, "chama.members_new")!.value).toBe(1);
    expect(find(vals, "chama.sms_messages")!.value).toBe(1);
    for (const q of reader.queries) expect(q).toMatchObject({ group: true, groupParent: "chamas", timeType: "epochMs" });
  });

  it("day, week and month active chamas use the right windows", async () => {
    const vals = await createChamaCollector(seed()).collect({ period: dailyPeriod(DAY), runId: "t", now: NOW });
    expect(find(vals, "chama.chamas_active")!.value).toBe(2); // c1, c2
    expect(find(vals, "chama.chamas_active", "weekly")).toMatchObject({ value: 3, periodStart: "2026-09-28", complete: false }); // + c3
    expect(find(vals, "chama.chamas_active", "monthly")).toMatchObject({ value: 4, periodStart: "2026-09-01" }); // + c4
    expect(find(vals, "chama.chamas_messaging", "weekly")!.value).toBe(1);
  });

  it("scans each week once per run", async () => {
    const reader = seed();
    const c = createChamaCollector(reader);
    for (const day of ["2026-09-28", "2026-09-29"]) await c.collect({ period: dailyPeriod(day), runId: "t", now: NOW });
    const weekly = reader.queries.filter((q) => q.collection === "transactions" && q.endMs - q.startMs === 7 * 86_400_000);
    expect(weekly).toHaveLength(1);
  });

  it("never selects names, phones, message text or recipients", async () => {
    const reader = seed();
    await createChamaCollector(reader).collect({ period: dailyPeriod(DAY), runId: "t", now: NOW });
    await snapshotChama(reader, NOW, "t");
    const selected = [...reader.queries, ...reader.equalsQueries, ...reader.pathQueries].flatMap((q) => q.select).join(",");
    expect(selected).not.toMatch(/name|phone|message|recipientIds|idNumber|note|email|password/i);
  });
});

describe("Chama stock snapshot", () => {
  it("computes plans, loans, overdue contributions and MGR from aggregates and explicit fields", async () => {
    const r = new MemoryPayReader()
      .add("chama", "chamas/c1", { plan: "free", smsCredits: 100, reportCreditsBalance: 2, planExpiry: "2026-01-01" })
      .add("chama", "chamas/c2", { plan: "basic", smsCredits: 50, reportCreditsBalance: 0, planExpiry: "2026-10-05" })
      .add("chama", "chamas/c3", { plan: "growth", smsCredits: 0, reportCreditsBalance: 1, planExpiry: "2026-12-31" })
      .add("chama", "chamas/c1/members/m1", { status: "active" })
      .add("chama", "chamas/c1/members/m2", { status: "removed" })
      .add("chama", "chamas/c2/members/m3", { status: "active" })
      .add("chama", "chamas/c1/loans/l1", { status: "active", schedule: [{ due: 1000, paid: false, paidAmount: 400, dueDate: "2026-09-01" }, { due: 1000, paid: false, paidAmount: 0, dueDate: "2026-11-01" }] })
      .add("chama", "chamas/c2/loans/l2", { status: "overdue", schedule: [{ due: 500, paid: false, paidAmount: 0, dueDate: "2026-09-15" }] })
      .add("chama", "chamas/c2/loans/l3", { status: "active", schedule: [{ due: 800, paid: false, paidAmount: 0, dueDate: "2026-12-01" }] })
      .add("chama", "chamas/c2/loans/l4", { status: "completed", schedule: [] })
      .add("chama", "chamas/c1/contributions/k1", { status: "overdue", amount: 500, paidAmount: 100 })
      .add("chama", "chamas/c1/contributions/k2", { status: "overdue", amount: 500, paidAmount: 0 })
      .add("chama", "chamas/c3/contributions/k3", { status: "paid", amount: 500, paidAmount: 500 })
      .add("chama", "chamas/c1/mgrPots/p1", { status: "active", pendingShortfall: 250 })
      .add("chama", "chamas/c1/mgrPots/p2", { status: "closed", pendingShortfall: 999 })
      .add("chama", "chamas/c1/mgrPots/p1/arrears/a1", { status: "open", amount: 300, settledAmount: 100 })
      .add("chama", "chamas/c1/mgrPots/p1/arrears/a2", { status: "settled", amount: 300, settledAmount: 300 })
      .add("chama", "chamas/c1/mgrPots/p2/arrears/a3", { status: "open", amount: 999 });
    const vals = await snapshotChama(r, NOW, "snap"); // today = 2026-09-30
    const get = (id: string) => vals.find((v) => v.kpiId === id)!.value;
    expect(get("chama.chamas_total")).toBe(3);
    expect(vals.filter((v) => v.kpiId === "chama.chamas_by_plan").map((v) => `${v.dimensions.plan}:${v.value}`).sort()).toEqual(["basic:1", "free:1", "growth:1", "max:0", "starter:0"]);
    expect(get("chama.paid_plans_expiring_14d")).toBe(1); // c2 only (c1 already past, c3 far off)
    expect(get("chama.members_active")).toBe(2);
    expect(get("chama.sms_credits_outstanding")).toBe(150);
    expect(get("chama.report_credits_outstanding")).toBe(3);
    // loans: l1 outstanding 600 + 1000 = 1600 (600 past due); l2 500 (all past due); l3 800
    expect(get("chama.loans_active")).toBe(3);
    expect(get("chama.loans_outstanding_balance")).toBe(290000);
    expect(get("chama.loans_at_risk_count")).toBe(2);
    expect(get("chama.loans_at_risk_balance")).toBe(210000);
    expect(vals.find((v) => v.kpiId === "chama.portfolio_at_risk")).toMatchObject({ value: 72.41, numerator: 210000, denominator: 290000 });
    expect(get("chama.contributions_overdue_count")).toBe(2);
    expect(get("chama.contributions_overdue_amount")).toBe(90000);
    expect(get("chama.chamas_with_overdue_contributions")).toBe(1);
    expect(get("chama.mgr_pots_active")).toBe(1);
    expect(get("chama.mgr_pending_shortfall")).toBe(25000);
    expect(get("chama.mgr_arrears_open_count")).toBe(1);
    expect(get("chama.mgr_arrears_open_amount")).toBe(20000);
    expect(vals).toHaveLength(22);
    expect(vals.every((v) => v.complete === false && v.periodStart === "2026-09-30")).toBe(true);
  });
});

describe("running Chama with the rest", () => {
  it("a Chama failure is logged but does not block the company revenue rollup", async () => {
    const store = new MemoryKpiStore();
    const broken: Collector = { id: "chama", collect: async () => { throw new Error("chama down"); } };
    const res = await runDays({ store, collectors: [createPayCollector(new MemoryPayReader()), broken], now: () => NOW }, [DAY]);
    expect(res.ok).toBe(false);
    expect([...store.values.values()].some((v) => v.kpiId === "company.net_revenue")).toBe(true);
    expect(store.runs.find((r) => r.collector === "chama")).toMatchObject({ status: "error" });
  });

  it("re-running a day overwrites, it does not duplicate", async () => {
    const store = new MemoryKpiStore();
    await runDays({ store, collectors: [createChamaCollector(seed())], now: () => NOW }, [DAY]);
    const size = store.values.size;
    await runDays({ store, collectors: [createChamaCollector(seed())], now: () => NOW }, [DAY]);
    expect(store.values.size).toBe(size);
  });
});
