import * as admin from "firebase-admin";
import { Grain, KpiDefinition, KpiRun, KpiValue, PlatformId } from "./types";

/** Firestore collection names in the KPI project. */
export const COLLECTIONS = {
  definitions: "kpi_definitions",
  values: "kpi_values",
  runs: "kpi_runs",
  // Reserved for the Operations Control Plane (schema fixed, unused in v1):
  customerMetrics: "customer_metrics",
  events: "events",
  auditLog: "audit_log",
} as const;

export interface ValueQuery {
  grain: Grain;
  /** Inclusive periodStart bounds, YYYY-MM-DD. */
  from: string;
  to: string;
  kpiIds?: string[];
  platform?: PlatformId;
}

/** Seam 3: swap the storage (Firestore now, BigQuery later) without touching collectors. */
export interface KpiStore {
  writeValues(values: KpiValue[]): Promise<void>;
  readValues(query: ValueQuery): Promise<KpiValue[]>;
  writeRun(run: KpiRun): Promise<void>;
  lastSuccessfulRun(collector: string): Promise<KpiRun | null>;
  syncDefinitions(defs: KpiDefinition[]): Promise<{ written: number }>;
}

// ---------------------------------------------------------------------------
// In-memory implementation: used by tests and by local dry runs.
// ---------------------------------------------------------------------------
export class MemoryKpiStore implements KpiStore {
  readonly values = new Map<string, KpiValue>();
  readonly runs: KpiRun[] = [];
  readonly definitions = new Map<string, KpiDefinition>();

  async writeValues(values: KpiValue[]): Promise<void> {
    for (const v of values) this.values.set(v.id, { ...v });
  }

  async readValues(q: ValueQuery): Promise<KpiValue[]> {
    return [...this.values.values()].filter(
      (v) =>
        v.grain === q.grain &&
        v.periodStart >= q.from &&
        v.periodStart <= q.to &&
        (!q.kpiIds || q.kpiIds.includes(v.kpiId)) &&
        (!q.platform || v.platform === q.platform)
    );
  }

  async writeRun(run: KpiRun): Promise<void> {
    this.runs.push(run);
  }

  async lastSuccessfulRun(collector: string): Promise<KpiRun | null> {
    const ok = this.runs.filter((r) => r.collector === collector && r.status === "success");
    if (!ok.length) return null;
    return ok.reduce((a, b) => (b.startedAt > a.startedAt ? b : a));
  }

  async syncDefinitions(defs: KpiDefinition[]): Promise<{ written: number }> {
    let written = 0;
    for (const d of defs) {
      const existing = this.definitions.get(d.id);
      if (!existing || JSON.stringify(existing) !== JSON.stringify(d)) {
        this.definitions.set(d.id, d);
        written++;
      }
    }
    return { written };
  }
}

// ---------------------------------------------------------------------------
// Firestore implementation (the KPI project's own default database).
// ---------------------------------------------------------------------------
const BATCH_LIMIT = 400; // Firestore hard limit is 500 writes per batch.

export class FirestoreKpiStore implements KpiStore {
  constructor(private readonly db: admin.firestore.Firestore) {}

  async writeValues(values: KpiValue[]): Promise<void> {
    for (let i = 0; i < values.length; i += BATCH_LIMIT) {
      const batch = this.db.batch();
      for (const v of values.slice(i, i + BATCH_LIMIT)) {
        batch.set(this.db.collection(COLLECTIONS.values).doc(v.id), v);
      }
      await batch.commit();
    }
  }

  async readValues(q: ValueQuery): Promise<KpiValue[]> {
    let query: admin.firestore.Query = this.db
      .collection(COLLECTIONS.values)
      .where("grain", "==", q.grain)
      .where("periodStart", ">=", q.from)
      .where("periodStart", "<=", q.to);
    if (q.platform) query = query.where("platform", "==", q.platform);
    // `kpiId in [...]` is capped at 30 values by Firestore; filter client-side beyond that.
    if (q.kpiIds && q.kpiIds.length > 0 && q.kpiIds.length <= 30) query = query.where("kpiId", "in", q.kpiIds);
    const snap = await query.get();
    let rows = snap.docs.map((d) => d.data() as KpiValue);
    if (q.kpiIds && q.kpiIds.length > 30) rows = rows.filter((r) => q.kpiIds!.includes(r.kpiId));
    return rows;
  }

  async writeRun(run: KpiRun): Promise<void> {
    await this.db.collection(COLLECTIONS.runs).doc(run.id).set(run);
  }

  async lastSuccessfulRun(collector: string): Promise<KpiRun | null> {
    const snap = await this.db
      .collection(COLLECTIONS.runs)
      .where("collector", "==", collector)
      .where("status", "==", "success")
      .orderBy("startedAt", "desc")
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0].data() as KpiRun);
  }

  async syncDefinitions(defs: KpiDefinition[]): Promise<{ written: number }> {
    const refs = defs.map((d) => this.db.collection(COLLECTIONS.definitions).doc(d.id));
    const existing = refs.length ? await this.db.getAll(...refs) : [];
    const batch = this.db.batch();
    let written = 0;
    defs.forEach((d, i) => {
      const cur = existing[i].exists ? (existing[i].data() as KpiDefinition) : null;
      if (!cur || JSON.stringify(cur) !== JSON.stringify(d)) {
        batch.set(refs[i], d);
        written++;
      }
    });
    if (written) await batch.commit();
    return { written };
  }
}
