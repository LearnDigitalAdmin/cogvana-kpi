import { describe, expect, it } from "vitest";
import { DAY, MemoryPayReader, NOW, T_DAY } from "./helpers";
import { createPmsCollector } from "../src/collectors/pms";
import { accountMetrics, loadPmsUsers, tierCounts, toPmsUser } from "../src/collectors/pms/users";
import { collectionRate, paymentUserIdOf, receivables, userIdOf } from "../src/collectors/pms/billing";
import { snapshotPms } from "../src/collectors/pms/snapshot";
import { MemoryKpiStore } from "../src/core/store";
import { runDays } from "../src/jobs/run";
import { dailyPeriod } from "../src/core/period";
import { KpiValue } from "../src/core/types";
import { DocRecord } from "../src/core/reader";

const ts = (ms: number) => ({ toMillis: () => ms });
const D = 86_400_000;
const find = (v: KpiValue[], id: string, grain = "daily", dims: Record<string, string> = {}) =>
  v.find((x) => x.kpiId === id && x.grain === grain && JSON.stringify(x.dimensions) === JSON.stringify(dims));
const rec = (path: string, data: Record<string, unknown>): DocRecord => ({ id: path.split("/").pop()!, path, data });

const user = (localId: number, extra: Record<string, unknown> = {}) => ({ localId, tier: "free", storage: false, isTrial: false, messageTokens: 0, passwordHash: "SECRET", email: "a@b.c", ...extra });

describe("accounts, plans and trials", () => {
  const users = [
    user(1, { tier: "business", storage: true, subscriptionExpiry: ts(NOW + 5 * D), lastSyncTime: ts(NOW - D), messageTokens: 100, trialStartedAt: ts(NOW - 60 * D), lastPaymentDate: ts(NOW - 30 * D) }), // paid, expiring in 5 days, converted
    user(2, { tier: "enterprise", storage: true, subscriptionExpiry: ts(NOW + 60 * D), lastSyncTime: ts(NOW - 20 * D), messageTokens: 50 }), // paid, stale sync
    user(3, { tier: "business", storage: true, subscriptionExpiry: ts(NOW - 3 * D), lastSyncTime: ts(NOW - D) }), // lapsed 3 days ago
    user(4, { isTrial: true, subscriptionExpiry: ts(NOW + 4 * D), trialStartedAt: ts(NOW - 10 * D), lastSyncTime: ts(NOW - D) }), // trial ending soon, not converted
    user(5, { isTrial: true, subscriptionExpiry: ts(NOW - 2 * D), trialStartedAt: ts(NOW - 20 * D) }), // expired trial not downgraded
    user(6, { tier: "weird" }),
  ].map((d, i) => toPmsUser(rec(`users/u${i + 1}`, d)));

  it("computes plan, trial and sync health metrics", () => {
    const m = accountMetrics(users, NOW);
    expect(m["pms.users_total"].value).toBe(6);
    expect(m["pms.paid_active"].value).toBe(2);
    expect(m["pms.paid_expiring_14d"].value).toBe(1);
    expect(m["pms.paid_lapsed_14d"].value).toBe(1);
    expect(m["pms.paid_stale_sync_7d"].value).toBe(1); // only u2 (synced 20 days ago); u1 and u3 synced yesterday
    expect(m["pms.users_synced_7d"].value).toBe(3);
    expect(m["pms.trials_active"].value).toBe(1);
    expect(m["pms.trials_expiring_7d"].value).toBe(1);
    expect(m["pms.trials_awaiting_downgrade"].value).toBe(1);
    expect(m["pms.tokens_outstanding"].value).toBe(150);
    // trials ever: u1, u4, u5; converted: u1 (paid after trial start)
    expect(m["pms.trial_conversion_rate"]).toMatchObject({ value: 33.33, numerator: 1, denominator: 3 });
  });

  it("tier counts always list the four known tiers and group the rest as other", () => {
    expect(tierCounts(users)).toEqual({ free: 2, low: 0, business: 2, enterprise: 1, other: 1 });
  });
});

describe("loading PMS accounts", () => {
  it("returns only documents with a numeric localId and never selects credentials", async () => {
    const r = new MemoryPayReader()
      .add("default", "users/pms1", user(7, { tier: "low" }))
      .add("default", "users/cyber1", { tier: "free", phone: "0700", name: "Cyber user" }); // no localId: Cyber account
    const loaded = await loadPmsUsers(r);
    expect(loaded.map((u) => u.id)).toEqual(["pms1"]);
    const selected = r.queries.flatMap((q) => q.select).join(",");
    expect(selected).not.toMatch(/password|hash|email|phone|name/i);
    expect(loaded[0]).not.toHaveProperty("passwordHash");
  });
});

