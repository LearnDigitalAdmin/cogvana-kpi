import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryKpiStore } from "../src/core/store";
import { eachDay, periodFor } from "../src/core/period";
import { Grain, KpiValue, PlatformId, valueId } from "../src/core/types";
import { makeValue } from "../src/core/values";
import { validateDefinitions } from "../src/core/registry";
import { ALL_DEFINITIONS, DEFINITIONS_BY_ID } from "../src/registry";
import { CROSS_DEFINITIONS } from "../src/registry/cross";
import { deriveGrain, ratioValue } from "../src/rollups/derive";
import { smsCostCentsPerUnit } from "../src/rollups/config";
import { runRollups } from "../src/jobs/rollups";
import { runDays } from "../src/jobs/run";
import { createPayCollector } from "../src/collectors/pay";
import { DAY, MemoryPayReader, NOW as PIPE_NOW, T_DAY } from "./helpers";

const NOW = Date.UTC(2026, 9, 1, 9, 0, 0); // 2026-10-01 12:00 Nairobi
const D = "2026-09-08"; // Tuesday
const W = "2026-09-07"; // its week (Monday)
const M = "2026-09-01"; // its month

interface PutOpts {
  n?: number;
  d?: number;
  dims?: Record<string, string>;
  complete?: boolean;
}

function put(
  store: MemoryKpiStore,
  kpiId: string,
  platform: PlatformId,
  grain: Grain,
  day: string,
  value: number,
  o: PutOpts = {}
): KpiValue {
  const v = makeValue(
    kpiId,
    { value, numerator: o.n, denominator: o.d },
    { platform, grain, period: periodFor(grain, day), now: NOW, runId: "seed", dimensions: o.dims, complete: o.complete ?? true }
  );
  store.values.set(v.id, v);
  return v;
}

function row(
  store: MemoryKpiStore,
  kpiId: string,
  platform: PlatformId,
  grain: Grain,
  start: string,
  dims: Record<string, string> = {}
): KpiValue | undefined {
  return store.values.get(valueId({ kpiId, platform, grain, periodStart: start, dimensions: dims }));
}

const deps = (store: MemoryKpiStore, now = NOW) => ({ store, now: () => now });
const allValues = (store: MemoryKpiStore) => [...store.values.values()];

/** One full set of inputs for day D, its week and its month. `cyber: false` leaves every Cyber input absent. */
function seedAll(store: MemoryKpiStore, { cyber = true }: { cyber?: boolean } = {}): void {
  put(store, "register.schools_marking", "register", "daily", D, 10);
  put(store, "chama.chamas_active", "chama", "daily", D, 5);
  put(store, "pms.managers_active", "pms", "daily", D, 7);
  put(store, "register.schools_new", "register", "daily", D, 2);
  put(store, "chama.chamas_new", "chama", "daily", D, 3);
  put(store, "pms.users_new", "pms", "daily", D, 4);
  put(store, "company.net_revenue", "all", "daily", D, 100000);
  put(store, "company.net_revenue_unverified", "all", "daily", D, 25000);
  put(store, "company.net_revenue", "all", "daily", D, 30000, { dims: { stream: "commission" } });
  put(store, "company.net_revenue", "all", "daily", D, 30000, { dims: { stream: "sms" } });
  put(store, "company.net_revenue", "all", "daily", D, 40000, { dims: { stream: "subscription" } });
  put(store, "pay.net_revenue", "pms", "daily", D, 60000);
  put(store, "pay.net_revenue", "register", "daily", D, 10000);
  put(store, "pay.net_revenue", "chama", "daily", D, 20000);
  put(store, "pay.net_revenue", "cyber", "daily", D, 10000);
  put(store, "pay.net_revenue", "register", "daily", D, 8000, { dims: { stream: "sms" } });
  put(store, "pay.net_revenue", "chama", "daily", D, 12000, { dims: { stream: "sms" } });
  put(store, "register.sms_tokens_used", "register", "daily", D, 500);
  put(store, "chama.sms_credits_used", "chama", "daily", D, 300);
  put(store, "register.tokens_outstanding", "register", "daily", D, 1000, { complete: false });
  put(store, "chama.sms_credits_outstanding", "chama", "daily", D, 2000, { complete: false });
  put(store, "pms.tokens_outstanding", "pms", "daily", D, 3000, { complete: false });
  put(store, "pay.gmv", "pms", "daily", D, 90000, { dims: { chargeType: "pms_rent" } });
  put(store, "pms.rent_collected", "pms", "daily", D, 120000);
  put(store, "company.data_freshness_hours", "all", "daily", D, 3.5, { dims: { collector: "pay" }, complete: false });
  put(store, "company.data_freshness_hours", "all", "daily", D, 30, { dims: { collector: "register" }, complete: false });
  put(store, "company.data_freshness_hours", "all", "daily", D, 27, { dims: { collector: "chama" }, complete: false });
  // Distinct counts: the collectors write weekly and monthly values themselves.
  put(store, "register.schools_marking", "register", "weekly", W, 10);
  put(store, "chama.chamas_active", "chama", "weekly", W, 5);
  put(store, "pms.managers_active", "pms", "weekly", W, 7);
  put(store, "register.schools_marking", "register", "monthly", M, 20);
  put(store, "chama.chamas_active", "chama", "monthly", M, 10);
  put(store, "pms.managers_active", "pms", "monthly", M, 14);
  if (cyber) {
    put(store, "cyber.wa_users_active", "cyber", "daily", D, 4);
    put(store, "cyber.wa_users_active", "cyber", "weekly", W, 4);
    put(store, "cyber.wa_users_active", "cyber", "monthly", M, 8);
  }
}

