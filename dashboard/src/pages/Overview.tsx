import { GroupedChart } from "../components/GroupedChart";
import { KpiSection } from "../components/KpiSection";
import { useKpiValues } from "../hooks/useKpiValues";
import { OVERVIEW_CARDS, OVERVIEW_OPTIONAL, STREAM_ORDER } from "../lib/layouts";

const IDS = [...OVERVIEW_CARDS, "cross.revenue_share"];

export default function Overview() {
  const data = useKpiValues(IDS);
  return (
    <>
      <h1>Overview</h1>
      <KpiSection ids={OVERVIEW_CARDS} data={data} hideWhenEmpty={OVERVIEW_OPTIONAL} hero />
      <div className="grid grid-2">
        <GroupedChart data={data} kpiId="company.net_revenue" by={{ dim: "stream" }} order={STREAM_ORDER} title="Net revenue by stream" emptyText="No stream breakdown in this range" />
        <GroupedChart data={data} kpiId="cross.revenue_share" by={{ dim: "platform" }} donut title="Revenue share by product" hideWhenEmpty />
      </div>
      <GroupedChart data={data} kpiId="company.active_accounts" by={{ dim: "platform" }} title="Active accounts by product" hideWhenEmpty />
    </>
  );
}
