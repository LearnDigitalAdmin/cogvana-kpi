import type { Grain } from "./types";

const DAY_MS = 86_400_000;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const MAX_RANGE_DAYS = 400;

/** Africa/Nairobi is UTC+3 with no DST. Never use the browser's timezone for period logic. */
export function todayNairobi(now: number = Date.now()): string {
  return new Date(now + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
export function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
export function isIsoDay(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUtc(toUtc(s)) === s;
}
export function addDays(iso: string, n: number): string {
  return fromUtc(toUtc(iso) + n * DAY_MS);
}
/** b - a in whole days. */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}
/** Monday of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  const dow = new Date(toUtc(iso)).getUTCDay();
  return addDays(iso, -((dow + 6) % 7));
}
export function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + "01";
}
/** First day of the month `n` months from the month of `iso`. */
export function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split("-").map(Number);
  return fromUtc(Date.UTC(y, m - 1 + n, 1));
}
export function endOfMonth(iso: string): string {
  return addDays(addMonths(iso, 1), -1);
}

export interface Range { from: string; to: string }
export interface Preset extends Range { id: string; label: string }

export function presetsFor(grain: Grain, today: string): Preset[] {
  if (grain === "daily") {
    const lastMonthStart = addMonths(today, -1);
    return [
      { id: "7d", label: "Last 7 days", from: addDays(today, -6), to: today },
      { id: "30d", label: "Last 30 days", from: addDays(today, -29), to: today },
      { id: "90d", label: "Last 90 days", from: addDays(today, -89), to: today },
      { id: "this-month", label: "This month", from: startOfMonth(today), to: today },
      { id: "last-month", label: "Last month", from: lastMonthStart, to: endOfMonth(lastMonthStart) },
    ];
  }
  if (grain === "weekly") {
    const monday = startOfWeek(today);
    return [8, 12, 26].map((n) => ({ id: `${n}w`, label: `Last ${n} weeks`, from: addDays(monday, -7 * (n - 1)), to: today }));
  }
  const first = startOfMonth(today);
  return [6, 12].map((n) => ({ id: `${n}m`, label: `Last ${n} months`, from: addMonths(first, -(n - 1)), to: today }));
}

export function defaultPreset(grain: Grain, today: string): Preset {
  return presetsFor(grain, today)[0];
}

export function rangeLength(from: string, to: string): number {
  return diffDays(from, to) + 1;
}

/** The equal-length range that ends the day before `from`. */
export function previousRange(from: string, to: string): Range {
  const len = rangeLength(from, to);
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

export function validateRange(from: string, to: string, today: string): string | null {
  if (!isIsoDay(from) || !isIsoDay(to)) return "Enter valid dates.";
  if (from > to) return "Start date must be on or before the end date.";
  if (to > today) return "End date cannot be in the future.";
  if (rangeLength(from, to) > MAX_RANGE_DAYS) return `Range is limited to ${MAX_RANGE_DAYS} days.`;
  return null;
}

/** periodStart values a grain can produce inside [from, to] (used to leave gaps for absent periods). */
export function expectedPeriods(grain: Grain, from: string, to: string): string[] {
  const out: string[] = [];
  if (from > to) return out;
  if (grain === "daily") {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  } else if (grain === "weekly") {
    let d = startOfWeek(from);
    if (d < from) d = addDays(d, 7);
    for (; d <= to; d = addDays(d, 7)) out.push(d);
  } else {
    let d = startOfMonth(from);
    if (d < from) d = addMonths(d, 1);
    for (; d <= to; d = addMonths(d, 1)) out.push(d);
  }
  return out;
}

/** `Tue 29 Sep` */
export function formatDay(iso: string): string {
  const dt = new Date(toUtc(iso));
  return `${DOW[dt.getUTCDay()]} ${dt.getUTCDate()} ${MON[dt.getUTCMonth()]}`;
}

/** daily `Tue 29 Sep`, weekly `Week of 28 Sep`, monthly `Sep 2026` */
export function periodLabel(grain: Grain, periodStart: string): string {
  const dt = new Date(toUtc(periodStart));
  if (grain === "daily") return formatDay(periodStart);
  if (grain === "weekly") return `Week of ${dt.getUTCDate()} ${MON[dt.getUTCMonth()]}`;
  return `${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

/** HH:MM in Nairobi time. */
export function formatClock(ms: number): string {
  return new Date(ms + 3 * 3600 * 1000).toISOString().slice(11, 16);
}
