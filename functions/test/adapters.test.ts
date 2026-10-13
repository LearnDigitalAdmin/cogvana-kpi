import { describe, expect, it } from "vitest";
import { MemoryPayReader, DAY_WINDOW, T_DAY } from "./helpers";
import { registerSmsAdapter, pmsSmsAdapter } from "../src/collectors/pay/adapters/sms";
import { pmsRentAdapter } from "../src/collectors/pay/adapters/rent";
import { pmsSubscriptionAdapter } from "../src/collectors/pay/adapters/subscription";
import { cyberServiceAdapter } from "../src/collectors/pay/adapters/cyber";
import { reportChargeAdapter } from "../src/collectors/pay/adapters/reports";
import { chamaMemberPaymentAdapter, chamaSmsAdapter, chamaPlanAdapter } from "../src/collectors/pay/adapters/chama";
import { statusOf } from "../src/collectors/pay/facts";

const ts = (ms: number) => ({ toMillis: () => ms });

describe("status vocabulary", () => {
  it("maps every source spelling to success | failed | pending", () => {
    for (const s of ["success", "paid", "completed", " SUCCESS "]) expect(statusOf(s)).toBe("success");
    for (const s of ["failed", "payment_failed", "abandoned", "reversed"]) expect(statusOf(s)).toBe("failed");
    for (const s of ["pending", "", undefined, null, "weird"]) expect(statusOf(s)).toBe("pending");
  });
});

describe("SMS credit purchases", () => {
  it("Register: whole amount is revenue; net is amount received after the Paystack fee", async () => {
    const r = new MemoryPayReader().add("register", "sms-topup-transactions/SMS_1", {
      status: "success", amountKes: 500, grossAmount: 500, paystackFees: 12.5, amountReceived: 487.5,
      schoolId: "s1", createdAt: ts(T_DAY), completedAt: ts(T_DAY + 5000),
    });
    const [f] = await registerSmsAdapter.load(r, DAY_WINDOW);
    expect(f).toMatchObject({
      platform: "register", chargeType: "register_sms", stream: "sms", status: "success",
      gmvCents: 50000, gatewayFeeCents: 1250, platformRevenueCents: 50000, netRevenueCents: 48750,
      basis: "recorded", customerRef: "register:school:s1",
    });
  });

  it("failed and pending purchases earn nothing but count as attempts", async () => {
    const r = new MemoryPayReader()
      .add("default", "sms-topup-transactions/SMS_2", { status: "failed", amountKes: 300, userId: "u1", createdAt: ts(T_DAY) })
      .add("default", "sms-topup-transactions/SMS_3", { status: "pending", amountKes: 300, userId: "u2", createdAt: ts(T_DAY) });
    const facts = await pmsSmsAdapter.load(r, DAY_WINDOW);
    expect(facts).toHaveLength(2);
    for (const f of facts) expect(f).toMatchObject({ platformRevenueCents: 0, netRevenueCents: 0, gmvCents: 30000 });
    expect(facts.find((f) => f.reference === "SMS_3")!.settledAtMs).toBeNull();
  });

  it("Register and PMS read different databases and never mix", async () => {
    const r = new MemoryPayReader()
      .add("register", "sms-topup-transactions/A", { status: "success", amountKes: 100, createdAt: ts(T_DAY) })
      .add("default", "sms-topup-transactions/B", { status: "success", amountKes: 200, createdAt: ts(T_DAY) });
    expect((await registerSmsAdapter.load(r, DAY_WINDOW)).map((f) => f.reference)).toEqual(["A"]);
    expect((await pmsSmsAdapter.load(r, DAY_WINDOW)).map((f) => f.reference)).toEqual(["B"]);
  });

  it("excludes records outside the day window", async () => {
    const r = new MemoryPayReader().add("default", "sms-topup-transactions/OLD", { status: "success", amountKes: 100, createdAt: ts(T_DAY - 86_400_000) });
    expect(await pmsSmsAdapter.load(r, DAY_WINDOW)).toHaveLength(0);
  });
});

