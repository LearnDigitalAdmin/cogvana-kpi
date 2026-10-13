import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatValue } from "../lib/format";
import type { KpiUnit } from "../lib/types";
import { PALETTE } from "./StackedChart";

export interface DonutItem { name: string; value: number }

export function DonutChart({ items, unit, height = 200 }: { items: DonutItem[]; unit: KpiUnit; height?: number }) {
  const positive = items.filter((i) => i.value > 0);
  return (
    <div className="donut">
      <div style={{ width: "100%", maxWidth: 220, height }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={positive} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="90%" paddingAngle={1} isAnimationActive={false} stroke="var(--bg)">
              {positive.map((it) => <Cell key={it.name} fill={PALETTE[items.indexOf(it) % PALETTE.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number) => formatValue(unit, v)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="legend">
        {items.map((it, i) => (
          <li key={it.name}><span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} /> {it.name} <strong>{formatValue(unit, it.value)}</strong></li>
        ))}
      </ul>
    </div>
  );
}
