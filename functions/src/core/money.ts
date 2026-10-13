/**
 * Money rules:
 *  - The source apps store decimal KES (rounded to 2 places); Paystack payloads
 *    (`paystackResponse.amount/fees` saved from the raw webhook) are already in
 *    subunits (cents).
 *  - The KPI store holds INTEGER CENTS only, so sums never drift.
 */

/** A finite number, or null. Accepts numeric strings; rejects NaN/Infinity/empty. */
export function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Decimal KES -> integer cents. */
export function toCents(kes: number): number {
  return Math.round(kes * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function formatKes(cents: number): string {
  const kes = Math.round(cents) / 100;
  return "KES " + kes.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Percentage (0-100) rounded to 2 places; 0 when the denominator is 0. */
export function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}
