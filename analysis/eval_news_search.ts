// Compares ways of asking NewsAPI.ai for the news behind a shift.
//
// The test set is 16 shifts whose cause is well known (the March 2020 crash,
// the Terra collapse, the December 2023 Fed pivot, ...). Each search variant
// is run for every shift over the same window the tool uses, the results are
// ranked two ways, and a variant scores a hit when a headline it would show
// names the known cause.
//
//   npx tsx analysis/eval_news_search.ts            score what is cached
//   npx tsx analysis/eval_news_search.ts --fetch    run searches not yet cached
//
// Each search costs about 5 tokens (16 shifts x 5 variants is about 400).
// Raw results, which include article openings, are cached in
// analysis/cache/news-eval.private.json and are not for publication.
// Needs NEWSAPI_AI_KEY in .env.local.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { headlineScore } from "../src/lib/news";

const path = (p: string) => new URL(p, import.meta.url);
process.loadEnvFile(path("../.env.local").pathname);
const KEY = process.env.NEWSAPI_AI_KEY!;
const CACHE = path("./cache/news-eval.private.json");
const FETCH = process.argv.includes("--fetch");
const API = "https://eventregistry.org/api/v1";
const DAY = 86_400_000;

/** Outlets the site searches today. */
const SOURCES = [
  "reuters.com", "apnews.com", "bloomberg.com", "cnbc.com", "wsj.com", "ft.com",
  "nytimes.com", "washingtonpost.com", "bbc.com", "bbc.co.uk", "theguardian.com",
  "marketwatch.com", "finance.yahoo.com", "barrons.com", "fortune.com", "forbes.com",
  "businessinsider.com", "economist.com", "axios.com", "cnn.com", "npr.org",
  "usatoday.com", "latimes.com", "time.com", "theverge.com", "techcrunch.com", "coindesk.com",
];
const MARKET_WORDS = [
  "stock", "stocks", "shares", "earnings", "revenue", "results", "profit", "sales",
  "forecast", "outlook", "guidance", "investors", "valuation", "market value",
  "rally", "rallies", "record", "selloff", "sell-off", "plunge", "plunges", "surge", "surges",
  "slump", "slumps", "tumble", "tumbles", "jumps", "soars", "falls", "sinks", "drops", "slides",
];
const JUNK = [
  "stocks to buy", "to buy now", "price prediction", "should you buy", "live updates",
  "how to", "best stocks", "dividend stocks", "stock forecast",
];

type Series = {
  name: string;
  /** Title phrases the site uses today. */
  words: string[];
  /** A wider set of title phrases. */
  wider: string[];
  /** Label to resolve to an entity. */
  concept: string;
  company?: boolean;
};
const S: Record<string, Series> = {
  spx: { name: "S&P 500", words: ["S&P 500"], wider: ["S&P 500", "Wall Street", "stocks", "stock market", "Dow"], concept: "S&P 500" },
  nvda: { name: "Nvidia", words: ["Nvidia"], wider: ["Nvidia"], concept: "Nvidia", company: true },
  btc: { name: "Bitcoin", words: ["Bitcoin"], wider: ["Bitcoin", "crypto", "cryptocurrency"], concept: "Bitcoin" },
  oil: { name: "Crude oil", words: ["oil prices", "oil price", "crude oil", "Brent"], wider: ["oil prices", "oil price", "crude oil", "Brent", "oil", "crude", "OPEC"], concept: "Price of oil" },
  tnx: { name: "10-year Treasury", words: ["Treasury yields", "bond yields", "10-year Treasury"], wider: ["Treasury yields", "bond yields", "10-year Treasury", "yields", "Treasuries", "bonds"], concept: "United States Treasury security" },
  meta: { name: "Meta", words: ["Meta", "Facebook"], wider: ["Meta", "Facebook"], concept: "Meta Platforms", company: true },
  tsla: { name: "Tesla", words: ["Tesla"], wider: ["Tesla"], concept: "Tesla, Inc.", company: true },
  nflx: { name: "Netflix", words: ["Netflix"], wider: ["Netflix"], concept: "Netflix", company: true },
  covid: { name: "COVID-19 cases", words: ["COVID-19", "coronavirus", "Covid"], wider: ["COVID-19", "coronavirus", "Covid"], concept: "COVID-19 pandemic" },
};

