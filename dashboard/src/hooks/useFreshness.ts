import { useMemo } from "react";
import { addDays } from "../lib/nairobi";
import { freshnessLevel, freshnessRows } from "../lib/freshness";
import { useKpiValues } from "./useKpiValues";
import { useRange } from "./useRange";

/** Always daily, last 7 days, independent of the selected grain/range. */
export function useFreshness() {
  const { today } = useRange();
  const data = useKpiValues(["company.data_freshness_hours"], { grain: "daily", from: addDays(today, -6), to: today, withPrevious: false });
  const rows = useMemo(() => freshnessRows(data.values), [data.values]);
  return { rows, level: freshnessLevel(rows), isLoading: data.isLoading, isError: data.isError, refetch: data.refetch };
}
