import { PlatformId } from "../../core/types";

/**
 * A "fact" is one payment attempt normalised across every source shape.
 * Adapters produce facts; `aggregate.ts` turns facts into KPI values.
 * All money is INTEGER CENTS.
 */
export type ChargeType =
  | "pms_rent"
  | "pms_subscription"
  | "pms_sms"
  | "register_sms"
  | "cyber_service"
  | "report_charge"
  | "chama_member_payment"
  | "chama_sms"
  | "chama_plan"
  | "chama_report_credit"
  | "chama_report_alacarte";

/** How the company earns from a charge type. */
export type RevenueStream = "commission" | "sms" | "subscription" | "reports" | "markup";

/**
 * How trustworthy the revenue figure is:
 *  recorded          - taken from amounts PAY stored at settlement
 *  split_actual      - taken from Paystack's recorded split (fees_split.integration)
 *  rate_recorded     - gross x the commission rate PAY stored when the Paystack account was set up (the rate the split applied)
 *  rate_estimate     - computed from the tier commission % because no recorded split or rate exists
 *  gross_fee_unknown - amount sold is exact, but the gateway fee was not recorded
 */
export type RevenueBasis = "recorded" | "split_actual" | "rate_recorded" | "rate_estimate" | "gross_fee_unknown";

export type PayStatus = "success" | "failed" | "pending";

export const STREAM_BY_CHARGE_TYPE: Record<ChargeType, RevenueStream> = {
  pms_rent: "commission",
  cyber_service: "commission",
  pms_sms: "sms",
  register_sms: "sms",
  chama_sms: "sms",
  pms_subscription: "subscription",
  chama_plan: "subscription",
  report_charge: "reports",
  chama_report_credit: "reports",
  chama_report_alacarte: "reports",
  chama_member_payment: "markup",
};

export const PLATFORM_BY_CHARGE_TYPE: Record<ChargeType, PlatformId> = {
  pms_rent: "pms",
  pms_subscription: "pms",
  pms_sms: "pms",
  register_sms: "register",
  cyber_service: "cyber",
  report_charge: "cyber",
  chama_member_payment: "chama",
  chama_sms: "chama",
  chama_plan: "chama",
  chama_report_credit: "chama",
  chama_report_alacarte: "chama",
};

export const PLATFORMS: Exclude<PlatformId, "all">[] = ["pms", "register", "chama", "cyber"];

export interface PaymentFact {
  reference: string;
  chargeType: ChargeType;
  platform: PlatformId;
  stream: RevenueStream;
  status: PayStatus;
  createdAtMs: number;
  settledAtMs: number | null;
  /** Money charged to the payer (attempted amount; only summed for successes). */
  gmvCents: number;
  /** Recorded gateway fee, or null when the source did not record it. */
  gatewayFeeCents: number | null;
  /** What the company earns before gateway costs and pass-throughs. */
  platformRevenueCents: number;
  /** Revenue owed onward (agent share). */
  passThroughCents: number;
  /** Company revenue after gateway costs it bears and pass-throughs. */
  netRevenueCents: number;
  basis: RevenueBasis;
  /** Platform-scoped id for Phase 3/6 (Customer 360). Never a phone number. */
  customerRef: string | null;
}

/** Maps every status spelling used across the source records to one vocabulary. */
export function statusOf(raw: unknown): PayStatus {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "success" || s === "successful" || s === "paid" || s === "completed") return "success";
  if (["failed", "payment_failed", "abandoned", "reversed", "cancelled", "canceled", "rejected"].includes(s)) return "failed";
  return "pending";
}

/** Reads a dotted path from nested data ("paystackResponse.fees"). */
export function get(data: Record<string, unknown>, path: string): unknown {
  let cur: unknown = data;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
