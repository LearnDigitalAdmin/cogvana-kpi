import { describe, expect, it } from "vitest";
import { DAY, MemoryPayReader, NOW, T_DAY } from "./helpers";
import { createPayCollector } from "../src/collectors/pay";
import { MemoryKpiStore } from "../src/core/store";
import { runDays, runSnapshot, writeFreshness } from "../src/jobs/run";
import { snapshotPlatformStats } from "../src/collectors/pay/snapshotStats";
import { Collector, KpiValue } from "../src/core/types";
import { PLATFORMS } from "../src/collectors/pay/facts";

const ts = (ms: number) => ({ toMillis: () => ms });

function seed(): MemoryPayReader {
  return new MemoryPayReader()
    // Register SMS: 1 success (net 487.50), 1 failed
    .add("register", "sms-topup-transactions/R1", { status: "success", amountKes: 500, grossAmount: 500, paystackFees: 12.5, amountReceived: 487.5, schoolId: "s1", createdAt: ts(T_DAY) })
    .add("register", "sms-topup-transactions/R2", { status: "failed", amountKes: 500, schoolId: "s2", createdAt: ts(T_DAY) })
    // PMS: rent with split (15.00), subscription no agent (net 1,960), pending SMS stuck > 30 min
    .add("default", "transactions/INV_1", { status: "success", userId: "u1", createdAt: ts(T_DAY), paystackResponse: { amount: 100000, fees: 1500, fees_split: { integration: 1500 } } })
    .add("default", "subscriptions/SUB_1", { status: "success", agentId: null, userId: "u1", initiatedAt: ts(T_DAY), paystackResponse: { amount: 200000, fees: 4000 } })
    .add("default", "sms-topup-transactions/P1", { status: "pending", amountKes: 300, userId: "u1", createdAt: ts(T_DAY) })
    // Chama: markup 3.50 and a plan (999)
    .add("chama", "chamas/c1/paymentIntents/MCW-c1-1", { status: "success", amount: 1000, grossAmount: 1010, paystackFee: 6.5, ourFee: 3.5, createdAt: T_DAY })
    .add("chama", "chamas/c1/planBilling/MCP-1", { status: "success", amountKes: 999, createdAt: T_DAY })
    // Cyber: commission 25.00
    .add("default", "cyber-transactions/CYBER_1", { status: "success", uid: "a1", createdAt: ts(T_DAY), paystackResponse: { amount: 104000, fees: 4000 } });
}

const find = (vals: KpiValue[], kpiId: string, platform: string, dims: Record<string, string> = {}) =>
  vals.find((v) => v.kpiId === kpiId && v.platform === platform && JSON.stringify(v.dimensions) === JSON.stringify(dims));

describe("PAY collector -> KPI values", () => {
  it("computes per-platform KPIs, rates and stuck pending", async () => {
    const store = new MemoryKpiStore();
    const res = await runDays({ store, collectors: [createPayCollector(seed())], now: () => NOW }, [DAY]);
    expect(res.ok).toBe(true);
    const vals = [...store.values.values()];

    // Register: 2 attempts, 1 success -> 50%, net 487.50
    expect(find(vals, "pay.attempts", "register")!.value).toBe(2);
    expect(find(vals, "pay.success_rate", "register")).toMatchObject({ value: 50, numerator: 1, denominator: 2 });
    expect(find(vals, "pay.net_revenue", "register")!.value).toBe(48750);

    // PMS: rent split 1,500 + subscription 196,000 (no agent) = 197,500 net; pending SMS is stuck
    expect(find(vals, "pay.net_revenue", "pms")!.value).toBe(197500);
    expect(find(vals, "pay.stuck_pending", "pms")!.value).toBe(1);
    expect(find(vals, "pay.gmv", "pms")!.value).toBe(300000); // rent 1,000 + subscription 2,000 (KES 3,000 in cents)

    // Streams and charge types split correctly
    expect(find(vals, "pay.net_revenue", "pms", { stream: "commission" })!.value).toBe(1500);
    expect(find(vals, "pay.net_revenue", "pms", { stream: "subscription" })!.value).toBe(196000);
    expect(find(vals, "pay.net_revenue", "chama", { chargeType: "chama_plan" })!.value).toBe(99900);
    expect(find(vals, "pay.net_revenue", "cyber")!.value).toBe(2500);
  });

  it("flags estimates and unknown fees as not fully verified", async () => {
    const store = new MemoryKpiStore();
    await runDays({ store, collectors: [createPayCollector(seed())], now: () => NOW }, [DAY]);
    const vals = [...store.values.values()];
    // Chama plan (999) rests on gross_fee_unknown; Chama markup is recorded
    expect(find(vals, "pay.net_revenue_unverified", "chama")!.value).toBe(99900);
    // Register SMS has recorded fees -> nothing unverified there
    expect(find(vals, "pay.net_revenue_unverified", "register")!.value).toBe(0);
  });

  it("emits zeros for platforms with no payments so series have no holes", async () => {
    const store = new MemoryKpiStore();
    await runDays({ store, collectors: [createPayCollector(new MemoryPayReader())], now: () => NOW }, [DAY]);
    for (const p of PLATFORMS) {
      expect(find([...store.values.values()], "pay.attempts", p)!.value).toBe(0);
      expect(find([...store.values.values()], "pay.success_rate", p)!.value).toBe(0);
    }
  });

  it("marks today's values incomplete and past days complete", async () => {
    const store = new MemoryKpiStore();
    await runDays({ store, collectors: [createPayCollector(seed())], now: () => NOW }, [DAY, "2026-09-30"]);
    const vals = [...store.values.values()];
    expect(vals.filter((v) => v.periodStart === DAY).every((v) => v.complete)).toBe(true);
    expect(vals.filter((v) => v.periodStart === "2026-09-30").every((v) => !v.complete)).toBe(true);
  });
});

