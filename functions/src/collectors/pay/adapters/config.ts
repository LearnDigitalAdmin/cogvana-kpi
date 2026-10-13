/**
 * Business constants copied from the PAY repository (functions/src/index.ts).
 * If a rate changes in PAY it MUST change here too; docs/source-of-truth.md lists where each comes from.
 */

/** Plot Yangu (PMS) rent commission % by subscription tier: PAY `TIER_RATES`. Unknown tier -> SOLO. */
export const PMS_TIER_COMMISSION_PCT: Record<string, number> = {
  ENTERPRISE: 1.0,
  PRO: 1.9,
  BUSINESS: 1.5,
  SOLO: 2.4,
};
export const PMS_DEFAULT_TIER = "SOLO";

/** Cyber service commission % taken on (gross - Paystack fee): PAY `handleCyberCharge`. */
export const CYBER_COMMISSION_PCT = 2.5;

/** Agent share % of (gross - Paystack fee) on Plot Yangu subscriptions with an agent: PAY `handlePlotYanguSubscriptionCharge`. */
export const PMS_SUBSCRIPTION_AGENT_SHARE_PCT = 45;

/** A payment still pending after this long counts as "stuck". */
export const STUCK_PENDING_MS = 30 * 60 * 1000;
