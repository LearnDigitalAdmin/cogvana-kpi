import { describe, expect, it } from "vitest";
import { addDays, dailyPeriod, dayBounds, eachDay, isComplete, monthEnd, nairobiDay, periodFor, recentDays, weekStart } from "../src/core/period";
import { toMillis } from "../src/core/timestamps";
import { fromCents, num, pct, toCents } from "../src/core/money";
import { dimsKey, valueId } from "../src/core/types";
import { defineKpi, validateDefinitions } from "../src/core/registry";
import { ALL_DEFINITIONS } from "../src/registry";

describe("period (Africa/Nairobi, UTC+3)", () => {
  it("assigns instants to the Nairobi day, not the UTC day", () => {
    expect(nairobiDay(Date.parse("2026-09-29T20:59:59Z"))).toBe("2026-09-29");
    expect(nairobiDay(Date.parse("2026-09-29T21:00:00Z"))).toBe("2026-09-30"); // 00:00 Nairobi
  });

  it("day bounds are 24h and start at 21:00 UTC the previous day", () => {
    const b = dayBounds("2026-09-29");
    expect(new Date(b.startMs).toISOString()).toBe("2026-09-28T21:00:00.000Z");
    expect(b.endMs - b.startMs).toBe(86_400_000);
  });

  it("handles month and year edges", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
  });

  it("weeks start Monday", () => {
    expect(weekStart("2026-09-30")).toBe("2026-09-28"); // Wednesday -> Monday
    expect(weekStart("2026-09-27")).toBe("2026-09-21"); // Sunday -> previous Monday
    const p = periodFor("weekly", "2026-09-30");
    expect([p.start, p.end]).toEqual(["2026-09-28", "2026-10-04"]);
  });

  it("recentDays returns the complete days before today", () => {
    const now = Date.parse("2026-09-30T05:00:00Z"); // 08:00 Nairobi, 30 Sep
    expect(recentDays(now, 3)).toEqual(["2026-09-27", "2026-09-28", "2026-09-29"]);
    expect(eachDay("2026-09-29", "2026-09-28")).toEqual([]);
  });

  it("a period is complete only after its last day ends", () => {
    const now = Date.parse("2026-09-29T12:00:00Z");
    expect(isComplete(dailyPeriod("2026-09-29"), now)).toBe(false);
    expect(isComplete(dailyPeriod("2026-09-28"), now)).toBe(true);
  });
});

describe("timestamps: four source formats normalise to UTC ms", () => {
  const ms = Date.parse("2026-09-29T07:00:00Z");
  it("handles Firestore Timestamp-like, ISO, epoch ms, epoch s, date string, Date", () => {
    expect(toMillis({ toMillis: () => ms })).toBe(ms);
    expect(toMillis({ _seconds: ms / 1000, _nanoseconds: 0 })).toBe(ms);
    expect(toMillis("2026-09-29T07:00:00Z")).toBe(ms);
    expect(toMillis(ms)).toBe(ms);
    expect(toMillis(ms / 1000)).toBe(ms);
    expect(toMillis(new Date(ms))).toBe(ms);
    expect(toMillis("2026-09-29")).toBe(Date.parse("2026-09-28T21:00:00Z"));
  });
  it("returns null for unusable input", () => {
    for (const bad of [null, undefined, "", "garbage", NaN, 0, -5, {}, []]) expect(toMillis(bad)).toBeNull();
  });
});

describe("money", () => {
  it("converts decimal KES to integer cents without float drift", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1499.99)).toBe(149999);
    expect(fromCents(149999)).toBe(1499.99);
  });
  it("num rejects non-finite values", () => {
    expect(num("12.5")).toBe(12.5);
    expect(num("")).toBeNull();
    expect(num(NaN)).toBeNull();
    expect(num(Infinity)).toBeNull();
    expect(num("abc")).toBeNull();
  });
  it("pct guards a zero denominator", () => {
    expect(pct(1, 0)).toBe(0);
    expect(pct(1, 3)).toBe(33.33);
  });
});

describe("ids and registry", () => {
  it("value ids are deterministic and independent of dimension key order", () => {
    const a = valueId({ kpiId: "pay.gmv", platform: "pms", grain: "daily", periodStart: "2026-09-29", dimensions: { b: "2", a: "1" } });
    const b = valueId({ kpiId: "pay.gmv", platform: "pms", grain: "daily", periodStart: "2026-09-29", dimensions: { a: "1", b: "2" } });
    expect(a).toBe(b);
    expect(dimsKey({})).toBe("-");
  });

  it("the shipped registry is valid and every KPI names an owner and a decision", () => {
    expect(() => validateDefinitions(ALL_DEFINITIONS)).not.toThrow();
  });

  it("rejects duplicate ids, missing decisions and ratios without numerator/denominator", () => {
    const base = { scope: "company" as const, platform: "all" as const, type: "flow" as const, unit: "count" as const, owner: "x", description: "d" };
    const bad = [
      defineKpi({ ...base, id: "a.b", name: "A", formula: "f", decision: "d" }),
      defineKpi({ ...base, id: "a.b", name: "A2", formula: "f", decision: "d" }),
      defineKpi({ ...base, id: "a.c", name: "C", formula: "f", decision: "" }),
      defineKpi({ ...base, id: "a.d", name: "D", type: "ratio", formula: "f", decision: "d" }),
    ];
    expect(() => validateDefinitions(bad)).toThrow(/duplicate id[\s\S]*decision is required[\s\S]*numeratorDesc/);
  });
});
