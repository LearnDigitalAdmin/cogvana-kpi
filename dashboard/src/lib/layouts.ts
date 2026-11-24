import type { KpiDefinition, PlatformId } from "./types";

export interface Group { title: string; ids: string[]; /** always rendered greyed, never fetched */ planned?: boolean }
export interface PlatformLayout {
  key: string; title: string; payPlatform: PlatformId;
  groups: Group[];
  banner?: string;
  /** dimensioned tiles: kpi id → dimension key */
  breakdowns: Record<string, string>;
}

export const PAY_TILES = ["pay.net_revenue", "pay.platform_revenue", "pay.gmv", "pay.success_rate", "pay.attempts", "pay.failed", "pay.stuck_pending", "pay.net_revenue_unverified"];
export const PAY_PLATFORMS = ["pms", "register", "chama", "cyber"] as const;
export const PLATFORM_NAMES: Record<string, string> = { pms: "Plot Yangu", register: "Register", chama: "Chama", cyber: "Cyber" };

export const CHARGE_TYPES: Record<string, string[]> = {
  pms: ["pms_rent", "pms_subscription", "pms_sms"], register: ["register_sms"],
  chama: ["chama_member_payment", "chama_sms", "chama_plan", "chama_report_credit", "chama_report_alacarte"],
  cyber: ["cyber_service", "report_charge"],
};
export const STREAMS: Record<string, string[]> = {
  pms: ["commission", "sms", "subscription"], register: ["sms"],
  chama: ["markup", "sms", "subscription", "reports"], cyber: ["commission", "reports"],
};
export const STREAM_ORDER = ["commission", "sms", "subscription", "reports", "markup"];
export const PLAN_ORDER = ["free", "starter", "basic", "growth", "max"];
export const TIER_ORDER = ["free", "low", "business", "enterprise", "other"];

export const OVERVIEW_CARDS = ["company.net_revenue", "company.platform_revenue", "company.gmv", "company.success_rate", "company.active_accounts", "company.new_accounts", "company.unverified_revenue_share"];
/** Produced by the parallel cross-project work: hidden until values exist. */
export const OVERVIEW_OPTIONAL = ["company.active_accounts", "company.new_accounts", "company.unverified_revenue_share"];
export const MONEY_CARDS = ["company.gmv", "company.platform_revenue", "company.net_revenue", "company.net_revenue_unverified", "company.gateway_fees", "company.pass_through", "company.success_rate"];
export const CROSS_CARDS = [
  "company.active_accounts", "company.new_accounts", "company.net_revenue_per_active_account", "company.unverified_revenue_share",
  "company.data_freshness_max_hours", "company.collectors_stale", "cross.subscription_revenue", "cross.digital_rent_share",
  "cross.sms_cost_estimate", "cross.sms_margin",
];
export const CROSS_OPTIONAL = ["cross.sms_cost_estimate", "cross.sms_margin"];
export const CROSS_CHART_IDS = ["cross.revenue_share", "cross.stream_share", "cross.sms_units_used", "cross.sms_prepaid_outstanding"];

const MONEY_FROM_PAY = "Money from PAY";

