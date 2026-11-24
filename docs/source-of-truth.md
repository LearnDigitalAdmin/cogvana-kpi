# Source-of-truth map (PAY-settled payments)

PAY's Paystack webhook is the only payment handler; every collection below is written by it or by the app that initiates the charge.

| Charge type | Ref prefix | Database | Collection | Time field | Status field | Amount fields | Recorded fee |
|-------------|------------|----------|------------|------------|--------------|---------------|--------------|
| Plot Yangu rent | `INV_` | default | `transactions` | `createdAt` (Timestamp) | `status` | `paystackResponse.amount` (subunits), `.fees`, `.fees_split.integration` | yes |
| Plot Yangu subscription | `SUB_` | default | `subscriptions` | `initiatedAt` (Timestamp) | `status` | `paystackResponse.amount/fees` (subunits); `amount` (KES); `agentId` | yes |
| Plot Yangu SMS | `SMS_` | default | `sms-topup-transactions` | `createdAt` | `status` | `grossAmount`, `paystackFees`, `amountReceived` (KES) | yes |
| Register SMS | `SMS_` | register | `sms-topup-transactions` | `createdAt` | `status` | same | yes |
| Cyber service | `CYBER_` | default | `cyber-transactions` | `createdAt` | `status` | `paystackResponse.amount/fees` (subunits) | yes |
| Report charge | `REPORT_` | default | `report_charges` | `createdAtTimestamp` (epoch ms) | `status` | `paystackResponse.amount/fees` (KES) | yes |
| Chama member payment | `MCW-` `MCA-` | chama | `chamas/{id}/paymentIntents` | `createdAt` (epoch ms) | `status` | `amount`, `grossAmount`, `paystackFee`, `ourFee` (KES) | yes |
| Chama SMS credits | `MCS-` | chama | `chamas/{id}/smsTopUps` | `createdAt` (epoch ms) | `status` | `amountKes` | no |
| Chama plan | `MCP-` | chama | `chamas/{id}/planBilling` | `createdAt` (epoch ms) | `status` | `amountKes` | no |
| Chama report credits | `MCX-` | chama | `chamas/{id}/reportCreditTopUps` | `createdAt` (epoch ms) | `status` | `amountKes` | no |
| Chama pay-per-report | `MCR-` | chama | `chamas/{id}/reportAlacartePurchases` | `createdAt` (epoch ms) | `status` | `amountKes` | no |

Running counters: `platform_stats/totals` in the default database (report and Plot Yangu SMS counters) and in Register's database (Register SMS counters). Snapshotted daily; not used to compute KPIs.

## Constants copied from PAY (change here if they change there)

| Constant | Value | PAY location |
|----------|-------|--------------|
| Rent tier commission % | SOLO 2.4, BUSINESS 1.5, PRO 1.9, ENTERPRISE 1.0 (unknown tier = SOLO) | `TIER_RATES` |
| Cyber commission % | 2.5 of (gross − fee) | `handleCyberCharge` |
| Agent share on Plot Yangu subscriptions | 45% of (gross − fee) | `handlePlotYanguSubscriptionCharge` |

All three live in `functions/src/collectors/pay/adapters/config.ts`.

## Known limits (read before trusting a number)

1. **Rent commission may be an estimate.** If Paystack's split share is not stored on the transaction, commission = gross × tier rate. These payments are counted in `pay.net_revenue_unverified`. The dry run shows how many are estimates; if most are, the fix is to have PAY store the split amount at settlement.
2. **Chama SMS, plan and report purchases do not record the Paystack fee**, so their net revenue equals the amount sold and is flagged unverified.
3. **Assumed field semantics (verify with the dry run):** `transactions.paystackResponse` and `cyber-transactions.paystackResponse` hold the raw webhook payload (subunits); `report_charges.paystackResponse` holds decimal KES.
4. **Chama collection-group queries** need indexes on the Chama project (`source-indexes/`); without them the reader falls back to per-chama queries (slower, still correct). This fallback path is not covered by the automated tests.
5. **Pending is never expired at source**, so old pending records stay pending; only records created on the day are counted, and "stuck" is reported separately.