afterEach(() => vi.unstubAllEnvs());

describe("1. flow derivation", () => {
  const defs = ALL_DEFINITIONS;
  const flowDays = (store: MemoryKpiStore, days: string[]) =>
    days.forEach((d) => put(store, "register.registers_marked", "register", "daily", d, 10));
  const derive = (store: MemoryKpiStore, start: string, grain: "weekly" | "monthly", now = NOW) =>
    deriveGrain(defs, allValues(store), periodFor(grain, start), { now, runId: "t" }).find(
      (v) => v.kpiId === "register.registers_marked"
    );

  it("sums seven daily values into the week", () => {
    const store = new MemoryKpiStore();
    flowDays(store, eachDay("2026-09-07", "2026-09-13"));
    const v = derive(store, "2026-09-07", "weekly")!;
    expect(v.value).toBe(70);
    expect(v.grain).toBe("weekly");
    expect(v.periodStart).toBe("2026-09-07");
    expect(v.periodEnd).toBe("2026-09-13");
    expect(v.numerator).toBeNull();
    expect(v.complete).toBe(true);
  });

  it("sums a month that spans several weeks", () => {
    const store = new MemoryKpiStore();
    eachDay("2026-09-01", "2026-09-30").forEach((d, i) => put(store, "register.registers_marked", "register", "daily", d, i + 1));
    const v = derive(store, "2026-09-01", "monthly")!;
    expect(v.value).toBe(465);
    expect(v.periodEnd).toBe("2026-09-30");
    expect(v.complete).toBe(true);
  });

  it("is incomplete when a day is missing or the period has not ended", () => {
    const missing = new MemoryKpiStore();
    flowDays(missing, eachDay("2026-09-07", "2026-09-13").filter((d) => d !== "2026-09-10"));
    const m = derive(missing, "2026-09-07", "weekly")!;
    expect(m.value).toBe(60);
    expect(m.complete).toBe(false);

    const running = new MemoryKpiStore();
    flowDays(running, eachDay("2026-09-07", "2026-09-10"));
    const midWeek = Date.UTC(2026, 8, 10, 12, 0, 0);
    expect(derive(running, "2026-09-07", "weekly", midWeek)!.complete).toBe(false);
  });

  it("produces nothing for a series with no daily value in the period", () => {
    const store = new MemoryKpiStore();
    flowDays(store, ["2026-09-01"]);
    expect(derive(store, "2026-09-07", "weekly")).toBeUndefined();
  });
});

describe("2. ratio derivation", () => {
  it("recomputes from summed numerator/denominator, not an average of daily percentages", () => {
    const store = new MemoryKpiStore();
    put(store, "register.register_marking_rate", "register", "daily", "2026-09-07", 50, { n: 1, d: 2 });
    put(store, "register.register_marking_rate", "register", "daily", "2026-09-08", 75, { n: 3, d: 4 });
    put(store, "register.register_marking_rate", "register", "daily", "2026-09-09", 99); // no parts: skipped
    const v = deriveGrain(ALL_DEFINITIONS, allValues(store), periodFor("weekly", W), { now: NOW, runId: "t" }).find(
      (x) => x.kpiId === "register.register_marking_rate"
    )!;
    expect(v.numerator).toBe(4);
    expect(v.denominator).toBe(6);
    expect(v.value).toBe(66.67); // not (50 + 75) / 2
    expect(v.complete).toBe(false);
  });

  it("rounds percent to 2 decimals and other ratio units to an integer; 0 for a zero denominator", () => {
    expect(ratioValue("percent", 1, 3)).toBe(33.33);
    expect(ratioValue("KES_CENTS", 10, 3)).toBe(3);
    expect(ratioValue("KES_CENTS", 5, 2)).toBe(3);
    expect(ratioValue("percent", 5, 0)).toBe(0);
    expect(ratioValue("KES_CENTS", 5, 0)).toBe(0);
  });
});

