import { SourceId } from "./sources";

export interface DocRecord {
  id: string;
  /** Full Firestore path, e.g. `chamas/abc/paymentIntents/MCW-abc-123`. */
  path: string;
  data: Record<string, unknown>;
}

/**
 * How a source stores time. Bounds are always given as UTC ms ([start, end)) and
 * converted per type:
 *  timestamp  - Firestore Timestamp
 *  epochMs    - numeric milliseconds (also used for plain numeric range queries)
 *  epochSeconds - numeric seconds (Cyber sessions)
 *  isoString  - ISO-8601 string (compares correctly as text)
 *  dateString - YYYY-MM-DD school/calendar day (Nairobi); bounds MUST be day-aligned
 */
export type TimeType = "timestamp" | "epochMs" | "epochSeconds" | "isoString" | "dateString";

export interface RangeQuery {
  source: SourceId;
  /** Collection name, or collection-group name when `group` is true. */
  collection: string;
  group?: boolean;
  /** For group queries: top-level parent collection, used only by the no-index fallback. */
  groupParent?: string;
  timeField: string;
  timeType: TimeType;
  /** Inclusive start, exclusive end (UTC ms). */
  startMs: number;
  endMs: number;
  /**
   * Fields to fetch. ALWAYS list them: collectors never read whole documents,
   * so fields like passwords, phones and message text are never pulled in.
   */
  select: string[];
}

/**
 * Aggregation query. Use EITHER an equality filter OR a time range, never both:
 * combining them needs a composite index on the source project.
 */
export interface CountQuery {
  source: SourceId;
  collection: string;
  /** Collection-group query across every parent. Without a source-side group index it falls back to per-parent queries. */
  group?: boolean;
  /** Top-level parent collection for the no-index fallback (e.g. "chamas"). */
  groupParent?: string;
  equals?: { field: string; value: string | number | boolean };
  time?: { field: string; type: TimeType; startMs: number; endMs: number };
}

/** Equality query (optionally across all parents) returning selected fields only. */
export interface EqualsQuery {
  source: SourceId;
  collection: string;
  group?: boolean;
  groupParent?: string;
  field: string;
  value: string | number | boolean;
  select: string[];
}

/** Direct listing of one exact collection path, e.g. `chamas/c1/mgrPots/p1/arrears`. */
export interface PathQuery {
  source: SourceId;
  path: string;
  equals?: { field: string; value: string | number | boolean };
  select: string[];
}

/** Seam between collectors and Firestore: swapped for an in-memory reader in tests. */
export interface SourceReader {
  queryRange(q: RangeQuery): Promise<DocRecord[]>;
  getDocs(source: SourceId, paths: string[], select: string[]): Promise<DocRecord[]>;
  queryEquals(q: EqualsQuery): Promise<DocRecord[]>;
  queryPath(q: PathQuery): Promise<DocRecord[]>;
  count(q: CountQuery): Promise<number>;
  sum(q: CountQuery, field: string): Promise<number>;
}
