// Runs Inflection's explanation for one series from the command line, using the
// same detection code as the page, and prints what comes back. For tuning the
// news search and the write-up. Needs the dev server running on localhost:3000.
//
//   npx tsx analysis/try_explain.ts <source> <id> [years] [trend|level] [log|linear] [shifts]
//   npx tsx analysis/try_explain.ts yahoo TSLA 5 trend log 4
//
// Each shift costs news-search tokens the first time; repeats are served from
// the server's cache until it restarts.
import { analyse, describeShifts, prepare } from "../src/lib/inflection/analyze";
import { describeShift } from "../src/lib/inflection/format";
import type { ExplainResponse, SeriesData } from "../src/lib/inflection/types";
import type { Model } from "../src/lib/segmentation";

const BASE = "http://localhost:3000";

async function main() {
  const [source = "yahoo", id = "TSLA", years = "5", model = "trend", scale = "log", shifts = "4"] =
    process.argv.slice(2);
  const log = scale === "log";

  const series = (await (
    await fetch(`${BASE}/api/series?${new URLSearchParams({ source, id })}`)
  ).json()) as SeriesData;
  const prepared = prepare(series.points, Number(years), log);
  const segmentation = analyse(prepared.z, model as Model);
  const cps = segmentation.changePoints[Math.min(Number(shifts), segmentation.changePoints.length - 1)];
  const { events } = describeShifts(prepared.points, prepared.z, cps, model as Model, log);

  console.log(`${series.label}: ${events.length} shifts\n`);
  const started = Date.now();
  const res = await fetch(`${BASE}/api/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, id, events }),
  });
  const body = (await res.json()) as ExplainResponse & { error?: string };
  console.log(`[${res.status}] ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
  if (!res.ok) return console.log(body);

  events.forEach((e, i) => {
    const x = body.explanations.find((k) => k.date === e.date);
    console.log(`${i + 1}. ${e.date}  ${describeShift(e, series.unit)}`);
    if (!x) return console.log("   (no explanation returned)\n");
    console.log(`   ${x.headline}${"confidence" in x && x.confidence ? `   [${x.confidence}]` : ""}`);
    if (x.summary) console.log(`   ${x.summary}`);
    for (const s of x.sources) console.log(`     - ${s.date ?? ""} ${s.source ?? ""}: ${s.title.slice(0, 100)}`);
    console.log();
  });
  if (body.overview) console.log(`Overview: ${body.overview}`);
}

main();
