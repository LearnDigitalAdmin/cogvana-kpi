import { useQuery } from "@tanstack/react-query";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { normaliseDefinition, placeholderDef } from "../lib/layouts";
import type { KpiDefinition } from "../lib/types";

export function useDefinitions() {
  const q = useQuery({
    queryKey: ["definitions"],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<KpiDefinition[]> => {
      const snap = await getDocs(collection(db, "kpi_definitions"));
      return snap.docs.map((d) => normaliseDefinition(d.id, d.data() as Partial<KpiDefinition>));
    },
  });
  const map = new Map((q.data ?? []).map((d) => [d.id, d]));
  return {
    list: q.data ?? [], isLoading: q.isPending, error: q.error, refetch: q.refetch,
    /** Stored definition, else a safe fallback so a missing document never breaks a page. */
    get: (id: string): KpiDefinition => map.get(id) ?? placeholderDef(id),
    has: (id: string) => map.has(id),
  };
}
export type Definitions = ReturnType<typeof useDefinitions>;
