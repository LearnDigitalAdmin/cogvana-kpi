import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { KpiRun } from "../lib/types";

export function useRuns() {
  return useQuery({
    queryKey: ["kpi-runs"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<KpiRun[]> => {
      const snap = await getDocs(query(collection(db, "kpi_runs"), orderBy("startedAt", "desc"), limit(100)));
      return snap.docs.map((d) => ({ ...(d.data() as Omit<KpiRun, "id">), id: d.id }));
    },
  });
}
