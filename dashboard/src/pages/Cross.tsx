import { useMemo } from "react";
import { fillPeriods, totalSeries } from "../lib/aggregate";
import { CROSS_CARDS, CROSS_CHART_IDS, CROSS_OPTIONAL, PLATFORM_NAMES, STREAM_ORDER } from "../lib/layouts";
import { ChartCard } from "../components/ChartCard";
import { EmptyState, Skeleton } from "../components/EmptyState";
import { GroupedChart } from "../components/GroupedChart";
import { KpiSection } from "../components/KpiSection";
import { SeriesChart } from "../components/SeriesChart";
import { useDefinitions } from "../hooks/useDefinitions";
import { useKpiValues, type KpiData } from "../hooks/useKpiValues";

const IDS = [...CROSS_CARDS, ...CROSS_CHART_IDS];
const EMPTY = "Not computed yet";

function SingleSeries({ data, kpiId, title, kind }: { data: KpiData; kpiId: string; title: string; kind: "line" | "bar" }) {
  const def = useDefinitions().get(kpiId);
  const points = useMemo(() => totalSeries(data.values, kpiId), [data.values, kpiId]);
  const rows = useMemo(() => fillPeriods(data.grain, data.from, data.to, points), [data.grain, data.from, data.to, points]);
  if (data.isLoading) return <Skeleton h={240} />;
  return (
    <ChartCard title={title} caveat={def.caveat}>
      {points.length === 0 ? <EmptyState>{EMPTY}</EmptyState> : <SeriesChart rows={rows} grain={data.grain} unit={def.unit} kind={kind} />}
    </ChartCard>
  );
}

export default function Cross() {
  const data = useKpiValues(IDS);
  const platformLabel = (k: string) => PLATFORM_NAMES[k] ?? k;
  const hasValues = (id: string) => data.values.some((v) => v.kpiId === id);
  return (
    <>
      <h1>Cross-project</h1>
      <p className="muted small">Computed from the platform values by a separate job. Anything not yet computed shows “{EMPTY}”.</p>
      <KpiSection ids={CROSS_CARDS} data={data} hideWhenEmpty={CROSS_OPTIONAL} emptyHint={EMPTY} />
      <div className="grid grid-2">
        <GroupedChart data={data} kpiId="cross.revenue_share" by={{ dim: "platform" }} donut title="Revenue share by product" emptyText={EMPTY} />
        <GroupedChart data={data} kpiId="cross.stream_share" by={{ dim: "stream" }} order={STREAM_ORDER} donut title="Revenue share by stream" emptyText={EMPTY} />
        <SingleSeries data={data} kpiId="cross.subscription_revenue" title="Subscription revenue (recurring)" kind="bar" />
        <SingleSeries data={data} kpiId="cross.digital_rent_share" title="Digital rent share" kind="line" />
        <GroupedChart data={data} kpiId="cross.sms_units_used" by={{ dim: "platform" }} label={platformLabel} title="SMS units used" emptyText={EMPTY} />
        <GroupedChart data={data} kpiId="cross.sms_prepaid_outstanding" by={{ dim: "platform" }} label={platformLabel} title="Prepaid SMS units outstanding" emptyText={EMPTY} />
      </div>
      {(hasValues("cross.sms_cost_estimate") || hasValues("cross.sms_margin")) && <p className="muted small">SMS cost and margin are estimates; see the caveat on each card.</p>}
    </>
  );
}
