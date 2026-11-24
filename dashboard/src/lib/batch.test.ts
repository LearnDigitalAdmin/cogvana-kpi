import { describe, expect, it } from "vitest";
import { chunk, uniqueSorted } from "./batch";

describe("batch", () => {
  it("splits more than 30 ids into chunks of at most 30", () => {
    const ids = Array.from({ length: 65 }, (_, i) => `k.${i}`);
    const parts = chunk(ids);
    expect(parts.map((p) => p.length)).toEqual([30, 30, 5]);
    expect(parts.flat()).toEqual(ids);
  });
  it("keeps exactly 30 in one call and handles empty", () => {
    expect(chunk(Array.from({ length: 30 }, (_, i) => String(i)))).toHaveLength(1);
    expect(chunk([])).toEqual([]);
  });
  it("dedupes and sorts for stable cache keys", () => {
    expect(uniqueSorted(["b", "a", "b"])).toEqual(["a", "b"]);
  });
});
