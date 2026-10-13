import { num, toCents } from "../../../core/money";
import { toMillis } from "../../../core/timestamps";
import { get } from "../facts";

/** First usable timestamp among the given fields (settlement time for success/failure). */
export function firstMillis(data: Record<string, unknown>, ...fields: string[]): number | null {
  for (const f of fields) {
    const t = toMillis(get(data, f));
    if (t !== null) return t;
  }
  return null;
}

/** Decimal KES field -> cents, or null if absent/invalid. */
export function kesToCents(value: unknown): number | null {
  const n = num(value);
  return n === null ? null : toCents(n);
}

/** Raw Paystack payload amounts are already in subunits (cents): integer, or null. */
export function subunits(value: unknown): number | null {
  const n = num(value);
  return n === null ? null : Math.round(n);
}

/** Percentage of an integer-cents amount, rounded to whole cents. */
export function percentOf(cents: number, pct: number): number {
  return Math.round((cents * pct) / 100);
}
