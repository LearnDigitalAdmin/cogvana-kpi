import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRange } from "../hooks/useRange";
import { useLatestComputedAt } from "../hooks/useKpiValues";
import { formatClock, validateRange } from "../lib/nairobi";
import type { Grain } from "../lib/types";

const GRAINS: { id: Grain; label: string }[] = [{ id: "daily", label: "Daily" }, { id: "weekly", label: "Weekly" }, { id: "monthly", label: "Monthly" }];

export function Controls() {
  const r = useRange();
  const qc = useQueryClient();
  const updated = useLatestComputedAt();
  const [from, setFrom] = useState(r.from);
  const [to, setTo] = useState(r.to);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setFrom(r.from); setTo(r.to); setErr(null); }, [r.from, r.to]);

  const apply = (f: string, t: string) => {
    setFrom(f); setTo(t);
    const e = validateRange(f, t, r.today);
    setErr(e);
    if (!e) r.setRange(f, t);
  };

  return (
    <div className="controls">
      <div className="seg" role="group" aria-label="Grain">
        {GRAINS.map((g) => <button key={g.id} className={r.grain === g.id ? "on" : ""} aria-pressed={r.grain === g.id} onClick={() => r.setGrain(g.id)}>{g.label}</button>)}
      </div>
      <select aria-label="Range" value={r.activePreset} onChange={(e) => { const p = r.presets.find((x) => x.id === e.target.value); if (p) r.setRange(p.from, p.to); }}>
        {r.presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        {r.activePreset === "custom" && <option value="custom">Custom range</option>}
      </select>
      {r.grain !== "monthly" && (
        <span className="dates">
          <input type="date" aria-label="From" value={from} max={r.today} onChange={(e) => apply(e.target.value, to)} />
          <span>–</span>
          <input type="date" aria-label="To" value={to} max={r.today} onChange={(e) => apply(from, e.target.value)} />
        </span>
      )}
      <button className="btn" onClick={() => void qc.invalidateQueries()}>Refresh</button>
      <span className="muted small">{updated ? `Updated ${formatClock(updated)}` : ""}</span>
      {err && <span className="error-text small" role="alert">{err}</span>}
    </div>
  );
}
