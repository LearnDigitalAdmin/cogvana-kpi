import { describe, expect, it } from "vitest";
import { formatCount, formatDelta, formatHours, formatMoney, formatPercent, formatValue } from "./format";

describe("format", () => {
  it("money: cents to KES, decimals only below 1,000", () => {
    expect(formatMoney(12500)).toBe("KES 125.00");
    expect(formatMoney(123456789)).toBe("KES 1,234,568");
    expect(formatMoney(100000)).toBe("KES 1,000");
    expect(formatMoney(99999)).toBe("KES 999.99");
    expect(formatMoney(-250000)).toBe("-KES 2,500");
  });
  it("money: compact form for tiles", () => {
    expect(formatMoney(120_000_000, { compact: true })).toBe("KES 1.2M");
    expect(formatMoney(1_250_000, { compact: true })).toBe("KES 12.5K");
    expect(formatMoney(12500, { compact: true })).toBe("KES 125.00");
  });
  it("percent: one decimal", () => {
    expect(formatPercent(66.666)).toBe("66.7%");
    expect(formatPercent(0)).toBe("0.0%");
  });
  it("count: grouped, compact only above 100,000", () => {
    expect(formatCount(1234567)).toBe("1,234,567");
    expect(formatCount(100000, { compact: true })).toBe("100,000");
    expect(formatCount(150000, { compact: true })).toBe("150K");
    expect(formatCount(1_200_000, { compact: true })).toBe("1.2M");
  });
  it("hours", () => expect(formatHours(3.24)).toBe("3.2 h"));
  it("absent values render as a dash, never 0", () => {
    expect(formatValue("count", null)).toBe("—");
    expect(formatValue("KES_CENTS", undefined)).toBe("—");
    expect(formatValue("count", 0)).toBe("0");
  });
  it("delta", () => {
    expect(formatDelta(-12.345)).toBe("12.3%");
    expect(formatDelta(250.4)).toBe("250%");
  });
});
