# KPI catalogue (generated)

146 KPIs.

| id | name | scope | platform | type | unit | grains | dimensions | direction | status | caveat |
|----|------|-------|----------|------|------|--------|------------|-----------|--------|--------|
| `pay.attempts` | Payment attempts | platform | all | flow | count | daily | chargeType,stream | neutral | active |  |
| `pay.success` | Successful payments | platform | all | flow | count | daily | chargeType,stream | higher_is_better | active |  |
| `pay.failed` | Failed payments | platform | all | flow | count | daily | chargeType,stream | lower_is_better | active |  |
| `pay.stuck_pending` | Stuck pending payments | platform | all | flow | count | daily | chargeType,stream | lower_is_better | active |  |
| `pay.success_rate` | Payment success rate | platform | all | ratio | percent | daily | chargeType,stream | higher_is_better | active |  |
| `pay.gmv` | GMV (money charged) | platform | all | flow | KES_CENTS | daily | chargeType,stream | higher_is_better | active |  |
| `pay.gateway_fees` | Gateway fees | platform | all | flow | KES_CENTS | daily | chargeType,stream | neutral | active |  |
| `pay.platform_revenue` | Platform revenue | platform | all | flow | KES_CENTS | daily | chargeType,stream | higher_is_better | active |  |
| `pay.pass_through` | Pass-through (agent share) | platform | all | flow | KES_CENTS | daily | chargeType,stream | neutral | active |  |
| `pay.net_revenue` | Net revenue | platform | all | flow | KES_CENTS | daily | chargeType,stream | higher_is_better | active | Part of this rests on estimates; see "Net revenue not fully verified". |
| `pay.net_revenue_unverified` | Net revenue not fully verified | platform | all | flow | KES_CENTS | daily | chargeType,stream | lower_is_better | active | Rent commission derived from a rate, or sales whose gateway fee is not recorded. |
| `pay.stats_counter` | PAY running counters (snapshot) | platform | all | stock | count | daily | db,counter | neutral | active |  |
| `register.schools_new` | New schools | platform | register | flow | count | daily | - | higher_is_better | active |  |
| `register.students_new` | New students | platform | register | flow | count | daily | - | higher_is_better | active |  |
| `register.schools_total` | Schools (total) | platform | register | stock | count | daily | - | neutral | active |  |
| `register.teachers_total` | Teacher accounts | platform | register | stock | count | daily | - | neutral | active |  |
| `register.school_admins_total` | School admin accounts | platform | register | stock | count | daily | - | neutral | active |  |
| `register.students_total` | Active students | platform | register | stock | count | daily | - | neutral | active |  |
| `register.tokens_outstanding` | Unspent SMS tokens | platform | register | stock | count | daily | - | neutral | active |  |
| `register.schedules_waiting_tokens` | Scheduled messages waiting for tokens | platform | register | stock | count | daily | - | lower_is_better | active |  |
| `register.registers_marked` | Registers marked by teachers | platform | register | flow | count | daily | - | higher_is_better | active |  |
| `register.registers_auto_unmarked` | Registers left unmarked | platform | register | flow | count | daily | - | lower_is_better | active |  |
| `register.register_marking_rate` | Register marking rate | platform | register | ratio | percent | daily | - | higher_is_better | active |  |
| `register.students_attended` | Students attended | platform | register | flow | count | daily | - | neutral | active |  |
| `register.students_absent` | Students absent | platform | register | flow | count | daily | - | neutral | active |  |
| `register.students_excused` | Students excused | platform | register | flow | count | daily | - | neutral | active |  |
| `register.attendance_rate` | Attendance rate | platform | register | ratio | percent | daily | - | higher_is_better | active |  |
| `register.schools_marking` | Active schools (marking) | platform | register | flow | count | daily/weekly/monthly | - | higher_is_better | active |  |
| `register.schools_messaging` | Active schools (messaging) | platform | register | flow | count | daily/weekly/monthly | - | higher_is_better | active |  |
| `register.schools_purchasing` | Schools buying tokens | platform | register | flow | count | daily/weekly/monthly | - | higher_is_better | active |  |
| `register.sms_messages_sent` | Messages sent | platform | register | flow | count | daily | - | higher_is_better | active |  |
| `register.sms_messages_failed` | Messages failed | platform | register | flow | count | daily | - | lower_is_better | active |  |
| `register.sms_blocked_no_tokens` | Sends blocked: no tokens | platform | register | flow | count | daily | - | lower_is_better | active | Inferred from the failed-with-zeros signature; no stored flag. |
| `register.sms_success_rate` | Message success rate | platform | register | ratio | percent | daily | - | higher_is_better | active |  |
| `register.sms_recipients` | SMS recipients | platform | register | flow | count | daily | - | higher_is_better | active |  |
| `register.sms_tokens_used` | Tokens used | platform | register | flow | count | daily | - | neutral | active | Estimate: tokens are deducted and logged by the browser. |
| `register.sms_scheduled_messages` | Scheduled messages sent | platform | register | flow | count | daily | - | neutral | active |  |
| `register.sms_log_sent` | Provider calls accepted | platform | register | flow | count | daily | - | neutral | active |  |
| `register.sms_log_failed` | Provider calls failed | platform | register | flow | count | daily | - | lower_is_better | active |  |
| `register.sms_provider_success_rate` | Provider success rate | platform | register | ratio | percent | daily | - | higher_is_better | active |  |
| `register.tokens_sold` | Tokens sold | platform | register | flow | count | daily | - | higher_is_better | active |  |
| `chama.chamas_new` | New chamas | platform | chama | flow | count | daily | - | higher_is_better | active |  |
| `chama.members_new` | New members | platform | chama | flow | count | daily | - | higher_is_better | active |  |
| `chama.contribution_volume` | Contribution volume | platform | chama | flow | KES_CENTS | daily | - | higher_is_better | active |  |
| `chama.contribution_count` | Contributions received | platform | chama | flow | count | daily | - | higher_is_better | active |  |
| `chama.loan_repayment_volume` | Loan repayments | platform | chama | flow | KES_CENTS | daily | - | higher_is_better | active |  |
| `chama.loans_disbursed_volume` | Loans disbursed | platform | chama | flow | KES_CENTS | daily | - | neutral | active |  |
| `chama.mgr_contribution_volume` | Merry-go-round contributions | platform | chama | flow | KES_CENTS | daily | - | higher_is_better | active |  |
| `chama.mgr_payout_volume` | Merry-go-round payouts | platform | chama | flow | KES_CENTS | daily | - | neutral | active |  |
| `chama.money_in_volume` | Total money in | platform | chama | flow | KES_CENTS | daily | - | higher_is_better | active |  |
| `chama.digital_payment_share` | Digital payment share | platform | chama | ratio | percent | daily | - | higher_is_better | active | Rows with no payment method count as not digital. |
| `chama.whatsapp_payment_share` | WhatsApp payment share | platform | chama | ratio | percent | daily | - | neutral | active |  |
| `chama.chamas_active` | Active chamas (money) | platform | chama | flow | count | daily/weekly/monthly | - | higher_is_better | active |  |
| `chama.chamas_messaging` | Active chamas (SMS) | platform | chama | flow | count | daily/weekly/monthly | - | higher_is_better | active |  |
| `chama.sms_messages` | SMS campaigns sent | platform | chama | flow | count | daily | - | higher_is_better | active |  |
| `chama.sms_recipients_sent` | SMS delivered to provider | platform | chama | flow | count | daily | - | neutral | active |  |
| `chama.sms_credits_used` | SMS credits used | platform | chama | flow | count | daily | - | neutral | active |  |
| `chama.sms_delivery_rate` | SMS acceptance rate | platform | chama | ratio | percent | daily | - | higher_is_better | active |  |
| `chama.chamas_total` | Chamas (total) | platform | chama | stock | count | daily | - | neutral | active |  |
| `chama.chamas_by_plan` | Chamas by plan | platform | chama | stock | count | daily | plan | neutral | active |  |
| `chama.paid_plans_expiring_14d` | Plans expiring within 14 days | platform | chama | stock | count | daily | - | lower_is_better | active | Plan expiry is a UTC date; Nairobi is 3 hours ahead. |
| `chama.members_active` | Active members | platform | chama | stock | count | daily | - | neutral | active |  |
| `chama.sms_credits_outstanding` | Unspent SMS credits | platform | chama | stock | count | daily | - | neutral | active |  |
| `chama.report_credits_outstanding` | Unspent report credits | platform | chama | stock | count | daily | - | neutral | active |  |
| `chama.loans_active` | Open loans | platform | chama | stock | count | daily | - | neutral | active |  |
| `chama.loans_outstanding_balance` | Loan book outstanding | platform | chama | stock | KES_CENTS | daily | - | neutral | active |  |
| `chama.loans_at_risk_count` | Loans past due | platform | chama | stock | count | daily | - | lower_is_better | active |  |
| `chama.loans_at_risk_balance` | Loan balance at risk | platform | chama | stock | KES_CENTS | daily | - | lower_is_better | active |  |
| `chama.portfolio_at_risk` | Portfolio at risk | platform | chama | ratio | percent | daily | - | lower_is_better | active |  |
| `chama.contributions_overdue_count` | Overdue contributions | platform | chama | stock | count | daily | - | lower_is_better | active |  |
| `chama.contributions_overdue_amount` | Overdue contribution amount | platform | chama | stock | KES_CENTS | daily | - | lower_is_better | active |  |
| `chama.chamas_with_overdue_contributions` | Chamas with overdue contributions | platform | chama | stock | count | daily | - | lower_is_better | active |  |
| `chama.mgr_pots_active` | Active merry-go-round pots | platform | chama | stock | count | daily | - | neutral | active |  |
| `chama.mgr_pending_shortfall` | MGR pending shortfall | platform | chama | stock | KES_CENTS | daily | - | lower_is_better | active |  |
| `chama.mgr_arrears_open_count` | Open MGR arrears | platform | chama | stock | count | daily | - | lower_is_better | active |  |
| `chama.mgr_arrears_open_amount` | Open MGR arrears amount | platform | chama | stock | KES_CENTS | daily | - | lower_is_better | active |  |
| `pms.users_new` | New property managers | platform | pms | flow | count | daily | - | higher_is_better | active | As of last sync: accounts count once they reach the cloud. |
| `pms.trials_started` | Trials started | platform | pms | flow | count | daily | - | higher_is_better | active |  |
| `pms.properties_new` | New properties | platform | pms | flow | count | daily | - | higher_is_better | active |  |
| `pms.tenants_new` | New tenants | platform | pms | flow | count | daily | - | higher_is_better | active |  |
| `pms.invoices_issued` | Invoices issued | platform | pms | flow | count | daily | - | higher_is_better | active | As of last sync; recent days rise as devices sync. |
| `pms.invoiced_amount` | Amount invoiced | platform | pms | flow | KES_CENTS | daily | - | higher_is_better | active | As of last sync; recent days rise as devices sync. |
| `pms.payments_recorded` | Payments recorded | platform | pms | flow | count | daily | - | higher_is_better | active | As of last sync; recent days rise as devices sync. |
| `pms.rent_collected` | Rent collected (recorded) | platform | pms | flow | KES_CENTS | daily | - | higher_is_better | active | As of last sync; recent days rise as devices sync. |
| `pms.managers_active` | Active property managers | platform | pms | flow | count | daily/weekly/monthly | - | higher_is_better | active | As of last sync; recent periods rise as devices sync. |
| `pms.users_total` | PMS accounts (total) | platform | pms | stock | count | daily | - | neutral | active |  |
| `pms.users_by_tier` | Accounts by tier | platform | pms | stock | count | daily | tier | neutral | active |  |
| `pms.users_synced_7d` | Accounts synced in 7 days | platform | pms | stock | count | daily | - | higher_is_better | active |  |
| `pms.paid_active` | Active paid accounts | platform | pms | stock | count | daily | - | higher_is_better | active |  |
| `pms.paid_expiring_14d` | Paid plans expiring in 14 days | platform | pms | stock | count | daily | - | lower_is_better | active |  |
| `pms.paid_lapsed_14d` | Paid plans lapsed in last 14 days | platform | pms | stock | count | daily | - | lower_is_better | active |  |
| `pms.paid_stale_sync_7d` | Paid accounts not syncing | platform | pms | stock | count | daily | - | lower_is_better | active |  |
| `pms.trials_active` | Active trials | platform | pms | stock | count | daily | - | neutral | active |  |
| `pms.trials_expiring_7d` | Trials ending in 7 days | platform | pms | stock | count | daily | - | neutral | active |  |
| `pms.trials_awaiting_downgrade` | Expired trials not yet downgraded | platform | pms | stock | count | daily | - | neutral | active |  |
| `pms.trial_conversion_rate` | Trial to paid conversion | platform | pms | ratio | percent | daily | - | higher_is_better | active |  |
| `pms.tokens_outstanding` | Unspent SMS tokens | platform | pms | stock | count | daily | - | neutral | active | Balance only: SMS consumption is not synced to the cloud. |
| `pms.properties_total` | Properties (total) | platform | pms | stock | count | daily | - | neutral | active |  |
| `pms.tenants_active` | Active tenants | platform | pms | stock | count | daily | - | neutral | active |  |
| `pms.units_total` | Units (total) | platform | pms | stock | count | daily | - | neutral | active |  |
| `pms.units_occupied` | Units occupied | platform | pms | stock | count | daily | - | neutral | active |  |
| `pms.occupancy_rate` | Occupancy rate | platform | pms | ratio | percent | daily | - | higher_is_better | active |  |
| `pms.invoices_unpaid_count` | Unpaid invoices | platform | pms | stock | count | daily | - | lower_is_better | active |  |
| `pms.receivables_outstanding` | Rent outstanding | platform | pms | stock | KES_CENTS | daily | - | lower_is_better | active | As of last sync; excludes invoices PMS already marked paid at 40%. |
| `pms.invoices_overdue_count` | Overdue invoices | platform | pms | stock | count | daily | - | lower_is_better | active |  |
| `pms.receivables_overdue` | Rent overdue | platform | pms | stock | KES_CENTS | daily | - | lower_is_better | active |  |
| `pms.collection_rate` | Rent collection rate (billing month) | platform | pms | ratio | percent | daily | month | higher_is_better | active | As of last sync; a billing month matures as tenants pay. |
| `cyber.wa_messages_in` | WhatsApp messages received | platform | cyber | flow | count | daily | - | higher_is_better | active |  |
| `cyber.wa_messages_out` | WhatsApp messages sent | platform | cyber | flow | count | daily | - | neutral | active |  |
| `cyber.wa_messages_out_failed` | WhatsApp sends failed | platform | cyber | flow | count | daily | - | lower_is_better | active |  |
| `cyber.wa_delivery_success_rate` | WhatsApp send success rate | platform | cyber | ratio | percent | daily | - | higher_is_better | active |  |
| `cyber.wa_sessions_started` | WhatsApp conversations started | platform | cyber | flow | count | daily | - | higher_is_better | active |  |
| `cyber.wa_users_active` | Active WhatsApp users | platform | cyber | flow | count | daily/weekly/monthly | - | higher_is_better | active |  |
| `cyber.wa_users_seen` | WhatsApp users seen (approx.) | platform | cyber | flow | count | daily | - | neutral | active | Approximate: each phone counts once, at its latest activity. |
| `cyber.wa_known_users` | WhatsApp users known (approx.) | platform | cyber | stock | count | daily | - | neutral | active | Approximate: one session document per phone. |
| `cyber.shops_total` | Shops registered | platform | cyber | stock | count | daily | - | neutral | planned |  |
| `cyber.shops_new` | New shops | platform | cyber | flow | count | daily | - | neutral | planned |  |
| `cyber.sales_recorded` | Sales recorded | platform | cyber | flow | count | daily | - | neutral | planned |  |
| `cyber.sales_value` | Sales value recorded | platform | cyber | flow | KES_CENTS | daily | - | neutral | planned |  |
| `cyber.expenses_recorded` | Expenses recorded | platform | cyber | flow | count | daily | - | neutral | planned |  |
| `cyber.reports_generated` | Reports generated | platform | cyber | flow | count | daily | - | neutral | planned |  |
| `cyber.report_jobs_failed` | Report jobs failed | platform | cyber | flow | count | daily | - | lower_is_better | planned |  |
| `company.attempts` | Payment attempts (company) | company | all | flow | count | daily | stream | neutral | active |  |
| `company.success` | Successful payments (company) | company | all | flow | count | daily | stream | higher_is_better | active |  |
| `company.success_rate` | Payment success rate (company) | company | all | ratio | percent | daily | stream | higher_is_better | active |  |
| `company.gmv` | GMV (company) | company | all | flow | KES_CENTS | daily | stream | higher_is_better | active |  |
| `company.gateway_fees` | Gateway fees (company) | company | all | flow | KES_CENTS | daily | stream | neutral | active |  |
| `company.platform_revenue` | Platform revenue (company) | company | all | flow | KES_CENTS | daily | stream | higher_is_better | active |  |
| `company.pass_through` | Pass-through (company) | company | all | flow | KES_CENTS | daily | stream | neutral | active |  |
| `company.net_revenue` | Net revenue (company) | company | all | flow | KES_CENTS | daily | stream | higher_is_better | active | Part of this rests on estimates; see "Net revenue not fully verified". |
| `company.net_revenue_unverified` | Net revenue not fully verified (company) | company | all | flow | KES_CENTS | daily | stream | lower_is_better | active |  |
| `company.data_freshness_hours` | Data freshness | company | all | stock | hours | daily | collector | lower_is_better | active |  |
| `company.active_accounts` | Active accounts | company | all | flow | count | daily/weekly/monthly | platform | higher_is_better | active | Entities differ by platform (schools, chamas, managers, WhatsApp users). |
| `company.new_accounts` | New accounts | company | all | flow | count | daily/weekly/monthly | platform | higher_is_better | active |  |
| `company.net_revenue_per_active_account` | Net revenue per active account | company | all | ratio | KES_CENTS | weekly/monthly | - | higher_is_better | active |  |
| `company.unverified_revenue_share` | Unverified revenue share | company | all | ratio | percent | daily/weekly/monthly | - | lower_is_better | active |  |
| `cross.revenue_share` | Revenue share by platform | cross | all | ratio | percent | daily/weekly/monthly | platform | neutral | active |  |
| `cross.stream_share` | Revenue share by stream | cross | all | ratio | percent | daily/weekly/monthly | stream | neutral | active |  |
| `cross.subscription_revenue` | Subscription revenue (recurring) | cross | all | flow | KES_CENTS | daily/weekly/monthly | - | higher_is_better | active |  |
| `cross.sms_units_used` | SMS units used | cross | all | flow | count | daily/weekly/monthly | platform | neutral | active | Register tokens used is an estimate (deducted in the browser). |
| `cross.sms_prepaid_outstanding` | Prepaid SMS units outstanding | cross | all | stock | count | daily/weekly/monthly | platform | neutral | active |  |
| `cross.sms_cost_estimate` | SMS provider cost (estimate) | cross | all | flow | KES_CENTS | daily/weekly/monthly | - | neutral | active |  |
| `cross.sms_margin` | SMS margin (estimate) | cross | all | flow | KES_CENTS | daily/weekly/monthly | - | higher_is_better | active | Needs the SMS provider cost per unit to be configured. |
| `cross.digital_rent_share` | Digital rent share | cross | all | ratio | percent | daily/weekly/monthly | - | higher_is_better | active | PMS data is as of last sync. |
| `company.data_freshness_max_hours` | Oldest data (hours) | company | all | stock | hours | daily | - | lower_is_better | active |  |
| `company.collectors_stale` | Collectors stale | company | all | stock | count | daily | - | lower_is_better | active |  |
