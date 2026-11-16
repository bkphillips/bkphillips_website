// Prints what the insight models find for the company and each function,
// next to the events planted by generate_org.py.  Run: npx tsx analysis/check_org.ts
import { readFileSync } from "node:fs";
import { ANALYSIS_MODEL, analyseSeries, drivers, isStep } from "../src/lib/org/insights";
import { METRICS, OrgModel, formatMetric, type RawOrg } from "../src/lib/org/model";

const raw: RawOrg = JSON.parse(readFileSync(new URL("../src/data/org.json", import.meta.url), "utf8"));
const t0 = performance.now();
const model = new OrgModel(raw);
console.log(`model built in ${(performance.now() - t0).toFixed(0)} ms; planted:`,
  model.events.map((e) => `${e.label} @ ${e.month}`).join(", "));

const leaders = [model.ceo, ...model.reports[model.ceo]];
for (const id of leaders.slice(0, Number(process.argv[2] ?? 3))) {
  console.log(`\n== ${model.orgName(id)} (${model.orgSize(id)} people)`);
  for (const def of METRICS) {
    const s = model.seriesFor(id)![def.key];
    const a = analyseSeries(s, ANALYSIS_MODEL[def.key]);
    const text = a.findings.map((f) => {
      const d = drivers(model, id, def.key, f, 2).map((x) => `${x.org} ${formatMetric(def.key, x.before)}→${formatMetric(def.key, x.after)}`);
      return `${f.kind === "shift" ? (isStep(f) ? "step" : "bend") : "spike"}@${f.month} ${formatMetric(def.key, f.before)}→${formatMetric(def.key, f.after)} [${d.join("; ")}]`;
    });
    console.log(`  ${def.short.padEnd(12)} now ${formatMetric(def.key, s[model.last]).padEnd(12)} ${text.join(" | ") || "-"}`);
  }
}
