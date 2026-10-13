import { dayBounds } from "./period";

/**
 * The source apps store times four different ways:
 *   - Firestore Timestamp (server timestamps)
 *   - ISO strings (Register, PMS expiry, CYBER report_charges.createdAt)
 *   - epoch milliseconds (Chama createdAt/updatedAt, CYBER createdAtTimestamp)
 *   - plain YYYY-MM-DD dates (Chama paidOn/dueDate)
 * This is the ONE place they are normalised. Returns UTC ms, or null if unusable.
 */
export function toMillis(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    // Values below 1e11 are epoch seconds (year < 5138); everything else is ms.
    return value < 1e11 ? Math.round(value * 1000) : Math.round(value);
  }

  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return dayBounds(s).startMs; // Nairobi midnight
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  }

  if (typeof value === "object") {
    const v = value as {
      toMillis?: () => number;
      seconds?: number;
      _seconds?: number;
      nanoseconds?: number;
      _nanoseconds?: number;
    };
    if (typeof v.toMillis === "function") {
      const t = v.toMillis();
      return Number.isFinite(t) ? t : null;
    }
    const seconds = v.seconds ?? v._seconds;
    if (typeof seconds === "number") {
      const nanos = v.nanoseconds ?? v._nanoseconds ?? 0;
      return seconds * 1000 + Math.floor(nanos / 1e6);
    }
  }
  return null;
}
