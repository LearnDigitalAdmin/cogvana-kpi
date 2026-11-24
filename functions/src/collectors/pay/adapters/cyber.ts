import { PayAdapter } from "./types";
import { PaymentFact, STREAM_BY_CHARGE_TYPE, get, statusOf } from "../facts";
import { toCents, num } from "../../../core/money";
import { toMillis } from "../../../core/timestamps";
import { CYBER_COMMISSION_PCT } from "./config";
import { firstMillis, percentOf, subunits } from "./common";

/**
 * CYBER services (CYBER_ references, including Samuhia Desk service tickets, CYBER_DSK_). The payer's money belongs to the cyber
 * agent or desk agent; the company keeps a commission on (gross - Paystack fee), which PAY
 * calls `platformCommission`. `paystackResponse` here is the RAW webhook data,
 * so its amount and fees are already in subunits (cents).
 */
export const cyberServiceAdapter: PayAdapter = {
  id: "cyber_service",
  platform: "cyber",
  async load(reader, w) {
    const docs = await reader.queryRange({
      source: "default",
      collection: "cyber-transactions",
      timeField: "createdAt",
      timeType: "timestamp",
      startMs: w.startMs,
      endMs: w.endMs,
      select: ["status", "amount", "uid", "createdAt", "completedAt", "failedAt", "commissionRate", "paystackResponse.amount", "paystackResponse.fees"],
    });

    const facts: PaymentFact[] = [];
    for (const rec of docs) {
      const d = rec.data;
      const createdAtMs = toMillis(d.createdAt);
      if (createdAtMs === null) continue;

      const status = statusOf(d.status);
      const success = status === "success";
      const rawGross = subunits(get(d, "paystackResponse.amount"));
      const rawFee = subunits(get(d, "paystackResponse.fees"));
      const amountKes = num(d.amount);
      const gross = rawGross ?? (amountKes !== null ? toCents(amountKes) : 0);
      // Desk service charges (CYBER_DSK_) store the rate used at charge time; older charges use the default.
      const recordedRate = num(d.commissionRate);
      const ratePct = recordedRate !== null && recordedRate >= 0 && recordedRate < 100 ? recordedRate : CYBER_COMMISSION_PCT;
      const commission = success ? percentOf(gross - (rawFee ?? 0), ratePct) : 0;
      const uid = typeof d.uid === "string" && d.uid ? `cyber:agent:${d.uid}` : null;

      facts.push({
        reference: rec.id,
        chargeType: "cyber_service",
        platform: "cyber",
        stream: STREAM_BY_CHARGE_TYPE.cyber_service,
        status,
        createdAtMs,
        settledAtMs: status === "pending" ? null : firstMillis(d, "completedAt", "failedAt"),
        gmvCents: gross,
        gatewayFeeCents: success ? rawFee : null,
        platformRevenueCents: commission,
        passThroughCents: 0,
        // The Paystack fee comes out of the agent's share, not the company's commission.
        netRevenueCents: commission,
        basis: rawGross !== null && rawFee !== null ? "recorded" : "rate_estimate",
        customerRef: uid,
      });
    }
    return facts;
  },
};
