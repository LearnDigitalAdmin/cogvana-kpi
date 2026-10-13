import * as admin from "firebase-admin";
import { nairobiDay } from "./period";
import { sourceDb, SourceId } from "./sources";
import { CountQuery, DocRecord, EqualsQuery, PathQuery, RangeQuery, SourceReader, TimeType } from "./reader";

const FAILED_PRECONDITION = 9;
const GETALL_CHUNK = 250;
const FALLBACK_CONCURRENCY = 8;

function boundValue(type: TimeType, ms: number): admin.firestore.Timestamp | number | string {
  switch (type) {
    case "timestamp":
      return admin.firestore.Timestamp.fromMillis(ms);
    case "epochMs":
      return ms;
    case "epochSeconds":
      return Math.floor(ms / 1000);
    case "isoString":
      return new Date(ms).toISOString();
    case "dateString":
      return nairobiDay(ms);
  }
}

function toRecord(doc: admin.firestore.QueryDocumentSnapshot | admin.firestore.DocumentSnapshot): DocRecord {
  return { id: doc.id, path: doc.ref.path, data: (doc.data() || {}) as Record<string, unknown> };
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

export class FirestoreSourceReader implements SourceReader {
  async queryRange(q: RangeQuery): Promise<DocRecord[]> {
    const db = sourceDb(q.source);
    const base = q.group ? db.collectionGroup(q.collection) : db.collection(q.collection);
    const query = base
      .where(q.timeField, ">=", boundValue(q.timeType, q.startMs))
      .where(q.timeField, "<", boundValue(q.timeType, q.endMs))
      .select(...q.select);

    try {
      const snap = await query.get();
      return snap.docs.map(toRecord);
    } catch (err) {
      // A collection-group range query needs a collection-group index on the SOURCE
      // project. If it is not deployed yet, fall back to per-parent queries (slower,
      // needs no index) instead of failing the whole run.
      const code = (err as { code?: number }).code;
      if (q.group && q.groupParent && code === FAILED_PRECONDITION) {
        return this.groupFallback(q, db);
      }
      throw err;
    }
  }

  private async groupFallback(q: RangeQuery, db: admin.firestore.Firestore): Promise<DocRecord[]> {
    // select() with no fields returns document ids only (no data read).
    const parents = await db.collection(q.groupParent!).select().get();
    const perParent = await inBatches(parents.docs, FALLBACK_CONCURRENCY, async (p) => {
      const snap = await p.ref
        .collection(q.collection)
        .where(q.timeField, ">=", boundValue(q.timeType, q.startMs))
        .where(q.timeField, "<", boundValue(q.timeType, q.endMs))
        .select(...q.select)
        .get();
      return snap.docs.map(toRecord);
    });
    return perParent.flat();
  }

  async getDocs(source: SourceId, paths: string[], select: string[]): Promise<DocRecord[]> {
    if (paths.length === 0) return [];
    const db = sourceDb(source);
    const out: DocRecord[] = [];
    for (let i = 0; i < paths.length; i += GETALL_CHUNK) {
      const refs = paths.slice(i, i + GETALL_CHUNK).map((p) => db.doc(p));
      // An empty select means "all fields" (used only for the counters doc, which holds no PII).
      const snaps = select.length ? await db.getAll(...refs, { fieldMask: select }) : await db.getAll(...refs);
      for (const s of snaps) if (s.exists) out.push(toRecord(s));
    }
    return out;
  }

  private applyFilters(base: admin.firestore.Query, q: CountQuery): admin.firestore.Query {
    let query = base;
    if (q.equals) query = query.where(q.equals.field, "==", q.equals.value);
    if (q.time) {
      query = query
        .where(q.time.field, ">=", boundValue(q.time.type, q.time.startMs))
        .where(q.time.field, "<", boundValue(q.time.type, q.time.endMs));
    }
    return query;
  }

  private base(q: { source: SourceId; collection: string; group?: boolean }): admin.firestore.Query {
    const db = sourceDb(q.source);
    return q.group ? db.collectionGroup(q.collection) : db.collection(q.collection);
  }

  async count(q: CountQuery): Promise<number> {
    try {
      const snap = await this.applyFilters(this.base(q), q).count().get();
      return snap.data().count;
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (!(q.group && q.groupParent && code === FAILED_PRECONDITION)) throw err;
      // No source-side group index yet: count per parent instead (slower, needs no index).
      const db = sourceDb(q.source);
      const parents = await db.collection(q.groupParent).select().get();
      const counts = await inBatches(parents.docs, FALLBACK_CONCURRENCY, async (p) => {
        const snap = await this.applyFilters(p.ref.collection(q.collection), q).count().get();
        return snap.data().count;
      });
      return counts.reduce((t, n) => t + n, 0);
    }
  }

  async sum(q: CountQuery, field: string): Promise<number> {
    const snap = await this.applyFilters(this.base(q), q).aggregate({ total: admin.firestore.AggregateField.sum(field) }).get();
    const total = snap.data().total;
    return typeof total === "number" && Number.isFinite(total) ? total : 0;
  }

  async queryEquals(q: EqualsQuery): Promise<DocRecord[]> {
    try {
      const snap = await this.base(q).where(q.field, "==", q.value).select(...q.select).get();
      return snap.docs.map(toRecord);
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (!(q.group && q.groupParent && code === FAILED_PRECONDITION)) throw err;
      const db = sourceDb(q.source);
      const parents = await db.collection(q.groupParent).select().get();
      const perParent = await inBatches(parents.docs, FALLBACK_CONCURRENCY, async (p) => {
        const snap = await p.ref.collection(q.collection).where(q.field, "==", q.value).select(...q.select).get();
        return snap.docs.map(toRecord);
      });
      return perParent.flat();
    }
  }

  async queryPath(q: PathQuery): Promise<DocRecord[]> {
    let query: admin.firestore.Query = sourceDb(q.source).collection(q.path);
    if (q.equals) query = query.where(q.equals.field, "==", q.equals.value);
    const snap = await query.select(...q.select).get();
    return snap.docs.map(toRecord);
  }
}
