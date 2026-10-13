import { PayAdapter } from "./types";
import { PaymentFact, STREAM_BY_CHARGE_TYPE, get, statusOf } from "../facts";
import { toCents } from "../../../core/money";
import { toMillis } from "../../../core/timestamps";
import { num } from "../../../core/money";
import { firstMillis, kesToCents } from "./common";

/**
 * CYBER report charges (REPORT_ references). The company sells the report, so
 * the whole amount is revenue; PAY stores `paystackResponse.{amount,fees}` as
 * decimal KES on success. `createdAt` is an ISO string here, so the query uses
 * the numeric `createdAtTimestamp` (epoch ms) that the same record carries.
 */
export const reportChargeAdapter: PayAdapter = {
  id: "report_charge",
  platform: "cyber",
  async load(reader, w) {
    const docs = await reader.queryRange({
      source: "default",
      collection: "report_charges",
      timeField: "createdAtTimestamp",
      timeType: "epochMs",
      startMs: w.startMs,
      endMs: w.endMs,
      select: [
        "status",
        "chargeAmount",
        "shopId",
        "createdAtTimestamp",
        "completedAt",
        "failedAt",
        "paystackResponse.amount",
        "paystackResponse.fees",
      ],
    });

    const facts: PaymentFact[] = [];
    for (const rec of docs) {
      const d = rec.data;
      const createdAtMs = toMillis(d.createdAtTimestamp);
      if (createdAtMs === null) continue;

      const status = statusOf(d.status);
      const success = status === "success";
      const paid = kesToCents(get(d, "paystackResponse.amount"));
      const fee = kesToCents(get(d, "paystackResponse.fees"));
      const charge = num(d.chargeAmount);
      const gmv = paid ?? (charge !== null ? toCents(charge) : 0);
      const shopId = typeof d.shopId === "string" && d.shopId ? `cyber:shop:${d.shopId}` : null;

      facts.push({
        reference: rec.id,
        chargeType: "report_charge",
        platform: "cyber",
        stream: STREAM_BY_CHARGE_TYPE.report_charge,
        status,
        createdAtMs,
        settledAtMs: status === "pending" ? null : firstMillis(d, "completedAt", "failedAt"),
        gmvCents: gmv,
        gatewayFeeCents: success ? fee : null,
        platformRevenueCents: success ? gmv : 0,
        passThroughCents: 0,
        netRevenueCents: success ? gmv - (fee ?? 0) : 0,
        basis: paid !== null ? "recorded" : "gross_fee_unknown",
        customerRef: shopId,
      });
    }
    return facts;
  },
};
