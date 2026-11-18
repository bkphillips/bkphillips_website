// Attaches news to the change points of the landing page's regime terrain.
//
// For every change point in public/data/terrain.json it looks up the top
// articles published around that date (NewsAPI.ai) and writes them back into
// the file, so the page can show them on hover without calling the news
// service itself.
//
// Results are kept in analysis/cache/terrain-news.json, so a search is only
// ever paid for once. Without --fetch the script uses the cache alone and
// reports what a fetch would cost.
//
//   npx tsx analysis/add_terrain_news.ts            (cache only, no cost)
//   npx tsx analysis/add_terrain_news.ts --fetch    (searches what is missing)
//
// Needs NEWSAPI_AI_KEY in .env.local for --fetch.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { newsTerms } from "../src/lib/inflection/keywords";
import { headlineScore, searchNews } from "../src/lib/news";

type Headline = { t: string; s: string; u: string; d: string };
type Terrain = {
  generated: string;
  dates: string[];
  series: { id: string; label: string; v: number[]; cps: number[]; news?: Headline[][] }[];
};

const DAY = 86_400_000;
const BEFORE_DAYS = 10; // a shift is dated at the first week of the new regime, so look back further
const AFTER_DAYS = 6;
const PER_POINT = 2; // headlines shown per change point
const KEEP = 8; // candidates kept in the cache, so ranking can be retuned without paying again

const path = (p: string) => new URL(p, import.meta.url);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Tokens one search costs: 1 within the last 30 days, otherwise 5 per calendar year touched. */
function cost(from: string, to: string): number {
  if (Date.parse(from) >= Date.now() - 30 * DAY) return 1;
  return 5 * (Number(to.slice(0, 4)) - Number(from.slice(0, 4)) + 1);
}

async function main() {
  const fetchMissing = process.argv.includes("--fetch");
  // --only=NVDA,^GSPC limits a fetch to those series, for a cheap trial run.
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
  try {
    process.loadEnvFile(path("../.env.local").pathname);
  } catch {
    // No .env.local: fine for a cache-only run.
  }
  const apiKey = process.env.NEWSAPI_AI_KEY;
  if (fetchMissing && !apiKey) {
    console.error("NEWSAPI_AI_KEY is not set in .env.local, so nothing can be fetched.");
    process.exit(1);
  }

  const terrain: Terrain = JSON.parse(readFileSync(path("../public/data/terrain.json"), "utf8"));
  const cacheFile = path("./cache/terrain-news.json");
  const cache: Record<string, Headline[]> = existsSync(cacheFile)
    ? JSON.parse(readFileSync(cacheFile, "utf8"))
    : {};

  let found = 0;
  let missing = 0;
  let spend = 0;
  let unspent = 0;
  for (const s of terrain.series) {
    const terms = newsTerms({ source: "yahoo", id: s.id, label: s.label });
    s.news = [];
    for (const c of s.cps) {
      const at = Date.parse(`${terrain.dates[c]}T00:00:00Z`);
      const from = iso(at - BEFORE_DAYS * DAY);
      const to = iso(at + AFTER_DAYS * DAY);
      const key = `${s.id}|${from}|${to}`;
      if (!(key in cache)) {
        if (!fetchMissing || (only && !only.includes(s.id))) {
          missing++;
          unspent += cost(from, to);
          s.news.push([]);
          continue;
        }
        const articles = await searchNews(apiKey!, { ...terms, from, to, count: KEEP });
        cache[key] = articles.map((a) => ({ t: a.title, s: a.source, u: a.url, d: a.date }));
        spend += cost(from, to);
        for (const a of cache[key].length ? cache[key] : [{ t: "(nothing found)", s: "", u: "", d: "" }]) {
          console.log(`${s.label.padEnd(18)} ${terrain.dates[c]}  [${a.s}] ${a.t.slice(0, 110)}`);
        }
        // Save as we go so an interrupted run keeps what it paid for.
        mkdirSync(path("./cache/"), { recursive: true });
        writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
      }
      // Show the best headlines, and nothing at all rather than a filler piece.
      const shown = cache[key]
        .map((a, order) => ({ a, order, score: headlineScore(a.t) }))
        .filter((x) => x.score >= 0)
        .sort((x, y) => y.score - x.score || x.order - y.order)
        .slice(0, PER_POINT)
        .map((x) => x.a);
      if (shown.length) found++;
      s.news.push(shown);
    }
  }

  writeFileSync(path("../public/data/terrain.json"), JSON.stringify(terrain));
  const total = terrain.series.reduce((n, s) => n + s.cps.length, 0);
  console.log(`\n${found} of ${total} change points have news.`);
  if (fetchMissing) console.log(`About ${spend} tokens used this run.`);
  if (missing) console.log(`${missing} are not in the cache. Fetching them would use about ${unspent} tokens.`);
}

main();