/** Shifts with a cause that is not in doubt, and words a headline about it would use. */
/** `dir` is which way the series moved: 1 up, -1 down, 0 where tone says nothing (case counts). */
const CASES: { s: keyof typeof S; date: string; dir: number; what: string; cause: RegExp }[] = [
  { s: "spx", date: "2020-03-11", dir: -1, what: "pandemic crash", cause: /coronavirus|covid|pandemic|virus/i },
  { s: "spx", date: "2023-12-14", dir: 1, what: "Fed pivot", cause: /\bfed\b|federal reserve|rate cuts?|powell/i },
  { s: "spx", date: "2025-04-03", dir: -1, what: "tariff shock", cause: /tariff/i },
  { s: "nvda", date: "2023-05-25", dir: 1, what: "AI forecast", cause: /\bAI\b|artificial intelligence|forecast|trillion/i },
  { s: "nvda", date: "2025-01-27", dir: -1, what: "DeepSeek", cause: /deepseek/i },
  { s: "btc", date: "2021-05-13", dir: -1, what: "Tesla stops payments", cause: /tesla|musk/i },
  { s: "btc", date: "2022-05-10", dir: -1, what: "Terra collapse", cause: /terra|luna|stablecoin/i },
  { s: "btc", date: "2022-11-09", dir: -1, what: "FTX collapse", cause: /ftx|binance|bankman/i },
  { s: "btc", date: "2024-01-11", dir: 1, what: "spot ETF approval", cause: /\betfs?\b/i },
  { s: "oil", date: "2020-03-09", dir: -1, what: "OPEC price war", cause: /saudi|opec|price war|russia/i },
  { s: "oil", date: "2022-02-24", dir: 1, what: "invasion of Ukraine", cause: /russia|ukraine|invasion/i },
  { s: "tnx", date: "2023-03-13", dir: -1, what: "SVB failure", cause: /svb|silicon valley bank|bank/i },
  { s: "meta", date: "2022-02-03", dir: -1, what: "user decline", cause: /users|user growth|daily active|\$2\d\d ?billion|record (drop|plunge|loss|wipeout)/i },
  { s: "tsla", date: "2024-11-06", dir: 1, what: "US election", cause: /trump|election/i },
  { s: "nflx", date: "2022-04-20", dir: -1, what: "subscriber loss", cause: /subscriber/i },
  { s: "covid", date: "2021-12-20", dir: 0, what: "Omicron wave", cause: /omicron/i },
];

type Raw = {
  title?: string;
  url?: string;
  date?: string;
  body?: string;
  eventUri?: string | null;
  sentiment?: number | null;
  shares?: Record<string, number>;
  source?: { title?: string; ranking?: { importanceRank?: number } };
};
type Cache = { concepts: Record<string, string | null>; searches: Record<string, Raw[]> };
const cache: Cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : { concepts: {}, searches: {} };
const save = () => writeFileSync(CACHE, JSON.stringify(cache));

