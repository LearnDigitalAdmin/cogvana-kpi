import { useMemo, type KeyboardEvent } from "react";
import { fillPeriods, latestPerDim, summarise } from "../lib/aggregate";
import { formatDelta, formatValue } from "../lib/format";
import { PLAN_ORDER, TIER_ORDER } from "../lib/layouts";
import { formatDay, periodLabel } from "../lib/nairobi";
import type { Grain, KpiDefinition, KpiValue } from "../lib/types";
import { CaveatBadge } from "./CaveatBadge";
import { EmptyState } from "./EmptyState";
import { SeriesChart } from "./SeriesChart";

interface Props {
  def: KpiDefinition; values: KpiValue[]; prevValues: KpiValue[];
  grain: Grain; from: string; to: string; prevFrom: string;
  onOpen: (id: string) => void;
  breakdown?: string;
  emptyHint?: string;
  hero?: boolean;
}

const press = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };
const ARROW = { up: "▲", down: "▼", flat: "■" } as const;
const TONE = { good: "var(--good)", bad: "var(--bad)", neutral: "var(--muted)" } as const;

export function PlannedTile({ def }: { def: KpiDefinition }) {
  return (
    <div className="tile tile-planned" title="Planned KPI">
      <div className="tile-head"><span className="tile-name">{def.name}</span></div>
      <div className="tile-value muted">—</div>
      <div className="small">Not collected yet</div>
      {def.formula && <div className="small muted">{def.formula}</div>}
    </div>
  );
}

function tierName(t: string): string { return TIER_ORDER.includes(t) ? t : "other"; }

function BreakdownTile({ def, values, grain, breakdown, onOpen }: Pick<Props, "def" | "values" | "grain" | "breakdown" | "onOpen">) {
  const key = breakdown as string;
  const items = useMemo(() => {
    const list = latestPerDim(values, key, key === "tier" ? tierName : undefined);
    const order = key === "plan" ? PLAN_ORDER : key === "tier" ? TIER_ORDER : null;
    return list.sort((a, b) => (order ? order.indexOf(a.dim) - order.indexOf(b.dim) : b.dim.localeCompare(a.dim)));
  }, [values, key]);
  const max = Math.max(1, ...items.map((i) => i.point.value));
  const asOf = items.reduce((m, i) => (i.point.periodEnd > m ? i.point.periodEnd : m), "");
  const open = () => onOpen(def.id);
  return (
    <div className="tile tile-wide" role="button" tabIndex={0} onClick={open} onKeyDown={press(open)}>
      <div className="tile-head"><span className="tile-name">{def.name}</span><CaveatBadge text={def.caveat} /></div>
      {items.length === 0 ? <EmptyState compact /> : (
        <>
          <div className="small muted">{items.some((i) => !i.point.complete) ? "partial · " : ""}as of {asOf} · latest per {key}</div>
          <ul className="bars">
            {items.map(({ dim, point }) => (
              <li key={dim}>
                <span className="bar-label">{dim}</span>
                <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.max(2, ((def.unit === "percent" ? Math.min(100, point.value) : point.value) / (def.unit === "percent" ? 100 : max)) * 100)}%` }} /></span>
                <span className="bar-value">{formatValue(def.unit, point.value)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <span className="sr-only">{grain}</span>
    </div>
  );
}

export function KpiTile(p: Props) {
  return p.breakdown ? <BreakdownTile {...p} /> : <ValueTile {...p} />;
}

function ValueTile(p: Props) {
  const { def, values, prevValues, grain, from, to, prevFrom, onOpen, emptyHint, hero } = p;
  const s = useMemo(() => summarise(def, values, prevValues, from, prevFrom), [def, values, prevValues, from, prevFrom]);

  const h = s.headline;
  const rows = useMemo(() => fillPeriods(grain, from, to, s.points), [grain, from, to, s.points]);
  const hasValue = h.value !== null;
  const sub =
    h.kind === "stock" ? (h.asOf ? `as of ${h.asOf}` : "")
    : h.kind === "latest" ? (h.period ? periodLabel(grain, h.period) : "")
    : h.kind === "ratio" ? "over range, recomputed"
    : "total in range";
  const open = () => onOpen(def.id);
  const d = s.delta;
  return (
    <div className={`tile${hero ? " tile-hero" : ""}`} role="button" tabIndex={0} onClick={open} onKeyDown={press(open)} aria-label={`${def.name}: open details`}>
      <div className="tile-head">
        <span className="tile-name">{def.name}</span>
        <CaveatBadge text={def.caveat} />
        {hasValue && h.partial && <span className="chip chip-warn">partial</span>}
      </div>
      <div className="tile-value" title={hasValue ? formatValue(def.unit, h.value) : undefined}>{hasValue ? formatValue(def.unit, h.value, { compact: true }) : "—"}</div>
      {hasValue ? (
        <div className="tile-sub small muted">
          {sub}
          {h.historyStart && <> · history starts {formatDay(h.historyStart).replace(/^\w+ /, "")} ({h.historyStart})</>}
        </div>
      ) : (
        <EmptyState compact>{emptyHint ?? "Not measured in this range"}</EmptyState>
      )}
      {d && (
        <span className="chip" style={{ color: TONE[d.tone] }} title={`vs previous period: ${formatValue(def.unit, s.prevHeadline.value)}`}>
          {ARROW[d.dir]} {formatDelta(d.pct)}
        </span>
      )}
      {s.points.length > 0 && <div className="spark"><SeriesChart rows={rows} grain={grain} unit={def.unit} kind="line" height={40} spark /></div>}
    </div>
  );
}
