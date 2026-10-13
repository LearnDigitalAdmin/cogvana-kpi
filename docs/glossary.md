# KPI glossary

| Term | Meaning |
|------|---------|
| **GMV** | Gross money charged to payers on successful payments. Includes rent and contributions that belong to customers. **Not** revenue. |
| **Platform revenue** | What the company earns before gateway costs and pass-throughs: rent commission, Cyber commission, SMS/report/plan/subscription sales, Chama markup. |
| **Pass-through** | Revenue owed onward. Today: the 45% agent share on Plot Yangu subscriptions that carry an agent. |
| **Net revenue** | Platform revenue after the gateway fee the company bears and after pass-throughs. |
| **Unverified net revenue** | Net revenue resting on an estimate: rent commission derived from the tier rate (no recorded split), or a sale whose gateway fee is not recorded (Chama SMS, plans, reports). Goal: zero. |
| **Attempt** | Any payment record created on the Nairobi day, whatever its outcome. |
| **Success rate** | Successful ÷ attempts. Abandoned prompts count as unsuccessful. |
| **Stuck pending** | Still pending more than 30 minutes after initiation, at compute time. |
| **Day** | A calendar day in Africa/Nairobi (UTC+3). A payment belongs to the day it was initiated. |

## Revenue streams and how each is computed

| Stream | Charge types | Platform revenue | Net revenue |
|--------|--------------|------------------|-------------|
| commission | Plot Yangu rent, Cyber services | Rent: Paystack's recorded split share, else gross × tier rate (SOLO 2.4, BUSINESS 1.5, PRO 1.9, ENTERPRISE 1.0). Cyber: 2.5% of (gross − fee) | Same as revenue (the fee is borne by the customer's side) |
| sms | Register, Plot Yangu, Chama SMS credits | Amount sold | Amount received after Paystack fee (Chama: amount sold; fee not recorded) |
| subscription | Plot Yangu subscriptions, Chama plans | Amount billed | Gross − fee − agent share (Plot Yangu). Chama: amount billed |
| reports | Cyber reports, Chama report credits and pay-per-report | Amount sold | Amount after fee (Cyber). Chama: amount sold |
| markup | Chama member payments | Our fee (`ourFee`) | Same |

Not counted: shop customer charges (`SHOP_`) and movie subscriptions (`MOV_`), because no company revenue is recorded for them. PNS is out of scope (not running).

---

# Register terms

| Term | Meaning |
|------|---------|
| **Marked register** | A class register a teacher actually saved (`locked = true`). Placeholder registers written by the system at noon are **not** marked. |
| **Active school (marking)** | A school with at least one marked register in the period. Daily, weekly (Monday to Sunday) and calendar-month values. |
| **Active school (messaging)** | A school with at least one message recorded as sent or partial in the period. |
| **Register marking rate** | Marked registers divided by all register records for the school day. Late marking counts once it happens (days are recomputed nightly). |
| **Attendance rate** | (present + late) / (present + late + absent + excused), marked registers only; unmarked students excluded. |
| **Blocked: no tokens** | A failed attendance message with zero segments, tokens and delivered: the app refused to send for lack of tokens (inferred). |
| **Provider calls accepted** | Sends the SMS provider accepted, from the server log. Acceptance, not handset delivery. |
| **Unspent SMS tokens** | Sum of token balances across all user accounts: prepaid credit customers have not used. |
| **Stock vs flow** | Flow KPIs cover a period and can be backfilled. Stock KPIs are a point-in-time count and are snapshotted nightly; their history starts at go-live. |

---

# Chama terms

| Term | Meaning |
|------|---------|
| **Ledger** | `chamas/{id}/transactions`: every contribution, repayment, disbursement and merry-go-round movement, manual or Paystack. Amounts are the chama's net money, not company revenue. |
| **Active chama** | A chama with at least one ledger row in the period (day, Monday-Sunday week, or calendar month). |
| **Digital payment share** | Money in paid through Paystack divided by all money in. Manual recordings earn the company nothing. |
| **Loan book outstanding** | Unpaid installment amounts across loans with status active or overdue. |
| **Portfolio at risk** | Outstanding balance of loans with an installment past due, divided by the whole loan book. |
| **Overdue contribution** | A contribution period the nightly sweep flagged overdue. |
| **MGR** | Merry-go-round pot. Pending shortfall and open arrears measure money the pot is still owed. |
