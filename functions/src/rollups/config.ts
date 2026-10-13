import { PlatformId } from "../core/types";

export type ProductPlatform = Exclude<PlatformId, "all">;

/** `kpi_runs.collector` value for rollup runs (also listed in COLLECTOR_IDS for freshness). */
export const ROLLUP_COLLECTOR_ID = "rollups";

/** Provider cost of one SMS unit in KES cents. Evaluated at module load; prefer `smsCostCentsPerUnit()`. */
export const SMS_PROVIDER_COST_CENTS_PER_UNIT = Number(process.env.KPI_SMS_COST_CENTS ?? 0);

/** Reads the env at call time (tests set it per case). Anything not a positive finite number means "not configured". */
export function smsCostCentsPerUnit(): number {
  const n = Number(process.env.KPI_SMS_COST_CENTS ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** A collector is stale when its freshness value is above this many hours. */
export const STALE_COLLECTOR_HOURS = 26;

export interface Component {
  platform: ProductPlatform;
  kpiId: string;
}

/** Platform "active entity" KPIs (distinct counts, written at every grain by their collectors). */
export const ACTIVE_ACCOUNT_COMPONENTS: Component[] = [
  { platform: "register", kpiId: "register.schools_marking" },
  { platform: "chama", kpiId: "chama.chamas_active" },
  { platform: "pms", kpiId: "pms.managers_active" },
  { platform: "cyber", kpiId: "cyber.wa_users_active" },
];

export const NEW_ACCOUNT_COMPONENTS: Component[] = [
  { platform: "register", kpiId: "register.schools_new" },
  { platform: "chama", kpiId: "chama.chamas_new" },
  { platform: "pms", kpiId: "pms.users_new" },
];

export const SMS_USED_COMPONENTS: Component[] = [
  { platform: "register", kpiId: "register.sms_tokens_used" },
  { platform: "chama", kpiId: "chama.sms_credits_used" },
];

export const SMS_OUTSTANDING_COMPONENTS: Component[] = [
  { platform: "register", kpiId: "register.tokens_outstanding" },
  { platform: "chama", kpiId: "chama.sms_credits_outstanding" },
  { platform: "pms", kpiId: "pms.tokens_outstanding" },
];

/** Platforms whose pay.net_revenue feeds cross.revenue_share. */
export const REVENUE_PLATFORMS: ProductPlatform[] = ["pms", "register", "chama", "cyber"];

export const REVENUE_STREAMS = ["commission", "sms", "subscription", "reports", "markup"] as const;

/** Platforms whose SMS net revenue feeds cross.sms_margin (Plot Yangu excluded: usage unknown). */
export const SMS_MARGIN_PLATFORMS: ProductPlatform[] = ["register", "chama"];

/**
 * KPIs never derived to weekly/monthly: diagnostics, and the freshness KPIs this layer writes daily only.
 */
export const NOT_DERIVED_KPI_IDS: ReadonlySet<string> = new Set([
  "pay.stats_counter",
  "company.data_freshness_hours",
  "company.data_freshness_max_hours",
  "company.collectors_stale",
]);
