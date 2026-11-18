/**
 * What to search the news for, given a series. Article titles are matched
 * against these phrases, so they need to be specific: "gold prices", not "gold".
 *
 * No imports, so the data build scripts can use it too.
 */

export type NewsTerms = {
  /** The title must contain one of these. */
  keywords: string[];
  /** If set, the title must also contain one of these. */
  context?: string[];
};

/**
 * Markets and prices. The cause of a market move is often reported without
 * naming the index ("Wall Street tumbles on tariff fears"), so each one also
 * carries the general words headlines use for it.
 */
const MARKETS: Record<string, string[]> = {
  "^GSPC": ["S&P 500", "Wall Street", "stocks", "stock market", "Dow"],
  "^IXIC": ["Nasdaq", "tech stocks", "Wall Street", "stocks"],
  "^DJI": ["Dow Jones", "Dow", "Wall Street", "stocks", "stock market"],
  "^RUT": ["Russell 2000", "small caps", "small-cap"],
  "^FTSE": ["FTSE 100", "FTSE"],
  "^N225": ["Nikkei"],
  "^VIX": ["VIX", "volatility"],
  "^TNX": [
    "Treasury yields",
    "bond yields",
    "10-year Treasury",
    "yields",
    "Treasuries",
    "bonds",
  ],
  "CL=F": [
    "oil prices",
    "oil price",
    "crude oil",
    "Brent",
    "oil",
    "crude",
    "OPEC",
  ],
  "NG=F": ["natural gas"],
  "GC=F": ["gold prices", "gold price", "bullion"],
  "SI=F": ["silver prices", "silver price"],
  "HG=F": ["copper prices", "copper price", "copper"],
  "BTC-USD": ["Bitcoin", "crypto", "cryptocurrency"],
  "ETH-USD": ["Ethereum", "Ether", "crypto", "cryptocurrency"],
  "EURUSD=X": ["euro", "ECB"],
  "JPY=X": ["yen", "Bank of Japan"],
};

/** Companies whose official names make poor search terms. */
const COMPANIES: Record<string, string[]> = {
  AAPL: ["Apple"],
  MSFT: ["Microsoft"],
  NVDA: ["Nvidia"],
  AMZN: ["Amazon"],
  GOOGL: ["Google", "Alphabet"],
  GOOG: ["Google", "Alphabet"],
  META: ["Meta", "Facebook"],
  TSLA: ["Tesla"],
  NFLX: ["Netflix"],
  UBER: ["Uber"],
  JPM: ["JPMorgan"],
  XOM: ["Exxon"],
  WMT: ["Walmart"],
  DIS: ["Disney"],
  BA: ["Boeing"],
  PFE: ["Pfizer"],
};

/** A company headline counts only if it is about the stock or the business results. */
const MARKET_WORDS = [
  "stock",
  "stocks",
  "shares",
  "earnings",
  "revenue",
  "results",
  "profit",
  "sales",
  "forecast",
  "outlook",
  "guidance",
  "investors",
  "valuation",
  "market value",
  "rally",
  "rallies",
  "record",
  "selloff",
  "sell-off",
  "plunge",
  "plunges",
  "surge",
  "surges",
  "slump",
  "slumps",
  "tumble",
  "tumbles",
  "jumps",
  "soars",
  "falls",
  "sinks",
  "drops",
  "slides",
];

const COMPANY_SUFFIX =
  /[,\s]+(inc\.?|incorporated|corporation|corp\.?|company|co\.?|ltd\.?|limited|plc|n\.v\.|s\.a\.|ag|se|holdings?|group|platforms|\(the\)|class [a-c].*|common stock.*)$/i;

/** "NVIDIA Corporation" -> "NVIDIA"; "The Walt Disney Company" -> "Walt Disney". */
function companyName(label: string): string {
  let name = label.trim().replace(/^the\s+/i, "");
  for (let i = 0; i < 4 && COMPANY_SUFFIX.test(name); i++)
    name = name.replace(COMPANY_SUFFIX, "");
  return name.trim();
}

export function newsTerms(series: {
  source: string;
  id: string;
  label: string;
}): NewsTerms {
  if (series.source === "owid")
    return { keywords: ["COVID-19", "coronavirus", "Covid"] };
  if (series.source === "wikipedia") {
    return {
      keywords: [series.id.replaceAll("_", " ").replace(/\s*\(.*\)$/, "")],
    };
  }
  const symbol = series.id.toUpperCase();
  if (MARKETS[symbol]) return { keywords: MARKETS[symbol] };
  return {
    keywords: COMPANIES[symbol] ?? [companyName(series.label)],
    context: MARKET_WORDS,
  };
}