describe("company rollup reconciles to platforms", () => {
  it("company totals equal the sum of platform totals, per stream too", async () => {
    const store = new MemoryKpiStore();
    await runDays({ store, collectors: [createPayCollector(seed())], now: () => NOW }, [DAY]);
    const vals = [...store.values.values()];

    for (const [platformKpi, companyKpi] of [
      ["pay.net_revenue", "company.net_revenue"],
      ["pay.platform_revenue", "company.platform_revenue"],
      ["pay.gmv", "company.gmv"],
      ["pay.attempts", "company.attempts"],
      ["pay.success", "company.success"],
    ]) {
      const platformSum = PLATFORMS.reduce((a, p) => a + find(vals, platformKpi, p)!.value, 0);
      expect(find(vals, companyKpi, "all")!.value).toBe(platformSum);
    }

    const streamSum = (stream: string) =>
      PLATFORMS.reduce((a, p) => a + (find(vals, "pay.net_revenue", p, { stream })?.value ?? 0), 0);
    for (const stream of ["commission", "sms", "subscription", "reports", "markup"]) {
      expect(find(vals, "company.net_revenue", "all", { stream })?.value ?? 0).toBe(streamSum(stream));
    }
    // The breakdown must add back up to the total
    const total = find(vals, "company.net_revenue", "all")!.value;
    const streams = ["commission", "sms", "subscription", "reports", "markup"].reduce((a, s) => a + (find(vals, "company.net_revenue", "all", { stream: s })?.value ?? 0), 0);
    expect(streams).toBe(total);
  });

  it("company success rate is recomputed from sums, not averaged", async () => {
    const store = new MemoryKpiStore();
    await runDays({ store, collectors: [createPayCollector(seed())], now: () => NOW }, [DAY]);
    const v = find([...store.values.values()], "company.success_rate", "all")!;
    expect(v.numerator).toBe(find([...store.values.values()], "company.success", "all")!.value);
    expect(v.denominator).toBe(find([...store.values.values()], "company.attempts", "all")!.value);
  });
});

