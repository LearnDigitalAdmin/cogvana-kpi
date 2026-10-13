import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StackRow } from "../lib/aggregate";
import { formatValue } from "../lib/format";
import { periodLabel } from "../lib/nairobi";
import type { Grain, KpiUnit } from "../lib/types";

export const PALETTE = ["#4f7cff", "#22b07d", "#f5a524", "#e5484d", "#9b6bff", "#14b8c4", "#ec6fb0", "#8b8f98"];

interface Props {
  rows: StackRow[]; series: string[]; grain: Grain; unit: KpiUnit;
  /** stack = stacked columns (flows/stocks), lines = one line per series (rates) */
  mode?: "stack" | "lines";
  height?: number;
  label?: (k: string) => string;
}

type Datum = { x: string; partial: boolean } & Record<string, number | null | string | boolean>;

export function StackedChart({ rows, series, grain, unit, mode = "stack", height = 260, label = (k) => k }: Props) {
  const data: Datum[] = rows.map((r) => ({ x: r.periodStart, partial: r.partial, ...r.values }));
  const color = (k: string) => PALETTE[series.indexOf(k) % PALETTE.length];

  const tip = ({ active, payload }: { active?: boolean; payload?: { payload?: unknown }[] }) => {
    if (!active || !payload?.length || !payload[0].payload) return null;
    const d = payload[0].payload as Datum;
    const present = series.filter((k) => typeof d[k] === "number");
    const total = present.reduce((s, k) => s + (d[k] as number), 0);
    return (
      <div className="tip">
        <strong>{periodLabel(grain, d.x)}</strong>
        {present.length === 0 && <div>Not measured</div>}
        {present.map((k) => <div key={k}><span className="dot" style={{ background: color(k) }} /> {label(k)}: {formatValue(unit, d[k] as number)}</div>)}
        {mode === "stack" && present.length > 1 && <div className="muted">Total: {formatValue(unit, total)}</div>}
        {d.partial && <div className="warn-text">partial period</div>}
      </div>
    );
  };

  const common = (
    <>
      <CartesianGrid stroke="var(--border)" vertical={false} />
      <XAxis dataKey="x" tickFormatter={(x: string) => periodLabel(grain, x)} tick={{ fill: "var(--muted)", fontSize: 11 }} minTickGap={24} stroke="var(--border)" />
      <YAxis tickFormatter={(n: number) => formatValue(unit, n, { compact: true })} tick={{ fill: "var(--muted)", fontSize: 11 }} width={64} stroke="var(--border)" />
      <Tooltip content={tip} />
      <Legend formatter={(k: string) => label(k)} wrapperStyle={{ fontSize: 12 }} />
    </>
  );

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        {mode === "stack" ? (
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            {common}
            {series.map((k) => (
              <Bar key={k} dataKey={k} stackId="s" fill={color(k)} isAnimationActive={false}>
                {data.map((d, i) => <Cell key={i} fill={color(k)} fillOpacity={d.partial ? 0.5 : 1} />)}
              </Bar>
            ))}
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            {common}
            {series.map((k) => <Line key={k} type="monotone" dataKey={k} stroke={color(k)} strokeWidth={2} dot={rows.length <= 1} connectNulls={false} isAnimationActive={false} />)}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
