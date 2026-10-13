import { CountQuery, DocRecord, EqualsQuery, PathQuery, RangeQuery, SourceReader } from "../src/core/reader";
import { SourceId } from "../src/core/sources";
import { toMillis } from "../src/core/timestamps";

type Stored = { source: SourceId; path: string; data: Record<string, unknown> };

/** In-memory SourceReader: same contract as the Firestore reader, no network. */
export class MemoryPayReader implements SourceReader {
  private docs: Stored[] = [];
  public queries: RangeQuery[] = [];
  public counts: CountQuery[] = [];

  add(source: SourceId, path: string, data: Record<string, unknown>): this {
    this.docs.push({ source, path, data });
    return this;
  }

  private static pick(data: Record<string, unknown>, select: string[]): Record<string, unknown> {
    if (select.length === 0) return { ...data };
    const out: Record<string, unknown> = {};
    for (const field of select) {
      const parts = field.split(".");
      let src: unknown = data;
      for (const p of parts) {
        src = src && typeof src === "object" ? (src as Record<string, unknown>)[p] : undefined;
      }
      if (src === undefined) continue;
      let dst = out;
      parts.slice(0, -1).forEach((p) => {
        dst[p] = (dst[p] as Record<string, unknown>) || {};
        dst = dst[p] as Record<string, unknown>;
      });
      dst[parts[parts.length - 1]] = src;
    }
    return out;
  }

  async queryRange(q: RangeQuery): Promise<DocRecord[]> {
    this.queries.push(q);
    const out: DocRecord[] = [];
    for (const d of this.docs) {
      if (d.source !== q.source) continue;
      const segs = d.path.split("/");
      const inCollection = q.group ? segs[segs.length - 2] === q.collection : segs.length === 2 && segs[0] === q.collection;
      if (!inCollection) continue;
      const t = toMillis(d.data[q.timeField]);
      if (t === null || t < q.startMs || t >= q.endMs) continue;
      out.push({ id: segs[segs.length - 1], path: d.path, data: MemoryPayReader.pick(d.data, q.select) });
    }
    return out;
  }

  async getDocs(source: SourceId, paths: string[], select: string[]): Promise<DocRecord[]> {
    const out: DocRecord[] = [];
    for (const p of paths) {
      const d = this.docs.find((x) => x.source === source && x.path === p);
      if (d) out.push({ id: p.split("/").pop()!, path: p, data: MemoryPayReader.pick(d.data, select) });
    }
    return out;
  }

  public equalsQueries: EqualsQuery[] = [];
  public pathQueries: PathQuery[] = [];

  async queryEquals(q: EqualsQuery): Promise<DocRecord[]> {
    this.equalsQueries.push(q);
    const out: DocRecord[] = [];
    for (const d of this.docs) {
      if (d.source !== q.source) continue;
      const segs = d.path.split("/");
      const inCollection = q.group ? segs[segs.length - 2] === q.collection : segs.length === 2 && segs[0] === q.collection;
      if (!inCollection || d.data[q.field] !== q.value) continue;
      out.push({ id: segs[segs.length - 1], path: d.path, data: MemoryPayReader.pick(d.data, q.select) });
    }
    return out;
  }

  async queryPath(q: PathQuery): Promise<DocRecord[]> {
    this.pathQueries.push(q);
    const depth = q.path.split("/").length + 1;
    const out: DocRecord[] = [];
    for (const d of this.docs) {
      if (d.source !== q.source) continue;
      const segs = d.path.split("/");
      if (segs.length !== depth || segs.slice(0, -1).join("/") !== q.path) continue;
      if (q.equals && d.data[q.equals.field] !== q.equals.value) continue;
      out.push({ id: segs[segs.length - 1], path: d.path, data: MemoryPayReader.pick(d.data, q.select) });
    }
    return out;
  }

  private matching(q: CountQuery): Stored[] {
    return this.docs.filter((d) => {
      if (d.source !== q.source) return false;
      const segs = d.path.split("/");
      const inCollection = q.group ? segs[segs.length - 2] === q.collection : segs.length === 2 && segs[0] === q.collection;
      if (!inCollection) return false;
      if (q.equals && d.data[q.equals.field] !== q.equals.value) return false;
      if (q.time) {
        const t = toMillis(d.data[q.time.field]);
        if (t === null || t < q.time.startMs || t >= q.time.endMs) return false;
      }
      return true;
    });
  }

  async count(q: CountQuery): Promise<number> {
    this.counts.push(q);
    return this.matching(q).length;
  }

  async sum(q: CountQuery, field: string): Promise<number> {
    this.counts.push(q);
    return this.matching(q).reduce((t, d) => t + (typeof d.data[field] === "number" ? (d.data[field] as number) : 0), 0);
  }
}

/** Nairobi 2026-09-29 10:00 (= 07:00 UTC), a stable instant inside the test day. */
export const DAY = "2026-09-29";
export const T_DAY = Date.parse("2026-09-29T07:00:00Z");
export const NOW = Date.parse("2026-09-30T05:00:00Z");
export const DAY_WINDOW = { startMs: Date.parse("2026-09-28T21:00:00Z"), endMs: Date.parse("2026-09-29T21:00:00Z") };