---

# Register (schools) sources

Database: `my-register-728ff` (the `register` source). No composite indexes are needed: every query is a single-field range, a single equality, or an unfiltered aggregate.

| KPI group | Collection | Field used | Stored as | Notes |
|-----------|------------|------------|-----------|-------|
| Active schools, marking rate, attendance | `registers` | `date` | `YYYY-MM-DD` school day | One record per class per day. **Teacher-saved = `locked: true`.** The noon job writes placeholders (`locked: false`, `autoUnmarked: true`, `savedBy: "system"`) that never count as activity |
| Messages sent / failed / tokens used | `messages` | `sentAt` | ISO string | Written by the **browser** (and by the scheduler, which adds `scheduleId`). Token deduction also happens in the browser, so tokens used is an estimate |
| Token blocks | `messages` | `status`, `smsSegments`, `tokensUsed`, `delivered` | - | Inferred: failed with all three at zero is the app's insufficient-tokens block. No stored flag exists |
| Provider acceptance | `sms-logs` | `createdAt` | Timestamp | Written by the `sendSms` function. `sent` means the provider accepted the call, not that a handset received it |
| Tokens sold, schools buying | `sms-topup-transactions` | `createdAt` | Timestamp | Written by PAY. Money is in the PAY KPIs |
| New schools | `schools` | `createdAt` | ISO string | Aggregate count only |
| New students | `students` | `createdAt` | ISO string | Aggregate count only. Bulk imports create many at once |
| Stock snapshot | `schools`, `users` (`role`, `messageTokens`), `students` (`archived`), `scheduledMessages` (`status`) | - | - | Aggregates only (count and sum); no documents are read |

Never selected, by design: message text, recipient lists, phone numbers, names, emails.

## Register known limits

1. **Stock KPIs start at go-live.** Teachers, active students, unspent tokens and stalled schedules cannot be reconstructed for past days, so they are snapshotted at 23:55 Nairobi. Flow KPIs can be backfilled.
2. **Tokens used is an estimate.** The browser deducts tokens and writes the message record; a failed deduction is swallowed. Treat it as usage, not an audit figure.
3. **"Blocked: no tokens" is inferred** from the failed-with-zeros signature. The dry run will show whether the numbers look plausible.
4. **Token balances live on user accounts**, not on schools. `tokens_outstanding` is the sum across all users, including tokens admins have allocated to teachers.
5. **Deliberately not built:** a "sends without a message record" reconciliation. Token-warning SMS also pass through `sms-logs` without a message record, so it would be permanently noisy.
6. **Low-token schools** (balance below expected burn) needs a per-school balance sum over user accounts and a threshold decision; deferred.

---

# Chama sources

Database: `mychama1` (the `chama` source). Everything lives under `chamas/{chamaId}/...` and is read through collection-group queries. Without source-side group indexes the reader falls back to per-chama queries automatically (slower, still correct); the indexes are in `source-indexes/mychama1.indexes-to-add.json`.

| KPI group | Collection | Field used | Stored as | Notes |
|-----------|------------|------------|-----------|-------|
| Money flows, active chamas, digital and WhatsApp share | `chamas/{id}/transactions` | `createdAt` | epoch ms | The ledger: every manual or Paystack money movement. `amount` is the chama's net money; fees are separate fields. Rows outside `chamas/{id}/transactions` are ignored |
| SMS usage | `chamas/{id}/smsLog` | `createdAt` | epoch ms | `recipientCount`, `sentCount`, `creditsUsed`. Message text and recipient ids never selected |
| New chamas | `chamas` | `createdAt` | epoch ms | Aggregate count |
| New members | `chamas/{id}/members` | `createdAt` | epoch ms | Aggregate count (group) |
| Plans, expiring plans, credits | `chamas` | `plan`, `planExpiry` (`YYYY-MM-DD`), `smsCredits`, `reportCreditsBalance` | - | Aggregates only |
| Active members | `chamas/{id}/members` | `status == active` | - | Aggregate count (group) |
| Loan book, past due, portfolio at risk | `chamas/{id}/loans` | `status in (active, overdue)`, `schedule[]` | - | Outstanding = unpaid installments (due minus paidAmount); past due = installment `dueDate` before today |
| Overdue contributions | `chamas/{id}/contributions` | `status == overdue` | - | Status set by the nightly sweep |
| MGR | `chamas/{id}/mgrPots` (+ `/arrears`) | `status == active`, `pendingShortfall`; arrears `status == open` | - | Arrears read per active pot by exact path |