async function post(endpoint: string, body: object, tries = 3): Promise<unknown> {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(`${API}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ ...body, apiKey: KEY }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i + 1 >= tries) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

/** Entity lookups are free. */
async function concept(label: string): Promise<string | null> {
  if (label in cache.concepts) return cache.concepts[label];
  const found = (await post("suggestConceptsFast", { prefix: label, lang: "eng", conceptLang: "eng" })) as { uri: string }[];
  const uri = found.find((c) => c.uri.startsWith("http://en.wikipedia.org/"))?.uri ?? null;
  cache.concepts[label] = uri;
  save();
  return uri;
}

type Built = { query: object; filter?: object; count: number };
const notJunk = { $not: { keyword: { $or: JUNK }, keywordLoc: "title" } };
const title = (words: string[]) => ({ keyword: { $or: words }, keywordLoc: "title" });
const fixed = { sourceUri: { $or: SOURCES } };

const VARIANTS: Record<string, (s: Series, uri: string | null) => Built | null> = {
  // What the site does today.
  "A today": (s) => ({
    query: { $and: [{ ...title(s.words), ...fixed }, ...(s.company ? [title(MARKET_WORDS)] : [])] },
    count: 40,
  }),
  // Wider title words, junk excluded in the query, 100 candidates.
  "B wider words": (s) => ({
    query: { $and: [{ ...title(s.wider), ...fixed }, ...(s.company ? [title(MARKET_WORDS)] : [])], ...notJunk },
    count: 100,
  }),
  // The series as an entity, same outlets.
  "C entity": (s, uri) => (uri ? { query: { $and: [{ conceptUri: uri, ...fixed }], ...notJunk }, count: 100 } : null),
  // Entity, with the top tenth of all sources by rank in place of the fixed list, and only articles tied to an event.
  "D entity, top sources": (s, uri) =>
    uri
      ? {
          query: { $and: [{ conceptUri: uri }], ...notJunk },
          filter: { startSourceRankPercentile: 0, endSourceRankPercentile: 10, hasEvent: "skipArticlesWithoutEvent" },
          count: 100,
        }
      : null,
  // Entity or wider title words, same outlets.
  "E entity or words": (s, uri) =>
    uri
      ? {
          query: {
            $and: [{ $or: [{ conceptUri: uri }, title(s.wider)] }, fixed, ...(s.company ? [{ $or: [{ conceptUri: uri }, title(MARKET_WORDS)] }] : [])],
            ...notJunk,
          },
          count: 100,
        }
      : null,
};

async function search(variant: string, c: (typeof CASES)[number]): Promise<Raw[] | null> {
  const key = `${variant}|${c.s}|${c.date}`;
  if (cache.searches[key]) return cache.searches[key];
  if (!FETCH) return null;
  const s = S[c.s];
  const built = VARIANTS[variant](s, await concept(s.concept));
  if (!built) return null;
  const at = Date.parse(c.date);
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const range = { lang: "eng", dateStart: iso(at - 14 * DAY), dateEnd: iso(at + 5 * DAY) };
  const q = built.query as { $and: object[] };
  const body = (await post("article/getArticles", {
    action: "getArticles",
    query: {
      $query: { ...q, $and: [...q.$and, range] },
      $filter: { dataType: ["news"], isDuplicate: "skipDuplicates", ...built.filter },
    },
    resultType: "articles",
    articlesPage: 1,
    articlesCount: built.count,
    articlesSortBy: "rel",
    articlesSortByAsc: false,
    articleBodyLen: 500,
    includeArticleBody: true,
    includeArticleEventUri: true,
    includeArticleSentiment: true,
    includeArticleSocialScore: true,
    includeSourceRanking: true,
    includeArticleImage: false,
    includeArticleAuthors: false,
  })) as { error?: string; articles?: { results?: Raw[] } };
  if (body.error) throw new Error(`${variant}: ${body.error}`);
  const results = body.articles?.results ?? [];
  cache.searches[key] = results;
  save();
  return results;
}

/** The same clean-up the site applies: drop repeats, foreign headlines, and a third article from one outlet. */
function clean(raw: Raw[]) {
  const seen = new Set<string>();
  const perSource = new Map<string, number>();
  const out: (Raw & { title: string; order: number; source_: string })[] = [];
  raw.forEach((a, order) => {
    if (!a.title || !a.url || !a.date) return;
    const t = a.title.trim();
    const source = a.source?.title?.trim() ?? "";
    const k = t.toLowerCase().replace(/[^a-z0-9]+/g, " ").slice(0, 60);
    if (t.length < 15 || /[¿¡áéíóúñãõçàèìòùâêôäöüß]/i.test(t) || seen.has(k) || (perSource.get(source) ?? 0) >= 2) return;
    seen.add(k);
    perSource.set(source, (perSource.get(source) ?? 0) + 1);
    out.push({ ...a, title: t, order, source_: source });
  });
  return out;
}

type Clean = ReturnType<typeof clean>;
/** 1 when an article's tone agrees with the direction of the move, -1 when it clearly disagrees. */
const toneMatch = (a: Raw, dir: number) => {
  const tone = a.sentiment ?? 0;
  if (!dir || Math.abs(tone) < 0.08) return 0;
  return Math.sign(tone) === dir ? 1 : -1;
};

const RANKERS: Record<string, (list: Clean, all: Raw[], dir: number) => Clean> = {
  // Today: headlines that read like news about a move come first.
  headline: (list) => [...list].sort((a, b) => headlineScore(b.title) - headlineScore(a.title) || a.order - b.order),
  // Articles from the most-covered event first, then by headline.
  event: (list, all) => {
    const size = new Map<string, number>();
    for (const a of all) if (a.eventUri) size.set(a.eventUri, (size.get(a.eventUri) ?? 0) + 1);
    const weight = (a: Raw) => (a.eventUri ? (size.get(a.eventUri) ?? 0) : 0);
    return [...list].sort(
      (a, b) =>
        Math.min(weight(b), 8) + headlineScore(b.title) - (Math.min(weight(a), 8) + headlineScore(a.title)) || a.order - b.order,
    );
  },
  // Headline score, nudged by whether the article's tone fits the move.
  "headline + tone": (list, _all, dir) =>
    [...list].sort(
      (a, b) => headlineScore(b.title) + 2 * toneMatch(b, dir) - (headlineScore(a.title) + 2 * toneMatch(a, dir)) || a.order - b.order,
    ),
  // Headline score, but no more than two articles about the same event near the top.
  "headline, 2 per event": (list) => {
    const ranked = [...list].sort((x, y) => headlineScore(y.title) - headlineScore(x.title) || x.order - y.order);
    const used = new Map<string, number>();
    const first: Clean = [];
    const rest: Clean = [];
    for (const x of ranked) {
      const n = x.eventUri ? (used.get(x.eventUri) ?? 0) : 0;
      if (x.eventUri) used.set(x.eventUri, n + 1);
      (n < 2 ? first : rest).push(x);
    }
    return [...first, ...rest];
  },
  // Headline score, with a small lift for articles that belong to a multi-article event.
  "headline + event": (list, all) => {
    const size = new Map<string, number>();
    for (const a of all) if (a.eventUri) size.set(a.eventUri, (size.get(a.eventUri) ?? 0) + 1);
    const lift = (a: Raw) => Math.min(a.eventUri ? (size.get(a.eventUri) ?? 0) : 0, 3);
    return [...list].sort((a, b) => headlineScore(b.title) + lift(b) - (headlineScore(a.title) + lift(a)) || a.order - b.order);
  },
};

async function main() {
  const rows: Record<string, { shown: number; useful: number; n: number; cases: number; withEvent: number; misses: string[] }> = {};
  for (const variant of Object.keys(VARIANTS)) {
    for (const c of CASES) {
      const raw = await search(variant, c);
      if (!raw) continue;
      const list = clean(raw);
      for (const [ranker, rank] of Object.entries(RANKERS)) {
        const r = (rows[`${variant} / ${ranker}`] ??= { shown: 0, useful: 0, n: 0, cases: 0, withEvent: 0, misses: [] });
        const ranked = rank(list, raw, c.dir);
        // Shown: does one of the four headlines a visitor sees name the cause?
        const hit = ranked.slice(0, 4).some((a) => c.cause.test(a.title));
        // Useful: of the ten articles the model reads, how many mention the cause at all?
        const useful = ranked.slice(0, 10).filter((a) => c.cause.test(`${a.title} ${a.body ?? ""}`)).length;
        r.shown += hit ? 1 : 0;
        r.useful += useful;
        r.n += list.length;
        r.cases += 1;
        r.withEvent += raw.length ? raw.filter((a) => a.eventUri).length / raw.length : 0;
        if (!hit) r.misses.push(`${S[c.s].name} ${c.date} (${c.what})`);
      }
    }
  }
  console.log("variant / ranking".padEnd(40), "cause in top 4", " of top 10 on cause", " articles", " in an event");
  for (const [name, r] of Object.entries(rows)) {
    console.log(
      name.padEnd(40),
      `${r.shown}/${r.cases}`.padStart(10),
      (r.useful / r.cases).toFixed(1).padStart(16),
      Math.round(r.n / r.cases).toString().padStart(12),
      `${Math.round((r.withEvent / r.cases) * 100)}%`.padStart(12),
    );
  }
  console.log();
  for (const [name, r] of Object.entries(rows)) if (r.misses.length) console.log(`${name} missed: ${r.misses.join("; ")}`);
  const usage = (await post("usage", {})) as { availableTokens: number; usedTokens: number };
  console.log(`\ntokens used so far on this account: ${usage.usedTokens} of ${usage.availableTokens}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
