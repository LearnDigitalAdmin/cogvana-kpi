import { describe, expect, it } from "vitest";
import { DAY, MemoryPayReader, NOW, T_DAY } from "./helpers";
import { agentShareMinor, createDeskCollector, productOf, snapshotDesk } from "../src/collectors/desk";
import { dailyPeriod } from "../src/core/period";
import { KpiValue } from "../src/core/types";
import { DESK_DEFINITIONS } from "../src/registry/desk";

const find = (v: KpiValue[], id: string, dims: Record<string, string> = {}, grain = "daily") =>
  v.find((x) => x.kpiId === id && x.grain === grain && JSON.stringify(x.dimensions) === JSON.stringify(dims));
const collect = (r: MemoryPayReader) => createDeskCollector(r).collect({ period: dailyPeriod(DAY), runId: "t", now: NOW });

describe("helpers", () => {
  it("reads the product from an entity key", () => {
    expect(productOf("chama:SMC-0042")).toBe("chama");
    expect(productOf("school:12345678")).toBe("school");
    expect(productOf("pms:PYL-0007")).toBe("pms");
    expect(productOf("other:1")).toBe("");
    expect(productOf(undefined)).toBe("");
  });
  it("agent share is floor((gross - fee) x share), like PAY", () => {
    expect(agentShareMinor(10000, 150, 25)).toBe(2462); // 9850 x 25% = 2462.5 -> 2462
    expect(agentShareMinor(1000, 2000, 30)).toBe(0);
  });
  it("every Desk KPI is registered once and the definitions are all platform cyber", () => {
    expect(new Set(DESK_DEFINITIONS.map((d) => d.id)).size).toBe(DESK_DEFINITIONS.length);
    expect(DESK_DEFINITIONS.every((d) => d.platform === "cyber" && d.id.startsWith("desk."))).toBe(true);
  });
});

describe("Desk collector", () => {
  it("an empty day gives zeros for counts and no ratios", async () => {
    const vals = await collect(new MemoryPayReader());
    expect(find(vals, "desk.sessions_started")!.value).toBe(0);
    expect(find(vals, "desk.agents_working")!.value).toBe(0);
    expect(find(vals, "desk.session_verify_rate")).toBeUndefined();
    expect(find(vals, "desk.ticket_conversion")).toBeUndefined();
  });

  it("sessions, tickets, attributed sales, earnings, support, requests and rent batches", async () => {
    const t = T_DAY;
    const r = new MemoryPayReader()
      .add("default", "desk_agents/a1", { createdAt: t, status: "applied" })
      .add("default", "desk_sessions/s1", { agentId: "a1", entityKey: "chama:SMC-1", createdAt: t, otpVerifiedAt: t + 1 })
      .add("default", "desk_sessions/s2", { agentId: "a1", entityKey: "school:777", createdAt: t })
      .add("default", "desk_sessions/s3", { agentId: "a2", entityKey: "chama:SMC-1", createdAt: t, otpVerifiedAt: t + 5 })
      .add("default", "desk_sessions/old", { agentId: "a3", entityKey: "pms:PYL-1", createdAt: t - 3 * 86_400_000, otpVerifiedAt: t })
      .add("default", "desk_tickets/t1", { status: "committed", serviceType: "import_excel", amountMinor: 20000, grossMinor: 20000, platformMinor: 400, createdAt: t })
      .add("default", "desk_tickets/t2", { status: "paid", serviceType: "manual_entry", amountMinor: 40000, createdAt: t })
      .add("default", "desk_tickets/t3", { status: "expired", serviceType: "import_excel", amountMinor: 20000, createdAt: t })
      .add("default", "desk_tickets/t4", { status: "awaiting_payment", serviceType: "import_excel", amountMinor: 20000, createdAt: t })
      .add("default", "desk_events/e1", { type: "sms_purchase", product: "school", grossMinor: 10000, feeMinor: 150, agentSharePct: 25, credits: 400, paidAt: t })
      .add("default", "desk_events/e2", { type: "subscription_payment", product: "pms", grossMinor: 50000, feeMinor: 750, agentSharePct: 30, paidAt: t })
      .add("default", "desk_events/e3", { type: "refund", product: "pms", grossMinor: 50000, feeMinor: 750, agentSharePct: 30, paidAt: t, originalRef: "x" })
      .add("default", "desk_ledger/l1", { kind: "commission", status: "settled", amountMinor: 2462, createdAt: t })
      .add("default", "desk_ledger/l2", { kind: "bonus", status: "payable", amountMinor: 200000, createdAt: t })
      .add("default", "desk_ledger/l3", { kind: "bonus", status: "void", amountMinor: 200000, createdAt: t })
      .add("default", "desk_ledger/l4", { kind: "reversal", status: "settled", amountMinor: -500, createdAt: t })
      .add("default", "desk_support/p1", { category: "sms", customerConfirmedAt: t + 9, createdAt: t })
      .add("default", "desk_support/p2", { category: "setup", createdAt: t })
      .add("default", "desk_requests/q1", { source: "chama", status: "new", createdAt: t })
      .add("default", "desk_requests/q2", { source: "school", status: "answered", createdAt: t })
      .add("default", "desk_rent_batches/b1", { createdAt: t, results: [{ tenantId: "1", status: "sent" }, { tenantId: "2", status: "sent" }, { tenantId: "3", status: "failed" }] });
    const v = await collect(r);

    expect(find(v, "desk.agents_applied")!.value).toBe(1);
    expect(find(v, "desk.sessions_started")!.value).toBe(3);
    expect(find(v, "desk.sessions_started", { product: "chama" })!.value).toBe(2);
    expect(find(v, "desk.sessions_verified")!.value).toBe(2);
    expect(find(v, "desk.session_verify_rate")).toMatchObject({ value: 66.67, numerator: 2, denominator: 3 });
    expect(find(v, "desk.agents_working")!.value).toBe(2);
    expect(find(v, "desk.agents_working", {}, "weekly")!.value).toBe(2); // old session is in a previous week
    expect(find(v, "desk.customers_served")!.value).toBe(1); // only chama:SMC-1 verified today
    expect(find(v, "desk.customers_served", {}, "monthly")!.value).toBe(2); // + pms:PYL-1 earlier in the month

    expect(find(v, "desk.tickets_created")!.value).toBe(4);
    expect(find(v, "desk.tickets_created", { serviceType: "import_excel" })!.value).toBe(3);
    expect(find(v, "desk.tickets_paid")!.value).toBe(2);
    expect(find(v, "desk.ticket_conversion")).toMatchObject({ value: 50, numerator: 2, denominator: 4 });
    expect(find(v, "desk.tickets_paid_not_committed")!.value).toBe(1);
    expect(find(v, "desk.tickets_failed")!.value).toBe(1);
    expect(find(v, "desk.service_sales")!.value).toBe(60000);
    expect(find(v, "desk.service_platform_revenue")!.value).toBe(400);

    expect(find(v, "desk.attributed_sales")!.value).toBe(2); // refund excluded
    expect(find(v, "desk.attributed_gmv", { product: "school", type: "sms_purchase" })!.value).toBe(10000);
    expect(find(v, "desk.agent_share_paid", { product: "school", type: "sms_purchase" })!.value).toBe(2462);
    expect(find(v, "desk.agent_share_paid")!.value).toBe(2462 + 14775); // 49250 x 30% = 14775
    expect(find(v, "desk.net_kept_by_samuhia")!.value).toBe(9850 - 2462 + 49250 - 14775);
    expect(find(v, "desk.refunds")!.value).toBe(1);
    expect(find(v, "desk.sms_credits_sold")!.value).toBe(400);

    expect(find(v, "desk.agent_earnings")!.value).toBe(202462); // void and reversal excluded
    expect(find(v, "desk.agent_earnings", { kind: "bonus" })!.value).toBe(200000);
    expect(find(v, "desk.reversals")!.value).toBe(500);

    expect(find(v, "desk.support_visits_logged")!.value).toBe(2);
    expect(find(v, "desk.support_visits_confirmed")!.value).toBe(1);
    expect(find(v, "desk.support_confirm_rate")).toMatchObject({ value: 50 });
    expect(find(v, "desk.requests_new", { source: "chama" })!.value).toBe(1);
    expect(find(v, "desk.requests_answered")!.value).toBe(1);

    expect(find(v, "desk.rent_batches")!.value).toBe(1);
    expect(find(v, "desk.rent_stk_sent")!.value).toBe(2);
    expect(find(v, "desk.rent_stk_failed")!.value).toBe(1);
  });

  it("never selects personal fields", async () => {
    const r = new MemoryPayReader();
    await collect(r);
    const selected = new Set(r.queries.flatMap((q) => q.select));
    for (const banned of ["name", "phone", "email", "idHash", "idNumberMasked", "message", "subject", "requesterPhone", "requesterName", "notes", "responses", "otpHash"]) {
      expect(selected.has(banned)).toBe(false);
    }
  });
});

