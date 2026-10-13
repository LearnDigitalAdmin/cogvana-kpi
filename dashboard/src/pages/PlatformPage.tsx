import { GroupedChart } from "../components/GroupedChart";
import { KpiSection } from "../components/KpiSection";
import { useKpiValues } from "../hooks/useKpiValues";
import { LAYOUTS, PAY_SECTION_TITLE, PAY_TILES, STREAM_ORDER } from "../lib/layouts";
import type { PlatformId } from "../lib/types";

function PaySection({ platform }: { platform: PlatformId }) {
  const data = useKpiValues(PAY_TILES, { platform });
  return (
    <KpiSection title={PAY_SECTION_TITLE} ids={PAY_TILES} platform={platform} data={data}>
      <GroupedChart data={data} kpiId="pay.net_revenue" platform={platform} by={{ dim: "stream" }} order={STREAM_ORDER} title="Net revenue by stream" emptyText="No stream breakdown in this range" />
    </KpiSection>
  );
}

/** One generic page driven by LAYOUTS (lib/layouts.ts). */
export default function PlatformPage({ layoutKey }: { layoutKey: string }) {
  const layout = LAYOUTS[layoutKey];
  const first = layout.groups[0];
  return (
    <>
      <h1>{layout.title}</h1>
      {layout.banner && <div className="box box-info">{layout.banner}</div>}
      <KpiSection ids={first.ids.slice(0, 3)} hero breakdowns={layout.breakdowns} />
      {layout.groups.map((g) => (
        <KpiSection key={g.title} title={g.title} ids={g.ids} planned={g.planned} breakdowns={layout.breakdowns} />
      ))}
      <PaySection platform={layout.payPlatform} />
    </>
  );
}
