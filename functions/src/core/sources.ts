import * as admin from "firebase-admin";

/**
 * The three Firestore databases the collectors READ from. The KPI project's own
 * database (where values are written) is the default app and is never listed here.
 *
 * Access: the KPI functions' service account needs `roles/datastore.viewer`
 * (read-only) on each of these projects. Nothing here ever writes to a source.
 */
export type SourceId = "default" | "register" | "chama";

export const SOURCE_PROJECTS: Record<SourceId, string> = {
  default: process.env.KPI_SRC_DEFAULT_PROJECT || "plot-9fd6e",
  register: process.env.KPI_SRC_REGISTER_PROJECT || "my-register-728ff",
  chama: process.env.KPI_SRC_CHAMA_PROJECT || "mychama1",
};

const cache = new Map<SourceId, admin.firestore.Firestore>();

export function sourceDb(source: SourceId): admin.firestore.Firestore {
  const hit = cache.get(source);
  if (hit) return hit;

  const appName = `kpi-src-${source}`;
  const app =
    admin.apps.find((a) => a && a.name === appName) ||
    admin.initializeApp(
      { credential: admin.credential.applicationDefault(), projectId: SOURCE_PROJECTS[source] },
      appName
    );
  const db = app.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  cache.set(source, db);
  return db;
}