describe("Plot Yangu rent commission", () => {
  const rent = (id: string, extra: Record<string, unknown>) => ({
    status: "success", userId: "u1", createdAt: ts(T_DAY), paystackResponse: { amount: 100000, fees: 1500, ...extra },
  });

  it("uses Paystack's recorded platform split when present (split_actual)", async () => {
    const r = new MemoryPayReader().add("default", "transactions/INV_1", rent("INV_1", { fees_split: { integration: 1500 } }));
    const [f] = await pmsRentAdapter.load(r, DAY_WINDOW);
    expect(f).toMatchObject({ gmvCents: 100000, platformRevenueCents: 1500, netRevenueCents: 1500, basis: "split_actual" });
  });

  it("falls back to the manager's tier rate and labels it an estimate", async () => {
    const r = new MemoryPayReader()
      .add("default", "users/u1", { tier: "business", password_hash: "SHOULD-NEVER-BE-READ" })
      .add("default", "transactions/INV_2", rent("INV_2", {}));
    const [f] = await pmsRentAdapter.load(r, DAY_WINDOW);
    expect(f).toMatchObject({ platformRevenueCents: 1500, basis: "rate_estimate" }); // 1.5% of KES 1,000
  });

  it("prefers the commission rate PAY recorded at account setup over the tier map", async () => {
    const r = new MemoryPayReader()
      .add("default", "users/u1", { tier: "business" })
      .add("default", "paymentAccounts/u1", { commissionRate: 1.9, tier: "PRO" })
      .add("default", "transactions/INV_6", rent("INV_6", {}));
    const [f] = await pmsRentAdapter.load(r, DAY_WINDOW);
    expect(f).toMatchObject({ platformRevenueCents: 1900, basis: "rate_recorded" }); // 1.9% of KES 1,000, not the 1.5% tier map
  });

  it("unknown or missing tier is treated as SOLO (2.4%), as PAY does", async () => {
    const r = new MemoryPayReader()
      .add("default", "users/u1", { tier: "free" })
      .add("default", "transactions/INV_3", rent("INV_3", {}));
    const [f] = await pmsRentAdapter.load(r, DAY_WINDOW);
    expect(f.platformRevenueCents).toBe(2400);
  });

  it("reads only the tier field of a user document (never the password hash)", async () => {
    const r = new MemoryPayReader()
      .add("default", "users/u1", { tier: "pro", password_hash: "x", passwordHash: "y", email: "a@b.c" })
      .add("default", "transactions/INV_4", rent("INV_4", {}));
    const spy: string[][] = [];
    const orig = r.getDocs.bind(r);
    r.getDocs = async (s, p, select) => { spy.push(select); return orig(s, p, select); };
    await pmsRentAdapter.load(r, DAY_WINDOW);
    expect(spy).toEqual([["tier"], ["commissionRate"]]); // users: tier only; paymentAccounts: rate only
  });

  it("only INV_ references count, and failed rent earns nothing", async () => {
    const r = new MemoryPayReader()
      .add("default", "transactions/OTHER_1", { status: "success", createdAt: ts(T_DAY), paystackResponse: { amount: 999, fees: 0 } })
      .add("default", "transactions/INV_5", { status: "failed", userId: "u1", createdAt: ts(T_DAY), paystackResponse: { amount: 100000, fees: 0 } });
    const facts = await pmsRentAdapter.load(r, DAY_WINDOW);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ status: "failed", platformRevenueCents: 0 });
  });
});

describe("Plot Yangu subscriptions", () => {
  const sub = (agentId: string | null) => ({
    status: "success", agentId, userId: "u9", initiatedAt: ts(T_DAY), paystackResponse: { amount: 200000, fees: 4000 },
  });

  it("with an agent: 45% of (gross - fee) is passed through, the rest is net", async () => {
    const r = new MemoryPayReader().add("default", "subscriptions/SUB_1", sub("agent1"));
    const [f] = await pmsSubscriptionAdapter.load(r, DAY_WINDOW);
    expect(f).toMatchObject({
      stream: "subscription", gmvCents: 200000, gatewayFeeCents: 4000, platformRevenueCents: 200000,
      passThroughCents: 88200, netRevenueCents: 107800, basis: "recorded",
    });
  });

  it("without an agent: net is gross minus the gateway fee", async () => {
    const r = new MemoryPayReader().add("default", "subscriptions/SUB_2", sub(null));
    const [f] = await pmsSubscriptionAdapter.load(r, DAY_WINDOW);
    expect(f).toMatchObject({ passThroughCents: 0, netRevenueCents: 196000 });
  });

  it("initiated but unpaid subscription is an attempt with no revenue", async () => {
    const r = new MemoryPayReader().add("default", "subscriptions/SUB_3", { status: "pending", amount: 2000, initiatedAt: ts(T_DAY) });
    const [f] = await pmsSubscriptionAdapter.load(r, DAY_WINDOW);
    expect(f).toMatchObject({ status: "pending", gmvCents: 200000, netRevenueCents: 0, platformRevenueCents: 0 });
  });
});