export const LAYOUTS: Record<string, PlatformLayout> = {
  register: {
    key: "register", title: "Register (schools)", payPlatform: "register", breakdowns: {},
    groups: [
      { title: "Adoption", ids: ["register.schools_marking", "register.schools_messaging", "register.schools_purchasing", "register.schools_total", "register.schools_new"] },
      { title: "Attendance", ids: ["register.registers_marked", "register.registers_auto_unmarked", "register.register_marking_rate", "register.attendance_rate", "register.students_attended", "register.students_absent", "register.students_excused"] },
      { title: "SMS", ids: ["register.sms_messages_sent", "register.sms_messages_failed", "register.sms_blocked_no_tokens", "register.sms_success_rate", "register.sms_recipients", "register.sms_scheduled_messages", "register.sms_log_sent", "register.sms_log_failed", "register.sms_provider_success_rate"] },
      { title: "Tokens", ids: ["register.sms_tokens_used", "register.tokens_sold", "register.tokens_outstanding", "register.schedules_waiting_tokens"] },
      { title: "People", ids: ["register.teachers_total", "register.school_admins_total", "register.students_total", "register.students_new"] },
    ],
  },
  chama: {
    key: "chama", title: "Chama", payPlatform: "chama", breakdowns: { "chama.chamas_by_plan": "plan" },
    groups: [
      { title: "Adoption", ids: ["chama.chamas_active", "chama.chamas_messaging", "chama.chamas_total", "chama.chamas_new", "chama.members_active", "chama.members_new", "chama.chamas_by_plan", "chama.paid_plans_expiring_14d"] },
      { title: "Money", ids: ["chama.money_in_volume", "chama.contribution_volume", "chama.contribution_count", "chama.loan_repayment_volume", "chama.loans_disbursed_volume", "chama.mgr_contribution_volume", "chama.mgr_payout_volume", "chama.digital_payment_share", "chama.whatsapp_payment_share"] },
      { title: "Loans", ids: ["chama.loans_active", "chama.loans_outstanding_balance", "chama.loans_at_risk_count", "chama.loans_at_risk_balance", "chama.portfolio_at_risk"] },
      { title: "Collections and merry-go-round", ids: ["chama.contributions_overdue_count", "chama.contributions_overdue_amount", "chama.chamas_with_overdue_contributions", "chama.mgr_pots_active", "chama.mgr_pending_shortfall", "chama.mgr_arrears_open_count", "chama.mgr_arrears_open_amount"] },
      { title: "SMS and credits", ids: ["chama.sms_messages", "chama.sms_recipients_sent", "chama.sms_credits_used", "chama.sms_delivery_rate", "chama.sms_credits_outstanding", "chama.report_credits_outstanding"] },
    ],
  },
  pms: {
    key: "pms", title: "Plot Yangu (PMS)", payPlatform: "pms",
    banner: "Plot Yangu data is as of each manager's last sync. Recent days rise as devices sync.",
    breakdowns: { "pms.users_by_tier": "tier", "pms.collection_rate": "month" },
    groups: [
      { title: "Adoption", ids: ["pms.managers_active", "pms.users_new", "pms.users_total", "pms.users_by_tier", "pms.properties_new", "pms.tenants_new"] },
      { title: "Plans and trials", ids: ["pms.paid_active", "pms.paid_expiring_14d", "pms.paid_lapsed_14d", "pms.trials_started", "pms.trials_active", "pms.trials_expiring_7d", "pms.trials_awaiting_downgrade", "pms.trial_conversion_rate"] },
      { title: "Sync health", ids: ["pms.users_synced_7d", "pms.paid_stale_sync_7d"] },
      { title: "Portfolio", ids: ["pms.properties_total", "pms.tenants_active", "pms.units_total", "pms.units_occupied", "pms.occupancy_rate"] },
      { title: "Rent and billing", ids: ["pms.invoices_issued", "pms.invoiced_amount", "pms.payments_recorded", "pms.rent_collected", "pms.collection_rate", "pms.invoices_unpaid_count", "pms.receivables_outstanding", "pms.invoices_overdue_count", "pms.receivables_overdue"] },
      { title: "SMS", ids: ["pms.tokens_outstanding"] },
    ],
  },
  cyber: {
    key: "cyber", title: "Cyber (WhatsApp usage)", payPlatform: "cyber", breakdowns: {},
    banner: "Exact WhatsApp numbers start on the day the usage meter is deployed in the Cyber repo. Until then only the approximate session-based numbers are shown.",
    groups: [
      { title: "WhatsApp usage (exact, needs the usage meter)", ids: ["cyber.wa_users_active", "cyber.wa_messages_in", "cyber.wa_messages_out", "cyber.wa_messages_out_failed", "cyber.wa_delivery_success_rate", "cyber.wa_sessions_started"] },
      { title: "WhatsApp usage (approximate, available now)", ids: ["cyber.wa_users_seen", "cyber.wa_known_users"] },
      { title: "Coming later", planned: true, ids: ["cyber.shops_total", "cyber.shops_new", "cyber.sales_recorded", "cyber.sales_value", "cyber.expenses_recorded", "cyber.reports_generated", "cyber.report_jobs_failed"] },
    ],
  },
};
export const PAY_SECTION_TITLE = MONEY_FROM_PAY;

