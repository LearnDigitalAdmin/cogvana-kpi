import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { chunk, uniqueSorted } from "../lib/batch";
import { previousRange } from "../lib/nairobi";
import type { Grain, KpiValue, PlatformId } from "../lib/types";
import { useRange } from "./useRange";

export interface KpiDataOptions {
  grain?: Grain; from?: string; to?: string; platform?: PlatformId;
  enabled?: boolean;
  /** Also fetch the previous equal-length range (for deltas). Default true. */
  withPrevious?: boolean;
}
export interface KpiData {
  values: KpiValue[]; prevValues: KpiValue[];
  isLoading: boolean; isError: boolean; error: unknown;
  refetch: () => void;
  grain: Grain; from: string; to: string; prevFrom: string; prevTo: string;
  ids: string[];
}

interface Req { grain: Grain; from: string; to: string; kpiIds: string[]; platform?: PlatformId }
const getCall = () => httpsCallable<Req, { values: KpiValue[] }>(functions, "kpiGetValues");

export function isAuthError(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "functions/permission-denied" || code === "functions/unauthenticated" || code === "permission-denied";
}

/** Fetches `ids` in chunks of ≤ 30 (in parallel) for the selected grain/range, plus the previous range. Never aggregates across grains. */
export function useKpiValues(ids: string[], opts: KpiDataOptions = {}): KpiData {
  const r = useRange();
  const grain = opts.grain ?? r.grain;
  const from = opts.from ?? r.from;
  const to = opts.to ?? r.to;
  const prev = previousRange(from, to);
  const withPrev = opts.withPrevious !== false;
  const enabled = opts.enabled !== false;
  const idsKey = uniqueSorted(ids).join(",");
  const chunks = useMemo(() => chunk(idsKey ? idsKey.split(",") : []), [idsKey]);
  const qc = useQueryClient();

  const make = (c: string[], f: string, t: string, on: boolean) => ({
    queryKey: ["kpi-values", grain, f, t, opts.platform ?? "any", c.join(",")],
    enabled: enabled && on,
    staleTime: 60_000,
    retry: (n: number, e: unknown) => !isAuthError(e) && n < 1,
    queryFn: async () => {
      const req: Req = { grain, from: f, to: t, kpiIds: c };
      if (opts.platform) req.platform = opts.platform;
      return (await getCall()(req)).data.values ?? [];
    },
  });
  const queries = chunks.flatMap((c) => [make(c, from, to, true), ...(withPrev ? [make(c, prev.from, prev.to, true)] : [])]);
  const stride = withPrev ? 2 : 1;

  const combine = useCallback(
    (results: { data?: KpiValue[]; isPending: boolean; isError: boolean; error: unknown; fetchStatus: string }[]) => {
      const cur = results.filter((_, i) => i % stride === 0);
      const prv = results.filter((_, i) => i % stride === 1);
      return {
        values: cur.flatMap((x) => x.data ?? []),
        prevValues: prv.flatMap((x) => x.data ?? []), // a failed previous side just means "no delta"
        isLoading: cur.some((x) => x.isPending && x.fetchStatus !== "idle"),
        isError: cur.some((x) => x.isError),
        error: cur.find((x) => x.isError)?.error ?? null,
      };
    },
    [stride],
  );
  const res = useQueries({ queries, combine });

  const refetch = useCallback(() => { void qc.invalidateQueries({ queryKey: ["kpi-values", grain, from, to] }); void qc.invalidateQueries({ queryKey: ["kpi-values", grain, prev.from, prev.to] }); }, [qc, grain, from, to, prev.from, prev.to]);

  return { ...res, refetch, grain, from, to, prevFrom: prev.from, prevTo: prev.to, ids: uniqueSorted(ids) };
}

/** Most recent `computedAt` across every KPI query in the cache (drives "Updated HH:MM"). */
export function useLatestComputedAt(): number | null {
  const qc = useQueryClient();
  const subscribe = useCallback((cb: () => void) => qc.getQueryCache().subscribe(cb), [qc]);
  const snap = useCallback(() => {
    let max = 0;
    for (const q of qc.getQueryCache().findAll({ queryKey: ["kpi-values"] })) {
      for (const v of (q.state.data as KpiValue[] | undefined) ?? []) if (v.computedAt > max) max = v.computedAt;
    }
    return max;
  }, [qc]);
  const max = useSyncExternalStore(subscribe, snap, snap);
  return max || null;
}
