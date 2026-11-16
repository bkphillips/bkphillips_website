import "server-only";
import { cacheLife } from "next/cache";
import type { Point, SeriesData, SourceId } from "./types";

/** Generic client name; no contact details are sent to data providers. */
const USER_AGENT = "inflection-demo/0.1";
const YEARS = 10;

export class SeriesError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 502,
  ) {
    super(message);
  }
}

const idRules: Record<SourceId, RegExp> = {
  yahoo: /^[A-Za-z0-9^.=-]{1,15}$/,
  wikipedia: /^[^/?#%\\|<>[\]{}\u0000-\u001f]{1,120}$/,
  owid: /^covid-weekly-cases-usa$/,
};

export function isSourceId(value: string): value is SourceId {
  return value === "yahoo" || value === "wikipedia" || value === "owid";
}

export function validId(source: SourceId, id: string) {
  return idRules[source].test(id);
}

async function get(url: string, userAgent = USER_AGENT) {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "application/json,text/csv,*/*" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new SeriesError("The data provider did not respond.", 502);
  }
  if (res.status === 404) throw new SeriesError("No data found for that name.", 404);
  if (!res.ok) throw new SeriesError("The data provider returned an error.", 502);
  return res;
}

async function yahoo(symbol: string): Promise<SeriesData> {
  const res = await get(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${YEARS}y&interval=1d`,
    // Yahoo rejects non-browser clients.
    "Mozilla/5.0",
  );
  const body = await res.json();
  const result = body?.chart?.result?.[0];
  const stamps: number[] | undefined = result?.timestamp;
  const closes: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.close;
  if (!stamps || !closes) throw new SeriesError("No data found for that ticker.", 404);

  const points: Point[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const v = closes[i];
    if (typeof v === "number" && Number.isFinite(v)) points.push([stamps[i] * 1000, v]);
  }
  const meta = result.meta ?? {};
  return {
    source: "yahoo",
    id: String(meta.symbol ?? symbol).toUpperCase(),
    label: String(meta.longName ?? meta.shortName ?? symbol),
    unit: String(meta.currency ?? ""),
    sourceName: "Yahoo Finance",
    sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
    points,
  };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");

async function wikipedia(title: string): Promise<SeriesData> {
  const article = title.trim().replaceAll(" ", "_");
  const end = new Date();
  const start = new Date(end);
  start.setUTCFullYear(end.getUTCFullYear() - YEARS);
  const res = await get(
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(article)}/daily/${ymd(start)}/${ymd(end)}`,
  );
  const body = await res.json();
  const items: { timestamp: string; views: number }[] = body?.items ?? [];
  const points: Point[] = items.map((it) => [
    Date.UTC(
      Number(it.timestamp.slice(0, 4)),
      Number(it.timestamp.slice(4, 6)) - 1,
      Number(it.timestamp.slice(6, 8)),
    ),
    it.views,
  ]);
  return {
    source: "wikipedia",
    id: article,
    label: `${article.replaceAll("_", " ")} (Wikipedia pageviews)`,
    unit: "daily pageviews",
    sourceName: "Wikimedia Pageviews API",
    sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(article)}`,
    points,
  };
}

async function owidCovidUsa(): Promise<SeriesData> {
  const res = await get(
    "https://ourworldindata.org/grapher/weekly-covid-cases.csv?csvType=full",
  );
  const text = await res.text();
  const points: Point[] = [];
  for (const line of text.split("\n")) {
    // Entity,Code,Day,Weekly cases[,...]
    const cols = line.split(",");
    if (cols[1] !== "USA") continue;
    const t = Date.parse(`${cols[2]}T00:00:00Z`);
    const v = Number(cols[3]);
    if (Number.isFinite(t) && cols[3] !== "" && Number.isFinite(v)) points.push([t, v]);
  }
  points.sort((a, b) => a[0] - b[0]);
  // Reporting stopped in 2023; drop the long tail of zeros that follows.
  let last = points.length;
  while (last > 0 && points[last - 1][1] === 0) last--;
  return {
    source: "owid",
    id: "covid-weekly-cases-usa",
    label: "COVID-19 weekly confirmed cases, United States",
    unit: "cases per week",
    sourceName: "Our World in Data (WHO)",
    sourceUrl: "https://ourworldindata.org/grapher/weekly-covid-cases?country=~USA",
    points: points.slice(0, last),
  };
}

/**
 * Fetches a series from its provider. Results are cached for an hour.
 * Returns null when the provider has no such series (errors thrown inside a
 * cached function lose their type, so "not found" is a value, not an exception).
 */
export async function loadSeries(source: SourceId, id: string): Promise<SeriesData | null> {
  "use cache";
  cacheLife("hours");

  try {
    const data =
      source === "yahoo"
        ? await yahoo(id)
        : source === "wikipedia"
          ? await wikipedia(id)
          : await owidCovidUsa();
    return data.points.length >= 30 ? data : null;
  } catch (err) {
    if (err instanceof SeriesError && err.status === 404) return null;
    throw err;
  }
}