describe("paths", () => {
  it("accepts only users/{u}/... rows, so Cyber's top-level collections never count", () => {
    expect(userIdOf("users/u1/invoices/i1", "invoices")).toBe("u1");
    expect(userIdOf("invoices/i1", "invoices")).toBeNull();
    expect(userIdOf("users/u1/tenants/t1", "invoices")).toBeNull();
    expect(paymentUserIdOf("users/u1/invoices/i1/payments/p1")).toBe("u1");
    expect(paymentUserIdOf("payments/p1")).toBeNull();
  });
});

describe("receivables and collection rate", () => {
  const inv = (id: string, d: Record<string, unknown>) => rec(`users/u1/invoices/${id}`, d);
  it("sums unpaid and overdue amounts over invoices PMS has not marked paid", () => {
    const m = receivables([
      inv("a", { totalAmount: 10000, amountPaid: 2000, dueDate: "2026-09-10" }), // overdue, 8,000 left
      inv("b", { totalAmount: 5000, amountPaid: 0, dueDate: "2026-10-10T00:00:00.000Z" }), // not due
      rec("invoices/cyber1", { totalAmount: 999999, amountPaid: 0, dueDate: "2020-01-01" }), // Cyber: ignored
    ], "2026-09-30");
    expect(m["pms.invoices_unpaid_count"].value).toBe(2);
    expect(m["pms.receivables_outstanding"].value).toBe(1300000);
    expect(m["pms.invoices_overdue_count"].value).toBe(1);
    expect(m["pms.receivables_overdue"].value).toBe(800000);
  });
  it("collection rate caps each invoice's paid amount at its total", () => {
    const r = collectionRate([inv("a", { totalAmount: 1000, amountPaid: 1500 }), inv("b", { totalAmount: 1000, amountPaid: 500 })]);
    expect(r).toMatchObject({ value: 75, numerator: 150000, denominator: 200000 });
    expect(collectionRate([]).value).toBe(0);
  });
});

function seed(): MemoryPayReader {
  const iso = (ms: number) => new Date(ms).toISOString();
  return new MemoryPayReader()
    .add("default", "users/u1", user(1, { createdAt: iso(T_DAY), trialStartedAt: ts(T_DAY) }))
    .add("default", "users/cyberU", { createdAt: iso(T_DAY), phone: "0700" }) // not PMS
    .add("default", "users/u1/invoices/i1", { createdAt: iso(T_DAY), totalAmount: 10000, amountPaid: 0, userId: "u1" })
    .add("default", "users/u2/invoices/i2", { createdAt: iso(T_DAY), totalAmount: 5000, amountPaid: 0 })
    .add("default", "invoices/cyberInv", { createdAt: iso(T_DAY), totalAmount: 777, amountPaid: 0 }) // Cyber invoice
    .add("default", "users/u1/invoices/i1/payments/p1", { paymentDate: "2026-09-29", amount: 4000 }) // date-only string
    .add("default", "users/u3/invoices/i3/payments/p2", { paymentDate: iso(T_DAY), amount: 1000 })
    .add("default", "users/u9/invoices/old/payments/p3", { paymentDate: iso(T_DAY - D), amount: 300 }) // Monday 28 Sep: same week, earlier day
    .add("default", "users/u1/properties/pr1", { createdAt: iso(T_DAY) })
    .add("default", "users/u1/tenants/t1", { createdAt: iso(T_DAY), isActive: true })
    .add("default", "tenants/cyberTenant", { createdAt: iso(T_DAY) });
}

