import { PayAdapter } from "./types";
import { DocRecord } from "../reader";
import { PaymentFact, PayStatus, STREAM_BY_CHARGE_TYPE, statusOf, ChargeType } from "../facts";
import { num, toCents } from "../../../core/money";
import { toMillis } from "../../../core/timestamps";
import { PlatformId } from "../../../core/types";
import { firstMillis, kesToCents } from "./common";
import { SourceId } from "../../../core/sources";

const SELECT = [
  "status",
  "amountKes",
  "grossAmount",
  "paystackFees",
  "amountReceived",
  "userId",
  "schoolId",
  "createdAt",
  "completedAt",
  "failedAt",
];

/**
 * SMS credit purchases. The company sells the tokens, so the whole amount is
 * platform revenue; net revenue is what remained after the Paystack fee
 * (`amountReceived`, exactly as PAY records it).
 */
function smsFact(chargeType: ChargeType, platform: PlatformId, rec: DocRecord, customerRef: string | null): PaymentFact | null {
  const d = rec.data;
  const createdAtMs = toMillis(d.createdAt);
  if (createdAtMs === null) return null;

  const status: PayStatus = statusOf(d.status);
  const success = status === "success";
  const asked = num(d.amountKes);
  const grossKes = success ? (num(d.grossAmount) ?? asked ?? 0) : (asked ?? 0);
  const gmv = toCents(grossKes);
  const fee = success ? kesToCents(d.paystackFees) : null;
  const received = success ? kesToCents(d.amountReceived) : null;

  return {
    reference: rec.id,
    chargeType,
    platform,
    stream: STREAM_BY_CHARGE_TYPE[chargeType],
    status,
    createdAtMs,
    settledAtMs: status === "pending" ? null : firstMillis(d, "completedAt", "failedAt"),
    gmvCents: gmv,
    gatewayFeeCents: fee,
    platformRevenueCents: success ? gmv : 0,
    passThroughCents: 0,
    netRevenueCents: success ? (received ?? gmv - (fee ?? 0)) : 0,
    basis: received !== null || fee !== null ? "recorded" : "gross_fee_unknown",
    customerRef,
  };
}

function smsAdapter(id: ChargeType, platform: PlatformId, source: SourceId, refPrefix: string, idField: string): PayAdapter {
  return {
    id,
    platform,
    async load(reader, w) {
      const docs = await reader.queryRange({
        source,
        collection: "sms-topup-transactions",
        timeField: "createdAt",
        timeType: "timestamp",
        startMs: w.startMs,
        endMs: w.endMs,
        select: SELECT,
      });
      const facts: PaymentFact[] = [];
      for (const rec of docs) {
        const who = rec.data[idField];
        const ref = typeof who === "string" && who ? `${refPrefix}${who}` : null;
        const f = smsFact(id, platform, rec, ref);
        if (f) facts.push(f);
      }
      return facts;
    },
  };
}

/** Register SMS top-ups live in Register's own database (written by PAY's webhook). */
export const registerSmsAdapter = smsAdapter("register_sms", "register", "register", "register:school:", "schoolId");

/** Plot Yangu SMS top-ups live in the default database. */
export const pmsSmsAdapter = smsAdapter("pms_sms", "pms", "default", "pms:user:", "userId");
