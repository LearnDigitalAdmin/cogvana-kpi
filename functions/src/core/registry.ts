import { KpiDefinition } from "./types";

const ID_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$/;

/** Fills the defaults so definition files stay short and consistent. */
export function defineKpi(
  d: Omit<KpiDefinition, "thresholds" | "version" | "status" | "dimensions" | "direction" | "grain" | "grains"> &
    Partial<Pick<KpiDefinition, "thresholds" | "version" | "status" | "dimensions" | "direction" | "grain" | "grains">>
): KpiDefinition {
  return {
    thresholds: {},
    version: 1,
    status: "active",
    dimensions: [],
    direction: "neutral",
    grain: "daily",
    grains: ["daily"],
    ...d,
  };
}

/** Throws with every problem listed, so a bad definition fails at build/test time. */
export function validateDefinitions(defs: KpiDefinition[]): void {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const d of defs) {
    if (!ID_RE.test(d.id)) problems.push(`${d.id}: id must look like "namespace.name"`);
    if (seen.has(d.id)) problems.push(`${d.id}: duplicate id`);
    seen.add(d.id);
    if (!d.formula.trim()) problems.push(`${d.id}: formula is required`);
    if (!d.owner.trim()) problems.push(`${d.id}: owner is required`);
    if (!d.decision.trim()) problems.push(`${d.id}: decision is required (every KPI must drive one)`);
    if (d.type === "ratio" && (!d.numeratorDesc || !d.denominatorDesc)) {
      problems.push(`${d.id}: ratios need numeratorDesc and denominatorDesc`);
    }
    if (d.version < 1 || !Number.isInteger(d.version)) problems.push(`${d.id}: version must be a positive integer`);
  }

  if (problems.length) throw new Error("Invalid KPI definitions:\n - " + problems.join("\n - "));
}

export function indexById(defs: KpiDefinition[]): Map<string, KpiDefinition> {
  return new Map(defs.map((d) => [d.id, d]));
}
