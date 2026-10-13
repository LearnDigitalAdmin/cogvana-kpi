import { PayAdapter } from "./types";
import { DocRecord } from "../reader";
import { ChargeType, PaymentFact, STREAM_BY_CHARGE_TYPE, statusOf } from "../facts";
import { num } from "../../../core/money";
import { toMillis } from "../../../core/timestamps";
import { firstMillis, kesToCents } from "./common";

/**
 * MyChama charges. Attempt records live under chamas/{chamaId}/<subcollection>
 * in Chama's own database, with EPOCH-MILLISECOND `createdAt`/`updatedAt`.
 * Queried as collection groups (needs the collection-group indexes in
 * docs/source-of-truth.md; without them the reader falls back to per-chama queries).
 */
function chamaIdOf(rec: DocRecord): string | null {
  const parts = rec.path.split("/"); // chamas/{chamaId}/{sub}/{ref}
  return parts[0] === "chamas" && parts[1] ? parts[1] : null;
}

function base(id: ChargeType, rec: DocRecord): Omit<
  PaymentFact,
  "gmvCents" | "gatewayFeeCents" | "platformRevenueCents" | "passThroughCents" | "netRevenueCents" | "basis"
> | null {
  const createdAtMs = toMillis(rec.data.createdAt);
  if (createdAtMs === null) return null;
  const status = statusOf(rec.data.status);
  const chamaId = chamaIdOf(rec);
  return {
    reference: rec.id,
    chargeType: id,
    platform: "chama",
    stream: STREAM_BY_CHARGE_TYPE[id],
    status,
    createdAtMs,
    settledAtMs: status === "pending" ? null : firstMillis(rec.data, "updatedAt"),
    customerRef: chamaId ? `chama:${chamaId}` : null,
  };
}

/**
 * Member payments (contributions, loan repayments, MGR): the payer is grossed up
 * so the chama receives its net exactly; our markup (`ourFee`) is company revenue
 * and the Paystack fee sits inside the gross, paid by the payer, not the company.
 */
const memberPayments: PayAdapter = {
  id: "chama_member_payment",
  platform: "chama",
  async load(reader, w) {
    const docs = await reader.queryRange({
      source: "chama",
      collection: "paymentIntents",
      group: true,
      groupParent: "chamas",
      timeField: "createdAt",
      timeType: "epochMs",
      startMs: w.startMs,
      endMs: w.endMs,
      select: ["status", "amount", "grossAmount", "paystackFee", "ourFee", "createdAt", "updatedAt"],
    });
    const facts: PaymentFact[] = [];
    for (const rec of docs) {
      const b = base("chama_member_payment", rec);
      if (!b) continue;
      const success = b.status === "success";
      const gross = kesToCents(rec.data.grossAmount) ?? kesToCents(rec.data.amount) ?? 0;
      const ourFee = kesToCents(rec.data.ourFee) ?? 0;
      facts.push({
        ...b,
        gmvCents: gross,
        gatewayFeeCents: success ? kesToCents(rec.data.paystackFee) : null,
        platformRevenueCents: success ? ourFee : 0,
        passThroughCents: 0,
        netRevenueCents: success ? ourFee : 0,
        basis: "recorded",
      });
    }
    return facts;
  },
};

/**
 * Purchases the company sells directly (SMS credits, plan billing, report credits,
 * pay-per-report). The amount sold is exact; the gateway fee is not recorded on
 * these records, so net revenue is flagged `gross_fee_unknown`.
 */
function purchases(id: ChargeType, subcollection: string): PayAdapter {
  return {
    id,
    platform: "chama",
    async load(reader, w) {
      const docs = await reader.queryRange({
        source: "chama",
        collection: subcollection,
        group: true,
        groupParent: "chamas",
        timeField: "createdAt",
        timeType: "epochMs",
        startMs: w.startMs,
        endMs: w.endMs,
        select: ["status", "amountKes", "createdAt", "updatedAt"],
      });
      const facts: PaymentFact[] = [];
      for (const rec of docs) {
        const b = base(id, rec);
        if (!b) continue;
        const success = b.status === "success";
        const asked = num(rec.data.amountKes);
        const cents = asked !== null ? Math.round(asked * 100) : 0;
        facts.push({
          ...b,
          gmvCents: cents,
          gatewayFeeCents: null,
          platformRevenueCents: success ? cents : 0,
          passThroughCents: 0,
          netRevenueCents: success ? cents : 0,
          basis: "gross_fee_unknown",
        });
      }
      return facts;
    },
  };
}

export const chamaMemberPaymentAdapter = memberPayments;
export const chamaSmsAdapter = purchases("chama_sms", "smsTopUps");
export const chamaPlanAdapter = purchases("chama_plan", "planBilling");
export const chamaReportCreditAdapter = purchases("chama_report_credit", "reportCreditTopUps");
export const chamaReportAlacarteAdapter = purchases("chama_report_alacarte", "reportAlacartePurchases");
