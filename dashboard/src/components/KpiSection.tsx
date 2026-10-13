import { useMemo, type ReactNode } from "react";
import { useDefinitions } from "../hooks/useDefinitions";
import { useKpiValues, type KpiData } from "../hooks/useKpiValues";
import type { PlatformId } from "../lib/types";
import { ErrorBox } from "./ErrorBox";
import { useKpiDrawer } from "./KpiDrawer";
import { KpiTile, PlannedTile } from "./KpiTile";
import { Skeleton } from "./EmptyState";

interface Props {
  title?: string; ids: string[]; platform?: PlatformId;
  breakdowns?: Record<string, string>;
  hero?: boolean;
  /** render every tile greyed ("Not collected yet") and fetch nothing */
  planned?: boolean;
  /** ids that disappear (no error) when they have no values */
  hideWhenEmpty?: string[];
  emptyHint?: string;
  /** reuse an already-fetched dataset instead of fetching */
  data?: KpiData;
  children?: ReactNode;
}

export function KpiSection({ title, ids, platform, breakdowns = {}, hero, planned, hideWhenEmpty = [], emptyHint, data: external, children }: Props) {
  const defs = useDefinitions();
  const visible = useMemo(() => ids.filter((id) => defs.get(id).status !== "deprecated"), [ids, defs]);
  const fetchIds = useMemo(() => visible.filter((id) => !planned && defs.get(id).status !== "planned"), [visible, defs, planned]);
  const own = useKpiValues(fetchIds, { platform, enabled: !external && !defs.isLoading && !planned });
  const data = external ?? own;
  const drawer = useKpiDrawer(data, platform);

  if (defs.error) return <section><ErrorBox error={defs.error} onRetry={() => void defs.refetch()} title="Could not load KPI definitions" /></section>;
  const loading = defs.isLoading || (!planned && data.isLoading);
  const cls = hero ? "grid grid-hero" : "grid";

  const tiles = visible.flatMap((id) => {
    const def = defs.get(id);
    if (planned || def.status === "planned") return [<PlannedTile key={id} def={def} />];
    const values = data.values.filter((v) => v.kpiId === id && (!platform || v.platform === platform));
    if (hideWhenEmpty.includes(id) && values.length === 0) return [];
    return [(
      <KpiTile key={id} def={def} values={values} breakdown={breakdowns[id]} emptyHint={emptyHint} hero={hero}
        prevValues={data.prevValues.filter((v) => v.kpiId === id && (!platform || v.platform === platform))}
        grain={data.grain} from={data.from} to={data.to} prevFrom={data.prevFrom} onOpen={drawer.open} />
    )];
  });

  if (!loading && !data.isError && tiles.length === 0 && !children) return null;
  return (
    <section>
      {title && <h2>{title}</h2>}
      {data.isError && !planned ? <ErrorBox error={data.error} onRetry={data.refetch} /> : (
        <div className={cls}>
          {loading ? visible.slice(0, hero ? 3 : 6).map((id) => <Skeleton key={id} h={hero ? 150 : 120} />) : tiles}
        </div>
      )}
      {children}
      {drawer.node}
    </section>
  );
}
