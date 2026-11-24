# WhatsApp usage meter (now part of the CYBER repo)

The meter that writes `whatsapp_usage/{YYYY-MM-DD}` is now in the CYBER repo at `functions/src/utils/whatsapp.usage.ts`
(called from `functions/src/services/session.service.ts`). The files that used to be copied from this folder are no longer
needed; this folder is kept only for its history.

Document shape (unchanged): `{ day, inbound, outbound, outboundFailed, sessionsStarted, users: { "<16-hex salted hash>": true }, updatedAt }`.
Set `WA_USAGE_SALT` on the CYBER functions so hashes are not guessable. Phone numbers are never stored.
