import { DocRecord } from "../../core/reader";
import { Metric } from "../../core/values";
import { num, pct } from "../../core/money";

/**
 * `messages` is written by the BROWSER (and by the scheduler on the server) and
 * drives token accounting. `sms-logs` is written by the sendSms function and records
 * what the SMS provider accepted. Message text, recipients and phone numbers are
 * never selected.
 */
export const MESSAGE_SELECT = ["schoolId", "status", "recipientCount", "delivered", "tokensUsed", "smsSegments", "scheduleId"];
export const SMS_LOG_SELECT = ["schoolId", "status"];

export type MessageClass = "sent" | "partial" | "blocked" | "failed" | "other";

export interface MessageRow {
  schoolId: string | null;
  cls: MessageClass;
  recipients: number;
  tokensUsed: number;
  scheduled: boolean;
}

/**
 * The app's insufficient-tokens block writes a failed message with zero segments,
 * zero tokens and zero delivered. That signature is used to tell it apart from a
 * genuine send failure. It is an inference: there is no stored "blocked" flag.
 */
export function classifyMessage(d: Record<string, unknown>): MessageClass {
  const status = typeof d.status === "string" ? d.status.trim().toLowerCase() : "";
  if (status === "sent") return "sent";
  if (status === "partial") return "partial";
  if (status === "failed") {
    const blocked = (num(d.smsSegments) ?? 0) === 0 && (num(d.tokensUsed) ?? 0) === 0 && (num(d.delivered) ?? 0) === 0;
    return blocked ? "blocked" : "failed";
  }
  return "other";
}

export function toMessageRow(rec: DocRecord): MessageRow {
  const d = rec.data;
  const cls = classifyMessage(d);
  return {
    schoolId: typeof d.schoolId === "string" && d.schoolId ? d.schoolId : null,
    cls,
    recipients: num(d.delivered) ?? num(d.recipientCount) ?? 0,
    tokensUsed: num(d.tokensUsed) ?? 0,
    scheduled: typeof d.scheduleId === "string" && d.scheduleId.length > 0,
  };
}

export function messageMetrics(rows: MessageRow[]): Record<string, Metric> {
  const count = (c: MessageClass) => rows.filter((r) => r.cls === c).length;
  const sent = count("sent");
  const partial = count("partial");
  const failed = count("failed");
  const out = rows.filter((r) => r.cls === "sent" || r.cls === "partial");
  const reachedProvider = sent + partial + failed;
  return {
    "register.sms_messages_sent": { value: sent + partial },
    "register.sms_messages_failed": { value: failed },
    "register.sms_blocked_no_tokens": { value: count("blocked") },
    "register.sms_success_rate": { value: pct(sent, reachedProvider), numerator: sent, denominator: reachedProvider },
    "register.sms_recipients": { value: out.reduce((t, r) => t + r.recipients, 0) },
    "register.sms_tokens_used": { value: rows.reduce((t, r) => t + r.tokensUsed, 0) },
    "register.sms_scheduled_messages": { value: out.filter((r) => r.scheduled).length },
  };
}

/** Schools that sent at least one message. */
export function messagingSchools(rows: MessageRow[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) if ((r.cls === "sent" || r.cls === "partial") && r.schoolId) out.add(r.schoolId);
  return out;
}

export function providerMetrics(logs: DocRecord[]): Record<string, Metric> {
  let sent = 0;
  let failed = 0;
  for (const l of logs) {
    const s = typeof l.data.status === "string" ? l.data.status.trim().toLowerCase() : "";
    if (s === "sent") sent++;
    else if (s === "failed") failed++;
  }
  return {
    "register.sms_log_sent": { value: sent },
    "register.sms_log_failed": { value: failed },
    "register.sms_provider_success_rate": { value: pct(sent, sent + failed), numerator: sent, denominator: sent + failed },
  };
}
