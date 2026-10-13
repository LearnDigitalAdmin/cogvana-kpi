import { SourceReader, DocRecord } from "../../core/reader";
import { dailyPeriod, dayBounds, addDays, nairobiDay } from "../../core/period";
import { num, pct, toCents } from "../../core/money";
import { makeValue, Metric } from "../../core/values";
import { KpiValue } from "../../core/types";
import { chamaIdOf } from "./ledger";

const SRC = "chama" as const;
const PLANS = ["free", "starter", "basic", "growth", "max"] as const;
const BATCH = 8;

/** Unpaid and past-due amounts (cents) for one loan's repayment schedule. */
export function loanPosition(schedule: unknown, today: string): { outstanding: number; pastDue: number } {
  let outstanding = 0;
  let pastDue = 0;
  if (!Array.isArray(schedule)) return { outstanding, pastDue };
  for (const raw of schedule) {
    if (!raw || typeof raw !== "object") continue;
    const inst = raw as Record<string, unknown>;
    if (inst.paid === true) continue;
    const remaining = toCents(Math.max(0, (num(inst.due) ?? 0) - (num(inst.paidAmount) ?? 0)));
    outstanding += remaining;
    if (typeof inst.dueDate === "string" && inst.dueDate < today) pastDue += remaining;
  }
  return { outstanding, pastDue };
}

async function inBatches<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += BATCH) out.push(...(await Promise.all(items.slice(i, i + BATCH).map(fn))));
  return out;
}

/**
 * Stock metrics ("how much is there right now"). They cannot be rebuilt for past days, so they are
 * snapshotted at 23:55 Nairobi and history starts at go-live. Counts and sums use aggregation queries;
 * loans, overdue contributions and active pots are read with explicit field lists (no names or phones).
 */
export async function snapshotChama(reader: SourceReader, now: number, runId: string): Promise<KpiValue[]> {
  const today = nairobiDay(now);
  const period = dailyPeriod(today);
  const horizon = { startMs: dayBounds(today).startMs, endMs: dayBounds(addDays(today, 15)).startMs };

  const [chamas, planCounts, expiring, members, smsCredits, reportCredits, loans, overdue, pots] = await Promise.all([
    reader.count({ source: SRC, collection: "chamas" }),
    Promise.all(PLANS.map((p) => reader.count({ source: SRC, collection: "chamas", equals: { field: "plan", value: p } }))),
    reader.count({ source: SRC, collection: "chamas", time: { field: "planExpiry", type: "dateString", ...horizon } }),
    reader.count({ source: SRC, collection: "members", group: true, groupParent: "chamas", equals: { field: "status", value: "active" } }),
    reader.sum({ source: SRC, collection: "chamas" }, "smsCredits"),
    reader.sum({ source: SRC, collection: "chamas" }, "reportCreditsBalance"),
    Promise.all(
      ["active", "overdue"].map((status) =>
        reader.queryEquals({ source: SRC, collection: "loans", group: true, groupParent: "chamas", field: "status", value: status, select: ["schedule"] })
      )
    ),
    reader.queryEquals({ source: SRC, collection: "contributions", group: true, groupParent: "chamas", field: "status", value: "overdue", select: ["amount", "paidAmount"] }),
    reader.queryEquals({ source: SRC, collection: "mgrPots", group: true, groupParent: "chamas", field: "status", value: "active", select: ["pendingShortfall"] }),
  ]);

  // Loans: only loans under chamas/{id}/loans count.
  const openLoans = loans.flat().filter((l) => chamaIdOf(l.path));
  let outstanding = 0;
  let atRiskBalance = 0;
  let atRiskCount = 0;
  for (const l of openLoans) {
    const pos = loanPosition(l.data.schedule, today);
    outstanding += pos.outstanding;
    if (pos.pastDue > 0) {
      atRiskBalance += pos.outstanding;
      atRiskCount++;
    }
  }

  // Overdue contributions.
  const overdueRows = overdue.filter((c) => chamaIdOf(c.path));
  const overdueAmount = overdueRows.reduce((t, c) => t + toCents(Math.max(0, (num(c.data.amount) ?? 0) - (num(c.data.paidAmount) ?? 0))), 0);
  const overdueChamas = new Set(overdueRows.map((c) => chamaIdOf(c.path)));

  // MGR: pending shortfall on active pots, then open arrears under each active pot.
  const activePots = pots.filter((p) => chamaIdOf(p.path));
  const shortfall = activePots.reduce((t, p) => t + toCents(num(p.data.pendingShortfall) ?? 0), 0);
  const arrearLists: DocRecord[][] = await inBatches(activePots, (p) =>
    reader.queryPath({ source: SRC, path: `${p.path}/arrears`, equals: { field: "status", value: "open" }, select: ["amount", "settledAmount"] })
  );
  const arrears = arrearLists.flat();
  const arrearsAmount = arrears.reduce((t, a) => t + toCents(Math.max(0, (num(a.data.amount) ?? 0) - (num(a.data.settledAmount) ?? 0))), 0);

  const metrics: Record<string, Metric> = {
    "chama.chamas_total": { value: chamas },
    "chama.paid_plans_expiring_14d": { value: expiring },
    "chama.members_active": { value: members },
    "chama.sms_credits_outstanding": { value: smsCredits },
    "chama.report_credits_outstanding": { value: reportCredits },
    "chama.loans_active": { value: openLoans.length },
    "chama.loans_outstanding_balance": { value: outstanding },
    "chama.loans_at_risk_count": { value: atRiskCount },
    "chama.loans_at_risk_balance": { value: atRiskBalance },
    "chama.portfolio_at_risk": { value: pct(atRiskBalance, outstanding), numerator: atRiskBalance, denominator: outstanding },
    "chama.contributions_overdue_count": { value: overdueRows.length },
    "chama.contributions_overdue_amount": { value: overdueAmount },
    "chama.chamas_with_overdue_contributions": { value: overdueChamas.size },
    "chama.mgr_pots_active": { value: activePots.length },
    "chama.mgr_pending_shortfall": { value: shortfall },
    "chama.mgr_arrears_open_count": { value: arrears.length },
    "chama.mgr_arrears_open_amount": { value: arrearsAmount },
  };

  const base = { platform: "chama" as const, grain: "daily" as const, period, now, runId, complete: false };
  const out = Object.entries(metrics).map(([kpiId, m]) => makeValue(kpiId, m, base));
  PLANS.forEach((plan, i) => out.push(makeValue("chama.chamas_by_plan", { value: planCounts[i] }, { ...base, dimensions: { plan } })));
  return out;
}
