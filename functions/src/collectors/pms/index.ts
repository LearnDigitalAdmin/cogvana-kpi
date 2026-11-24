import { CollectContext, Collector, Grain, KpiValue, Period } from "../../core/types";
import { periodFor } from "../../core/period";
import { SourceReader } from "../../core/reader";
import { emitMetrics, makeValue } from "../../core/values";
import { num } from "../../core/money";
import { billingMetrics, distinctUsers, INVOICE_SELECT, PAYMENT_SELECT, userIdOf } from "./billing";
import { pmsUsersIn } from "./users";

const SRC = "default" as const;
const GROUP = { group: true, groupParent: "users" } as const;

/**
 * Plot Yangu collector (read-only). All figures are as of last sync: device data reaches Firestore late, so the
 * weekly refresh job recomputes the last 21 days. Create ONE instance per job run (week/month scans are memoised).
 * Invoices are dated by createdAt (ISO string) and payments by paymentDate (string, compared as ISO text).
 */
export function createPmsCollector(reader: SourceReader): Collector {
  const memo = new Map<string, Promise<Set<string>>>();

  const invoices = (w: { startMs: number; endMs: number }, select: string[]) =>
    reader.queryRange({ source: SRC, collection: "invoices", ...GROUP, timeField: "createdAt", timeType: "isoString", ...w, select });
  const payments = (w: { startMs: number; endMs: number }, select: string[]) =>
    reader.queryRange({ source: SRC, collection: "payments", group: true, timeField: "paymentDate", timeType: "isoString", ...w, select });

  function managersFor(period: Period): Promise<Set<string>> {
    const key = `${period.grain}|${period.start}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const p = (async () => {
      const w = { startMs: period.startMs, endMs: period.endMs };
      const [inv, pay] = await Promise.all([invoices(w, []), payments(w, [])]);
      return new Set([...distinctUsers(inv, "invoices"), ...distinctUsers(pay, "payments")]);
    })();
    memo.set(key, p);
    return p;
  }

  return {
    id: "pms",
    async collect(ctx: CollectContext): Promise<KpiValue[]> {
      const { period, now, runId } = ctx;
      const w = { startMs: period.startMs, endMs: period.endMs };
      const base = { platform: "pms" as const, grain: "daily" as const, period, now, runId };

      const [newUsers, newTrials, invoiceDocs, paymentDocs, tenantDocs, propertyDocs, smsDocs] = await Promise.all([
        pmsUsersIn(reader, "createdAt", "isoString", w.startMs, w.endMs),
        pmsUsersIn(reader, "trialStartedAt", "timestamp", w.startMs, w.endMs),
        invoices(w, INVOICE_SELECT),
        payments(w, PAYMENT_SELECT),
        reader.queryRange({ source: SRC, collection: "tenants", ...GROUP, timeField: "createdAt", timeType: "isoString", ...w, select: [] }),
        reader.queryRange({ source: SRC, collection: "properties", ...GROUP, timeField: "createdAt", timeType: "isoString", ...w, select: [] }),
        // users/{u}/sms-sent-log: written server-side (never synced from devices), so it is exact, not "as of last sync".
        reader.queryRange({ source: SRC, collection: "sms-sent-log", ...GROUP, timeField: "sentAt", timeType: "timestamp", ...w, select: ["recipientCount", "tokensCharged", "successCount", "failCount"] }),
      ]);
      const smsUsed = smsDocs.reduce((t, d) => t + (num(d.data.tokensCharged) ?? 0), 0);
      const smsOk = smsDocs.reduce((t, d) => t + (num(d.data.successCount) ?? 0), 0);
      const smsFailed = smsDocs.reduce((t, d) => t + (num(d.data.failCount) ?? 0), 0);

      const newTenants = tenantDocs.filter((d) => userIdOf(d.path, "tenants")).length;
      const newProperties = propertyDocs.filter((d) => userIdOf(d.path, "properties")).length;
      const dayManagers = new Set([...distinctUsers(invoiceDocs, "invoices"), ...distinctUsers(paymentDocs, "payments")]);

      const out: KpiValue[] = [
        ...emitMetrics(
          {
            "pms.users_new": { value: newUsers.length },
            "pms.trials_started": { value: newTrials.length },
            "pms.sms_tokens_used": { value: smsUsed },
            "pms.sms_accepted": { value: smsOk },
            "pms.sms_failed": { value: smsFailed },
            ...billingMetrics(invoiceDocs, paymentDocs, newTenants, newProperties),
          },
          base
        ),
        makeValue("pms.managers_active", { value: dayManagers.size }, base),
      ];

      for (const grain of ["weekly", "monthly"] as Grain[]) {
        const wide = periodFor(grain, period.start);
        const set = await managersFor(wide);
        out.push(makeValue("pms.managers_active", { value: set.size }, { platform: "pms", grain, period: wide, now, runId }));
      }
      return out;
    },
  };
}
