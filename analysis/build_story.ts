// Builds the data behind the About page's scroll story: one set of dots that
// forms a globe, an epidemic curve, a map of where Americans live and an org structure.
//
//   globe   land points, each tied to its country's under-5 mortality for every
//           year since 1990 (UN IGME via Our World in Data, open licence)
//   covid   weekly confirmed COVID-19 cases, United States (WHO via OWID)
//   usa     dots placed where people live in the United States, sampled from
//           the 2020 Census population centre of every census tract
//   org     every current employee of the synthetic company, in a radial layout
//
//   npx tsx analysis/build_story.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { geoAlbersUsa, geoBounds, geoContains } from "d3-geo";
import iso from "i18n-iso-countries";
import { feature } from "topojson-client";
import { OrgModel, type RawOrg } from "../src/lib/org/model";

const UA = "inflection-demo/0.1";
const CANDIDATES = 30000; // points tried on the sphere; about 29% land on land
const START_YEAR = 1990;
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

async function csv(url: string): Promise<string[][]> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return (await res.text())
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split(","));
}

async function globe() {
  // Under-5 mortality, deaths per 100 live births, by country and year.
  // Read columns from the right: entity names can contain commas.
  const rows = await csv(
    "https://ourworldindata.org/grapher/child-mortality-igme.csv?csvType=full&useColumnShortNames=true",
  );
  const byCode = new Map<string, Map<number, number>>();
  let latest = 0;
  for (const r of rows) {
    const value = Number(r[r.length - 1]);
    const year = Number(r[r.length - 2]);
    const code = r[r.length - 3];
    if (!code || !Number.isFinite(value) || year < START_YEAR) continue;
    if (!byCode.has(code)) byCode.set(code, new Map());
    byCode.get(code)!.set(year, value);
    latest = Math.max(latest, year);
  }

  // Log scale from 0.3 to 30 deaths per 100 births, mapped to 0-100.
  const scale = (v: number | undefined) =>
    v === undefined
      ? -1
      : Math.round(
          Math.min(1, Math.max(0, (Math.log(v) - Math.log(0.3)) / (Math.log(30) - Math.log(0.3)))) * 100,
        );

  const topo = JSON.parse(read("../node_modules/world-atlas/countries-110m.json"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const countries = (feature(topo, topo.objects.countries) as any).features.map((f: any) => {
    const [[west, south], [east, north]] = geoBounds(f);
    const code = iso.numericToAlpha3(String(f.id).padStart(3, "0"));
    const series = code ? byCode.get(code) : undefined;
    return { f, west, south, east, north, series, index: -1 };
  });
  // One row per country that has data: its value for every year, scaled 0-100.
  const table: number[][] = [];
  const span = latest - START_YEAR + 1;
  for (const c of countries) {
    if (!c.series?.has(START_YEAR) || !c.series.has(latest)) continue;
    c.index = table.length;
    table.push(Array.from({ length: span }, (_, y) => scale(c.series!.get(START_YEAR + y))));
  }

  // Evenly spread points on the sphere (Fibonacci lattice); keep those on land.
  const dots: number[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < CANDIDATES; i++) {
    const lat = (Math.asin(1 - (2 * (i + 0.5)) / CANDIDATES) * 180) / Math.PI;
    const lon = ((((i * golden * 180) / Math.PI) % 360) + 360) % 360 - 180;
    for (const c of countries) {
      if (lat < c.south || lat > c.north) continue;
      // Bounds that cross the antimeridian come back with west > east.
      const inLon = c.west <= c.east ? lon >= c.west && lon <= c.east : lon >= c.west || lon <= c.east;
      if (inLon && geoContains(c.f, [lon, lat])) {
        dots.push(Math.round(lat * 10), Math.round(lon * 10), c.index);
        break;
      }
    }
  }

  const world = byCode.get("OWID_WRL")!;
  return {
    years: [START_YEAR, latest],
    // world average for each year, deaths per 100 live births
    world: Array.from({ length: span }, (_, y) => Number((world.get(START_YEAR + y) ?? NaN).toFixed(2))),
    // per country: value for each year on a 0-100 log scale (-1 = missing that year)
    countries: table,
    // flat: lat*10, lon*10, row in `countries` (-1 = no data)
    dots,
  };
}

async function covid() {
  const rows = await csv("https://ourworldindata.org/grapher/weekly-covid-cases.csv?csvType=full");
  const usa = rows
    .filter((r) => r[1] === "USA" && r[3] !== "")
    .map((r) => ({ day: r[2], cases: Number(r[3]) }))
    .sort((a, b) => a.day.localeCompare(b.day));
  let end = usa.length;
  while (end > 0 && usa[end - 1].cases === 0) end--;
  // The source is a rolling weekly total reported daily; keep one point per week.
  const weekly = usa.slice(0, end).filter((_, i) => i % 7 === 0);
  const peak = Math.max(...weekly.map((w) => w.cases));

  // Surges and where an early warning would fall. A wave is a peak that stands
  // clearly above the weeks around it; its surge is counted from the week cases
  // pass half the wave's height; the warning sits five weeks before that (or at
  // the wave's start, if it rose faster than five weeks).
  const LEAD_WEEKS = 5;
  const smooth = weekly.map((_, i) => {
    const near = weekly.slice(Math.max(0, i - 1), i + 2);
    return near.reduce((sum, w) => sum + w.cases, 0) / near.length / peak;
  });
  const prominence = (i: number) => {
    let left = smooth[i];
    for (let j = i - 1; j >= 0 && smooth[j] <= smooth[i]; j--) left = Math.min(left, smooth[j]);
    let right = smooth[i];
    for (let j = i + 1; j < smooth.length && smooth[j] <= smooth[i]; j++) right = Math.min(right, smooth[j]);
    return smooth[i] - Math.max(left, right);
  };
  const peaks = smooth
    .map((v, i) => i)
    .filter(
      (i) =>
        i > 0 &&
        i < smooth.length - 1 &&
        smooth[i] >= smooth[i - 1] &&
        smooth[i] > smooth[i + 1] &&
        smooth[i] >= 0.05 &&
        prominence(i) >= 0.02,
    );
  const warnings: { warning: number; surge: number; peak: number }[] = [];
  let from = 0;
  for (const p of peaks) {
    let trough = from;
    for (let j = from; j < p; j++) if (smooth[j] < smooth[trough]) trough = j;
    const halfway = smooth[trough] + (smooth[p] - smooth[trough]) / 2;
    let surge = trough;
    while (surge < p && smooth[surge] < halfway) surge++;
    warnings.push({ warning: Math.max(surge - LEAD_WEEKS, trough), surge, peak: p });
    from = p;
  }
  return {
    // week indexes: when a warning would fire, when the surge it precedes begins, and its peak
    warnings,
    from: weekly[0].day,
    to: weekly[weekly.length - 1].day,
    peak,
    peakWeek: weekly.findIndex((w) => w.cases === peak),
    // weekly cases as thousandths of the peak
    values: weekly.map((w) => Math.round((w.cases / peak) * 1000)),
  };
}

function org() {
  const model = new OrgModel(JSON.parse(read("../src/data/org.json")) as RawOrg);
  // Radial tree: leaves take consecutive slots around the circle, with a gap
  // between functions; a manager sits at the middle of their own leaves.
  const angle = new Map<number, number>();
  let slot = 0;
  const place = (id: number, depth: number): [number, number] => {
    const kids = [...model.reports[id]].sort((a, b) => model.orgSize(b) - model.orgSize(a));
    if (!kids.length) {
      angle.set(id, slot);
      return [slot, slot++];
    }
    let first = Infinity;
    let last = -Infinity;
    for (const kid of kids) {
      const [a, b] = place(kid, depth + 1);
      first = Math.min(first, a);
      last = Math.max(last, b);
      if (depth === 0) slot += 45;
    }
    angle.set(id, (first + last) / 2);
    return [first, last];
  };
  place(model.ceo, 0);

  const people: number[] = [];
  for (const [id, a] of angle) {
    const depth = model.path(id).length - 1;
    const kind = depth <= 1 ? 2 : model.reports[id].length ? 1 : 0;
    people.push(Math.round((a / slot) * 6283), depth, kind);
  }
  return {
    company: model.company,
    count: angle.size,
    // flat: angle in milliradians, layers below the CEO, kind (0 employee, 1 manager, 2 executive)
    people,
  };
}

/**
 * A dot map of where people live in the United States: the "city lights" view.
 * Dots are spread across census tracts in proportion to population, so each
 * dot stands for the same number of people. A faint outline of the country
 * keeps the empty parts of the map readable.
 */
async function usa(populationDots: number, outlineDots: number) {
  const tracts = (
    await csv("https://www2.census.gov/geo/docs/reference/cenpop2020/tract/CenPop2020_Mean_TR.txt")
  )
    .map((r) => ({ pop: Number(r[3]), lat: Number(r[4]), lon: Number(r[5]) }))
    .filter((t) => t.pop > 0 && Number.isFinite(t.lat) && Number.isFinite(t.lon));

  // Albers USA: the lower 48 with Alaska and Hawaii as insets. Places it cannot
  // show (Puerto Rico) come back null and are left out.
  const project = geoAlbersUsa().scale(1000).translate([0, 0]);
  const placed = tracts
    .map((t) => ({ pop: t.pop, at: project([t.lon, t.lat]) }))
    .filter((t): t is { pop: number; at: [number, number] } => t.at !== null);
  const total = placed.reduce((sum, t) => sum + t.pop, 0);

  // Systematic sampling: walk the cumulative population in equal steps, so a
  // tract gets dots in proportion to its people and the result is repeatable.
  const step = total / populationDots;
  const points: [number, number][] = [];
  let running = 0;
  let next = step / 2;
  let k = 0;
  for (const t of placed) {
    running += t.pop;
    while (next <= running) {
      // Nudge repeats inside one tract so they do not stack exactly.
      const nudge = (n: number) => (((Math.sin((k + 1) * n) * 43758.5453) % 1) - 0.5) * 2.4;
      points.push([t.at[0] + nudge(12.9898), t.at[1] + nudge(78.233)]);
      next += step;
      k++;
    }
  }

  // Outline: evenly spaced points along the national border and coast.
  const topo = JSON.parse(read("../node_modules/us-atlas/nation-10m.json"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nation = (feature(topo, topo.objects.nation) as any).features[0].geometry;
  const rings: [number, number][][] = (
    nation.type === "MultiPolygon" ? nation.coordinates.flat() : nation.coordinates
  ).map((ring: [number, number][]) =>
    ring.map((c) => project(c)).filter((c): c is [number, number] => c !== null),
  );
  const length = (ring: [number, number][]) =>
    ring.slice(1).reduce((sum, c, i) => sum + Math.hypot(c[0] - ring[i][0], c[1] - ring[i][1]), 0);
  const spacing = rings.reduce((sum, r) => sum + length(r), 0) / outlineDots;
  const outline: [number, number][] = [];
  for (const ring of rings) {
    let carried = spacing / 2;
    for (let i = 1; i < ring.length; i++) {
      const [x0, y0] = ring[i - 1];
      const [x1, y1] = ring[i];
      const segment = Math.hypot(x1 - x0, y1 - y0);
      while (carried <= segment && outline.length < outlineDots) {
        const f = segment ? carried / segment : 0;
        outline.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]);
        carried += spacing;
      }
      carried -= segment;
    }
  }

  // Centre the map and scale it to six units wide, y pointing up; store as thousandths.
  const all = [...points, ...outline];
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scaleTo = 6 / (x1 - x0);
  const pack = (list: [number, number][]) =>
    list.flatMap(([x, y]) => [
      Math.round((x - (x0 + x1) / 2) * scaleTo * 1000),
      Math.round(((y0 + y1) / 2 - y) * scaleTo * 1000),
    ]);
  return {
    population: total,
    peoplePerDot: Math.round(total / points.length),
    // flat x, y pairs in thousandths of a world unit
    points: pack(points),
    outline: pack(outline),
  };
}

async function main() {
  const out = {
    generated: new Date().toISOString().slice(0, 10),
    globe: await globe(),
    covid: await covid(),
    usa: await usa(7800, 1200),
    org: org(),
  };
  mkdirSync(new URL("../public/data/", import.meta.url), { recursive: true });
  const text = JSON.stringify(out);
  writeFileSync(new URL("../public/data/story.json", import.meta.url), text);
  console.log(
    `wrote public/data/story.json (${(text.length / 1024).toFixed(0)} KB): ` +
      `${out.globe.dots.length / 3} land dots, ${out.globe.countries.length} countries, ${out.covid.values.length} weeks, ${out.org.count} people`,
  );
  console.log("world under-5 mortality per 100 births:", out.globe.years, out.globe.world[0], "to", out.globe.world.at(-1));
  console.log(
    `usa: ${out.usa.points.length / 2} population dots (${out.usa.peoplePerDot.toLocaleString()} people each), ` +
      `${out.usa.outline.length / 2} outline dots, ${out.usa.population.toLocaleString()} people`,
  );
  console.log("covid:", out.covid.from, "to", out.covid.to, "peak week", out.covid.peakWeek, out.covid.peak);
  const weekDate = (w: number) =>
    new Date(Date.parse(out.covid.from) + w * 7 * 86_400_000).toISOString().slice(0, 10);
  for (const w of out.covid.warnings) {
    console.log(
      `  warning ${weekDate(w.warning)} -> surge ${weekDate(w.surge)} -> peak ${weekDate(w.peak)} ` +
        `(${((out.covid.values[w.peak] / 1000) * out.covid.peak / 1e6).toFixed(2)}M cases/week)`,
    );
  }
}

main();