describe("3. stock derivation", () => {
  const weekly = (store: MemoryKpiStore) =>
    deriveGrain(ALL_DEFINITIONS, allValues(store), periodFor("weekly", W), { now: NOW, runId: "t" }).find(
      (v) => v.kpiId === "register.schools_total"
    )!;

  it("takes the last snapshot in the period; complete only with a snapshot on period.end", () => {
    const store = new MemoryKpiStore();
    put(store, "register.schools_total", "register", "daily", "2026-09-08", 5, { complete: false });
    put(store, "register.schools_total", "register", "daily", "2026-09-10", 7, { complete: false });
    let v = weekly(store);
    expect(v.value).toBe(7);
    expect(v.complete).toBe(false);
    put(store, "register.schools_total", "register", "daily", "2026-09-13", 9, { complete: false });
    v = weekly(store);
    expect(v.value).toBe(9);
    expect(v.complete).toBe(true);
  });
});

describe("4. collector-owned grains and diagnostics", () => {
  it("never overwrites weekly/monthly values the collector writes; never derives diagnostics", async () => {
    const store = new MemoryKpiStore();
    const owned: Array<[string, PlatformId]> = [
      ["pms.managers_active", "pms"],
      ["register.schools_marking", "register"],
      ["chama.chamas_active", "chama"],
      ["cyber.wa_users_active", "cyber"],
    ];
    for (const [id, platform] of owned) {
      put(store, id, platform, "daily", D, 1);
      for (const [grain, start] of [["weekly", W], ["monthly", M]] as const) {
        const v = put(store, id, platform, grain, start, 99);
        store.values.set(v.id, { ...v, runId: "collector" });
      }
    }
    put(store, "pay.stats_counter", "all", "daily", D, 5, { dims: { db: "default", counter: "reports" }, complete: false });
    put(store, "company.data_freshness_hours", "all", "daily", D, 4, { dims: { collector: "pay" }, complete: false });

    const result = await runRollups(deps(store), [D]);
    expect(result.ok).toBe(true);
    for (const [id, platform] of owned) {
      for (const [grain, start] of [["weekly", W], ["monthly", M]] as const) {
        const v = row(store, id, platform, grain, start)!;
        expect(v.value).toBe(99);
        expect(v.runId).toBe("collector");
      }
    }
    const derivedIds = new Set(allValues(store).filter((v) => v.grain !== "daily").map((v) => v.kpiId));
    for (const id of ["pay.stats_counter", "company.data_freshness_hours", "company.data_freshness_max_hours", "company.collectors_stale"]) {
      expect(derivedIds.has(id)).toBe(false);
    }
  });
});

describe("5. dimensioned and company series", () => {
  it("derives per series, including platform=all company series", async () => {
    const store = new MemoryKpiStore();
    for (const [day, v] of [[D, 100], ["2026-09-09", 50]] as const) {
      put(store, "pay.net_revenue", "pms", "daily", day, v);
      put(store, "pay.net_revenue", "pms", "daily", day, v, { dims: { stream: "commission" } });
      put(store, "pay.net_revenue", "pms", "daily", day, v, { dims: { chargeType: "pms_rent" } });
      put(store, "pay.net_revenue", "chama", "daily", day, v * 2);
      put(store, "company.net_revenue", "all", "daily", day, v * 3, { dims: { stream: "commission" } });
    }
    const result = await runRollups(deps(store), [D, "2026-09-09"]);
    expect(result.periods).toEqual({ weekly: [W], monthly: [M] });
    for (const [grain, start] of [["weekly", W], ["monthly", M]] as const) {
      expect(row(store, "pay.net_revenue", "pms", grain, start)!.value).toBe(150);
      expect(row(store, "pay.net_revenue", "pms", grain, start, { stream: "commission" })!.value).toBe(150);
      expect(row(store, "pay.net_revenue", "pms", grain, start, { chargeType: "pms_rent" })!.value).toBe(150);
      expect(row(store, "pay.net_revenue", "chama", grain, start)!.value).toBe(300);
      const company = row(store, "company.net_revenue", "all", grain, start, { stream: "commission" })!;
      expect(company.value).toBe(450);
      expect(company.platform).toBe("all");
      expect(company.complete).toBe(false);
    }
  });
});

