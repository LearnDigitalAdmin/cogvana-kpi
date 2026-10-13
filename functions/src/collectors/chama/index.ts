import { CollectContext, Collector, Grain, KpiValue, Period } from "../../core/types";
import { periodFor } from "../../core/period";
import { DocRecord, SourceReader } from "../../core/reader";
import { emitMetrics, makeValue } from "../../core/values";
import { activeChamas, LEDGER_SELECT, ledgerMetrics, LedgerRow, toLedgerRow } from "./ledger";
import { messagingChamas, SMS_SELECT, smsMetrics, SmsRow, toSmsRow } from "./messaging";

type DistinctKind = "active" | "messaging";

const DISTINCT_KPI: Record<DistinctKind, string> = {
  active: "chama.chamas_active",
  messaging: "chama.chamas_messaging",
};

const SRC = "chama" as const;
const GROUP = { group: true, groupParent: "chamas", timeType: "epochMs" as const, timeField: "createdAt" };

const notNull = <T,>(x: T | null): x is T => x !== null;

/**
 * Chama collector (read-only). Per day: ledger flows, SMS usage, growth, and the distinct-chama counts for
 * the day plus the week and month containing it. Create ONE instance per job run: week/month scans are
 * memoised per instance.
 */
export function createChamaCollector(reader: SourceReader): Collector {
  const memo = new Map<string, Promise<Set<string>>>();

  const ledgerQuery = (p: { startMs: number; endMs: number }, select: string[]) =>
    reader.queryRange({ source: SRC, collection: "transactions", ...GROUP, ...p, select });
  const smsQuery = (p: { startMs: number; endMs: number }) =>
    reader.queryRange({ source: SRC, collection: "smsLog", ...GROUP, ...p, select: SMS_SELECT });

  async function scan(kind: DistinctKind, period: Period): Promise<Set<string>> {
    const window = { startMs: period.startMs, endMs: period.endMs };
    if (kind === "active") {
      const docs: DocRecord[] = await ledgerQuery(window, ["type"]);
      return activeChamas(docs.map(toLedgerRow).filter(notNull));
    }
    return messagingChamas((await smsQuery(window)).map(toSmsRow).filter(notNull));
  }

  function distinctFor(kind: DistinctKind, period: Period): Promise<Set<string>> {
    const key = `${kind}|${period.grain}|${period.start}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const p = scan(kind, period);
    memo.set(key, p);
    return p;
  }

  return {
    id: "chama",
    async collect(ctx: CollectContext): Promise<KpiValue[]> {
      const { period, now, runId } = ctx;
      const window = { startMs: period.startMs, endMs: period.endMs };
      const base = { platform: "chama" as const, grain: "daily" as const, period, now, runId };

      const [ledgerDocs, smsDocs, chamasNew, membersNew] = await Promise.all([
        ledgerQuery(window, LEDGER_SELECT),
        smsQuery(window),
        reader.count({ source: SRC, collection: "chamas", time: { field: "createdAt", type: "epochMs", ...window } }),
        reader.count({ source: SRC, collection: "members", group: true, groupParent: "chamas", time: { field: "createdAt", type: "epochMs", ...window } }),
      ]);

      const ledger: LedgerRow[] = ledgerDocs.map(toLedgerRow).filter(notNull);
      const sms: SmsRow[] = smsDocs.map(toSmsRow).filter(notNull);

      const out: KpiValue[] = [
        ...emitMetrics(
          {
            "chama.chamas_new": { value: chamasNew },
            "chama.members_new": { value: membersNew },
            ...ledgerMetrics(ledger),
            ...smsMetrics(sms),
          },
          base
        ),
        makeValue(DISTINCT_KPI.active, { value: activeChamas(ledger).size }, base),
        makeValue(DISTINCT_KPI.messaging, { value: messagingChamas(sms).size }, base),
      ];

      for (const grain of ["weekly", "monthly"] as Grain[]) {
        const wide = periodFor(grain, period.start);
        for (const kind of Object.keys(DISTINCT_KPI) as DistinctKind[]) {
          const set = await distinctFor(kind, wide);
          out.push(makeValue(DISTINCT_KPI[kind], { value: set.size }, { platform: "chama", grain, period: wide, now, runId }));
        }
      }
      return out;
    },
  };
}
