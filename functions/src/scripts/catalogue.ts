/** Writes docs/kpi-catalogue.json and docs/kpi-catalogue.md from the live registry. Run: npm run catalogue */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { ALL_DEFINITIONS } from "../registry";

const docs = join(__dirname, "..", "..", "..", "docs");
mkdirSync(docs, { recursive: true });

writeFileSync(join(docs, "kpi-catalogue.json"), JSON.stringify(ALL_DEFINITIONS, null, 2) + "\n");

const rows = ALL_DEFINITIONS.map((d) =>
  `| \`${d.id}\` | ${d.name} | ${d.scope} | ${d.platform} | ${d.type} | ${d.unit} | ${d.grains.join("/")} | ${d.dimensions.join(",") || "-"} | ${d.direction} | ${d.status} | ${d.caveat ?? ""} |`
);
writeFileSync(
  join(docs, "kpi-catalogue.md"),
  ["# KPI catalogue (generated)", "", `${ALL_DEFINITIONS.length} KPIs.`, "",
   "| id | name | scope | platform | type | unit | grains | dimensions | direction | status | caveat |",
   "|----|------|-------|----------|------|------|--------|------------|-----------|--------|--------|", ...rows, ""].join("\n")
);
console.log(`catalogue: ${ALL_DEFINITIONS.length} KPIs`);
