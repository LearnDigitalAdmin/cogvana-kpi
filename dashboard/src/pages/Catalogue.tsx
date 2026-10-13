import { Fragment, useMemo, useState } from "react";
import { useDefinitions } from "../hooks/useDefinitions";
import { downloadText, toCsv } from "../lib/csv";
import type { KpiDefinition } from "../lib/types";
import { CaveatBadge } from "../components/CaveatBadge";
import { EmptyState, Skeleton } from "../components/EmptyState";
import { ErrorBox } from "../components/ErrorBox";

const FILTERS: [keyof KpiDefinition, string][] = [["platform", "Platform"], ["scope", "Scope"], ["type", "Type"], ["status", "Status"]];

export default function Catalogue() {
  const defs = useDefinitions();
  const [q, setQ] = useState("");
  const [f, setF] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);

  const options = useMemo(() => Object.fromEntries(FILTERS.map(([k]) => [k, [...new Set(defs.list.map((d) => String(d[k])))].sort()])), [defs.list]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return defs.list
      .filter((d) => FILTERS.every(([k]) => !f[k] || String(d[k]) === f[k]))
      .filter((d) => !needle || `${d.id} ${d.name} ${d.description} ${d.formula}`.toLowerCase().includes(needle))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [defs.list, q, f]);

  const exportCsv = () => downloadText("kpi-catalogue.csv", toCsv([
    ["id", "name", "platform", "scope", "type", "unit", "grains", "dimensions", "direction", "status", "caveat", "formula", "decision", "owner", "version"],
    ...rows.map((d) => [d.id, d.name, d.platform, d.scope, d.type, d.unit, d.grains.join("/"), d.dimensions.join("/"), d.direction, d.status, d.caveat ?? "", d.formula, d.decision, d.owner, d.version]),
  ]));

  if (defs.error) return <ErrorBox error={defs.error} onRetry={() => void defs.refetch()} />;
  return (
    <>
      <h1>Catalogue</h1>
      <div className="row">
        <label className="field grow">Search<input type="search" placeholder="Name, id or formula" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {FILTERS.map(([k, label]) => (
          <label className="field" key={k}>{label}
            <select value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })}><option value="">All</option>{options[k]?.map((o) => <option key={o}>{o}</option>)}</select>
          </label>
        ))}
        <button className="btn" onClick={exportCsv} disabled={!rows.length}>Export CSV ({rows.length})</button>
      </div>
      {defs.isLoading ? <Skeleton h={240} /> : rows.length === 0 ? <EmptyState>No KPIs match</EmptyState> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Name</th><th>Platform</th><th>Type</th><th>Unit</th><th>Grains</th><th>Dimensions</th><th>Direction</th><th>Status</th><th>v</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <Fragment key={d.id}>
                <tr className="clickable" onClick={() => setOpen(open === d.id ? null : d.id)}>
                  <td><strong>{d.name}</strong> <CaveatBadge text={d.caveat} /><div className="small muted"><code>{d.id}</code></div></td>
                  <td>{d.platform}</td><td>{d.type}</td><td>{d.unit}</td><td>{d.grains.join(", ")}</td><td>{d.dimensions.join(", ") || "—"}</td>
                  <td>{d.direction.replace(/_/g, " ")}</td><td><span className={`chip ${d.status === "active" ? "chip-good" : d.status === "planned" ? "chip-warn" : "chip-bad"}`}>{d.status}</span></td><td>{d.version}</td>
                </tr>
                {open === d.id && (
                  <tr><td colSpan={9}><dl className="defn">
                    {([["Description", d.description], ["Formula", d.formula], ["Numerator", d.numeratorDesc], ["Denominator", d.denominatorDesc], ["Decision", d.decision], ["Owner", d.owner], ["Caveat", d.caveat], ["Scope", d.scope]] as [string, string | undefined][])
                      .filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                  </dl></td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}
