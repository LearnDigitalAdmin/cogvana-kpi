import { defineKpi } from "../core/registry";

/**
 * Cyber KPIs. Scope for now: WhatsApp usage only. Cyber keeps no WhatsApp message log: `whatsapp_sessions` holds one
 * short-lived document per phone number (30-minute timeout, overwritten on the next conversation). Two families:
 *  - EXACT, from the usage meter in `cyber-whatsapp-meter/` (collection `whatsapp_usage`, one document per Nairobi day).
 *    Values exist only from the day the meter is deployed; earlier days are absent, not zero.
 *  - APPROXIMATE, from `whatsapp_sessions`, available without the meter. Each phone appears once, at its latest activity.
 * Everything else Cyber measures is listed with status "planned" and is not collected yet.
 */
const COMMON = { scope: "platform" as const, platform: "cyber" as const, owner: "Sam", dimensions: [] as string[] };
const PLANNED = { status: "planned" as const };

export const CYBER_DEFINITIONS = [
  // ---- exact (usage meter) ----
  defineKpi({ ...COMMON, id: "cyber.wa_messages_in", name: "WhatsApp messages received", description: "Inbound messages the bot processed.", type: "flow", unit: "count", direction: "higher_is_better", formula: "Meter field inbound for the Nairobi day.", decision: "Bot demand." }),
  defineKpi({ ...COMMON, id: "cyber.wa_messages_out", name: "WhatsApp messages sent", description: "Outbound messages the bot sent (replies and notifications).", type: "flow", unit: "count", formula: "Meter field outbound for the day.", decision: "Cloud API volume and cost driver." }),
  defineKpi({ ...COMMON, id: "cyber.wa_messages_out_failed", name: "WhatsApp sends failed", description: "Outbound messages the WhatsApp API rejected or that errored.", type: "flow", unit: "count", direction: "lower_is_better", formula: "Meter field outboundFailed for the day.", decision: "Spikes mean token, template or API trouble: fix first." }),
  defineKpi({ ...COMMON, id: "cyber.wa_delivery_success_rate", name: "WhatsApp send success rate", description: "Share of outbound messages accepted by the WhatsApp API.", type: "ratio", unit: "percent", direction: "higher_is_better", formula: "(outbound - outboundFailed) / outbound x 100.", numeratorDesc: "Outbound accepted", denominatorDesc: "Outbound attempted", decision: "Operational health of the channel." }),
  defineKpi({ ...COMMON, id: "cyber.wa_sessions_started", name: "WhatsApp conversations started", description: "New conversation sessions (a session ends after 30 idle minutes).", type: "flow", unit: "count", direction: "higher_is_better", formula: "Meter field sessionsStarted for the day.", decision: "How often people come back to the bot." }),
  defineKpi({ ...COMMON, id: "cyber.wa_users_active", grains: ["daily", "weekly", "monthly"], name: "Active WhatsApp users", description: "Distinct people who messaged the bot in the period. The headline Cyber usage number.", type: "flow", unit: "count", direction: "higher_is_better", formula: "Distinct hashed-phone keys in the meter's users map over the period. Daily, weekly (Mon-Sun) and monthly values.", decision: "Real usage; compare with Cyber sign-ups." }),
  // ---- approximate (sessions; works before the meter) ----
  defineKpi({ ...COMMON, id: "cyber.wa_users_seen",
    caveat: "Approximate: each phone counts once, at its latest activity.", name: "WhatsApp users seen (approx.)", description: "Phones whose latest session activity falls on the day. Understates: a returning user moves to a later day.", type: "flow", unit: "count", formula: "Count of whatsapp_sessions documents with lastActive on the day. Approximate; superseded by active users once the meter is live.", decision: "Directional usage before the meter exists." }),
  defineKpi({ ...COMMON, id: "cyber.wa_known_users",
    caveat: "Approximate: one session document per phone.", name: "WhatsApp users known (approx.)", description: "Distinct phones with a session document at snapshot time.", type: "stock", unit: "count", formula: "Count of whatsapp_sessions documents at 23:55 Nairobi. Documents are overwritten per phone, so this approximates distinct recent users.", decision: "Rough size of the WhatsApp audience." }),
  // ---- planned (not collected) ----
  defineKpi({ ...COMMON, ...PLANNED, id: "cyber.shops_total", name: "Shops registered", description: "Shops set up through the bot.", type: "stock", unit: "count", formula: "Count of shops. Not collected yet.", decision: "Size of the Cyber customer base." }),
  defineKpi({ ...COMMON, ...PLANNED, id: "cyber.shops_new", name: "New shops", description: "Shops created on the day.", type: "flow", unit: "count", formula: "Count of shops created on the day. Not collected yet.", decision: "Acquisition pace." }),
  defineKpi({ ...COMMON, ...PLANNED, id: "cyber.sales_recorded", name: "Sales recorded", description: "Sales logged through the bot.", type: "flow", unit: "count", formula: "Count of shop sales. Not collected yet.", decision: "Core product usage." }),
  defineKpi({ ...COMMON, ...PLANNED, id: "cyber.sales_value", name: "Sales value recorded", description: "Value of sales logged through the bot.", type: "flow", unit: "KES_CENTS", formula: "Sum of sale amounts. Not collected yet.", decision: "Money passing through shops." }),
  defineKpi({ ...COMMON, ...PLANNED, id: "cyber.expenses_recorded", name: "Expenses recorded", description: "Expenses logged through the bot.", type: "flow", unit: "count", formula: "Count of shop expenses. Not collected yet.", decision: "Depth of usage." }),
  defineKpi({ ...COMMON, ...PLANNED, id: "cyber.reports_generated", name: "Reports generated", description: "Business reports produced.", type: "flow", unit: "count", formula: "Count of completed report jobs. Not collected yet (report charges are already in the PAY KPIs).", decision: "Feature demand." }),
  defineKpi({ ...COMMON, ...PLANNED, id: "cyber.report_jobs_failed", name: "Report jobs failed", description: "Report requests that failed.", type: "flow", unit: "count", direction: "lower_is_better", formula: "Count of failed report jobs. Not collected yet.", decision: "Reliability of a paid feature." }),
];
