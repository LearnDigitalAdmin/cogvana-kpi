# Cyber WhatsApp usage meter (drop into the CYBER repo)

Cyber keeps no WhatsApp message log (sessions are short-lived and keyed by phone number), so exact usage cannot
be read from existing data. This meter adds one counter document per day that the KPI pipeline reads.

Copy these three files into the CYBER repo at the same paths, then deploy functions:

- `functions/src/utils/whatsapp.usage.ts`      (new)
- `functions/src/services/session.service.ts`  (full file; adds 3 lines)
- `functions/src/services/whatsapp.service.ts` (full file; adds 4 lines)

Set `WA_USAGE_SALT` (long random string) in the CYBER functions environment so stored user keys cannot be reversed.
Until deployed, the KPI pipeline reports only the approximate session-based KPIs (`cyber.wa_users_seen`, `cyber.wa_known_users`).
Exact KPIs (`cyber.wa_messages_in`, `_out`, `_out_failed`, `wa_sessions_started`, `wa_users_active`, `wa_delivery_success_rate`)
start on the first day the meter is live; days before that have no values (absent, not zero).