describe("6. cross KPIs", () => {
  const run = async (store: MemoryKpiStore) => {
    const r = await runRollups(deps(store), [D]);
    expect(r.errors).toEqual([]);
    return r;
  };
  const daily = (s: MemoryKpiStore, id: string, dims: Record<string, string> = {}) => row(s, id, "all", "daily", D, dims);
  const weekly = (s: MemoryKpiStore, id: string, dims: Record<string, string> = {}) => row(s, id, "all", "weekly", W, dims);
  const monthly = (s: MemoryKpiStore, id: string, dims: Record<string, string> = {}) => row(s, id, "all", "monthly", M, dims);

  it("emits nothing when every input is absent", async () => {
    const store = new MemoryKpiStore();
    await run(store);
    expect(store.values.size).toBe(0);
  });

  it("emits no cross KPI when only company.net_revenue exists", async () => {
    const store = new MemoryKpiStore();
    put(store, "company.net_revenue", "all", "daily", D, 1000);
    await run(store);
    const ids = new Set(CROSS_DEFINITIONS.map((d) => d.id));
    expect(allValues(store).filter((v) => ids.has(v.kpiId))).toEqual([]);
  });

  it("company.active_accounts: per platform plus total, same grain", async () => {
    const store = new MemoryKpiStore();
    seedAll(store);
    await run(store);
    expect(daily(store, "company.active_accounts")!.value).toBe(26);
    expect(daily(store, "company.active_accounts", { platform: "register" })!.value).toBe(10);
    expect(daily(store, "company.active_accounts", { platform: "cyber" })!.value).toBe(4);
    expect(weekly(store, "company.active_accounts")!.value).toBe(26);
    expect(monthly(store, "company.active_accounts")!.value).toBe(52);
    expect(monthly(store, "company.active_accounts", { platform: "pms" })!.value).toBe(14);
    expect(daily(store, "company.active_accounts")!.platform).toBe("all");
  });

  it("company.new_accounts: three platforms plus total; derived weekly sum is incomplete after one day", async () => {
    const store = new MemoryKpiStore();
    seedAll(store);
    await run(store);
    expect(daily(store, "company.new_accounts")!.value).toBe(9);
    expect(daily(store, "company.new_accounts")!.complete).toBe(true);
    expect(daily(store, "company.new_accounts", { platform: "chama" })!.value).toBe(3);
    expect(daily(store, "company.new_accounts", { platform: "cyber" })).toBeUndefined();
    expect(weekly(store, "company.new_accounts")!.value).toBe(9);
    expect(weekly(store, "company.new_accounts")!.complete).toBe(false);
  });

  it("company.net_revenue_per_active_account: weekly and monthly only, round(net / accounts)", async () => {
    const store = new MemoryKpiStore();
    seedAll(store);
    await run(store);
    expect(daily(store, "company.net_revenue_per_active_account")).toBeUndefined();
    const w = weekly(store, "company.net_revenue_per_active_account")!;
    expect(w).toMatchObject({ value: 3846, numerator: 100000, denominator: 26 });
    const m = monthly(store, "company.net_revenue_per_active_account")!;
    expect(m).toMatchObject({ value: 1923, numerator: 100000, denominator: 52 });
    expect(DEFINITIONS_BY_ID.get("company.net_revenue_per_active_account")!.unit).toBe("KES_CENTS");
  });

  it("company.net_revenue_per_active_account is absent without active accounts or a zero denominator", async () => {
    const noAccounts = new MemoryKpiStore();
    put(noAccounts, "company.net_revenue", "all", "daily", D, 1000);
    await run(noAccounts);
    expect(weekly(noAccounts, "company.net_revenue_per_active_account")).toBeUndefined();

    const zero = new MemoryKpiStore();
    put(zero, "company.net_revenue", "all", "daily", D, 1000);
    put(zero, "register.schools_marking", "register", "weekly", W, 0);
    await run(zero);
    expect(weekly(zero, "company.active_accounts")!.value).toBe(0);
    expect(weekly(zero, "company.net_revenue_per_active_account")).toBeUndefined();
  });

  it("company.unverified_revenue_share, cross.revenue_share, cross.stream_share", async () => {
    const store = new MemoryKpiStore();
    seedAll(store);
    await run(store);
    expect(daily(store, "company.unverified_revenue_share")).toMatchObject({ value: 25, numerator: 25000, denominator: 100000 });
    expect(weekly(store, "company.unverified_revenue_share")!.value).toBe(25);
    expect(daily(store, "cross.revenue_share", { platform: "pms" })).toMatchObject({ value: 60, numerator: 60000, denominator: 100000 });
    expect(daily(store, "cross.revenue_share", { platform: "register" })!.value).toBe(10);
    expect(daily(store, "cross.revenue_share", { platform: "chama" })!.value).toBe(20);
    expect(daily(store, "cross.revenue_share", { platform: "cyber" })!.value).toBe(10);
    expect(monthly(store, "cross.revenue_share", { platform: "pms" })!.value).toBe(60);
    expect(daily(store, "cross.stream_share", { stream: "subscription" })).toMatchObject({ value: 40, numerator: 40000, denominator: 100000 });
    expect(daily(store, "cross.stream_share", { stream: "commission" })!.value).toBe(30);
    expect(daily(store, "cross.stream_share", { stream: "reports" })).toBeUndefined();
    expect(weekly(store, "cross.stream_share", { stream: "sms" })!.value).toBe(30);
  });

  it("company.unverified_revenue_share is 0 when net revenue is 0, and absent without the unverified input", async () => {
    const zero = new MemoryKpiStore();
    put(zero, "company.net_revenue", "all", "daily", D, 0);
    put(zero, "company.net_revenue_unverified", "all", "daily", D, 0);
    await run(zero);
    expect(daily(zero, "company.unverified_revenue_share")).toMatchObject({ value: 0, numerator: 0, denominator: 0 });

    const absent = new MemoryKpiStore();
    put(absent, "company.net_revenue", "all", "daily", D, 1000);
    await run(absent);
    expect(daily(absent, "company.unverified_revenue_share")).toBeUndefined();
  });

  it("cross.subscription_revenue, cross.sms_units_used, cross.sms_prepaid_outstanding", async () => {
    const store = new MemoryKpiStore();
    seedAll(store);
    await run(store);
    expect(daily(store, "cross.subscription_revenue")).toMatchObject({ value: 40000, numerator: null, denominator: null, dimensions: {} });
    expect(weekly(store, "cross.subscription_revenue")!.value).toBe(40000);
    expect(daily(store, "cross.sms_units_used")!.value).toBe(800);
    expect(daily(store, "cross.sms_units_used", { platform: "register" })!.value).toBe(500);
    expect(daily(store, "cross.sms_units_used", { platform: "chama" })!.value).toBe(300);
    expect(daily(store, "cross.sms_units_used", { platform: "pms" })).toBeUndefined();
    expect(monthly(store, "cross.sms_units_used")!.value).toBe(800);
    expect(daily(store, "cross.sms_prepaid_outstanding")!.value).toBe(6000);
    expect(daily(store, "cross.sms_prepaid_outstanding", { platform: "pms" })!.value).toBe(3000);
    expect(daily(store, "cross.sms_prepaid_outstanding")!.complete).toBe(false); // daily snapshot
    expect(weekly(store, "cross.sms_prepaid_outstanding")!.value).toBe(6000); // last snapshot of the week
    expect(weekly(store, "cross.sms_prepaid_outstanding")!.complete).toBe(false); // no snapshot on Sunday
  });

  it("cross.digital_rent_share needs rent collected > 0 and the pms_rent GMV series", async () => {
    const store = new MemoryKpiStore();
    seedAll(store);
    await run(store);
    expect(daily(store, "cross.digital_rent_share")).toMatchObject({ value: 75, numerator: 90000, denominator: 120000 });
    expect(weekly(store, "cross.digital_rent_share")!.value).toBe(75);

    const zeroRent = new MemoryKpiStore();
    put(zeroRent, "pms.rent_collected", "pms", "daily", D, 0);
    put(zeroRent, "pay.gmv", "pms", "daily", D, 500, { dims: { chargeType: "pms_rent" } });
    await run(zeroRent);
    expect(daily(zeroRent, "cross.digital_rent_share")).toBeUndefined();

    const noGmv = new MemoryKpiStore();
    put(noGmv, "pms.rent_collected", "pms", "daily", D, 1000);
    await run(noGmv);
    expect(daily(noGmv, "cross.digital_rent_share")).toBeUndefined();
  });

  it("cross.sms_cost_estimate and cross.sms_margin only when KPI_SMS_COST_CENTS > 0", async () => {
    const off = new MemoryKpiStore();
    seedAll(off);
    await run(off);
    expect(daily(off, "cross.sms_cost_estimate")).toBeUndefined();
    expect(daily(off, "cross.sms_margin")).toBeUndefined();

    vi.stubEnv("KPI_SMS_COST_CENTS", "0");
    const zero = new MemoryKpiStore();
    seedAll(zero);
    await run(zero);
    expect(daily(zero, "cross.sms_cost_estimate")).toBeUndefined();

    vi.stubEnv("KPI_SMS_COST_CENTS", "2");
    const on = new MemoryKpiStore();
    seedAll(on);
    await run(on);
    expect(daily(on, "cross.sms_cost_estimate")!.value).toBe(1600); // 800 units x 2
    expect(daily(on, "cross.sms_margin")!.value).toBe(18400); // 8000 + 12000 - 1600
    expect(weekly(on, "cross.sms_cost_estimate")!.value).toBe(1600);
    expect(monthly(on, "cross.sms_margin")!.value).toBe(18400);

    vi.stubEnv("KPI_SMS_COST_CENTS", "1.5");
    const frac = new MemoryKpiStore();
    seedAll(frac);
    await run(frac);
    expect(daily(frac, "cross.sms_cost_estimate")!.value).toBe(1200);
  });

  it("cross.sms_margin is absent without SMS usage or without SMS revenue", async () => {
    vi.stubEnv("KPI_SMS_COST_CENTS", "2");
    const noUsage = new MemoryKpiStore();
    put(noUsage, "pay.net_revenue", "register", "daily", D, 8000, { dims: { stream: "sms" } });
    await run(noUsage);
    expect(daily(noUsage, "cross.sms_cost_estimate")).toBeUndefined();
    expect(daily(noUsage, "cross.sms_margin")).toBeUndefined();

    const noRevenue = new MemoryKpiStore();
    put(noRevenue, "register.sms_tokens_used", "register", "daily", D, 500);
    await run(noRevenue);
    expect(daily(noRevenue, "cross.sms_cost_estimate")!.value).toBe(1000);
    expect(daily(noRevenue, "cross.sms_margin")).toBeUndefined();
  });

  it("smsCostCentsPerUnit reads the env at call time and ignores invalid values", () => {
    expect(smsCostCentsPerUnit()).toBe(0);
    vi.stubEnv("KPI_SMS_COST_CENTS", "abc");
    expect(smsCostCentsPerUnit()).toBe(0);
    vi.stubEnv("KPI_SMS_COST_CENTS", "-3");
    expect(smsCostCentsPerUnit()).toBe(0);
    vi.stubEnv("KPI_SMS_COST_CENTS", "4");
    expect(smsCostCentsPerUnit()).toBe(4);
  });

  it("company.data_freshness_max_hours and company.collectors_stale (daily only)", async () => {
    const store = new MemoryKpiStore();
    seedAll(store);
    await run(store);
    expect(daily(store, "company.data_freshness_max_hours")).toMatchObject({ value: 30, complete: false });
    expect(daily(store, "company.collectors_stale")).toMatchObject({ value: 2, complete: false }); // 30 and 27 > 26
    expect(weekly(store, "company.data_freshness_max_hours")).toBeUndefined();
    expect(monthly(store, "company.collectors_stale")).toBeUndefined();
  });

  it("freshness KPIs are also written for today, where the freshness values live", async () => {
    const store = new MemoryKpiStore();
    put(store, "company.data_freshness_hours", "all", "daily", "2026-10-01", 5, { dims: { collector: "pay" }, complete: false });
    put(store, "company.data_freshness_hours", "all", "daily", "2026-10-01", 40, { dims: { collector: "rollups" }, complete: false });
    await run(store);
    expect(row(store, "company.data_freshness_max_hours", "all", "daily", "2026-10-01")!.value).toBe(40);
    expect(row(store, "company.collectors_stale", "all", "daily", "2026-10-01")!.value).toBe(1);
    expect(daily(store, "company.data_freshness_max_hours")).toBeUndefined(); // no values for D
  });
});

