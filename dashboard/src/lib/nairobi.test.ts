import { describe, expect, it } from "vitest";
import { addDays, addMonths, expectedPeriods, formatClock, formatDay, periodLabel, presetsFor, previousRange, rangeLength, startOfWeek, todayNairobi, validateRange } from "./nairobi";

describe("nairobi", () => {
  it("today rolls over at 21:00 UTC (00:00 Nairobi)", () => {
    expect(todayNairobi(Date.UTC(2026, 8, 29, 20, 59))).toBe("2026-09-29");
    expect(todayNairobi(Date.UTC(2026, 8, 29, 21, 0))).toBe("2026-09-30");
  });
  it("labels", () => {
    expect(formatDay("2026-09-29")).toBe("Tue 29 Sep");
    expect(periodLabel("weekly", "2026-09-28")).toBe("Week of 28 Sep");
    expect(periodLabel("monthly", "2026-09-01")).toBe("Sep 2026");
    expect(formatClock(Date.UTC(2026, 8, 29, 21, 5))).toBe("00:05");
  });
  it("daily presets across month boundaries", () => {
    const p = Object.fromEntries(presetsFor("daily", "2026-03-02").map((x) => [x.id, x]));
    expect(p["7d"]).toMatchObject({ from: "2026-02-24", to: "2026-03-02" });
    expect(p["this-month"]).toMatchObject({ from: "2026-03-01", to: "2026-03-02" });
    expect(p["last-month"]).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("handles 29 Feb", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    const p = presetsFor("daily", "2028-03-10").find((x) => x.id === "last-month")!;
    expect(p).toMatchObject({ from: "2028-02-01", to: "2028-02-29" });
    expect(addMonths("2028-03-31", -1)).toBe("2028-02-01");
  });
  it("weekly and monthly presets", () => {
    expect(startOfWeek("2026-10-04")).toBe("2026-09-28"); // Sunday → previous Monday
    const w = presetsFor("weekly", "2026-10-02")[0];
    expect(w).toMatchObject({ from: "2026-08-10", to: "2026-10-02" });
    const m = presetsFor("monthly", "2026-01-15")[0];
    expect(m).toMatchObject({ from: "2025-08-01", to: "2026-01-15" });
  });
  it("previous range is equal length and adjacent", () => {
    expect(previousRange("2026-09-24", "2026-09-30")).toEqual({ from: "2026-09-17", to: "2026-09-23" });
    expect(rangeLength("2026-09-24", "2026-09-30")).toBe(7);
  });
  it("validates ranges", () => {
    const t = "2026-10-02";
    expect(validateRange("2026-09-01", "2026-09-30", t)).toBeNull();
    expect(validateRange("2026-09-30", "2026-09-01", t)).toMatch(/before/);
    expect(validateRange("2026-09-01", "2026-10-03", t)).toMatch(/future/);
    expect(validateRange("2025-01-01", "2026-10-02", t)).toMatch(/400/);
    expect(validateRange("nope", "2026-10-02", t)).toMatch(/valid/);
  });
  it("expected periods per grain", () => {
    expect(expectedPeriods("daily", "2026-09-29", "2026-10-01")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
    expect(expectedPeriods("weekly", "2026-09-29", "2026-10-13")).toEqual(["2026-10-05", "2026-10-12"]);
    expect(expectedPeriods("monthly", "2026-08-15", "2026-10-02")).toEqual(["2026-09-01", "2026-10-01"]);
  });
});
