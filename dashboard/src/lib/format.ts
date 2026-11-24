import type { KpiUnit } from "./types";

const DASH = "—";

function group(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
function trim1(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}
function compactNumber(abs: number): string {
  if (abs >= 1e9) return `${trim1(abs / 1e9)}B`;
  if (abs >= 1e6) return `${trim1(abs / 1e6)}M`;
  if (abs >= 1e3) return `${trim1(abs / 1e3)}K`;
  return group(abs);
}

/** Integer cents → `KES 1,234,567` (no decimals from KES 1,000; two below). Compact: `KES 1.2M`. */
export function formatMoney(cents: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(cents)) return DASH;
  const kes = cents / 100;
  const sign = kes < 0 ? "-" : "";
  const abs = Math.abs(kes);
  if (opts.compact && abs >= 1000) return `${sign}KES ${compactNumber(abs)}`;
  if (abs >= 1000) return `${sign}KES ${group(abs)}`;
  return `${sign}KES ${abs.toFixed(2)}`;
}

export function formatPercent(v: number): string {
  return Number.isFinite(v) ? `${v.toFixed(1)}%` : DASH;
}

/** Grouped integer; compact (`1.2M`, `150K`) only above 100,000 when `compact` is set. */
export function formatCount(v: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(v)) return DASH;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (opts.compact && abs > 100_000) return `${sign}${compactNumber(abs)}`;
  return `${sign}${group(abs)}`;
}

export function formatHours(v: number): string {
  return Number.isFinite(v) ? `${v.toFixed(1)} h` : DASH;
}

export function formatValue(unit: KpiUnit, v: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  switch (unit) {
    case "KES_CENTS": return formatMoney(v, opts);
    case "percent": return formatPercent(v);
    case "hours": return formatHours(v);
    default: return formatCount(v, opts);
  }
}

export function formatDelta(pct: number): string {
  const abs = Math.abs(pct);
  return `${abs >= 100 ? abs.toFixed(0) : abs.toFixed(1)}%`;
}