describe("Cyber services and reports", () => {
  it("cyber: company keeps 2.5% of (gross - fee); the fee comes out of the agent's share", async () => {
    const r = new MemoryPayReader().add("default", "cyber-transactions/CYBER_1", {
      status: "success", uid: "a1", createdAt: ts(T_DAY), paystackResponse: { amount: 104000, fees: 4000 },
    });
    const [f] = await cyberServiceAdapter.load(r, DAY_WINDOW);
    expect(f).toMatchObject({ stream: "commission", gmvCents: 104000, platformRevenueCents: 2500, netRevenueCents: 2500, basis: "recorded" });
  });

  it("report charge: whole amount is revenue; net after Paystack fee (decimal KES in source)", async () => {
    const r = new MemoryPayReader().add("default", "report_charges/REPORT_1", {
      status: "success", shopId: "sh1", createdAtTimestamp: T_DAY, paystackResponse: { amount: 50, fees: 1.5 },
    });
    const [f] = await reportChargeAdapter.load(r, DAY_WINDOW);
    expect(f).toMatchObject({ stream: "reports", gmvCents: 5000, gatewayFeeCents: 150, platformRevenueCents: 5000, netRevenueCents: 4850 });
  });
});

describe("Chama", () => {
  it("member payments: revenue is our markup only; the Paystack fee sits inside the payer's gross", async () => {
    const r = new MemoryPayReader().add("chama", "chamas/c1/paymentIntents/MCW-c1-1", {
      status: "success", amount: 1000, grossAmount: 1010, paystackFee: 6.5, ourFee: 3.5, createdAt: T_DAY, updatedAt: T_DAY + 4000,
    });
    const [f] = await chamaMemberPaymentAdapter.load(r, DAY_WINDOW);
    expect(f).toMatchObject({
      platform: "chama", stream: "markup", gmvCents: 101000, gatewayFeeCents: 650,
      platformRevenueCents: 350, netRevenueCents: 350, customerRef: "chama:c1", basis: "recorded",
    });
  });

  it("SMS credits and plan billing: amount sold, fee not recorded so flagged unverified", async () => {
    const r = new MemoryPayReader()
      .add("chama", "chamas/c1/smsTopUps/MCS-1", { status: "success", amountKes: 500, createdAt: T_DAY })
      .add("chama", "chamas/c2/planBilling/MCP-1", { status: "success", amountKes: 999, plan: "basic", createdAt: T_DAY })
      .add("chama", "chamas/c2/planBilling/MCP-2", { status: "failed", amountKes: 999, createdAt: T_DAY });
    const sms = await chamaSmsAdapter.load(r, DAY_WINDOW);
    const plans = await chamaPlanAdapter.load(r, DAY_WINDOW);
    expect(sms[0]).toMatchObject({ stream: "sms", netRevenueCents: 50000, basis: "gross_fee_unknown" });
    expect(plans).toHaveLength(2);
    expect(plans.find((p) => p.reference === "MCP-1")).toMatchObject({ stream: "subscription", platformRevenueCents: 99900 });
    expect(plans.find((p) => p.reference === "MCP-2")).toMatchObject({ status: "failed", platformRevenueCents: 0 });
  });

  it("queries Chama as a collection group with a per-chama fallback parent", async () => {
    const r = new MemoryPayReader();
    await chamaSmsAdapter.load(r, DAY_WINDOW);
    expect(r.queries[0]).toMatchObject({ source: "chama", group: true, groupParent: "chamas", timeType: "epochMs" });
  });
});

describe("read discipline", () => {
  it("every adapter query lists explicit fields (no whole-document reads)", async () => {
    const r = new MemoryPayReader();
    for (const a of [registerSmsAdapter, pmsSmsAdapter, pmsRentAdapter, pmsSubscriptionAdapter, cyberServiceAdapter, reportChargeAdapter, chamaMemberPaymentAdapter, chamaSmsAdapter, chamaPlanAdapter]) {
      await a.load(r, DAY_WINDOW);
    }
    expect(r.queries.length).toBeGreaterThan(0);
    for (const q of r.queries) {
      expect(q.select.length).toBeGreaterThan(0);
      expect(q.select.join(",")).not.toMatch(/password|phone|email|hash/i);
    }
  });
});
