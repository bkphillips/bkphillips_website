/**
 * News search through NewsAPI.ai (Event Registry).
 *
 * One call searches article titles for any of the given keywords inside a date
 * range, in a fixed list of major outlets, and returns the most relevant ones.
 *
 * The choices here (title keywords, a curated outlet list, junk excluded in the
 * query, 100 candidates, a small lift for articles in a multi-article event)
 * were compared on 16 shifts with known causes: analysis/eval_news_search.ts.
 *
 * Cost: a search of the last 30 days uses 1 token; an older search uses 5
 * tokens per calendar year it touches. Callers should cache results.
 *
 * No imports, so the site's server code and the data build scripts can share it.
 */

const ENDPOINT = "https://eventregistry.org/api/v1/article/getArticles";

export type NewsArticle = {
  title: string;
  url: string;
  /** Publisher name, e.g. "Reuters". */
  source: string;
  /** Publication date, YYYY-MM-DD. */
  date: string;
  /** Opening of the article. Used only to ground summaries; never shown or stored publicly. */
  snippet?: string;
  /** How many other articles the search found about the same event. */
  related?: number;
  /** How many articles the search found for these dates, after removing repeats. */
  pool?: number;
};

/** Headlines that are never news about a move; left out by the search itself. */
const JUNK = [
  "stocks to buy",
  "to buy now",
  "price prediction",
  "should you buy",
  "live updates",
  "how to",
  "best stocks",
  "dividend stocks",
  "stock forecast",
];

const MOVE_WORDS =
  /\b(surg\w*|plung\w*|record|falls?|fell|rall(y|ies|ied)|sell-?off|jumps?|jumped|slumps?|drops?|dropped|sinks?|sank|soars?|soared|tumbl\w*|slid\w*|highs?|lows?|rout|correction|crash\w*|rebound\w*|climbs?|spikes?|hits?|tops?|beats?|miss\w*|cuts?|rais\w*|gains?|loss(es)?)\b/gi;