Company revenue from Chama (markup, plans, SMS credits, report credits) is in the PAY KPIs, not here.

## Chama known limits

1. **Stock KPIs start at go-live** (plans, members, loans, overdue, MGR, credits): snapshotted at 23:55 Nairobi.
2. **Collection rate by due date is deliberately not built.** It would change meaning as members pay late, and backfilled values would differ from live ones. Overdue amounts and count give the live picture instead.
3. **Plan expiry uses UTC dates** in the source; Nairobi is 3 hours ahead, so the 14-day window can be off by that margin.
4. **`digital_payment_share` depends on `method`** being set on ledger rows; rows with no method count as not digital.
5. **Not built yet:** per-chama health scores and member-level metrics (Customer 360, later phase).

---

# Plot Yangu (PMS) sources

Database: the default database (`plot-9fd6e`), shared with PAY and Cyber. PMS is local-first: the app keeps SQLite on the device and mirrors it to Firestore on sync, spreading each local row into the cloud document. Every PMS figure is **as of last sync**; recent days rise as devices sync (a weekly refresh recomputes the last 21 days).

| KPI group | Path | Fields used | Stored as | Notes |
|-----------|------|-------------|-----------|-------|
| Accounts, plans, trials, sync health, tokens | `users/{userId}` (top-level, shared with Cyber) | `localId` (number, marks a PMS user), `tier`, `storage`, `isTrial`, `trialStartedAt`, `subscriptionExpiry`, `lastPaymentDate`, `lastSyncTime`, `tokens` (Plot Yangu's balance; `messageTokens` is Register's name and is only a fallback), `createdAt` | Timestamps for the five time fields; `createdAt` is an ISO string | **Never selected: `passwordHash`, `email`, `phone`, `name`.** The cloud user document does contain the password hash, which is a security issue to fix at source |
| Properties | `users/{u}/properties/{id}` | `createdAt` | ISO string | Group `properties`; fallback parent `users` |
| Units, occupancy | `users/{u}/properties/{p}/units/{id}` | `isOccupied` | boolean | Group `units` (nested two levels): needs the group index, no fallback |
| Tenants | `users/{u}/tenants/{id}` | `createdAt`, `isActive`, `userId` | ISO string, boolean | Group `tenants`. A top-level `tenants` collection also exists (Cyber); rows outside `users/{u}/tenants` are ignored |
| Invoices, receivables, collection rate | `users/{u}/invoices/{id}` | `createdAt`, `userId`, `totalAmount`, `amountPaid`, `isPaid`, `dueDate`, `billingMonth` (`YYYY-MM`) | ISO string; amounts decimal KES | Group `invoices`; top-level `invoices` (Cyber) ignored by path |
| Payments recorded, rent collected | `users/{u}/invoices/{i}/payments/{id}` | `paymentDate`, `amount`, `userId` | string (date or ISO datetime); decimal KES | Group `payments` (nested): needs the group index. Top-level `payments` ignored by path |

PMS commission, subscriptions and SMS sales are PAY KPIs (`pay.*` with platform `pms`). PMS SMS **consumption** is not synced to the cloud (only the `messageTokens` balance), so there is no PMS SMS usage KPI.

## PMS known limits