describe("runner behaviour", () => {
  it("is idempotent: running a day twice does not duplicate values", async () => {
    const store = new MemoryKpiStore();
    const deps = { store, collectors: [createPayCollector(seed())], now: () => NOW };
    await runDays(deps, [DAY]);
    const size = store.values.size;
    await runDays(deps, [DAY]);
    expect(store.values.size).toBe(size);
  });

  it("a late-settling payment corrects an earlier figure on re-run", async () => {
    const store = new MemoryKpiStore();
    const reader = new MemoryPayReader().add("register", "sms-topup-transactions/R1", { status: "pending", amountKes: 500, schoolId: "s1", createdAt: ts(T_DAY) });
    const deps = { store, collectors: [createPayCollector(reader)], now: () => NOW };
    await runDays(deps, [DAY]);
    expect(find([...store.values.values()], "pay.net_revenue", "register")!.value).toBe(0);
    // The payment settles after the first run: the source now holds the success record.
    const fresh = new MemoryPayReader().add("register", "sms-topup-transactions/R1", { status: "success", amountKes: 500, grossAmount: 500, paystackFees: 10, amountReceived: 490, schoolId: "s1", createdAt: ts(T_DAY) });
    await runDays({ store, collectors: [createPayCollector(fresh)], now: () => NOW }, [DAY]);
    expect(find([...store.values.values()], "pay.net_revenue", "register")!.value).toBe(49000);
  });

  it("a failing collector is logged, and no company rollup is published for that day", async () => {
    const store = new MemoryKpiStore();
    const broken: Collector = { id: "pay", feedsCompanyRollup: true, collect: async () => { throw new Error("boom"); } };
    const res = await runDays({ store, collectors: [broken], now: () => NOW }, [DAY]);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/boom/);
    expect(store.runs[0]).toMatchObject({ collector: "pay", status: "error", error: "boom" });
    expect([...store.values.values()].filter((v) => v.kpiId.startsWith("company."))).toHaveLength(0);
  });

  it("one bad day does not stop the other days", async () => {
    const store = new MemoryKpiStore();
    const flaky: Collector = {
      id: "pay",
      collect: async (ctx) => {
        if (ctx.period.start === "2026-09-28") throw new Error("day failed");
        return createPayCollector(seed()).collect(ctx);
      },
    };
    const res = await runDays({ store, collectors: [flaky], now: () => NOW }, ["2026-09-28", DAY]);
    expect(res.ok).toBe(false);
    expect([...store.values.values()].some((v) => v.periodStart === DAY)).toBe(true);
  });

  it("publishes freshness in hours since each collector last succeeded", async () => {
    const store = new MemoryKpiStore();
    await runDays({ store, collectors: [createPayCollector(seed())], now: () => NOW - 3 * 3_600_000 }, [DAY]);
    const out = await writeFreshness(store, ["pay", "pay_stats"], NOW);
    expect(out).toHaveLength(1); // pay_stats never ran: no number rather than a wrong one
    expect(out[0]).toMatchObject({ dimensions: { collector: "pay" }, value: 3 });
  });

  it("syncs KPI definitions once and only rewrites what changed", async () => {
    const store = new MemoryKpiStore();
    await runDays({ store, collectors: [], now: () => NOW }, []);
    expect(store.definitions.size).toBeGreaterThan(20);
    const { written } = await store.syncDefinitions([...store.definitions.values()]);
    expect(written).toBe(0);
  });
});

describe("platform_stats snapshot", () => {
  it("snapshots numeric counters from both databases and ignores non-numeric and PNS fields", async () => {
    const reader = new MemoryPayReader()
      .add("default", "platform_stats/totals", { totalReportCharges: 12, totalReportRevenue: 600.5, totalPmsSmsRevenue: 900, lastSmsTopUpDate: ts(T_DAY), totalPNSBookingsPaid: 4 })
      .add("register", "platform_stats/totals", { totalSmsTopUps: 30, totalSmsRevenue: 15000 });
    const store = new MemoryKpiStore();
    const res = await runSnapshot(store, "pay_stats", (now, runId) => snapshotPlatformStats(reader, now, runId), () => NOW);
    expect(res.ok).toBe(true);
    const vals = [...store.values.values()];
    expect(vals).toHaveLength(5); // 3 default numeric + 2 register
    expect(vals.find((v) => v.dimensions.counter === "totalPNSBookingsPaid")).toBeUndefined();
    expect(vals.find((v) => v.dimensions.counter === "lastSmsTopUpDate")).toBeUndefined();
    expect(vals.find((v) => v.dimensions.db === "register" && v.dimensions.counter === "totalSmsTopUps")!.value).toBe(30);
    expect(vals[0].periodStart).toBe("2026-09-30");
  });

  it("logs an error run instead of throwing when the source fails", async () => {
    const store = new MemoryKpiStore();
    const res = await runSnapshot(store, "pay_stats", async () => { throw new Error("no access"); }, () => NOW);
    expect(res.ok).toBe(false);
    expect(store.runs[0]).toMatchObject({ collector: "pay_stats", status: "error" });
  });
});
