import { useMemo } from "react";
import { groupByDim, groupByPlatform, latestPerDim, stackRows } from "../lib/aggregate";
import { periodLabel } from "../lib/nairobi";
import type { KpiData } from "../hooks/useKpiValues";
import { useDefinitions } from "../hooks/useDefinitions";
import { ChartCard } from "./ChartCard";
import { DonutChart } from "./DonutChart";
import { EmptyState, Skeleton } from "./EmptyState";
import { ErrorBox } from "./ErrorBox";
import { useKpiDrawer } from "./KpiDrawer";
import { StackedChart } from "./StackedChart";

type By = { dim: string } | { platform: true };
interface Props {
  data: KpiData; kpiId: string; by: By; title: string;
  platform?: string;
  mode?: "stack" | "lines";
  order?: string[];
  /** hide the whole card (no empty box) when there are no values */
  hideWhenEmpty?: boolean;
  emptyText?: string;
  donut?: boolean;
  subtitle?: string;
  /** display name for a series key */
  label?: (k: string) => string;
}

function orderKeys(keys: string[], order: string[] = []): string[] {
  return [...keys].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
}

/** Stacked columns / lines / donut of one KPI split by a dimension (or by its `platform` field). */
export function GroupedChart({ data, kpiId, by, title, platform, mode = "stack", order, hideWhenEmpty, emptyText, donut, subtitle, label }: Props) {
  const defs = useDefinitions();
  const def = defs.get(kpiId);
  const drawer = useKpiDrawer(data, platform);
  const scoped = useMemo(() => data.values.filter((v) => v.kpiId === kpiId && (!platform || v.platform === platform)), [data.values, kpiId, platform]);
  const groups = useMemo(() => ("dim" in by ? groupByDim(scoped, by.dim) : groupByPlatform(scoped, kpiId)), [scoped, by, kpiId]);
  const series = useMemo(() => orderKeys([...groups.keys()], order), [groups, order]);
  const rows = useMemo(() => stackRows(data.grain, data.from, data.to, groups), [data.grain, data.from, data.to, groups]);

  if (data.isError) return <ErrorBox error={data.error} onRetry={data.refetch} />;
  if (data.isLoading) return <Skeleton h={260} />;
  if (groups.size === 0) return hideWhenEmpty ? null : <ChartCard title={title}><EmptyState>{emptyText ?? "Not measured in this range"}</EmptyState></ChartCard>;

  if (donut && "dim" in by) {
    const latest = latestPerDim(scoped, by.dim);
    const period = latest.reduce((m, i) => (i.point.periodStart > m ? i.point.periodStart : m), "");
    const items = orderKeys(latest.filter((i) => i.point.periodStart === period).map((i) => i.dim), order)
      .map((name) => ({ name, value: latest.find((i) => i.dim === name)!.point.value }));
    const partial = latest.some((i) => i.point.periodStart === period && !i.point.complete);
    return (
      <ChartCard title={title} subtitle={`${periodLabel(data.grain, period)}${partial ? " · partial period" : ""}`} caveat={def.caveat} onDetails={() => drawer.open(kpiId)}>
        <DonutChart items={items} unit={def.unit} />
        {drawer.node}
      </ChartCard>
    );
  }
  return (
    <ChartCard title={title} subtitle={subtitle} caveat={def.caveat} onDetails={() => drawer.open(kpiId)}>
      <StackedChart rows={rows} series={series} grain={data.grain} unit={def.unit} mode={mode} label={label} />
      {drawer.node}
    </ChartCard>
  );
}
