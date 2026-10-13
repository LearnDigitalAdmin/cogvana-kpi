import { DocRecord } from "../../core/reader";
import { Metric } from "../../core/values";
import { num, pct, toCents } from "../../core/money";

/**
 * chamas/{id}/transactions is the money ledger: every contribution, repayment, disbursement and
 * MGR movement (manual or Paystack) writes a row. `amount` is the chama's net money; fees are separate.
 * Member names, phones and notes are never selected.
 */
export const LEDGER_SELECT = ["type", "direction", "amount", "method", "channel"];

/** Rows must live at chamas/{chamaId}/transactions/{id}; anything else is ignored. */
export function chamaIdOf(path: string): string | null {
  const parts = path.split("/");
  return parts[0] === "chamas" && parts[1] ? parts[1] : null;
}

export interface LedgerRow {
  chamaId: string;
  type: string;
  inbound: boolean;
  cents: number;
  paystack: boolean;
  whatsapp: boolean;
}

export function toLedgerRow(rec: DocRecord): LedgerRow | null {
  const chamaId = chamaIdOf(rec.path);
  if (!chamaId) return null;
  const d = rec.data;
  return {
    chamaId,
    type: typeof d.type === "string" ? d.type : "",
    inbound: d.direction === "in",
    cents: toCents(num(d.amount) ?? 0),
    paystack: d.method === "paystack",
    whatsapp: d.channel === "whatsapp",
  };
}

export function ledgerMetrics(rows: LedgerRow[]): Record<string, Metric> {
  const sum = (pick: (r: LedgerRow) => boolean) => rows.filter(pick).reduce((t, r) => t + r.cents, 0);
  const contributions = rows.filter((r) => r.type === "contribution");
  const moneyIn = sum((r) => r.inbound);
  const digitalIn = sum((r) => r.inbound && r.paystack);
  const paystackRows = rows.filter((r) => r.inbound && r.paystack);
  const whatsapp = paystackRows.filter((r) => r.whatsapp).length;
  return {
    "chama.contribution_volume": { value: contributions.reduce((t, r) => t + r.cents, 0) },
    "chama.contribution_count": { value: contributions.length },
    "chama.loan_repayment_volume": { value: sum((r) => r.type === "loan_repayment") },
    "chama.loans_disbursed_volume": { value: sum((r) => r.type === "loan_disbursement") },
    "chama.mgr_contribution_volume": { value: sum((r) => r.type === "mgr_contribution") },
    "chama.mgr_payout_volume": { value: sum((r) => r.type === "mgr_payout") },
    "chama.money_in_volume": { value: moneyIn },
    "chama.digital_payment_share": { value: pct(digitalIn, moneyIn), numerator: digitalIn, denominator: moneyIn },
    "chama.whatsapp_payment_share": { value: pct(whatsapp, paystackRows.length), numerator: whatsapp, denominator: paystackRows.length },
  };
}

/** Chamas with at least one ledger row. */
export function activeChamas(rows: LedgerRow[]): Set<string> {
  return new Set(rows.map((r) => r.chamaId));
}
