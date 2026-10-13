import { PayAdapter } from "./types";
import { PaymentFact, STREAM_BY_CHARGE_TYPE, get, statusOf } from "../facts";
import { toCents, num } from "../../../core/money";
import { toMillis } from "../../../core/timestamps";
import { PMS_SUBSCRIPTION_AGENT_SHARE_PCT } from "./config";
import { firstMillis, percentOf, subunits } from "./common";

/**
 * Plot Yangu monthly subscriptions (SUB_ references), created by the PMS
 * WhatsApp/web flow and settled by PAY. The company bills the full amount.
 * If a cyber agent referred the subscriber (`agentId`), 45% of
 * (gross - Paystack fee) is owed to the agent, so net revenue is the remaining
 * 55%. `paystackResponse` is the RAW webhook data (subunits).
 */
export const pmsSubscriptionAdapter: PayAdapter = {
  id: "pms_subscription",
  platform: "pms",
  async load(reader, w) {
    const docs = await reader.queryRange({
      source: "default",
      collection: "subscriptions",
      timeField: "initiatedAt",
      timeType: "timestamp",
      startMs: w.startMs,
      endMs: w.endMs,
      select: [
        "status",
        "amount",
        "agentId",
        "userId",
        "initiatedAt",
        "completedAt",
        "failedAt",
        "paystackResponse.amount",
        "paystackResponse.fees",
      ],
    });

    const facts: PaymentFact[] = [];
    for (const rec of docs) {
      const d = rec.data;
      const createdAtMs = toMillis(d.initiatedAt);
      if (createdAtMs === null) continue;

      const status = statusOf(d.status);
      const success = status === "success";
      const rawGross = subunits(get(d, "paystackResponse.amount"));
      const rawFee = subunits(get(d, "paystackResponse.fees"));
      const amountKes = num(d.amount);
      const gross = rawGross ?? (amountKes !== null ? toCents(amountKes) : 0);
      const fee = rawFee ?? 0;
      const hasAgent = typeof d.agentId === "string" && d.agentId.length > 0;
      const passThrough = success && hasAgent ? percentOf(gross - fee, PMS_SUBSCRIPTION_AGENT_SHARE_PCT) : 0;
      const userId = typeof d.userId === "string" && d.userId ? `pms:user:${d.userId}` : null;

      facts.push({
        reference: rec.id,
        chargeType: "pms_subscription",
        platform: "pms",
        stream: STREAM_BY_CHARGE_TYPE.pms_subscription,
        status,
        createdAtMs,
        settledAtMs: status === "pending" ? null : firstMillis(d, "completedAt", "failedAt"),
        gmvCents: gross,
        gatewayFeeCents: success ? rawFee : null,
        platformRevenueCents: success ? gross : 0,
        passThroughCents: passThrough,
        netRevenueCents: success ? gross - fee - passThrough : 0,
        basis: rawGross !== null ? "recorded" : "gross_fee_unknown",
        customerRef: userId,
      });
    }
    return facts;
  },
};
