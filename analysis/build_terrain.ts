// Builds the data behind the landing page's "regime terrain" sculpture.
//
// Fetches five years of weekly prices for about thirty market series, puts
// them on a common scale, finds each one's three strongest trend changes with
// the site's own segmentation code, and writes public/data/terrain.json.
//
//   npx tsx analysis/build_terrain.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { segment } from "../src/lib/segmentation";

const SERIES: [id: string, label: string][] = [
  ["^GSPC", "S&P 500"], ["^IXIC", "Nasdaq Composite"], ["^DJI", "Dow Jones"], ["^RUT", "Russell 2000"],
  ["^FTSE", "FTSE 100"], ["^N225", "Nikkei 225"], ["^VIX", "VIX volatility index"], ["^TNX", "10-year Treasury yield"],
  ["CL=F", "Crude oil"], ["NG=F", "Natural gas"], ["GC=F", "Gold"], ["SI=F", "Silver"], ["HG=F", "Copper"],
  ["BTC-USD", "Bitcoin"], ["ETH-USD", "Ethereum"], ["EURUSD=X", "Euro"], ["JPY=X", "Dollar-yen"],
  ["AAPL", "Apple"], ["MSFT", "Microsoft"], ["NVDA", "Nvidia"], ["AMZN", "Amazon"], ["GOOGL", "Alphabet"],
  ["META", "Meta"], ["TSLA", "Tesla"], ["NFLX", "Netflix"], ["UBER", "Uber"], ["JPM", "JPMorgan Chase"],
  ["XOM", "Exxon Mobil"], ["WMT", "Walmart"], ["DIS", "Disney"], ["BA", "Boeing"], ["PFE", "Pfizer"],
];
const POINTS = 160;
const SHIFTS = 3;

type Loaded = { id: string; label: string; t: number[]; z: number[] };

async function load(id: string, label: string): Promise<Loaded | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(id)}?range=5y&interval=1wk`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  const result = (await res.json())?.chart?.result?.[0];
  const stamps: number[] = result?.timestamp ?? [];
  const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
  const t: number[] = [];
  const v: number[] = [];
  stamps.forEach((s, i) => {
    const c = closes[i];
    if (typeof c === "number" && Number.isFinite(c) && c > 0) {
      t.push(s * 1000);
      v.push(Math.log(c));
    }
  });
  if (v.length < 200) return null;

  // Resample to a fixed number of points, then standardise.
  const at = (arr: number[], f: number) => {
    const i = Math.min(arr.length - 2, Math.floor(f));
    return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
  };
  const rt: number[] = [];
  const rv: number[] = [];
  for (let k = 0; k < POINTS; k++) {
    const f = (k / (POINTS - 1)) * (v.length - 1);
    rt.push(at(t, f));
    rv.push(at(v, f));
  }
  const mean = rv.reduce((a, b) => a + b, 0) / POINTS;
  const sd = Math.sqrt(rv.reduce((a, b) => a + (b - mean) ** 2, 0) / POINTS) || 1;
  return { id, label, t: rt, z: rv.map((x) => (x - mean) / sd) };
}

async function main() {
  const loaded: Loaded[] = [];
  for (const [id, label] of SERIES) {
    const s = await load(id, label).catch(() => null);
    console.log(s ? `ok   ${label}` : `skip ${label}`);
    if (s) loaded.push(s);
  }

  // Order the series so neighbours look alike: start from the first, then keep
  // appending whichever remaining series is closest to the last one placed.
  const distance = (a: Loaded, b: Loaded) => a.z.reduce((sum, v, i) => sum + (v - b.z[i]) ** 2, 0);
  const ordered = [loaded.shift()!];
  while (loaded.length) {
    const last = ordered[ordered.length - 1];
    let best = 0;
    for (let i = 1; i < loaded.length; i++) {
      if (distance(loaded[i], last) < distance(loaded[best], last)) best = i;
    }
    ordered.push(loaded.splice(best, 1)[0]);
  }

  const out = {
    generated: new Date().toISOString().slice(0, 10),
    dates: ordered[0].t.map((ms) => new Date(ms).toISOString().slice(0, 10)),
    series: ordered.map((s) => ({
      id: s.id,
      label: s.label,
      // z-scores of log price, times 100
      v: s.z.map((x) => Math.round(x * 100)),
      cps: segment(s.z, "trend", SHIFTS, 10).changePoints.at(-1) ?? [],
    })),
  };

  mkdirSync(new URL("../public/data/", import.meta.url), { recursive: true });
  const file = new URL("../public/data/terrain.json", import.meta.url);
  writeFileSync(file, JSON.stringify(out));
  console.log(`wrote public/data/terrain.json: ${out.series.length} series, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
}

main();
