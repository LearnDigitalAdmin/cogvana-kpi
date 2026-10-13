import { PayAdapter } from "./types";
import { PaymentFact, STREAM_BY_CHARGE_TYPE, get, statusOf } from "../facts";
import { toCents, num } from "../../../core/money";
import { toMillis } from "../../../core/timestamps";
import { PMS_DEFAULT_TIER, PMS_TIER_COMMISSION_PCT } from "./config";
import { firstMillis, percentOf, subunits } from "./common";

/**
 * Plot Yangu rent collection (INV_ references). Tenant rent is the property
 * manager's money, NOT company revenue: it is GMV. The company's cut is taken
 * by the Paystack split at the manager's tier commission rate.
 *
 * PAY writes no revenue record for these payments, so the cut is resolved as:
 *   1. split_actual  - Paystack's recorded split share for the platform account
 *                      (`paystackResponse.fees_split.integration`), when present;
 *   2. rate_recorded - gross x the commission rate stored in paymentAccounts/{userId} at account setup;
 *   3. rate_estimate - gross x tier rate (SOLO 2.4, BUSINESS 1.5, PRO 1.9, ENTERPRISE 1.0),
 *                      tier read from users/{userId}.tier (only that field is read).
 * Every figure is labelled with its basis so the estimate is never mistaken for a record.
 */
export const pmsRentAdapter: PayAdapter = {
  id: "pms_rent",
  platform: "pms",
  async load(reader, w) {
    const docs = await reader.queryRange({
      source: "default",
      collection: "transactions",
      timeField: "createdAt",
      timeType: "timestamp",
      startMs: w.startMs,
      endMs: w.endMs,
      select: [
        "status",
        "amount",
        "userId",
        "createdAt",
        "completedAt",
        "failedAt",
        "paystackResponse.amount",
        "paystackResponse.fees",
        "paystackResponse.fees_split.integration",
      ],
    });

    // The top-level `transactions` collection is rent payments only, but the
    // reference prefix is the contract, so enforce it.
    const rent = docs.filter((r) => r.id.startsWith("INV_"));

    // Tiers are needed only for successful payments that lack a recorded split.
    const needTier = new Set<string>();
    for (const r of rent) {
      const success = statusOf(r.data.status) === "success";
      const split = subunits(get(r.data, "paystackResponse.fees_split.integration"));
      const userId = r.data.userId;
      if (success && (split === null || split <= 0) && typeof userId === "string" && userId) needTier.add(userId);
    }
    const tierByUser = new Map<string, string>();
    const rateByUser = new Map<string, number>();
    if (needTier.size) {
      const ids = [...needTier];
      const [users, accounts] = await Promise.all([
        reader.getDocs("default", ids.map((id) => `users/${id}`), ["tier"]),
        // PAY stores the commission rate it applied to the Paystack split at account setup.
        reader.getDocs("default", ids.map((id) => `paymentAccounts/${id}`), ["commissionRate"]),
      ]);
      for (const u of users) {
        const tier = typeof u.data.tier === "string" ? u.data.tier.toUpperCase() : "";
        tierByUser.set(u.id, tier);
      }
      for (const a of accounts) {
        const rate = num(a.data.commissionRate);
        if (rate !== null && rate > 0) rateByUser.set(a.id, rate);
      }
    }

    const facts: PaymentFact[] = [];
    for (const rec of rent) {
      const d = rec.data;
      const createdAtMs = toMillis(d.createdAt);
      if (createdAtMs === null) continue;

      const status = statusOf(d.status);
      const success = status === "success";
      const rawGross = subunits(get(d, "paystackResponse.amount"));
      const rawFee = subunits(get(d, "paystackResponse.fees"));
      const amountKes = num(d.amount);
      const gross = rawGross ?? (amountKes !== null ? toCents(amountKes) : 0);

      let cut = 0;
      let basis: PaymentFact["basis"] = "split_actual";
      if (success) {
        const split = subunits(get(d, "paystackResponse.fees_split.integration"));
        if (split !== null && split > 0) {
          cut = split;
        } else {
          const userId = typeof d.userId === "string" ? d.userId : "";
          const recorded = rateByUser.get(userId);
          if (recorded !== undefined) {
            cut = percentOf(gross, recorded);
            basis = "rate_recorded";
          } else {
            const tier = tierByUser.get(userId) || PMS_DEFAULT_TIER;
            const rate = PMS_TIER_COMMISSION_PCT[tier] ?? PMS_TIER_COMMISSION_PCT[PMS_DEFAULT_TIER];
            cut = percentOf(gross, rate);
            basis = "rate_estimate";
          }
        }
      }

      facts.push({
        reference: rec.id,
        chargeType: "pms_rent",
        platform: "pms",
        stream: STREAM_BY_CHARGE_TYPE.pms_rent,
        status,
        createdAtMs,
        settledAtMs: status === "pending" ? null : firstMillis(d, "completedAt", "failedAt"),
        gmvCents: gross,
        gatewayFeeCents: success ? rawFee : null,
        platformRevenueCents: cut,
        passThroughCents: 0,
        netRevenueCents: cut,
        basis,
        customerRef: typeof d.userId === "string" && d.userId ? `pms:user:${d.userId}` : null,
      });
    }
    return facts;
  },
};
