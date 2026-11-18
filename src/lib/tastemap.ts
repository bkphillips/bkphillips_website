/** Shapes of public/data/tastemap.json (written by analysis/build_tastemap.py)
 *  and the maths the page runs in the browser to place a visitor. */

export type Film = [
  title: string,
  year: number | null,
  x: number,
  y: number,
  /** How far the film's ratings sit above or below the overall average. */
  bias: number,
  ratings: number,
  average: number,
  /** TMDB poster path, or null when TMDB has none. */
  poster: string | null,
  genreMask: number,
  cluster: number,
];

type Method = { name: string; rmse: number };
/** How one way of ranking did: share of picks liked, and how varied they were. */
type Picks = { liked: number; distinctFilms: number; top20Share: number };

export type TasteData = {
  meta: {
    ratings: number;
    people: number;
    modelFilms: number;
    trainRatings: number;
    rank: number;
    mu: number;
    factorScale: number;
    foldLam: number;
    foldLamPerRating: number;
    foldLamBias: number;
    view: [number, number];
    minRatings: number;
  };
  genres: string[];
  films: Film[];
  /** rank numbers per film, as base64 8-bit integers. */
  factors: string;
  clusters: { label: string; x: number; y: number; n: number; year: number }[];
  starters: number[];
  presets: { label: string; ratings: [film: number, stars: number][] }[];
  tests: {
    recent: { ratings: number; methods: Method[] };
    visitors: {
      people: number;
      given: number[];
      filmOnly: number;
      generosity: number[];
      model: number[];
      picks: {
        given: number;
        count: number;
        /** Personal picks must be predicted at this many stars or more. */
        personalFloor: number;
        likedAcclaimed: number;
        likedAny: number;
        safe: Picks;
        personal: Picks;
      };
    };
  };
};

export const posterUrl = (
  path: string,
  size: "w92" | "w154" | "w185" = "w154",
) => `https://image.tmdb.org/t/p/${size}${path}`;

export const genresOf = (mask: number, names: string[]) =>
  names.filter((_, i) => mask & (1 << i));

/** Unpacks the film factors into one flat array, rank numbers per film. */
export function decodeFactors(base64: string, scale: number) {
  const bytes = atob(base64);
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes.charCodeAt(i);
    out[i] = (b > 127 ? b - 256 : b) * scale;
  }
  return out;
}

/** Solves a small symmetric system by Gaussian elimination with pivoting. */
function solve(a: Float64Array, b: Float64Array, n: number) {
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r * n + col]) > Math.abs(a[pivot * n + col])) pivot = r;
    }
    if (pivot !== col) {
      for (let c = 0; c < n; c++) {
        [a[col * n + c], a[pivot * n + c]] = [a[pivot * n + c], a[col * n + c]];
      }
      [b[col], b[pivot]] = [b[pivot], b[col]];
    }
    const d = a[col * n + col];
    for (let r = col + 1; r < n; r++) {
      const f = a[r * n + col] / d;
      if (!f) continue;
      for (let c = col; c < n; c++) a[r * n + c] -= f * a[col * n + c];
      b[r] -= f * b[col];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let sum = b[r];
    for (let c = r + 1; c < n; c++) sum -= a[r * n + c] * x[c];
    x[r] = sum / a[r * n + r];
  }
  return x;
}

export type Taste = {
  /** The visitor's own factors. */
  vector: Float64Array;
  /** How much higher or lower than most people they rate films in general. */
  generosity: number;
};

/**
 * Finds a visitor's factors from the films they rated: a ridge regression of
 * their ratings (after removing each film's own average) on those films'
 * factors, plus one constant for how generous a rater they are. This mirrors
 * `place` in analysis/build_tastemap.py, which is what the tests measure.
 */
export function placeVisitor(
  data: TasteData,
  factors: Float32Array,
  ratings: Map<number, number>,
): Taste | null {
  if (!ratings.size) return null;
  const k = data.meta.rank;
  const n = k + 1;
  const a = new Float64Array(n * n);
  const b = new Float64Array(n);
  const row = new Float64Array(n);
  for (const [film, stars] of ratings) {
    for (let j = 0; j < k; j++) row[j] = factors[film * k + j];
    row[k] = 1;
    const target = stars - data.meta.mu - data.films[film][4];
    for (let i = 0; i < n; i++) {
      b[i] += row[i] * target;
      for (let j = 0; j < n; j++) a[i * n + j] += row[i] * row[j];
    }
  }
  const lam = data.meta.foldLam + data.meta.foldLamPerRating * ratings.size;
  for (let j = 0; j < k; j++) a[j * n + j] += lam;
  a[k * n + k] += data.meta.foldLamBias;
  const w = solve(a, b, n);
  return { vector: w.slice(0, k), generosity: w[k] };
}

/** How much more (or less) a film suits this visitor than the average viewer. */
export function affinities(
  data: TasteData,
  factors: Float32Array,
  taste: Taste,
) {
  const k = data.meta.rank;
  const out = new Float32Array(data.films.length);
  for (let i = 0; i < out.length; i++) {
    let dot = 0;
    for (let j = 0; j < k; j++) dot += factors[i * k + j] * taste.vector[j];
    out[i] = dot;
  }
  return out;
}

/** Predicted star rating, kept inside the half-star to five-star scale. */
export const predicted = (
  data: TasteData,
  film: number,
  affinity: number,
  taste: Taste,
) =>
  Math.min(
    5,
    Math.max(
      0.5,
      data.meta.mu + data.films[film][4] + taste.generosity + affinity,
    ),
  );

/** Cosine similarity between two films' factors. */
export function similarity(
  factors: Float32Array,
  k: number,
  a: number,
  b: number,
) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let j = 0; j < k; j++) {
    const x = factors[a * k + j];
    const y = factors[b * k + j];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return dot / (Math.sqrt(na * nb) || 1);
}
