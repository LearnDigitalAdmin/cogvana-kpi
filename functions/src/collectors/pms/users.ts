import { DocRecord, SourceReader } from "../../core/reader";
import { Metric } from "../../core/values";
import { num, pct } from "../../core/money";
import { toMillis } from "../../core/timestamps";

const DAY_MS = 86_400_000;
const SRC = "default" as const;

/**
 * PMS accounts live in the shared top-level `users` collection (Cyber users are there too).
 * A PMS account is recognised by a numeric `localId`. The numeric range query below returns ONLY documents
 * whose localId is a number, so Cyber users are never read. Credentials, names, phones and emails are never selected
 * (the cloud user document contains a password hash; it is not touched).
 */
export const USER_SELECT = [
  "localId", "tier", "storage", "isTrial", "trialStartedAt", "subscriptionExpiry", "lastPaymentDate", "lastSyncTime", "tokens", "messageTokens",
];

export const KNOWN_TIERS = ["free", "low", "business", "enterprise"] as const;

export interface PmsUser {
  id: string;
  tier: string;
  paid: boolean;
  isTrial: boolean;
  trialStartedAt: number | null;
  expiry: number | null;
  lastPayment: number | null;
  lastSync: number | null;
  tokens: number;
}

export function toPmsUser(rec: DocRecord): PmsUser {
  const d = rec.data;
  return {
    id: rec.id,
    tier: typeof d.tier === "string" ? d.tier.trim().toLowerCase() : "",
    paid: d.storage === true,
    isTrial: d.isTrial === true,
    trialStartedAt: toMillis(d.trialStartedAt),
    expiry: toMillis(d.subscriptionExpiry),
    lastPayment: toMillis(d.lastPaymentDate),
    lastSync: toMillis(d.lastSyncTime),
    // Plot Yangu keeps its SMS balance in `tokens` (credited by PAY, spent by the whatsapp functions); messageTokens is Register's name.
    tokens: num(d.tokens) ?? num(d.messageTokens) ?? 0,
  };
}

/** All PMS accounts (explicit fields only). One read per PMS account. */
export async function loadPmsUsers(reader: SourceReader): Promise<PmsUser[]> {
  const docs = await reader.queryRange({
    source: SRC, collection: "users", timeField: "localId", timeType: "epochMs",
    startMs: 1, endMs: Number.MAX_SAFE_INTEGER, select: USER_SELECT,
  });
  return docs.map(toPmsUser);
}

/** PMS accounts whose `field` falls in the window; Cyber users that share the collection are dropped by localId. */
export async function pmsUsersIn(
  reader: SourceReader, field: "createdAt" | "trialStartedAt", type: "isoString" | "timestamp", startMs: number, endMs: number
): Promise<DocRecord[]> {
  const docs = await reader.queryRange({ source: SRC, collection: "users", timeField: field, timeType: type, startMs, endMs, select: ["localId"] });
  return docs.filter((d) => typeof d.data.localId === "number");
}

export function accountMetrics(users: PmsUser[], now: number): Record<string, Metric> {
  const active = (u: PmsUser) => u.paid && !u.isTrial && u.expiry !== null && u.expiry > now;
  const trialsRunning = users.filter((u) => u.isTrial && u.expiry !== null && u.expiry > now);
  const everTrial = users.filter((u) => u.trialStartedAt !== null);
  const converted = everTrial.filter((u) => u.lastPayment !== null && u.lastPayment >= (u.trialStartedAt as number));
  return {
    "pms.users_total": { value: users.length },
    "pms.users_synced_7d": { value: users.filter((u) => u.lastSync !== null && u.lastSync >= now - 7 * DAY_MS).length },
    "pms.paid_active": { value: users.filter(active).length },
    "pms.paid_expiring_14d": { value: users.filter((u) => active(u) && (u.expiry as number) <= now + 14 * DAY_MS).length },
    "pms.paid_lapsed_14d": {
      value: users.filter((u) => u.paid && !u.isTrial && u.expiry !== null && u.expiry <= now && u.expiry >= now - 14 * DAY_MS).length,
    },
    "pms.paid_stale_sync_7d": { value: users.filter((u) => u.paid && (u.lastSync === null || u.lastSync < now - 7 * DAY_MS)).length },
    "pms.trials_active": { value: trialsRunning.length },
    "pms.trials_expiring_7d": { value: trialsRunning.filter((u) => (u.expiry as number) <= now + 7 * DAY_MS).length },
    "pms.trials_awaiting_downgrade": { value: users.filter((u) => u.isTrial && u.expiry !== null && u.expiry <= now).length },
    "pms.trial_conversion_rate": { value: pct(converted.length, everTrial.length), numerator: converted.length, denominator: everTrial.length },
    "pms.tokens_outstanding": { value: users.reduce((t, u) => t + u.tokens, 0) },
  };
}

/** Accounts per tier: the four known tiers always, anything else under "other" when present. */
export function tierCounts(users: PmsUser[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(KNOWN_TIERS.map((t) => [t, 0]));
  let other = 0;
  for (const u of users) {
    if ((KNOWN_TIERS as readonly string[]).includes(u.tier)) out[u.tier]++;
    else other++;
  }
  if (other > 0) out.other = other;
  return out;
}
