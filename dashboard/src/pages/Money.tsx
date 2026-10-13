import { useMemo } from "react";
import { breakdownRow, sumPoints, totalSeries } from "../lib/aggregate";
import { formatCount, formatMoney, formatPercent } from "../lib/format";
import { CHARGE_TYPES, MONEY_CARDS, PAY_PLATFORMS, PLATFORM_NAMES, STREAMS } from "../lib/layouts";
import type { KpiValue } from "../lib/types";
import { ErrorBox } from "../components/ErrorBox";
import { GroupedChart } from "../components/GroupedChart";
import { KpiSection } from "../components/KpiSection";
import { Skeleton } from "../components/EmptyState";
import { useKpiValues } from "../hooks/useKpiValues";

const PAY_IDS = ["pay.attempts", "pay.success", "pay.failed", "pay.stuck_pending", "pay.success_rate", "pay.gmv", "pay.platform_revenue", "pay.net_revenue", "pay.net_revenue_unverified"];
const n = (v: number | null) => (v === null ? "—" : formatCount(v));
const m = (v: number | null) => (v === null ? "—" : formatMoney(v));

function BreakdownTable({ title, values, dimKey, map }: { title: string; values: KpiValue[]; dimKey: string; map: Record<string, string[]> }) {
  const rows = useMemo(() => PAY_PLATFORMS.flatMap((p) => (map[p] ?? []).map((d) => ({ p, d, r: breakdownRow(values, p, dimKey, d) }))), [values, dimKey, map]);
  return (
    <section>
      <h2>{title}</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Product</th><th>{dimKey === "stream" ? "Stream" : "Charge type"}</th><th className="num">Attempts</th><th className="num">Success</th><th className="num">Success rate</th><th className="num">GMV</th><th className="num">Platform revenue</th><th className="num">Net revenue</th><th className="num">Unverified net revenue</th></tr></thead>
          <tbody>
            {rows.map(({ p, d, r }) => (
              <tr key={`${p}-${d}`}>
                <td>{PLATFORM_NAMES[p]}</td><td>{d}</td>
                <td className="num">{n(r.attempts)}</td><td className="num">{n(r.success)}</td>
                <td className="num">{r.rate === null ? "—" : formatPercent(r.rate)}</td>
                <td className="num">{m(r.gmv)}</td><td className="num">{m(r.platformRevenue)}</td><td className="num">{m(r.netRevenue)}</td><td className="num">{m(r.unverified)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Money() {
  const pay = useKpiValues(PAY_IDS, { withPrevious: false });
  const needs = useMemo(() => PAY_PLATFORMS.map((p) => ({ p, failed: sumPoints(totalSeries(pay.values, "pay.failed", p)), stuck: sumPoints(totalSeries(pay.values, "pay.stuck_pending", p)) })), [pay.values]);
  return (
    <>
      <h1>Money</h1>
      <p className="muted small">GMV is money charged to payers, not revenue. Net revenue is after gateway fees and pass-throughs; “unverified” rests on an estimate.</p>
      <KpiSection ids={MONEY_CARDS} />
      <div className="grid grid-2">
        <GroupedChart data={pay} kpiId="pay.net_revenue" by={{ platform: true }} order={[...PAY_PLATFORMS]} label={(k) => PLATFORM_NAMES[k] ?? k} title="Net revenue by product" />
        <GroupedChart data={pay} kpiId="pay.success_rate" by={{ platform: true }} order={[...PAY_PLATFORMS]} mode="lines" title="Payment success rate by product" />
      </div>
      {pay.isError ? <ErrorBox error={pay.error} onRetry={pay.refetch} /> : pay.isLoading ? <Skeleton h={200} /> : (
        <>
          <BreakdownTable title="By charge type" values={pay.values} dimKey="chargeType" map={CHARGE_TYPES} />
          <BreakdownTable title="By revenue stream" values={pay.values} dimKey="stream" map={STREAMS} />
          <section>
            <h2>Needs attention</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Product</th><th className="num">Failed</th><th className="num">Stuck pending</th></tr></thead>
                <tbody>{needs.map(({ p, failed, stuck }) => <tr key={p}><td>{PLATFORM_NAMES[p]}</td><td className="num">{n(failed)}</td><td className="num">{n(stuck)}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="muted small">stuck = pending more than 30 minutes</p>
          </section>
        </>
      )}
    </>
  );
}
