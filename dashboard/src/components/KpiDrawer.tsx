import { useMemo, useState } from "react";
import { dimensionOptions, fillPeriods, seriesForDimension } from "../lib/aggregate";
import { copyText, toCsv } from "../lib/csv";
import { formatValue } from "../lib/format";
import { periodLabel } from "../lib/nairobi";
import type { Grain, KpiDefinition, KpiValue } from "../lib/types";
import { useDefinitions } from "../hooks/useDefinitions";
import type { KpiData } from "../hooks/useKpiValues";
import { CaveatBadge } from "./CaveatBadge";
import { EmptyState } from "./EmptyState";
import { SeriesChart } from "./SeriesChart";

interface Props { def: KpiDefinition; values: KpiValue[]; grain: Grain; from: string; to: string; onClose: () => void }

export function KpiDrawer({ def, values, grain, from, to, onClose }: Props) {
  const [sel, setSel] = useState("");
  const [copied, setCopied] = useState(false);
  const options = useMemo(() => dimensionOptions(values), [values]);
  const [key, dimValue] = sel ? sel.split("=") : [null, null];
  const points = useMemo(() => seriesForDimension(values, key, dimValue), [values, key, dimValue]);
  const rows = useMemo(() => fillPeriods(grain, from, to, points), [grain, from, to, points]);

  const csv = () => toCsv([
    ["kpi", "dimension", "grain", "periodStart", "periodEnd", "value", "numerator", "denominator", "complete"],
    ...points.map((p) => [def.id, sel || "total", grain, p.periodStart, p.periodEnd, p.value, p.numerator, p.denominator, p.complete]),
  ]);
  const copy = async () => { setCopied(await copyText(csv())); setTimeout(() => setCopied(false), 1800); };
  const hasRatio = points.some((p) => p.numerator !== null);
  const meta: [string, string | undefined][] = [
    ["Description", def.description], ["Formula", def.formula], ["Numerator", def.numeratorDesc], ["Denominator", def.denominatorDesc],
    ["Decision it supports", def.decision], ["Owner", def.owner], ["Version", String(def.version)], ["Grains written", def.grains.join(", ")],
  ];

  return (
    <div className="drawer-wrap" role="dialog" aria-modal="true" aria-label={def.name}>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-head">
          <div><h2>{def.name} <CaveatBadge text={def.caveat} /></h2><div className="muted small">{def.id} · {def.type} · {def.unit}</div></div>
          <button className="btn" onClick={onClose} aria-label="Close">Close</button>
        </header>
        {def.caveat && <div className="box box-warn">{def.caveat}</div>}
        {options.length > 0 && (
          <label className="field">Breakdown
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="">Total</option>
              {options.map((o) => <option key={`${o.key}=${o.value}`} value={`${o.key}=${o.value}`}>{o.key}: {o.value}</option>)}
            </select>
          </label>
        )}
        {points.length === 0 ? <EmptyState>Not measured in this range</EmptyState> : (
          <SeriesChart rows={rows} grain={grain} unit={def.unit} kind={def.type === "flow" ? "bar" : "line"} height={240} />
        )}
        <div className="row">
          <button className="btn" onClick={copy} disabled={!points.length}>{copied ? "Copied" : "Copy values as CSV"}</button>
        </div>
        {points.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Period</th><th className="num">Value</th>{hasRatio && <th className="num">Num / Den</th>}<th>Complete</th></tr></thead>
              <tbody>
                {[...points].reverse().map((p) => (
                  <tr key={p.periodStart}>
                    <td>{periodLabel(grain, p.periodStart)}</td>
                    <td className="num">{formatValue(def.unit, p.value)}</td>
                    {hasRatio && <td className="num">{p.numerator !== null ? `${p.numerator.toLocaleString("en-US")} / ${(p.denominator ?? 0).toLocaleString("en-US")}` : "—"}</td>}
                    <td>{p.complete ? "yes" : <span className="chip chip-warn">partial</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <dl className="defn">
          {meta.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      </aside>
    </div>
  );
}

/** Drawer state for a page/section: `open(id)` and the node to render. */
export function useKpiDrawer(data: Pick<KpiData, "values" | "grain" | "from" | "to">, platform?: string) {
  const defs = useDefinitions();
  const [id, setId] = useState<string | null>(null);
  const node = id ? (
    <KpiDrawer def={defs.get(id)} grain={data.grain} from={data.from} to={data.to} onClose={() => setId(null)}
      values={data.values.filter((v) => v.kpiId === id && (!platform || v.platform === platform))} />
  ) : null;
  return { open: setId, node };
}
