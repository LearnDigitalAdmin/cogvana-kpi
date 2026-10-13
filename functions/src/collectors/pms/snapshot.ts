import { SourceReader } from "../../core/reader";
import { dailyPeriod, nairobiDay } from "../../core/period";
import { makeValue, Metric } from "../../core/values";
import { KpiValue } from "../../core/types";
import { pct } from "../../core/money";
import { accountMetrics, loadPmsUsers, tierCounts } from "./users";
import { collectionRate, receivables, userIdOf } from "./billing";

const SRC = "default" as const;
const GROUP = { group: true, groupParent: "users" } as const;

function monthOf(day: string): string {
  return day.slice(0, 7);
}
function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Stock metrics for Plot Yangu, snapshotted at 23:55 Nairobi (history starts at go-live). All figures are as of each
 * manager's last sync. Units live two levels deep (users/{u}/properties/{p}/units), so their counts need the group
 * index in source-indexes/plot-9fd6e.indexes-to-add.json (no fallback exists for nested groups).
 */
export async function snapshotPms(reader: SourceReader, now: number, runId: string): Promise<KpiValue[]> {
  const today = nairobiDay(now);
  const period = dailyPeriod(today);
  const thisMonth = monthOf(today);
  const months = [thisMonth, previousMonth(thisMonth)];

  const [users, properties, units, occupied, tenants, unpaid, ...monthInvoices] = await Promise.all([
    loadPmsUsers(reader),
    reader.count({ source: SRC, collection: "properties", ...GROUP }),
    reader.count({ source: SRC, collection: "units", group: true }),
    reader.count({ source: SRC, collection: "units", group: true, equals: { field: "isOccupied", value: true } }),
    reader.queryEquals({ source: SRC, collection: "tenants", ...GROUP, field: "isActive", value: true, select: [] }),
    reader.queryEquals({ source: SRC, collection: "invoices", ...GROUP, field: "isPaid", value: false, select: ["totalAmount", "amountPaid", "dueDate"] }),
    ...months.map((m) => reader.queryEquals({ source: SRC, collection: "invoices", ...GROUP, field: "billingMonth", value: m, select: ["totalAmount", "amountPaid"] })),
  ]);

  const activeTenants = tenants.filter((t) => userIdOf(t.path, "tenants")).length;
  const metrics: Record<string, Metric> = {
    ...accountMetrics(users, now),
    "pms.properties_total": { value: properties },
    "pms.tenants_active": { value: activeTenants },
    "pms.units_total": { value: units },
    "pms.units_occupied": { value: occupied },
    "pms.occupancy_rate": { value: pct(occupied, units), numerator: occupied, denominator: units },
    ...receivables(unpaid, today),
  };

  const base = { platform: "pms" as const, grain: "daily" as const, period, now, runId, complete: false };
  const out = Object.entries(metrics).map(([kpiId, m]) => makeValue(kpiId, m, base));
  for (const [tier, n] of Object.entries(tierCounts(users))) {
    out.push(makeValue("pms.users_by_tier", { value: n }, { ...base, dimensions: { tier } }));
  }
  months.forEach((month, i) => out.push(makeValue("pms.collection_rate", collectionRate(monthInvoices[i]), { ...base, dimensions: { month } })));
  return out;
}
