// Prepares Inflection's explanations for the example series ahead of time, so
// a visitor who picks one sees the news and the summary straight away.
//
// For every preset at its default settings this runs the same detection as
// the page, searches the news around each shift (NewsAPI.ai), has Claude write
// the summaries, and writes public/data/inflection-saved.json. The page uses
// a saved explanation when a shift it finds lands on (or within a few days
// of) a saved date; anything else still goes through /api/explain.
//
//   npx tsx analysis/build_inflection_saved.ts            reuse what is cached
//   npx tsx analysis/build_inflection_saved.ts --refresh  search and write again
//
// Needs the dev server running on localhost:3000: the series and the
// explanations come from its own /api/series and /api/explain, so this uses
// exactly the code the site uses (and the dev server has no rate limits).
//
// Costs about 5 news tokens per shift (around 40 shifts) and one model call
// per series. Results are cached in analysis/cache/inflection-saved.json and
// reused while the detected dates stay the same. Needs NEWSAPI_AI_KEY and
// ANTHROPIC_API_KEY in .env.local. Run it again from time to time: the series
// are live, so shifts move as new data arrives.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  analyse,
  describeShifts,
  prepare,
} from "../src/lib/inflection/analyze";
import { presets } from "../src/lib/inflection/presets";
import type {
  ExplainResponse,
  SavedExplanations,
  SeriesData,
} from "../src/lib/inflection/types";

const path = (p: string) => new URL(p, import.meta.url);
const BASE = "http://localhost:3000";

const CACHE = path("./cache/inflection-saved.json");
const OUT = path("../public/data/inflection-saved.json");
const refresh = process.argv.includes("--refresh");

async function main() {
  const cache: Record<string, ExplainResponse> = existsSync(CACHE)
    ? JSON.parse(readFileSync(CACHE, "utf8"))
    : {};
  const out: SavedExplanations = {
    asOf: new Date().toISOString().slice(0, 10),
    series: {},
  };

  for (const p of presets) {
    const loaded = await fetch(
      `${BASE}/api/series?${new URLSearchParams({ source: p.source, id: p.id })}`,
    );
    if (!loaded.ok) {
      console.log(`${p.name}: no data (${loaded.status}), skipped`);
      continue;
    }
    const series = (await loaded.json()) as SeriesData;
    const prepared = prepare(series.points, p.years, p.log);
    const segmentation = analyse(prepared.z, p.model);
    const k = Math.min(p.shifts, segmentation.changePoints.length - 1);
    const { events } = describeShifts(
      prepared.points,
      prepared.z,
      segmentation.changePoints[k],
      p.model,
      p.log,
    );

    const key = `${p.source}:${p.id}:${p.model}:${p.log}:${events.map((e) => e.date).join(",")}`;
    let result = refresh ? undefined : cache[key];
    const started = Date.now();
    if (!result) {
      const res = await fetch(`${BASE}/api/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: p.source, id: p.id, events }),
      });
      const body = (await res.json()) as ExplainResponse & { error?: string };
      if (!res.ok || !body.explanations?.some((x) => x.summary)) {
        // No summaries means a key is missing; do not save a half result.
        console.log(
          `${p.name}: not explained (${res.status}) ${body.error ?? "no summaries came back"}`,
        );
        continue;
      }
      result = body;
      cache[key] = result;
      writeFileSync(CACHE, JSON.stringify(cache, null, 1));
    }
    console.log(
      `${p.name}: ${events.length} shifts, ${result.explanations.length} explained` +
        (Date.now() - started > 50
          ? ` in ${((Date.now() - started) / 1000).toFixed(0)}s`
          : " (cached)"),
    );
    for (const x of result.explanations)
      console.log(`   ${x.date}  [${x.confidence ?? "-"}]  ${x.headline}`);

    out.series[`${p.source}:${p.id}`] = {
      years: p.years,
      model: p.model,
      log: p.log,
      shifts: k,
      overview: result.overview,
      explanations: result.explanations,
    };
  }
  writeFileSync(OUT, JSON.stringify(out));
  console.log(
    `\nwrote ${Object.keys(out.series).length} series to public/data/inflection-saved.json`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