describe("7. company.active_accounts with a missing component", () => {
  it("sums the components that exist (Cyber absent)", async () => {
    const store = new MemoryKpiStore();
    seedAll(store, { cyber: false });
    await runRollups(deps(store), [D]);
    for (const [grain, start, total] of [["daily", D, 22], ["weekly", W, 22], ["monthly", M, 44]] as const) {
      expect(row(store, "company.active_accounts", "all", grain, start)!.value).toBe(total);
      expect(row(store, "company.active_accounts", "all", grain, start, { platform: "cyber" })).toBeUndefined();
      expect(row(store, "company.active_accounts", "all", grain, start, { platform: "pms" })).toBeDefined();
    }
  });
});

describe("8. idempotency", () => {
  const snapshot = (store: MemoryKpiStore) =>
    new Map(
      allValues(store).map((v) => [
        v.id,
        JSON.stringify([v.value, v.numerator, v.denominator, v.complete, v.grain, v.periodStart, v.periodEnd, v.dimensions]),
      ])
    );

  it("a second run yields the same store; a corrected daily input changes weekly and monthly values", async () => {
    const store = new MemoryKpiStore();
    seedAll(store);
    await runRollups(deps(store), [D]);
    const first = snapshot(store);
    const sizeAfterFirst = store.values.size;
    await runRollups(deps(store), [D]);
    expect(store.values.size).toBe(sizeAfterFirst);
    expect(snapshot(store)).toEqual(first);

    expect(row(store, "company.net_revenue", "all", "weekly", W)!.value).toBe(100000);
    put(store, "company.net_revenue", "all", "daily", D, 150000); // late correction
    await runRollups(deps(store), [D]);
    expect(store.values.size).toBe(sizeAfterFirst);
    expect(row(store, "company.net_revenue", "all", "weekly", W)!.value).toBe(150000);
    expect(row(store, "company.net_revenue", "all", "monthly", M)!.value).toBe(150000);
    expect(row(store, "cross.revenue_share", "all", "daily", D, { platform: "pms" })!.value).toBe(40);
    expect(row(store, "company.unverified_revenue_share", "all", "daily", D)!.value).toBe(16.67);
    expect(row(store, "company.net_revenue_per_active_account", "all", "weekly", W)!.value).toBe(5769);
  });

  it("logs a successful run and syncs the definitions", async () => {
    const store = new MemoryKpiStore();
    seedAll(store);
    const result = await runRollups(deps(store), [D]);
    expect(result.ok).toBe(true);
    expect(store.runs).toHaveLength(1);
    expect(store.runs[0]).toMatchObject({
      collector: "rollups",
      status: "success",
      periodStart: D,
      periodEnd: D,
      error: null,
      rowsWritten: result.rowsWritten,
    });
    expect(result.rowsWritten).toBeGreaterThan(0);
    expect(store.definitions.has("cross.revenue_share")).toBe(true);
  });

  it("covers every weekly and monthly period that overlaps the days", async () => {
    const store = new MemoryKpiStore();
    const result = await runRollups(deps(store), ["2026-08-31", "2026-09-01", "2026-09-01"]);
    expect(result.periods).toEqual({ weekly: ["2026-08-31"], monthly: ["2026-08-01", "2026-09-01"] });
    expect(result.ok).toBe(true);
  });
});