type Fb = [id: string, name: string, type: KpiDefinition["type"], unit: KpiDefinition["unit"], direction: KpiDefinition["direction"], grains: KpiDefinition["grains"]];
const ALL: KpiDefinition["grains"] = ["daily", "weekly", "monthly"];
const FALLBACKS: Fb[] = [
  ["company.active_accounts", "Active accounts", "flow", "count", "higher_is_better", ALL],
  ["company.new_accounts", "New accounts", "flow", "count", "higher_is_better", ALL],
  ["company.net_revenue_per_active_account", "Net revenue per active account", "ratio", "KES_CENTS", "higher_is_better", ["weekly", "monthly"]],
  ["company.unverified_revenue_share", "Unverified revenue share", "ratio", "percent", "lower_is_better", ALL],
  ["company.data_freshness_max_hours", "Oldest data (hours)", "stock", "hours", "lower_is_better", ["daily"]],
  ["company.collectors_stale", "Collectors stale", "stock", "count", "lower_is_better", ["daily"]],
  ["cross.revenue_share", "Revenue share by platform", "ratio", "percent", "neutral", ALL],
  ["cross.stream_share", "Revenue share by stream", "ratio", "percent", "neutral", ALL],
  ["cross.subscription_revenue", "Subscription revenue (recurring)", "flow", "KES_CENTS", "higher_is_better", ALL],
  ["cross.sms_units_used", "SMS units used", "flow", "count", "neutral", ALL],
  ["cross.sms_prepaid_outstanding", "Prepaid SMS units outstanding", "stock", "count", "neutral", ALL],
  ["cross.sms_cost_estimate", "SMS provider cost (estimate)", "flow", "KES_CENTS", "lower_is_better", ALL],
  ["cross.sms_margin", "SMS margin (estimate)", "flow", "KES_CENTS", "higher_is_better", ALL],
  ["cross.digital_rent_share", "Digital rent share", "ratio", "percent", "higher_is_better", ALL],
];

/** Used only when a definition document is missing from kpi_definitions (e.g. parallel work not deployed yet). */
export const FALLBACK_DEFS = new Map<string, KpiDefinition>(FALLBACKS.map(([id, name, type, unit, direction, grains]) => [id, {
  id, name, description: "", scope: id.startsWith("cross.") ? "cross" : "company", platform: "all", type, unit, grain: grains[0], grains,
  formula: "", direction, dimensions: [], thresholds: {}, owner: "", decision: "", version: 1, status: "active",
} satisfies KpiDefinition]));

export function placeholderDef(id: string): KpiDefinition {
  const fb = FALLBACK_DEFS.get(id);
  if (fb) return fb;
  const raw = id.split(".").slice(1).join(" ").replace(/_/g, " ");
  return {
    id, name: raw.charAt(0).toUpperCase() + raw.slice(1) || id, description: "", scope: "platform", platform: "all", type: "flow", unit: "count",
    grain: "daily", grains: ["daily"], formula: "", direction: "neutral", dimensions: [], thresholds: {}, owner: "", decision: "", version: 1, status: "active",
  };
}

export function normaliseDefinition(id: string, d: Partial<KpiDefinition>): KpiDefinition {
  const base = placeholderDef(id);
  const grain = d.grain ?? base.grain;
  return {
    ...base, ...d, id,
    name: d.name || base.name,
    grain,
    grains: d.grains && d.grains.length ? d.grains : [grain],
    dimensions: d.dimensions ?? [],
    thresholds: d.thresholds ?? {},
    status: d.status ?? "active",
    direction: d.direction ?? "neutral",
  };
}
