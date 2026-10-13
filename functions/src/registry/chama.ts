import { defineKpi } from "../core/registry";

/**
 * MyChama KPIs. Flow KPIs come from the money ledger (chamas/{id}/transactions) and the SMS log,
 * attributed to the Nairobi day of creation. Amounts are the chama's money (net of fees), not company revenue:
 * company revenue from Chama (markup, plans, SMS, reports) is in the PAY KPIs.
 */
const COMMON = { scope: "platform" as const, platform: "chama" as const, owner: "Sam", dimensions: [] as string[] };

export const CHAMA_DEFINITIONS = [
  // ---- growth ----
  defineKpi({ ...COMMON, id: "chama.chamas_new", name: "New chamas", description: "Chamas created on the day.", type: "flow", unit: "count", direction: "higher_is_better", formula: "Count of chama records created on the day (Nairobi).", decision: "Acquisition pace." }),
  defineKpi({ ...COMMON, id: "chama.members_new", name: "New members", description: "Member records added on the day.", type: "flow", unit: "count", direction: "higher_is_better", formula: "Count of member records created on the day across all chamas.", decision: "Network growth inside existing chamas." }),
  // ---- money ledger (flow) ----
  defineKpi({ ...COMMON, id: "chama.contribution_volume", name: "Contribution volume", description: "Contributions received into chamas.", type: "flow", unit: "KES_CENTS", direction: "higher_is_better", formula: "Sum of amount on ledger rows of type contribution (money in).", decision: "Core money handled by the product." }),
  defineKpi({ ...COMMON, id: "chama.contribution_count", name: "Contributions received", description: "Number of contribution payments.", type: "flow", unit: "count", direction: "higher_is_better", formula: "Count of ledger rows of type contribution.", decision: "Activity behind the volume." }),
  defineKpi({ ...COMMON, id: "chama.loan_repayment_volume", name: "Loan repayments", description: "Loan repayments received.", type: "flow", unit: "KES_CENTS", direction: "higher_is_better", formula: "Sum of amount on ledger rows of type loan_repayment.", decision: "Loan book cash flow." }),
  defineKpi({ ...COMMON, id: "chama.loans_disbursed_volume", name: "Loans disbursed", description: "Loan money paid out to members.", type: "flow", unit: "KES_CENTS", formula: "Sum of amount on ledger rows of type loan_disbursement.", decision: "Lending appetite versus repayments." }),
  defineKpi({ ...COMMON, id: "chama.mgr_contribution_volume", name: "Merry-go-round contributions", description: "Contributions into merry-go-round pots.", type: "flow", unit: "KES_CENTS", direction: "higher_is_better", formula: "Sum of amount on ledger rows of type mgr_contribution.", decision: "Adoption of the MGR feature." }),
  defineKpi({ ...COMMON, id: "chama.mgr_payout_volume", name: "Merry-go-round payouts", description: "Pot money paid out to members.", type: "flow", unit: "KES_CENTS", formula: "Sum of amount on ledger rows of type mgr_payout.", decision: "Cross-check against MGR contributions." }),
  defineKpi({ ...COMMON, id: "chama.money_in_volume", name: "Total money in", description: "All money received into chamas (contributions, repayments, MGR).", type: "flow", unit: "KES_CENTS", direction: "higher_is_better", formula: "Sum of amount on ledger rows with direction in.", decision: "Headline money handled." }),
  defineKpi({
    ...COMMON, id: "chama.digital_payment_share",
    caveat: "Rows with no payment method count as not digital.", name: "Digital payment share", description: "Share of money in that was paid through the platform (Paystack) rather than recorded manually.", type: "ratio", unit: "percent", direction: "higher_is_better",
    formula: "Money in with method paystack / all money in x 100. Manual recordings earn the company nothing.",
    numeratorDesc: "Money in paid via Paystack", denominatorDesc: "All money in", decision: "The monetisable share of volume; raise it by pushing members to pay in-app or via WhatsApp.",
  }),
  defineKpi({
    ...COMMON, id: "chama.whatsapp_payment_share", name: "WhatsApp payment share", description: "Share of digital payments initiated on WhatsApp.", type: "ratio", unit: "percent", direction: "neutral",
    formula: "Paystack money-in rows with channel whatsapp / all Paystack money-in rows x 100.",
    numeratorDesc: "Paystack payments from WhatsApp", denominatorDesc: "All Paystack payments", decision: "Channel mix for product and support focus.",
  }),
  // ---- active chamas (distinct; day / week / month) ----
  defineKpi({ ...COMMON, id: "chama.chamas_active",
    grains: ["daily", "weekly", "monthly"], name: "Active chamas (money)", description: "Distinct chamas with at least one ledger transaction in the period. The headline adoption number.", type: "flow", unit: "count", direction: "higher_is_better", formula: "Distinct chamas with any ledger row created in the period. Daily, weekly (Mon-Sun) and calendar-month values.", decision: "Real adoption versus sign-ups." }),
  defineKpi({ ...COMMON, id: "chama.chamas_messaging",
    grains: ["daily", "weekly", "monthly"], name: "Active chamas (SMS)", description: "Distinct chamas that sent an SMS in the period.", type: "flow", unit: "count", direction: "higher_is_better", formula: "Distinct chamas with an SMS log entry in the period. Daily, weekly and monthly values.", decision: "SMS users are the revenue-relevant base for credits." }),
  // ---- SMS ----
  defineKpi({ ...COMMON, id: "chama.sms_messages", name: "SMS campaigns sent", description: "Bulk SMS sends from chamas.", type: "flow", unit: "count", direction: "higher_is_better", formula: "Count of SMS log entries.", decision: "Feature usage." }),
  defineKpi({ ...COMMON, id: "chama.sms_recipients_sent", name: "SMS delivered to provider", description: "Recipients the provider accepted.", type: "flow", unit: "count", formula: "Sum of sentCount over SMS log entries (acceptance, not handset delivery).", decision: "Volume behind credit use." }),
  defineKpi({ ...COMMON, id: "chama.sms_credits_used", name: "SMS credits used", description: "Credits spent on SMS.", type: "flow", unit: "count", formula: "Sum of creditsUsed over SMS log entries.", decision: "Burn rate; pair with credits sold (PAY) to predict top-ups." }),
  defineKpi({
    ...COMMON, id: "chama.sms_delivery_rate", name: "SMS acceptance rate", description: "Share of intended recipients the provider accepted.", type: "ratio", unit: "percent", direction: "higher_is_better",
    formula: "sentCount / recipientCount x 100 over SMS log entries.", numeratorDesc: "Recipients accepted", denominatorDesc: "Recipients intended", decision: "Falling rate points at bad numbers or provider trouble.",
  }),
  // ---- stock snapshots (23:55 Nairobi; history starts at go-live) ----
  defineKpi({ ...COMMON, id: "chama.chamas_total", name: "Chamas (total)", description: "Chamas registered at snapshot time.", type: "stock", unit: "count", formula: "Count of chama records.", decision: "Size of the customer base." }),
  defineKpi({ ...COMMON, id: "chama.chamas_by_plan", name: "Chamas by plan", description: "Chamas per subscription plan at snapshot time.", type: "stock", unit: "count", formula: "Count of chamas with each plan value. Dimension: plan (free, starter, basic, growth, max).", decision: "Conversion from Free to paid; plan mix.", dimensions: ["plan"] }),
  defineKpi({ ...COMMON, id: "chama.paid_plans_expiring_14d",
    caveat: "Plan expiry is a UTC date; Nairobi is 3 hours ahead.", name: "Plans expiring within 14 days", description: "Chamas whose plan expiry falls in the next 14 days.", type: "stock", unit: "count", direction: "lower_is_better", formula: "Count of chamas with planExpiry from today through 14 days ahead.", decision: "Renewal outreach list; unrenewed ones are downgraded to Free." }),
  defineKpi({ ...COMMON, id: "chama.members_active", name: "Active members", description: "Members with active status across all chamas.", type: "stock", unit: "count", formula: "Count of member records with status active.", decision: "Size of the user base." }),
  defineKpi({ ...COMMON, id: "chama.sms_credits_outstanding", name: "Unspent SMS credits", description: "Prepaid SMS credits held by chamas.", type: "stock", unit: "count", formula: "Sum of smsCredits across chamas.", decision: "Sold-but-unused credit." }),
  defineKpi({ ...COMMON, id: "chama.report_credits_outstanding", name: "Unspent report credits", description: "Prepaid report credits held by chamas.", type: "stock", unit: "count", formula: "Sum of reportCreditsBalance across chamas.", decision: "Sold-but-unused credit." }),
  defineKpi({ ...COMMON, id: "chama.loans_active", name: "Open loans", description: "Disbursed loans still being repaid (active or overdue).", type: "stock", unit: "count", formula: "Count of loans with status active or overdue.", decision: "Size of the loan book." }),
  defineKpi({ ...COMMON, id: "chama.loans_outstanding_balance", name: "Loan book outstanding", description: "Unpaid installments across open loans.", type: "stock", unit: "KES_CENTS", formula: "Sum over open loans of (installment due - paid) for installments not marked paid.", decision: "Money out on loan across chamas." }),
  defineKpi({ ...COMMON, id: "chama.loans_at_risk_count", name: "Loans past due", description: "Open loans with at least one installment past its due date.", type: "stock", unit: "count", direction: "lower_is_better", formula: "Count of open loans with an unpaid installment whose due date is before today (Nairobi).", decision: "Chamas needing a repayment follow-up." }),
  defineKpi({ ...COMMON, id: "chama.loans_at_risk_balance", name: "Loan balance at risk", description: "Outstanding balance of loans that are past due.", type: "stock", unit: "KES_CENTS", direction: "lower_is_better", formula: "Sum of outstanding balance over loans counted in loans past due.", decision: "Size of the repayment problem." }),
  defineKpi({
    ...COMMON, id: "chama.portfolio_at_risk", name: "Portfolio at risk", description: "Share of the loan book that is past due.", type: "ratio", unit: "percent", direction: "lower_is_better",
    formula: "Balance at risk / loan book outstanding x 100.", numeratorDesc: "Outstanding balance of past-due loans", denominatorDesc: "Loan book outstanding", decision: "Health of customers' lending; rising PAR means chamas are struggling.",
  }),
  defineKpi({ ...COMMON, id: "chama.contributions_overdue_count", name: "Overdue contributions", description: "Contribution periods flagged overdue.", type: "stock", unit: "count", direction: "lower_is_better", formula: "Count of contribution records with status overdue (set by the nightly sweep).", decision: "Collection health." }),
  defineKpi({ ...COMMON, id: "chama.contributions_overdue_amount", name: "Overdue contribution amount", description: "Unpaid part of overdue contributions.", type: "stock", unit: "KES_CENTS", direction: "lower_is_better", formula: "Sum of (amount - paidAmount) over overdue contributions.", decision: "Money chamas are owed by their members." }),
  defineKpi({ ...COMMON, id: "chama.chamas_with_overdue_contributions", name: "Chamas with overdue contributions", description: "Chamas that have at least one overdue contribution.", type: "stock", unit: "count", direction: "lower_is_better", formula: "Distinct chamas with an overdue contribution.", decision: "Chamas that may need reminders or support." }),
  defineKpi({ ...COMMON, id: "chama.mgr_pots_active", name: "Active merry-go-round pots", description: "Pots currently running.", type: "stock", unit: "count", formula: "Count of MGR pots with status active.", decision: "Adoption of the MGR feature." }),
  defineKpi({ ...COMMON, id: "chama.mgr_pending_shortfall", name: "MGR pending shortfall", description: "Amount active pots fell short by and have not covered.", type: "stock", unit: "KES_CENTS", direction: "lower_is_better", formula: "Sum of pendingShortfall over active MGR pots.", decision: "Pots needing treasurer action." }),
  defineKpi({ ...COMMON, id: "chama.mgr_arrears_open_count", name: "Open MGR arrears", description: "Member arrears still open in active pots.", type: "stock", unit: "count", direction: "lower_is_better", formula: "Count of arrears with status open across active pots.", decision: "Members behind on pot contributions." }),
  defineKpi({ ...COMMON, id: "chama.mgr_arrears_open_amount", name: "Open MGR arrears amount", description: "Unsettled arrears amount in active pots.", type: "stock", unit: "KES_CENTS", direction: "lower_is_better", formula: "Sum of (amount - settledAmount) over open arrears in active pots.", decision: "Money owed into pots." }),
];