describe("9. failures are recorded, never thrown", () => {
  it("a failing readValues is logged to kpi_runs and returned in errors", async () => {
    class FailingStore extends MemoryKpiStore {
      async readValues(): Promise<KpiValue[]> {
        throw new Error("firestore unavailable");
      }
    }
    const store = new FailingStore();
    const result = await runRollups(deps(store), [D]);
    expect(result.ok).toBe(false);
    expect(result.rowsWritten).toBe(0);
    expect(result.errors.join(" ")).toContain("firestore unavailable");
    expect(store.runs).toHaveLength(1);
    expect(store.runs[0]).toMatchObject({ collector: "rollups", status: "error", rowsWritten: 0 });
    expect(store.runs[0].error).toContain("firestore unavailable");
    expect(store.values.size).toBe(0);
  });

  it("a failing writeRun is reported without throwing", async () => {
    class NoRunsStore extends MemoryKpiStore {
      async writeRun(): Promise<void> {
        throw new Error("runs unavailable");
      }
    }
    const result = await runRollups(deps(new NoRunsStore()), [D]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("runs unavailable");
  });
});

describe("10. registry", () => {
  const contract: Record<string, { scope: string; platform: string; type: string; unit: string; grains: string[]; dimensions: string[] }> = {
    "company.active_accounts": { scope: "company", platform: "all", type: "flow", unit: "count", grains: ["daily", "weekly", "monthly"], dimensions: ["platform"] },
    "company.new_accounts": { scope: "company", platform: "all", type: "flow", unit: "count", grains: ["daily", "weekly", "monthly"], dimensions: ["platform"] },
    "company.net_revenue_per_active_account": { scope: "company", platform: "all", type: "ratio", unit: "KES_CENTS", grains: ["weekly", "monthly"], dimensions: [] },
    "company.unverified_revenue_share": { scope: "company", platform: "all", type: "ratio", unit: "percent", grains: ["daily", "weekly", "monthly"], dimensions: [] },
    "cross.revenue_share": { scope: "cross", platform: "all", type: "ratio", unit: "percent", grains: ["daily", "weekly", "monthly"], dimensions: ["platform"] },
    "cross.stream_share": { scope: "cross", platform: "all", type: "ratio", unit: "percent", grains: ["daily", "weekly", "monthly"], dimensions: ["stream"] },
    "cross.subscription_revenue": { scope: "cross", platform: "all", type: "flow", unit: "KES_CENTS", grains: ["daily", "weekly", "monthly"], dimensions: [] },
    "cross.sms_units_used": { scope: "cross", platform: "all", type: "flow", unit: "count", grains: ["daily", "weekly", "monthly"], dimensions: ["platform"] },
    "cross.sms_prepaid_outstanding": { scope: "cross", platform: "all", type: "stock", unit: "count", grains: ["daily", "weekly", "monthly"], dimensions: ["platform"] },
    "cross.sms_cost_estimate": { scope: "cross", platform: "all", type: "flow", unit: "KES_CENTS", grains: ["daily", "weekly", "monthly"], dimensions: [] },
    "cross.sms_margin": { scope: "cross", platform: "all", type: "flow", unit: "KES_CENTS", grains: ["daily", "weekly", "monthly"], dimensions: [] },
    "cross.digital_rent_share": { scope: "cross", platform: "all", type: "ratio", unit: "percent", grains: ["daily", "weekly", "monthly"], dimensions: [] },
    "company.data_freshness_max_hours": { scope: "company", platform: "all", type: "stock", unit: "hours", grains: ["daily"], dimensions: [] },
    "company.collectors_stale": { scope: "company", platform: "all", type: "stock", unit: "count", grains: ["daily"], dimensions: [] },
  };

  it("validates with the cross definitions added", () => {
    expect(() => validateDefinitions(ALL_DEFINITIONS)).not.toThrow();
    expect(ALL_DEFINITIONS).toEqual(expect.arrayContaining(CROSS_DEFINITIONS));
  });

  it("defines exactly the section 5 ids with the contracted shape", () => {
    expect(CROSS_DEFINITIONS.map((d) => d.id).sort()).toEqual(Object.keys(contract).sort());
    for (const [id, expected] of Object.entries(contract)) {
      const d = DEFINITIONS_BY_ID.get(id)!;
      expect(d, id).toBeDefined();
      expect({ scope: d.scope, platform: d.platform, type: d.type, unit: d.unit, grains: d.grains, dimensions: d.dimensions }, id).toEqual(expected);
      expect(d.owner).toBe("Sam");
      expect(d.status).toBe("active");
    }
  });
});

describe("11. integration with the real PAY collector and company rollup", () => {
  const ts = (ms: number) => ({ toMillis: () => ms });
  const seed = () =>
    new MemoryPayReader()
      .add("register", "sms-topup-transactions/R1", { status: "success", amountKes: 500, grossAmount: 500, paystackFees: 12.5, amountReceived: 487.5, schoolId: "s1", createdAt: ts(T_DAY) })
      .add("default", "transactions/INV_1", { status: "success", userId: "u1", createdAt: ts(T_DAY), paystackResponse: { amount: 100000, fees: 1500, fees_split: { integration: 1500 } } })
      .add("default", "subscriptions/SUB_1", { status: "success", agentId: null, userId: "u1", initiatedAt: ts(T_DAY), paystackResponse: { amount: 200000, fees: 4000 } })
      .add("chama", "chamas/c1/paymentIntents/MCW-c1-1", { status: "success", amount: 1000, grossAmount: 1010, paystackFee: 6.5, ourFee: 3.5, createdAt: T_DAY })
      .add("chama", "chamas/c1/planBilling/MCP-1", { status: "success", amountKes: 999, createdAt: T_DAY })
      .add("default", "cyber-transactions/CYBER_1", { status: "success", uid: "a1", createdAt: ts(T_DAY), paystackResponse: { amount: 104000, fees: 4000 } });

  it("cross KPIs reconcile to what the collectors and company rollup stored", async () => {
    const store = new MemoryKpiStore();
    const collected = await runDays({ store, collectors: [createPayCollector(seed())], now: () => PIPE_NOW }, [DAY]);
    expect(collected.ok).toBe(true);
    const net = row(store, "company.net_revenue", "all", "daily", DAY)!;
    expect(net.value).toBeGreaterThan(0);

    const r = await runRollups({ store, now: () => PIPE_NOW }, [DAY]);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);

    // Platform shares add up to 100 (within rounding) and each is net / company net.
    let platformSum = 0;
    for (const platform of ["pms", "register", "chama", "cyber"]) {
      const v = row(store, "cross.revenue_share", "all", "daily", DAY, { platform })!;
      expect(v.denominator).toBe(net.value);
      expect(v.numerator).toBe(row(store, "pay.net_revenue", platform as PlatformId, "daily", DAY)!.value);
      platformSum += v.value;
    }
    expect(Math.round(platformSum)).toBe(100);

    // Stream shares add up to 100 too.
    const streams = allValues(store).filter((v) => v.kpiId === "cross.stream_share" && v.grain === "daily");
    expect(streams.length).toBeGreaterThan(0);
    expect(Math.round(streams.reduce((t, v) => t + v.value, 0))).toBe(100);

    // Subscription revenue equals the company subscription stream; unverified share is bounded.
    expect(row(store, "cross.subscription_revenue", "all", "daily", DAY)!.value).toBe(
      row(store, "company.net_revenue", "all", "daily", DAY, { stream: "subscription" })!.value
    );
    const unv = row(store, "company.unverified_revenue_share", "all", "daily", DAY)!;
    expect(unv.value).toBeGreaterThanOrEqual(0);
    expect(unv.value).toBeLessThanOrEqual(100);
    expect(unv.denominator).toBe(net.value);

    // Weekly derivation of the real company series: one seeded day -> week equals that day, but incomplete.
    const wk = row(store, "company.net_revenue", "all", "weekly", periodFor("weekly", DAY).start)!;
    expect(wk.value).toBe(net.value);
    expect(wk.complete).toBe(false);
    // Real PAY success rate is a percent ratio: derived weekly value recomputes from parts.
    const rate = row(store, "pay.success_rate", "register", "weekly", periodFor("weekly", DAY).start)!;
    expect(rate.numerator).not.toBeNull();
    expect(rate.value).toBe(Math.round(((rate.numerator as number) / (rate.denominator as number)) * 10000) / 100);

    // Re-running changes nothing.
    const size = store.values.size;
    await runRollups({ store, now: () => PIPE_NOW }, [DAY]);
    expect(store.values.size).toBe(size);
  });
});