1. **As of last sync.** A manager who has not synced for a week has a week of missing invoices and payments. `pms.paid_stale_sync_7d` counts them.
2. **`users` is shared with Cyber.** PMS users are recognised by a numeric `localId`; tier counts use the `tier` field, which only PMS writes.
3. **Stock KPIs start at go-live**, like Register and Chama.
4. **Trial downgrade runs weekly (Mondays 08:00 Nairobi)**, so expired trials can still look like trials until then (`pms.trials_awaiting_downgrade`).
5. **The recorded rent commission rate** is read from `paymentAccounts/{userId}.commissionRate` (written when the Paystack account is set up) by the PAY rent adapter, so most rent commission is no longer an estimate.

---

# Samuhia Desk, WhatsApp bot (formerly Samuhia Cyber)

Database: the default database. Cyber keeps **no WhatsApp message log**. `whatsapp_sessions/{phone}` holds one short-lived document per phone (30-minute timeout, overwritten on the next conversation; `createdAt` and `lastActive` are epoch seconds). The document id is a phone number, so it is never selected.

| KPI family | Path | Fields | Notes |
|------------|------|--------|-------|
| **Exact** (usage meter) | `whatsapp_usage/{YYYY-MM-DD}` | `inbound`, `outbound`, `outboundFailed`, `sessionsStarted` (counters), `users` (map of salted-hash keys to true) | Written by the meter in the CYBER repo (`functions/src/utils/whatsapp.usage.ts`). Days before it went live have no document, so no values (absent, not zero) |
| **Approximate** (works today) | `whatsapp_sessions` | `lastActive` (epoch seconds) | Count only; one document per phone at its latest activity |

Flagged, not collected (status `planned` in the registry): shops, sales, expenses, reports generated and failed, new shops.

## Plot Yangu SMS usage (added)

`users/{u}/sms-sent-log/{id}` (default database, group `sms-sent-log`): `sentAt` (Timestamp), `recipientCount`, `tokensCharged`, `successCount`, `failCount`. Written by the server when a message is sent, so unlike the rest of PMS it is exact, not "as of last sync". Needs the `sms-sent-log.sentAt` collection-group index in `source-indexes/plot-9fd6e.indexes-to-add.json`. Plot Yangu now feeds `cross.sms_units_used` and the SMS margin.

# Samuhia Desk, agent network (added)

Database: the default database (`plot-9fd6e`). Times are epoch ms; money is integer minor units (KES x 100). Never selected: names, phones, emails, ID numbers, request or support text, documents.

| Figure | Collection | Fields read | Notes |
|---|---|---|---|
| Agents, applications | `desk_agents` | `status`, `createdAt` | Statuses: applied, training, certified, active, suspended, closed |
| Owned customers | `desk_customers` | `product`, `firstPurchaseUsed` | Product is chama, school or pms |
| Work sessions, agents working, customers served | `desk_sessions` | `agentId`, `entityKey`, `otpVerifiedAt`, `createdAt` | `entityKey` is `product:id`; only the product prefix is used |
| Paid services | `desk_tickets` | `status`, `serviceType`, `amountMinor`, `grossMinor`, `platformMinor`, `createdAt` | Paid or committed counts as sold. The same money is in the PAY Cyber stream |
| Desk-attributed sales, agent share | `desk_events` (written by PAY) | `type`, `product`, `grossMinor`, `feeMinor`, `agentSharePct`, `credits`, `paidAt` | Agent share = floor((gross − fee) × share), as PAY's split computes it. `pay.net_revenue` does not subtract it |
| Agent earnings, payouts waiting | `desk_ledger` | `kind`, `status`, `amountMinor`, `createdAt` | Void entries and reversals are excluded from earnings; payable and processing are stock counts |
| Support | `desk_support`, `desk_requests` | `category`, `customerConfirmedAt`, `source`, `status`, `createdAt` | Message and reply text is never selected |
| Rent batches | `desk_rent_batches` | `results[].status`, `createdAt` | Counts sent and failed STK prompts |

Service charges (`CYBER_DSK_`) go through `cyber-transactions`, which stores `commissionRate`; the PAY cyber adapter uses it when present.
