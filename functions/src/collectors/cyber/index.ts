import { CollectContext, Collector, Grain, KpiValue, Period } from "../../core/types";
import { dailyPeriod, eachDay, nairobiDay, periodFor } from "../../core/period";
import { SourceReader } from "../../core/reader";
import { emitMetrics, makeValue, Metric } from "../../core/values";
import { num, pct } from "../../core/money";

const SRC = "default" as const;
const USAGE_SELECT = ["inbound", "outbound", "outboundFailed", "sessionsStarted", "users"];

/**
 * Cyber collector: WhatsApp usage only. Everything else Cyber measures is registered as "planned" and not collected.
 *
 * EXACT numbers come from `whatsapp_usage/{YYYY-MM-DD}` (the usage meter in the CYBER repo, functions/src/utils/whatsapp.usage.ts). When the day's
 * document does not exist, NO exact values are written: absent, not zero. APPROXIMATE numbers come from
 * `whatsapp_sessions` (one short-lived document per phone, `lastActive` in epoch seconds) and work without the meter.
 * Phone numbers are never read: session documents are only counted, and meter users are salted hashes.
 */
export interface UsageDoc {
  inbound: number;
  outbound: number;
  outboundFailed: number;
  sessionsStarted: number;
  users: Set<string>;
}

export function toUsage(data: Record<string, unknown>): UsageDoc {
  const users = data.users && typeof data.users === "object" ? Object.keys(data.users as Record<string, unknown>) : [];
  return {
    inbound: num(data.inbound) ?? 0,
    outbound: num(data.outbound) ?? 0,
    outboundFailed: num(data.outboundFailed) ?? 0,
    sessionsStarted: num(data.sessionsStarted) ?? 0,
    users: new Set(users),
  };
}

export function usageMetrics(u: UsageDoc): Record<string, Metric> {
  const out: Record<string, Metric> = {
    "cyber.wa_messages_in": { value: u.inbound },
    "cyber.wa_messages_out": { value: u.outbound },
    "cyber.wa_messages_out_failed": { value: u.outboundFailed },
    "cyber.wa_sessions_started": { value: u.sessionsStarted },
  };
  if (u.outbound > 0) {
    const ok = Math.max(0, u.outbound - u.outboundFailed);
    out["cyber.wa_delivery_success_rate"] = { value: pct(ok, u.outbound), numerator: ok, denominator: u.outbound };
  }
  return out;
}

export function createCyberCollector(reader: SourceReader): Collector {
  const memo = new Map<string, Promise<Set<string> | null>>();

  /** Union of the meter's hashed users over a week or month; null when no daily document exists in the period. */
  function usersFor(period: Period): Promise<Set<string> | null> {
    const key = `${period.grain}|${period.start}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const p = (async () => {
      const paths = eachDay(period.start, period.end).map((d) => `whatsapp_usage/${d}`);
      const docs = await reader.getDocs(SRC, paths, ["users"]);
      if (docs.length === 0) return null;
      const all = new Set<string>();
      for (const d of docs) for (const k of toUsage(d.data).users) all.add(k);
      return all;
    })();
    memo.set(key, p);
    return p;
  }

  return {
    id: "cyber",
    async collect(ctx: CollectContext): Promise<KpiValue[]> {
      const { period, now, runId } = ctx;
      const base = { platform: "cyber" as const, grain: "daily" as const, period, now, runId };

      const [usageDocs, seen] = await Promise.all([
        reader.getDocs(SRC, [`whatsapp_usage/${period.start}`], USAGE_SELECT),
        reader.count({ source: SRC, collection: "whatsapp_sessions", time: { field: "lastActive", type: "epochSeconds", startMs: period.startMs, endMs: period.endMs } }),
      ]);

      const out: KpiValue[] = emitMetrics({ "cyber.wa_users_seen": { value: seen } }, base);

      if (usageDocs.length > 0) {
        const usage = toUsage(usageDocs[0].data);
        out.push(...emitMetrics(usageMetrics(usage), base));
        out.push(makeValue("cyber.wa_users_active", { value: usage.users.size }, base));
      }

      for (const grain of ["weekly", "monthly"] as Grain[]) {
        const wide = periodFor(grain, period.start);
        const set = await usersFor(wide);
        if (set) out.push(makeValue("cyber.wa_users_active", { value: set.size }, { platform: "cyber", grain, period: wide, now, runId }));
      }
      return out;
    },
  };
}

/** Stock snapshot: phones with a session document right now (approximate audience size). */
export async function snapshotCyber(reader: SourceReader, now: number, runId: string): Promise<KpiValue[]> {
  const period = dailyPeriod(nairobiDay(now));
  const known = await reader.count({ source: SRC, collection: "whatsapp_sessions" });
  return [makeValue("cyber.wa_known_users", { value: known }, { platform: "cyber", grain: "daily", period, now, runId, complete: false })];
}
