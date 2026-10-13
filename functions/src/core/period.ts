import { Grain, Period } from "./types";

/**
 * All KPI calendar logic lives here. Africa/Nairobi is UTC+3 all year (Kenya does
 * not observe daylight saving), so a fixed offset is exact and needs no Intl/tz data.
 */
export const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDay(day: string): { y: number; m: number; d: number } {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Invalid day "${day}", expected YYYY-MM-DD`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** UTC-midnight of the given calendar day, as a plain Date used only for calendar arithmetic. */
function calendarDate(day: string): Date {
  const { y, m, d } = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatCalendar(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Nairobi calendar day for an instant. */
export function nairobiDay(ms: number): string {
  return formatCalendar(new Date(ms + NAIROBI_OFFSET_MS));
}

/** Start (inclusive) and end (exclusive) of a Nairobi day, in UTC ms. */
export function dayBounds(day: string): { startMs: number; endMs: number } {
  const startMs = calendarDate(day).getTime() - NAIROBI_OFFSET_MS;
  return { startMs, endMs: startMs + DAY_MS };
}

export function addDays(day: string, n: number): string {
  return formatCalendar(new Date(calendarDate(day).getTime() + n * DAY_MS));
}

/** Inclusive list of days from..to. Empty if from > to. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  const dow = calendarDate(day).getUTCDay(); // 0 = Sunday
  const sinceMonday = (dow + 6) % 7;
  return addDays(day, -sinceMonday);
}

export function monthStart(day: string): string {
  const { y, m } = parseDay(day);
  return `${y}-${pad(m)}-01`;
}

export function monthEnd(day: string): string {
  const { y, m } = parseDay(day);
  return formatCalendar(new Date(Date.UTC(y, m, 0)));
}

export function periodStartFor(grain: Grain, day: string): string {
  if (grain === "daily") return day;
  if (grain === "weekly") return weekStart(day);
  return monthStart(day);
}

export function periodEndFor(grain: Grain, start: string): string {
  if (grain === "daily") return start;
  if (grain === "weekly") return addDays(start, 6);
  return monthEnd(start);
}

export function periodFor(grain: Grain, day: string): Period {
  const start = periodStartFor(grain, day);
  const end = periodEndFor(grain, start);
  return {
    grain,
    start,
    end,
    startMs: dayBounds(start).startMs,
    endMs: dayBounds(end).endMs,
  };
}

export function dailyPeriod(day: string): Period {
  return periodFor("daily", day);
}

/**
 * The days a scheduled run should (re)compute: the `lookback` complete days
 * before today (Nairobi). Recomputing recent days lets late-settling payments
 * correct earlier figures; deterministic ids make this safe.
 */
export function recentDays(nowMs: number, lookback: number): string[] {
  const today = nairobiDay(nowMs);
  return eachDay(addDays(today, -lookback), addDays(today, -1));
}

/** A period is complete once its last day is before today (Nairobi). */
export function isComplete(period: Period, nowMs: number): boolean {
  return period.end < nairobiDay(nowMs);
}