const CAUSE_WORDS = /\b(as|after|amid|on|following|despite)\b/i;
const FILLER =
  /\b(best|top \d+|\d+ (best|top)|stock forecasts?|should you|how to|here's|here are|predict\w*|bull and bear|earnings call|preview|to buy|dividend stocks?|what investors need|new to|vs\.?)\b|\?\s*$|\blive\b/i;

/**
 * How well a headline reads as news about a move: words like "surges" or
 * "record" count for it, a stated cause ("after", "amid") a little more, and
 * listicles, forecasts and how-to pieces count heavily against it.
 */
export function headlineScore(title: string): number {
  const moves = Math.min(title.match(MOVE_WORDS)?.length ?? 0, 3);
  return (
    moves * 2 + (CAUSE_WORDS.test(title) ? 1 : 0) - (FILLER.test(title) ? 6 : 0)
  );
}

export class NewsError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Outlets searched. Keeping to these filters out press releases and local listings. */
const SOURCES = [
  "reuters.com",
  "apnews.com",
  "bloomberg.com",
  "cnbc.com",
  "wsj.com",
  "ft.com",
  "nytimes.com",
  "washingtonpost.com",
  "bbc.com",
  "bbc.co.uk",
  "theguardian.com",
  "marketwatch.com",
  "finance.yahoo.com",
  "barrons.com",
  "fortune.com",
  "forbes.com",
  "businessinsider.com",
  "economist.com",
  "axios.com",
  "cnn.com",
  "npr.org",
  "usatoday.com",
  "latimes.com",
  "time.com",
  "theverge.com",
  "techcrunch.com",
  "coindesk.com",
];

export type NewsQuery = {
  /** Phrases to look for in article titles; any one may match. */
  keywords: string[];
  /** If given, the title must also contain one of these (e.g. "shares", "earnings"). */
  context?: string[];
  /** Inclusive date range, YYYY-MM-DD. */
  from: string;
  to: string;
  /** How many articles to return (default 4). */
  count?: number;
  /** Characters of each article's body to return as a snippet (default 0). */
  snippetLength?: number;
};

export async function searchNews(
  apiKey: string,
  query: NewsQuery,
): Promise<NewsArticle[]> {
  const count = query.count ?? 4;
  const snippetLength = query.snippetLength ?? 0;
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        action: "getArticles",
        query: {
          $query: {
            $and: [
              {
                keyword: { $or: query.keywords },
                keywordLoc: "title",
                sourceUri: { $or: SOURCES },
                lang: "eng",
                dateStart: query.from,
                dateEnd: query.to,
              },
              ...(query.context?.length
                ? [{ keyword: { $or: query.context }, keywordLoc: "title" }]
                : []),
            ],
            $not: { keyword: { $or: JUNK }, keywordLoc: "title" },
          },
          $filter: { dataType: ["news"], isDuplicate: "skipDuplicates" },
        },
        resultType: "articles",
        articlesPage: 1,
        // A call costs the same however many articles it returns, so take the
        // most allowed and pick the best headlines here.
        articlesCount: 100,
        articlesSortBy: "rel",
        articlesSortByAsc: false,
        articleBodyLen: snippetLength,
        includeArticleBody: snippetLength > 0,
        includeArticleImage: false,
        includeArticleAuthors: false,
        includeArticleSentiment: false,
        // The service groups articles about the same event; used below to
        // favour stories that several outlets covered.
        includeArticleEventUri: true,
        apiKey,
      }),
    });
  } catch {
    throw new NewsError("The news service did not respond.", 502);
  }
  if (res.status === 401 || res.status === 403) {
    throw new NewsError("The news service rejected the API key.", res.status);
  }
  if (!res.ok)
    throw new NewsError(`The news service returned ${res.status}.`, 502);

  const body = (await res.json()) as {
    error?: string;
    articles?: {
      results?: {
        title?: string;
        url?: string;
        date?: string;
        body?: string;
        eventUri?: string | null;
        source?: { title?: string };
      }[];
    };
  };
  if (body.error)
    throw new NewsError(`The news service reported: ${body.error}`, 502);

  const results = body.articles?.results ?? [];
  // How many of the articles found belong to each event.
  const eventSize = new Map<string, number>();
  for (const a of results) {
    if (a.eventUri)
      eventSize.set(a.eventUri, (eventSize.get(a.eventUri) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const perSource = new Map<string, number>();
  const out: NewsArticle[] = [];
  for (const a of results) {
    if (!a.title || !a.url || !a.date) continue;
    const title = a.title.trim();
    const source =
      a.source?.title?.trim() || new URL(a.url).hostname.replace(/^www\./, "");
    // Syndicated copies share a headline; keep the first, and at most two per publisher.
    const key = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .slice(0, 60);
    // The language filter lets a few non-English headlines through; accents give them away.
    const foreign = /[¿¡áéíóúñãõçàèìòùâêôäöüß]/i.test(title);
    if (
      title.length < 15 ||
      foreign ||
      seen.has(key) ||
      (perSource.get(source) ?? 0) >= 2
    )
      continue;
    seen.add(key);
    perSource.set(source, (perSource.get(source) ?? 0) + 1);
    out.push({
      title,
      url: a.url,
      source,
      date: a.date,
      ...(snippetLength > 0 && a.body
        ? { snippet: a.body.slice(0, snippetLength) }
        : {}),
      ...(a.eventUri && eventSize.get(a.eventUri)! > 1
        ? { related: eventSize.get(a.eventUri)! - 1 }
        : {}),
    });
  }
  // Best headlines first, with a small lift (at most 3 points) for articles
  // about an event that other articles also covered. The search's own
  // relevance order breaks ties.
  return out
    .map((article, order) => ({
      article: { ...article, pool: out.length },
      order,
      score: headlineScore(article.title) + Math.min(article.related ?? 0, 3),
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, count)
    .map((x) => x.article);
}
