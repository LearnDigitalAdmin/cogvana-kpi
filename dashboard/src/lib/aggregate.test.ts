import { describe, expect, it } from "vitest";
import { breakdownRow, computeDelta, computeHeadline, dimensionOptions, groupByDim, latestPerDim, stackRows, summarise, toSeries, toneFor, totalSeries } from "./aggregate";
import { fillPeriods } from "./aggregate";
import { freshnessLevel, freshnessRows } from "./freshness";
import type { KpiDefinition, KpiValue } from "./types";

const def = (o: Partial<KpiDefinition>): KpiDefinition => ({
  id: "x.y", name: "X", description: "", scope: "platform", platform: "all", type: "flow", unit: "count", grain: "daily", grains: ["daily"],
  formula: "", direction: "higher_is_better", dimensions: [], thresholds: {}, owner: "", decision: "", version: 1, status: "active", ...o,
});
let n = 0;
const val = (o: Partial<KpiValue>): KpiValue => ({
  id: `v${n++}`, kpiId: "x.y", platform: "all", grain: "daily", periodStart: "2026-09-29", periodEnd: "2026-09-29", value: 1,
  numerator: null, denominator: null, dimensions: {}, customerKey: null, definitionVersion: 1, complete: true, computedAt: 1, runId: "r", ...o,
});

describe("headline by type", () => {
  it("flow with only daily grain: sum", () => {
    const pts = toSeries([val({ periodStart: "2026-09-28", value: 10 }), val({ periodStart: "2026-09-29", value: 5 })]);
    expect(computeHeadline(def({}), pts, "2026-09-28")).toMatchObject({ kind: "sum", value: 15, partial: false });
  });
  it("distinct-count flow: latest period, never summed", () => {
    const d = def({ grains: ["daily", "weekly", "monthly"] });
    const pts = toSeries([val({ periodStart: "2026-09-21", value: 38, grain: "weekly" }), val({ periodStart: "2026-09-28", value: 41, complete: false, grain: "weekly" })]);
    expect(computeHeadline(d, pts, "2026-09-01")).toMatchObject({ kind: "latest", value: 41, period: "2026-09-28", partial: true });
  });
  it("stock: latest with as-of and history note", () => {
    const d = def({ type: "stock" });
    const pts = toSeries([val({ periodStart: "2026-09-30", periodEnd: "2026-09-30", value: 12 }), val({ periodStart: "2026-10-01", periodEnd: "2026-10-01", value: 14 })]);
    expect(computeHeadline(d, pts, "2026-09-25")).toMatchObject({ kind: "stock", value: 14, asOf: "2026-10-01", historyStart: "2026-09-30" });
    expect(computeHeadline(d, pts, "2026-09-30").historyStart).toBeUndefined();
  });
});

describe("ratios", () => {
  const d = def({ type: "ratio", unit: "percent", id: "pay.success_rate" });
  it("recomputes from summed numerator/denominator, never averages", () => {
    const pts = toSeries([
      val({ periodStart: "2026-09-28", value: 100, numerator: 1, denominator: 1 }),
      val({ periodStart: "2026-09-29", value: 50, numerator: 5, denominator: 10 }),
    ]);
    expect(computeHeadline(d, pts, "2026-09-28").value).toBe(54.5); // 6/11, not (100+50)/2
  });
  it("zero denominator sum is absent", () => {
    const pts = toSeries([val({ value: 0, numerator: 0, denominator: 0 })]);
    expect(computeHeadline(d, pts, "2026-09-29").value).toBeNull();
  });
  it("money ratio is rounded cents", () => {
    const m = def({ type: "ratio", unit: "KES_CENTS" });
    expect(computeHeadline(m, toSeries([val({ numerator: 10000, denominator: 3, value: 3333 })]), "2026-09-29").value).toBe(3333);
  });
  it("snapshot ratios use the latest value", () => {
    const s = def({ type: "ratio", unit: "percent", id: "pms.occupancy_rate" });
    const pts = toSeries([val({ periodStart: "2026-09-28", value: 80, numerator: 8, denominator: 10 }), val({ periodStart: "2026-09-29", value: 90, numerator: 9, denominator: 10 })]);
    expect(computeHeadline(s, pts, "2026-09-28")).toMatchObject({ kind: "stock", value: 90 });
  });
});

describe("absent is not zero", () => {
  it("no values → null headline, no delta", () => {
    const s = summarise(def({}), [], [], "2026-09-23", "2026-09-16");
    expect(s.headline.value).toBeNull();
    expect(s.delta).toBeNull();
  });
  it("a real zero stays zero", () => {
    expect(computeHeadline(def({}), toSeries([val({ value: 0 })]), "2026-09-29").value).toBe(0);
  });
  it("gaps stay null in the period grid", () => {
    const rows = fillPeriods("daily", "2026-09-28", "2026-09-30", toSeries([val({ periodStart: "2026-09-28", value: 3 }), val({ periodStart: "2026-09-30", value: 4 })]));
    expect(rows.map((r) => r.point?.value ?? null)).toEqual([3, null, 4]);
  });
});

