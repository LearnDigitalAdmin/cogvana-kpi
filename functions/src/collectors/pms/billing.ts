import { DocRecord } from "../../core/reader";
import { Metric } from "../../core/values";
import { num, pct, toCents } from "../../core/money";

/**
 * Invoices and payments are mirrored from each device under users/{userId}/...
 * Collection-group queries also match Cyber's top-level `invoices`, `tenants` and `payments`, so every row is
 * checked against its path and anything outside users/{userId}/ is ignored. The manager's id is taken from the path.
 */
export const INVOICE_SELECT = ["totalAmount", "amountPaid"];
export const PAYMENT_SELECT = ["amount"];

/** users/{u}/<kind>/{id}  (kind: properties | tenants | invoices) */
export function userIdOf(path: string, kind: "properties" | "tenants" | "invoices"): string | null {
  const p = path.split("/");
  return p.length === 4 && p[0] === "users" && p[2] === kind && p[1] ? p[1] : null;
}

/** users/{u}/invoices/{i}/payments/{id} */
export function paymentUserIdOf(path: string): string | null {
  const p = path.split("/");
  return p.length === 6 && p[0] === "users" && p[2] === "invoices" && p[4] === "payments" && p[1] ? p[1] : null;
}

export interface MoneyRow {
  userId: string;
  cents: number;
}

export function invoiceRows(docs: DocRecord[]): { userId: string; total: number; paid: number }[] {
  const out: { userId: string; total: number; paid: number }[] = [];
  for (const d of docs) {
    const userId = userIdOf(d.path, "invoices");
    if (!userId) continue;
    out.push({ userId, total: toCents(num(d.data.totalAmount) ?? 0), paid: toCents(num(d.data.amountPaid) ?? 0) });
  }
  return out;
}

export function paymentRows(docs: DocRecord[]): MoneyRow[] {
  const out: MoneyRow[] = [];
  for (const d of docs) {
    const userId = paymentUserIdOf(d.path);
    if (userId) out.push({ userId, cents: toCents(num(d.data.amount) ?? 0) });
  }
  return out;
}

export function distinctUsers(docs: DocRecord[], kind: "invoices" | "payments"): Set<string> {
  const out = new Set<string>();
  for (const d of docs) {
    const id = kind === "invoices" ? userIdOf(d.path, "invoices") : paymentUserIdOf(d.path);
    if (id) out.add(id);
  }
  return out;
}

export function billingMetrics(invoiceDocs: DocRecord[], paymentDocs: DocRecord[], newTenants: number, newProperties: number): Record<string, Metric> {
  const invoices = invoiceRows(invoiceDocs);
  const payments = paymentRows(paymentDocs);
  return {
    "pms.properties_new": { value: newProperties },
    "pms.tenants_new": { value: newTenants },
    "pms.invoices_issued": { value: invoices.length },
    "pms.invoiced_amount": { value: invoices.reduce((t, r) => t + r.total, 0) },
    "pms.payments_recorded": { value: payments.length },
    "pms.rent_collected": { value: payments.reduce((t, r) => t + r.cents, 0) },
  };
}

/**
 * Receivables over invoices PMS has NOT marked paid (PMS marks an invoice paid once 40% of it is paid, so 40-99% paid
 * invoices are excluded by design). `today` is the Nairobi day; dueDate is compared by its first 10 characters.
 */
export function receivables(docs: DocRecord[], today: string): Record<string, Metric> {
  let count = 0;
  let outstanding = 0;
  let overdueCount = 0;
  let overdue = 0;
  for (const d of docs) {
    if (!userIdOf(d.path, "invoices")) continue;
    const left = Math.max(0, toCents(num(d.data.totalAmount) ?? 0) - toCents(num(d.data.amountPaid) ?? 0));
    count++;
    outstanding += left;
    const due = typeof d.data.dueDate === "string" ? d.data.dueDate.slice(0, 10) : "";
    if (due && due < today) {
      overdueCount++;
      overdue += left;
    }
  }
  return {
    "pms.invoices_unpaid_count": { value: count },
    "pms.receivables_outstanding": { value: outstanding },
    "pms.invoices_overdue_count": { value: overdueCount },
    "pms.receivables_overdue": { value: overdue },
  };
}

/** Collection rate for one billing month: paid (capped at the invoice total) over invoiced. */
export function collectionRate(docs: DocRecord[]): Metric {
  let invoiced = 0;
  let paid = 0;
  for (const d of docs) {
    if (!userIdOf(d.path, "invoices")) continue;
    const total = toCents(num(d.data.totalAmount) ?? 0);
    invoiced += total;
    paid += Math.min(total, toCents(num(d.data.amountPaid) ?? 0));
  }
  return { value: pct(paid, invoiced), numerator: paid, denominator: invoiced };
}