describe("PMS collector", () => {
  it("computes the daily set, ignoring Cyber's records and handling date-only payment dates", async () => {
    const vals = await createPmsCollector(seed()).collect({ period: dailyPeriod(DAY), runId: "t", now: NOW });
    expect(vals).toHaveLength(11); // users_new, trials_started, 6 billing/growth, managers_active x3 grains
    expect(find(vals, "pms.users_new")!.value).toBe(1);
    expect(find(vals, "pms.trials_started")!.value).toBe(1);
    expect(find(vals, "pms.invoices_issued")!.value).toBe(2);
    expect(find(vals, "pms.invoiced_amount")!.value).toBe(1500000);
    expect(find(vals, "pms.payments_recorded")!.value).toBe(2);
    expect(find(vals, "pms.rent_collected")!.value).toBe(500000);
    expect(find(vals, "pms.properties_new")!.value).toBe(1);
    expect(find(vals, "pms.tenants_new")!.value).toBe(1);
  });

  it("active managers: distinct across invoices and payments for day, week and month", async () => {
    const vals = await createPmsCollector(seed()).collect({ period: dailyPeriod(DAY), runId: "t", now: NOW });
    expect(find(vals, "pms.managers_active")!.value).toBe(3); // u1, u2 (invoices) + u3 (payment); u1 also paid
    expect(find(vals, "pms.managers_active", "weekly")).toMatchObject({ value: 4, periodStart: "2026-09-28" }); // + u9
    expect(find(vals, "pms.managers_active", "monthly")!.value).toBe(4);
  });

  it("scans each week once per run and is idempotent", async () => {
    const reader = seed();
    const c = createPmsCollector(reader);
    for (const day of ["2026-09-28", "2026-09-29"]) await c.collect({ period: dailyPeriod(day), runId: "t", now: NOW });
    expect(reader.queries.filter((q) => q.collection === "invoices" && q.endMs - q.startMs === 7 * D)).toHaveLength(1);
    const store = new MemoryKpiStore();
    await runDays({ store, collectors: [createPmsCollector(seed())], now: () => NOW }, [DAY]);
    const size = store.values.size;
    await runDays({ store, collectors: [createPmsCollector(seed())], now: () => NOW }, [DAY]);
    expect(store.values.size).toBe(size);
  });
});

describe("PMS stock snapshot", () => {
  it("combines accounts, portfolio, receivables and billing-month collection rates", async () => {
    const r = new MemoryPayReader()
      .add("default", "users/u1", user(1, { tier: "business", storage: true, subscriptionExpiry: ts(NOW + 5 * D), lastSyncTime: ts(NOW - D) }))
      .add("default", "users/u2", user(2))
      .add("default", "users/u1/properties/p1", {})
      .add("default", "users/u1/properties/p1/units/a", { isOccupied: true })
      .add("default", "users/u1/properties/p1/units/b", { isOccupied: false })
      .add("default", "users/u1/properties/p1/units/c", { isOccupied: true })
      .add("default", "users/u1/tenants/t1", { isActive: true })
      .add("default", "tenants/cyberT", { isActive: true })
      .add("default", "users/u1/invoices/i1", { isPaid: false, totalAmount: 1000, amountPaid: 0, dueDate: "2026-09-01", billingMonth: "2026-09" })
      .add("default", "users/u1/invoices/i2", { isPaid: true, totalAmount: 1000, amountPaid: 600, dueDate: "2026-09-01", billingMonth: "2026-09" })
      .add("default", "users/u1/invoices/i3", { isPaid: true, totalAmount: 2000, amountPaid: 2000, billingMonth: "2026-08" });
    const vals = await snapshotPms(r, NOW, "snap");
    const g = (id: string, dims: Record<string, string> = {}) => find(vals, id, "daily", dims)!;
    expect(g("pms.users_total").value).toBe(2);
    expect(g("pms.paid_active").value).toBe(1);
    expect(g("pms.users_by_tier", { tier: "business" }).value).toBe(1);
    expect(g("pms.users_by_tier", { tier: "free" }).value).toBe(1);
    expect(g("pms.properties_total").value).toBe(1);
    expect(g("pms.units_total").value).toBe(3);
    expect(g("pms.units_occupied").value).toBe(2);
    expect(g("pms.occupancy_rate")).toMatchObject({ value: 66.67, numerator: 2, denominator: 3 });
    expect(g("pms.tenants_active").value).toBe(1); // Cyber's top-level tenant ignored
    expect(g("pms.invoices_unpaid_count").value).toBe(1);
    expect(g("pms.receivables_outstanding").value).toBe(100000);
    expect(g("pms.invoices_overdue_count").value).toBe(1);
    expect(g("pms.collection_rate", { month: "2026-09" })).toMatchObject({ value: 30, numerator: 60000, denominator: 200000 });
    expect(g("pms.collection_rate", { month: "2026-08" }).value).toBe(100);
    expect(vals.every((v) => v.complete === false && v.periodStart === "2026-09-30")).toBe(true);
  });
});
