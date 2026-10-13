import { useMemo, useState } from "react";
import { useDefinitions } from "../hooks/useDefinitions";
import { useFreshness } from "../hooks/useFreshness";
import { useKpiValues } from "../hooks/useKpiValues";
import { useRuns } from "../hooks/useRuns";
import { COLLECTORS } from "../lib/freshness";
import { formatHours } from "../lib/format";
import { formatClock } from "../lib/nairobi";
import { ErrorBox } from "../components/ErrorBox";
import { EmptyState, Skeleton } from "../components/EmptyState";

function Coverage() {
  const defs = useDefinitions();
  const active = useMemo(() => defs.list.filter((d) => d.status === "active"), [defs.list]);
  const data = useKpiValues(active.map((d) => d.id), { enabled: !defs.isLoading, withPrevious: false });
  if (defs.error) return <ErrorBox error={defs.error} onRetry={() => void defs.refetch()} />;
  if (defs.isLoading || data.isLoading) return <Skeleton h={100} />;
  if (data.isError) return <ErrorBox error={data.error} onRetry={data.refetch} />;
  const have = new Set(data.values.map((v) => v.kpiId));
  const missing = active.filter((d) => !have.has(d.id));
  return (
    <div className="card">
      <p><strong>{active.length - missing.length}</strong> of <strong>{active.length}</strong> active KPIs have values in this range ({data.grain}).</p>
      {missing.length === 0 ? <p className="muted">Every active KPI is measured.</p> : (
        <details><summary>{missing.length} not measured</summary>
          <ul className="plain">{missing.map((d) => <li key={d.id}><code>{d.id}</code> <span className="muted">{d.name}</span></li>)}</ul>
        </details>
      )}
    </div>
  );
}

function Runs() {
  const runs = useRuns();
  const [collector, setCollector] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => (runs.data ?? []).filter((r) => (!collector || r.collector === collector) && (!status || r.status === status)), [runs.data, collector, status]);
  if (runs.isError) return <ErrorBox error={runs.error} onRetry={() => void runs.refetch()} />;
  if (runs.isPending) return <Skeleton h={160} />;
  const collectors = [...new Set((runs.data ?? []).map((r) => r.collector))].sort();
  return (
    <>
      <div className="row">
        <label className="field">Collector<select value={collector} onChange={(e) => setCollector(e.target.value)}><option value="">All</option>{collectors.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field">Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option>success</option><option>error</option></select></label>
      </div>
      {rows.length === 0 ? <EmptyState>No runs match</EmptyState> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Collector</th><th>Period</th><th>Status</th><th className="num">Rows</th><th className="num">Duration</th><th>Started (Nairobi)</th><th>Error</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.status === "error" ? "row-bad" : ""}>
                <td>{r.collector}</td><td>{r.periodStart === r.periodEnd ? r.periodStart : `${r.periodStart} → ${r.periodEnd}`}</td>
                <td><span className={`chip ${r.status === "error" ? "chip-bad" : "chip-good"}`}>{r.status}</span></td>
                <td className="num">{r.rowsWritten.toLocaleString("en-US")}</td><td className="num">{(r.durationMs / 1000).toFixed(1)} s</td>
                <td>{new Date(r.startedAt + 3 * 3600_000).toISOString().slice(0, 10)} {formatClock(r.startedAt)}</td>
                <td className="err-cell">{r.error ? (open === r.id ? <>{r.error} <button className="link" onClick={() => setOpen(null)}>less</button></> : <button className="link" onClick={() => setOpen(r.id)}>{r.error.slice(0, 60)}{r.error.length > 60 ? "…" : ""}</button>) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}

export default function Health() {
  const f = useFreshness();
  const byName = new Map(f.rows.map((r) => [r.collector, r]));
  return (
    <>
      <h1>Data health</h1>
      <section>
        <h2>Freshness</h2>
        {f.isError ? <ErrorBox error="Could not load freshness" onRetry={f.refetch} /> : f.isLoading ? <Skeleton h={160} /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Collector</th><th className="num">Hours since data</th><th>Status</th></tr></thead>
            <tbody>{COLLECTORS.map((c) => { const r = byName.get(c)!; return (
              <tr key={c}><td>{c}</td><td className="num">{r.hours === null ? "—" : formatHours(r.hours)}</td>
                <td><span className={`chip chip-${r.status === "green" ? "good" : r.status === "amber" ? "warn" : "bad"}`}>{r.hours === null ? "no data" : r.status}</span></td></tr>); })}</tbody>
          </table></div>
        )}
      </section>
      <section><h2>Coverage</h2><Coverage /></section>
      <section><h2>Recent runs</h2><Runs /></section>
    </>
  );
}
