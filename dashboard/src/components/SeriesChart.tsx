import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GridRow } from "../lib/aggregate";
import { formatValue } from "../lib/format";
import { periodLabel } from "../lib/nairobi";
import type { Grain, KpiUnit } from "../lib/types";

interface Props {
  rows: GridRow[]; grain: Grain; unit: KpiUnit;
  kind: "line" | "bar";
  height?: number;
  /** sparkline: no axes, no tooltip */
  spark?: boolean;
  tone?: string;
}

interface Datum { x: string; v: number | null; p: number | null; hollow: boolean; val: number | null; partial: boolean; num: number | null; den: number | null }

export function SeriesTooltip({ active, payload, grain, unit }: { active?: boolean; payload?: { payload: Datum }[]; grain: Grain; unit: KpiUnit }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="tip">
      <strong>{periodLabel(grain, d.x)}</strong>
      {d.val === null ? <div>Not measured</div> : (
        <>
          <div>{formatValue(unit, d.val)}</div>
          {d.num !== null && d.den !== null && <div className="muted">{d.num.toLocaleString("en-US")} / {d.den.toLocaleString("en-US")}</div>}
          {d.partial && <div className="warn-text">partial period</div>}
        </>
      )}
    </div>
  );
}

function toData(rows: GridRow[]): Datum[] {
  const data: Datum[] = rows.map((r) => ({
    x: r.periodStart, val: r.point?.value ?? null, partial: !!r.point && !r.point.complete,
    v: r.point && r.point.complete ? r.point.value : null, p: null, hollow: false,
    num: r.point?.numerator ?? null, den: r.point?.denominator ?? null,
  }));
  data.forEach((d, i) => {
    if (!d.partial) return;
    d.p = d.val; d.hollow = true;
    const before = data[i - 1];
    if (before && before.v !== null) before.p = before.v; // bridge so the dashed segment connects
  });
  return data;
}

export function SeriesChart({ rows, grain, unit, kind, height = 220, spark, tone }: Props) {
  const data = toData(rows);
  const color = tone ?? "var(--accent)";
  const single = data.filter((d) => d.val !== null).length <= 1;
  const margin = spark ? { top: 4, right: 2, bottom: 2, left: 2 } : { top: 8, right: 12, bottom: 0, left: 0 };
  const axes = !spark && (
    <>
      <CartesianGrid stroke="var(--border)" vertical={false} />
      <XAxis dataKey="x" tickFormatter={(x: string) => periodLabel(grain, x)} tick={{ fill: "var(--muted)", fontSize: 11 }} minTickGap={24} stroke="var(--border)" />
      <YAxis tickFormatter={(n: number) => formatValue(unit, n, { compact: true })} tick={{ fill: "var(--muted)", fontSize: 11 }} width={64} stroke="var(--border)" />
      <Tooltip content={<SeriesTooltip grain={grain} unit={unit} />} />
    </>
  );
  const hollowDot = (p: { cx?: number; cy?: number; payload?: Datum; index?: number }) =>
    p.payload?.hollow && p.cx !== undefined && p.cy !== undefined
      ? <circle key={`h${p.index}`} cx={p.cx} cy={p.cy} r={4} fill="var(--bg)" stroke={color} strokeWidth={2} />
      : <g key={`n${p.index}`} />;

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        {kind === "bar" ? (
          <BarChart data={data} margin={margin}>
            {axes}
            <Bar dataKey="val" fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {data.map((d, i) => <Cell key={i} fill={color} fillOpacity={d.partial ? 0.45 : 1} stroke={d.partial ? color : undefined} strokeDasharray={d.partial ? "3 2" : undefined} />)}
            </Bar>
          </BarChart>
        ) : (
          <LineChart data={data} margin={margin}>
            {axes}
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={single ? { r: 3 } : false} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="p" stroke={color} strokeWidth={2} strokeDasharray="4 3" dot={hollowDot} activeDot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
