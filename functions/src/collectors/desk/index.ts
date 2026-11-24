import { CollectContext, Collector, Grain, KpiValue, Period } from "../../core/types";
import { dailyPeriod, nairobiDay, periodFor } from "../../core/period";
import { SourceReader } from "../../core/reader";
import { makeValue, Metric } from "../../core/values";
import { num, pct } from "../../core/money";

const SRC = "default" as const;
const PLATFORM = "cyber" as const;

/**
 * Samuhia Desk collector. Source: the default database (`desk_*` collections written by the Desk functions and by PAY's
 * webhooks). Times are epoch ms and money is integer minor units (KES x 100). Read-only, and never selects names, phones,
 * emails, ID numbers, request or support text, or documents.
 *
 * Flow KPIs are dated by creation (or payment) time, so recent days settle as tickets get paid and requests get answered;
 * the nightly 3-day lookback corrects them. Stock KPIs are snapshotted at 23:55 Nairobi (see `snapshotDesk`).
 */
export const PRODUCTS = ["chama", "school", "pms"] as const;
export const AGENT_STATUSES = ["applied", "training", "certified", "active", "suspended", "closed"] as const;
const PAID_TICKET = new Set(["paid", "committed"]);
const FAILED_TICKET = new Set(["failed", "expired"]);
const EVENT_TYPES = new Set(["sms_purchase", "subscription_payment", "report_purchase", "rent_payment"]);

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const n0 = (v: unknown): number => num(v) ?? 0;

/** "chama:SMC-0042" -> "chama". Unknown or missing prefixes return "". */
export function productOf(entityKey: unknown): string {
  const p = str(entityKey).split(":")[0];
  return (PRODUCTS as readonly string[]).includes(p) ? p : "";
}

/** What an agent's automatic split pays: floor((gross - fee) x share), exactly as PAY's settledAmounts. */
export function agentShareMinor(grossMinor: number, feeMinor: number, sharePct: number): number {
  const net = Math.max(0, grossMinor - feeMinor);
  return Math.floor((net * Math.round(sharePct * 100)) / 10000);
}

type Dims = Record<string, string>;
class Out {
  readonly values: KpiValue[] = [];
  constructor(private base: { grain: Grain; period: Period; now: number; runId: string }) {}
  put(kpiId: string, m: Metric, dimensions: Dims = {}, over?: { grain: Grain; period: Period }): void {
    this.values.push(makeValue(kpiId, m, { platform: PLATFORM, ...this.base, ...(over ?? {}), dimensions }));
  }
  /** Total plus one value per dimension member (members with no activity are simply absent). */
  split(kpiId: string, dim: string, by: Map<string, number>, total: number): void {
    this.put(kpiId, { value: total });
    for (const [k, v] of by) if (k) this.put(kpiId, { value: v }, { [dim]: k });
  }
}
const bump = (m: Map<string, number>, k: string, by = 1): void => void m.set(k, (m.get(k) ?? 0) + by);

