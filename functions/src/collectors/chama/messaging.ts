import { DocRecord } from "../../core/reader";
import { Metric } from "../../core/values";
import { num, pct } from "../../core/money";
import { chamaIdOf } from "./ledger";

/** chamas/{id}/smsLog: one entry per bulk send. Message text and recipient ids are never selected. */
export const SMS_SELECT = ["recipientCount", "sentCount", "creditsUsed"];

export interface SmsRow {
  chamaId: string;
  recipients: number;
  sent: number;
  credits: number;
}

export function toSmsRow(rec: DocRecord): SmsRow | null {
  const chamaId = chamaIdOf(rec.path);
  if (!chamaId) return null;
  return {
    chamaId,
    recipients: num(rec.data.recipientCount) ?? 0,
    sent: num(rec.data.sentCount) ?? 0,
    credits: num(rec.data.creditsUsed) ?? 0,
  };
}

export function smsMetrics(rows: SmsRow[]): Record<string, Metric> {
  const recipients = rows.reduce((t, r) => t + r.recipients, 0);
  const sent = rows.reduce((t, r) => t + r.sent, 0);
  return {
    "chama.sms_messages": { value: rows.length },
    "chama.sms_recipients_sent": { value: sent },
    "chama.sms_credits_used": { value: rows.reduce((t, r) => t + r.credits, 0) },
    "chama.sms_delivery_rate": { value: pct(sent, recipients), numerator: sent, denominator: recipients },
  };
}

export function messagingChamas(rows: SmsRow[]): Set<string> {
  return new Set(rows.map((r) => r.chamaId));
}