describe("Desk snapshot", () => {
  it("counts agents by status, owned customers, payouts waiting and the request backlog", async () => {
    const r = new MemoryPayReader()
      .add("default", "desk_agents/a", { status: "active" })
      .add("default", "desk_agents/b", { status: "active" })
      .add("default", "desk_agents/c", { status: "training" })
      .add("default", "desk_customers/x", { product: "chama", firstPurchaseUsed: true })
      .add("default", "desk_customers/y", { product: "school", firstPurchaseUsed: false })
      .add("default", "desk_ledger/p", { status: "payable", amountMinor: 200000 })
      .add("default", "desk_ledger/q", { status: "payable", amountMinor: 5000 })
      .add("default", "desk_ledger/r", { status: "processing", amountMinor: 1 })
      .add("default", "desk_requests/1", { status: "new" })
      .add("default", "desk_requests/2", { status: "open" })
      .add("default", "desk_requests/3", { status: "closed" });
    const v = await snapshotDesk(r, NOW, "t");
    expect(find(v, "desk.agents")!.value).toBe(3);
    expect(find(v, "desk.agents", { status: "active" })!.value).toBe(2);
    expect(find(v, "desk.agents_active")!.value).toBe(2);
    expect(find(v, "desk.customers_owned")!.value).toBe(2);
    expect(find(v, "desk.customers_owned", { product: "chama" })!.value).toBe(1);
    expect(find(v, "desk.customers_first_purchase_done")!.value).toBe(1);
    expect(find(v, "desk.payable_outstanding")!.value).toBe(205000);
    expect(find(v, "desk.payouts_processing")!.value).toBe(1);
    expect(find(v, "desk.requests_open")!.value).toBe(2);
    expect(find(v, "desk.requests_open", { status: "new" })!.value).toBe(1);
    expect(v.every((x) => x.complete === false)).toBe(true);
  });
});
