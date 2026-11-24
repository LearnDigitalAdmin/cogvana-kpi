/** kpiGetValues accepts at most 30 ids per call. */
export const MAX_IDS_PER_CALL = 30;

export function chunk<T>(items: T[], size: number = MAX_IDS_PER_CALL): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function uniqueSorted(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}
