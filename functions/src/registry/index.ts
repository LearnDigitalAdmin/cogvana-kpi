import { indexById, validateDefinitions } from "../core/registry";
import { KpiDefinition } from "../core/types";
import { CHAMA_DEFINITIONS } from "./chama";
import { COMPANY_DEFINITIONS } from "./company";
import { CROSS_DEFINITIONS } from "./cross";
import { PAY_DEFINITIONS } from "./pay";
import { PMS_DEFINITIONS } from "./pms";
import { CYBER_DEFINITIONS } from "./cyber";
import { DESK_DEFINITIONS } from "./desk";
import { REGISTER_DEFINITIONS } from "./register";

/**
 * Seam 2: the KPI registry. Add a platform's KPIs by adding its definitions
 * file here; nothing else changes.
 */
export const ALL_DEFINITIONS: KpiDefinition[] = [...PAY_DEFINITIONS, ...REGISTER_DEFINITIONS, ...CHAMA_DEFINITIONS, ...PMS_DEFINITIONS, ...CYBER_DEFINITIONS, ...DESK_DEFINITIONS, ...COMPANY_DEFINITIONS, ...CROSS_DEFINITIONS];

validateDefinitions(ALL_DEFINITIONS);

export const DEFINITIONS_BY_ID = indexById(ALL_DEFINITIONS);

export function definitionVersion(kpiId: string): number {
  const d = DEFINITIONS_BY_ID.get(kpiId);
  if (!d) throw new Error(`Unknown KPI id "${kpiId}" (not in registry)`);
  return d.version;
}