export function createDeskCollector(reader: SourceReader): Collector {
  const memo = new Map<string, Promise<{ agents: Set<string>; customers: Set<string> }>>();

  /** Distinct agents (any session) and customers (verified session) over a wider period. */
  function distinctFor(period: Period): Promise<{ agents: Set<string>; customers: Set<string> }> {
    const key = `${period.grain}|${period.start}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const p = (async () => {
      const docs = await reader.queryRange({
        source: SRC, collection: "desk_sessions", timeField: "createdAt", timeType: "epochMs",
        startMs: period.startMs, endMs: period.endMs, select: ["agentId", "entityKey", "otpVerifiedAt"],
      });
      const agents = new Set<string>(); const customers = new Set<string>();
      for (const d of docs) {
        if (str(d.data.agentId)) agents.add(str(d.data.agentId));
        if (n0(d.data.otpVerifiedAt) > 0 && str(d.data.entityKey)) customers.add(str(d.data.entityKey));
      }
      return { agents, customers };
    })();
    memo.set(key, p);
    return p;
  }

  return {
    id: "desk",
    async collect(ctx: CollectContext): Promise<KpiValue[]> {
      const { period, now, runId } = ctx;
      const out = new Out({ grain: "daily", period, now, runId });
      const range = (collection: string, timeField: string, select: string[]) =>
        reader.queryRange({ source: SRC, collection, timeField, timeType: "epochMs", startMs: period.startMs, endMs: period.endMs, select });

      const [applied, sessions, tickets, events, ledger, requests, support, rent] = await Promise.all([
        reader.count({ source: SRC, collection: "desk_agents", time: { field: "createdAt", type: "epochMs", startMs: period.startMs, endMs: period.endMs } }),
        range("desk_sessions", "createdAt", ["agentId", "entityKey", "otpVerifiedAt"]),
        range("desk_tickets", "createdAt", ["status", "serviceType", "amountMinor", "grossMinor", "platformMinor"]),
        range("desk_events", "paidAt", ["type", "product", "grossMinor", "feeMinor", "agentSharePct", "credits"]),
        range("desk_ledger", "createdAt", ["kind", "status", "amountMinor"]),
        range("desk_requests", "createdAt", ["source", "status"]),
        range("desk_support", "createdAt", ["category", "customerConfirmedAt"]),
        range("desk_rent_batches", "createdAt", ["results"]),
      ]);

      out.put("desk.agents_applied", { value: applied });

      // ---- sessions ----
      const sByProduct = new Map<string, number>();
      let verified = 0;
      for (const s of sessions) {
        bump(sByProduct, productOf(s.data.entityKey));
        if (n0(s.data.otpVerifiedAt) > 0) verified++;
      }
      out.split("desk.sessions_started", "product", sByProduct, sessions.length);
      out.put("desk.sessions_verified", { value: verified });
      if (sessions.length > 0) out.put("desk.session_verify_rate", { value: pct(verified, sessions.length), numerator: verified, denominator: sessions.length });

      // ---- tickets ----
      const created = new Map<string, number>(); const paid = new Map<string, number>(); const sales = new Map<string, number>();
      let paidN = 0, notCommitted = 0, failed = 0, salesTotal = 0, platformTotal = 0;
      for (const t of tickets) {
        const type = str(t.data.serviceType); const status = str(t.data.status);
        bump(created, type);
        if (PAID_TICKET.has(status)) {
          paidN++; bump(paid, type);
          const gross = n0(t.data.grossMinor) || n0(t.data.amountMinor);
          salesTotal += gross; bump(sales, type, gross); platformTotal += n0(t.data.platformMinor);
          if (status === "paid") notCommitted++;
        } else if (FAILED_TICKET.has(status)) failed++;
      }
      out.split("desk.tickets_created", "serviceType", created, tickets.length);
      out.split("desk.tickets_paid", "serviceType", paid, paidN);
      if (tickets.length > 0) out.put("desk.ticket_conversion", { value: pct(paidN, tickets.length), numerator: paidN, denominator: tickets.length });
      out.put("desk.tickets_paid_not_committed", { value: notCommitted });
      out.put("desk.tickets_failed", { value: failed });
      out.split("desk.service_sales", "serviceType", sales, salesTotal);
      out.put("desk.service_platform_revenue", { value: platformTotal });

      // ---- attributed sales (PAY-written events) ----
      type Cell = { count: number; gross: number; agent: number; kept: number };
      const cells = new Map<string, Cell>();
      let refunds = 0, credits = 0;
      for (const e of events) {
        const type = str(e.data.type);
        if (type === "refund") { refunds++; continue; }
        if (!EVENT_TYPES.has(type)) continue;
        const gross = n0(e.data.grossMinor); const fee = n0(e.data.feeMinor);
        const agent = agentShareMinor(gross, fee, n0(e.data.agentSharePct));
        const key = `${str(e.data.product)}|${type}`;
        const c = cells.get(key) ?? { count: 0, gross: 0, agent: 0, kept: 0 };
        c.count++; c.gross += gross; c.agent += agent; c.kept += Math.max(0, gross - fee) - agent;
        cells.set(key, c);
        if (type === "sms_purchase") credits += n0(e.data.credits);
      }
      const sum = (k: keyof Cell) => [...cells.values()].reduce((t, c) => t + c[k], 0);
      const emitCells = (kpiId: string, k: keyof Cell) => {
        out.put(kpiId, { value: sum(k) });
        for (const [key, c] of cells) { const [product, type] = key.split("|"); out.put(kpiId, { value: c[k] }, { product, type }); }
      };
      emitCells("desk.attributed_sales", "count");
      emitCells("desk.attributed_gmv", "gross");
      emitCells("desk.agent_share_paid", "agent");
      emitCells("desk.net_kept_by_samuhia", "kept");
      out.put("desk.refunds", { value: refunds });
      out.put("desk.sms_credits_sold", { value: credits });

      // ---- agent earnings (ledger) ----
      const earn = new Map<string, number>(); let earnTotal = 0, reversals = 0;
      for (const l of ledger) {
        const kind = str(l.data.kind); const status = str(l.data.status); const amt = n0(l.data.amountMinor);
        if (status === "void") continue;
        if (kind === "reversal") { reversals += Math.abs(amt); continue; }
        earnTotal += amt; bump(earn, kind, amt);
      }
      out.split("desk.agent_earnings", "kind", earn, earnTotal);
      out.put("desk.reversals", { value: reversals });

      // ---- support ----
      const cats = new Map<string, number>(); let confirmed = 0;
      for (const s of support) { bump(cats, str(s.data.category)); if (n0(s.data.customerConfirmedAt) > 0) confirmed++; }
      out.split("desk.support_visits_logged", "category", cats, support.length);
      out.put("desk.support_visits_confirmed", { value: confirmed });
      if (support.length > 0) out.put("desk.support_confirm_rate", { value: pct(confirmed, support.length), numerator: confirmed, denominator: support.length });

      const reqBySource = new Map<string, number>(); let answered = 0;
      for (const r of requests) { bump(reqBySource, str(r.data.source)); if (["answered", "closed"].includes(str(r.data.status))) answered++; }
      out.split("desk.requests_new", "source", reqBySource, requests.length);
      out.put("desk.requests_answered", { value: answered });

      // ---- rent batches ----
      let sent = 0, rentFailed = 0;
      for (const b of rent) {
        const results = Array.isArray(b.data.results) ? (b.data.results as Array<Record<string, unknown>>) : [];
        for (const r of results) { if (r?.status === "sent") sent++; else if (r?.status === "failed") rentFailed++; }
      }
      out.put("desk.rent_batches", { value: rent.length });
      out.put("desk.rent_stk_sent", { value: sent });
      out.put("desk.rent_stk_failed", { value: rentFailed });

      // ---- distinct agents and customers: daily, weekly, monthly ----
      const dayAgents = new Set<string>(); const dayCustomers = new Set<string>();
      for (const s of sessions) {
        if (str(s.data.agentId)) dayAgents.add(str(s.data.agentId));
        if (n0(s.data.otpVerifiedAt) > 0 && str(s.data.entityKey)) dayCustomers.add(str(s.data.entityKey));
      }
      out.put("desk.agents_working", { value: dayAgents.size });
      out.put("desk.customers_served", { value: dayCustomers.size });
      for (const grain of ["weekly", "monthly"] as Grain[]) {
        const wide = periodFor(grain, period.start);
        const set = await distinctFor(wide);
        out.put("desk.agents_working", { value: set.agents.size }, {}, { grain, period: wide });
        out.put("desk.customers_served", { value: set.customers.size }, {}, { grain, period: wide });
      }
      return out.values;
    },
  };
}

/** Stock snapshot (23:55 Nairobi): agents, owned customers, payouts waiting and the help-request backlog. None keeps history. */
export async function snapshotDesk(reader: SourceReader, now: number, runId: string): Promise<KpiValue[]> {
  const period = dailyPeriod(nairobiDay(now));
  const out = new Out({ grain: "daily", period, now, runId });
  const eq = (collection: string, field: string, value: string | number | boolean) =>
    ({ source: SRC, collection, equals: { field, value } });
  const stock = (kpiId: string, m: Metric, dims: Dims = {}) =>
    out.values.push(makeValue(kpiId, m, { platform: PLATFORM, grain: "daily", period, now, runId, dimensions: dims, complete: false }));

  const [byStatus, byProduct, bought, payable, processing, reqNew, reqOpen] = await Promise.all([
    Promise.all(AGENT_STATUSES.map((s) => reader.count(eq("desk_agents", "status", s)))),
    Promise.all(PRODUCTS.map((p) => reader.count(eq("desk_customers", "product", p)))),
    reader.count(eq("desk_customers", "firstPurchaseUsed", true)),
    reader.sum(eq("desk_ledger", "status", "payable"), "amountMinor"),
    reader.count(eq("desk_ledger", "status", "processing")),
    reader.count(eq("desk_requests", "status", "new")),
    reader.count(eq("desk_requests", "status", "open")),
  ]);

  stock("desk.agents", { value: byStatus.reduce((a, b) => a + b, 0) });
  AGENT_STATUSES.forEach((s, i) => stock("desk.agents", { value: byStatus[i] }, { status: s }));
  stock("desk.agents_active", { value: byStatus[AGENT_STATUSES.indexOf("active")] });
  stock("desk.customers_owned", { value: byProduct.reduce((a, b) => a + b, 0) });
  PRODUCTS.forEach((p, i) => stock("desk.customers_owned", { value: byProduct[i] }, { product: p }));
  stock("desk.customers_first_purchase_done", { value: bought });
  stock("desk.payable_outstanding", { value: payable });
  stock("desk.payouts_processing", { value: processing });
  stock("desk.requests_open", { value: reqNew + reqOpen });
  stock("desk.requests_open", { value: reqNew }, { status: "new" });
  stock("desk.requests_open", { value: reqOpen }, { status: "open" });
  return out.values;
}