describe("delta", () => {
  const h = (value: number | null) => ({ kind: "sum" as const, value, partial: false });
  it("colours by direction", () => {
    expect(toneFor("up", "higher_is_better")).toBe("good");
    expect(toneFor("down", "higher_is_better")).toBe("bad");
    expect(toneFor("up", "lower_is_better")).toBe("bad");
    expect(toneFor("down", "lower_is_better")).toBe("good");
    expect(toneFor("up", "neutral")).toBe("neutral");
    expect(toneFor("flat", "lower_is_better")).toBe("neutral");
  });
  it("percentage change; hidden for absent or zero previous", () => {
    expect(computeDelta(h(110), h(100), "higher_is_better")).toMatchObject({ pct: 10, dir: "up", tone: "good" });
    expect(computeDelta(h(90), h(100), "lower_is_better")).toMatchObject({ dir: "down", tone: "good" });
    expect(computeDelta(h(5), h(0), "higher_is_better")).toBeNull();
    expect(computeDelta(h(5), h(null), "higher_is_better")).toBeNull();
    expect(computeDelta(h(null), h(5), "higher_is_better")).toBeNull();
  });
});

describe("partial periods", () => {
  it("flags partial on the current side and excludes incomplete periods from the previous side", () => {
    const cur = [val({ periodStart: "2026-09-29", value: 10 }), val({ periodStart: "2026-09-30", value: 4, complete: false })];
    const prev = [val({ periodStart: "2026-09-22", value: 10 }), val({ periodStart: "2026-09-23", value: 999, complete: false })];
    const s = summarise(def({}), cur, prev, "2026-09-29", "2026-09-22");
    expect(s.headline).toMatchObject({ value: 14, partial: true });
    expect(s.prevHeadline.value).toBe(10);
    expect(s.delta?.pct).toBe(40);
  });
});

describe("dimensions", () => {
  const vs = [
    val({ value: 100 }),
    val({ value: 60, dimensions: { stream: "sms" } }),
    val({ value: 40, dimensions: { stream: "commission" } }),
    val({ value: 7, dimensions: { stream: "sms", chargeType: "x" } }),
  ];
  it("total is the un-dimensioned value only", () => {
    expect(totalSeries(vs, "x.y").map((p) => p.value)).toEqual([100]);
  });
  it("groups breakdowns by a single dimension key", () => {
    const g = groupByDim(vs, "stream");
    expect([...g.keys()].sort()).toEqual(["commission", "sms"]);
    expect(g.get("sms")![0].value).toBe(60);
  });
  it("lists dimension options", () => {
    expect(dimensionOptions(vs)).toEqual([{ key: "stream", value: "commission" }, { key: "stream", value: "sms" }]);
  });
  it("stack rows keep absent series as null and flag partial rows", () => {
    const g = new Map([
      ["sms", toSeries([val({ periodStart: "2026-09-29", value: 5 }), val({ periodStart: "2026-09-30", value: 6, complete: false })])],
      ["markup", toSeries([val({ periodStart: "2026-09-29", value: 2 })])],
    ]);
    const rows = stackRows("daily", "2026-09-29", "2026-09-30", g);
    expect(rows[1]).toMatchObject({ partial: true, values: { sms: 6, markup: null } });
  });
  it("latest per dimension merges unknown values via normaliser", () => {
    const tiers = [val({ dimensions: { tier: "free" }, value: 5 }), val({ dimensions: { tier: "weird" }, value: 2 }), val({ dimensions: { tier: "odd" }, value: 1 })];
    const out = latestPerDim(tiers, "tier", (t) => (["free", "low", "business", "enterprise"].includes(t) ? t : "other"));
    expect(out.find((o) => o.dim === "other")?.point.value).toBe(3);
  });
  it("charge-type row recomputes the success rate from summed numerator/denominator", () => {
    const d = { chargeType: "pms_rent" };
    const rows = [
      val({ kpiId: "pay.success_rate", platform: "pms", dimensions: d, periodStart: "2026-09-28", value: 100, numerator: 1, denominator: 1 }),
      val({ kpiId: "pay.success_rate", platform: "pms", dimensions: d, periodStart: "2026-09-29", value: 50, numerator: 1, denominator: 2 }),
      val({ kpiId: "pay.gmv", platform: "pms", dimensions: d, value: 5000 }),
      val({ kpiId: "pay.gmv", platform: "register", dimensions: d, value: 9999 }),
    ];
    const r = breakdownRow(rows, "pms", "chargeType", "pms_rent");
    expect(r.rate).toBe(66.7);
    expect(r.gmv).toBe(5000);
    expect(r.attempts).toBeNull();
  });
});

describe("freshness", () => {
  const f = (collector: string, value: number, periodStart = "2026-09-30") => val({ kpiId: "company.data_freshness_hours", dimensions: { collector }, value, periodStart });
  const all = (v: number) => ["pay", "register", "chama", "pms", "cyber", "rollups"].map((c) => f(c, v));
  it("ok when all fresh", () => expect(freshnessLevel(freshnessRows(all(3)))).toBe("ok"));
  it("amber between 12 and 26", () => expect(freshnessLevel(freshnessRows([...all(3), f("pay", 14, "2026-10-01")]))).toBe("amber"));
  it("red above 26 or when a required collector is missing", () => {
    expect(freshnessLevel(freshnessRows([...all(3), f("pay", 30, "2026-10-01")]))).toBe("red");
    expect(freshnessLevel(freshnessRows(all(3).slice(1)))).toBe("red");
  });
  it("uses the latest daily value per collector", () => {
    const rows = freshnessRows([f("pay", 40, "2026-09-29"), f("pay", 2, "2026-09-30")]);
    expect(rows.find((r) => r.collector === "pay")?.hours).toBe(2);
  });
});
