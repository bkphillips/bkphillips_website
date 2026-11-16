/**
 * Optimal segmentation of a series for every number of change points at once.
 *
 * Dynamic programming (the "segment neighbourhood" method, Auger & Lawrence
 * 1989; `Dynp` in the Python `ruptures` library). For k = 0..maxK it finds the
 * change points that minimise the total squared error of fitting each segment
 * with either
 *
 *   "level": a constant (shifts in the mean), or
 *   "trend": its own straight line (changes in slope and level).
 *
 * Prefix sums make every segment cost O(1), so the whole table costs
 * O(maxK * n^2) and re-drawing for a different k is free.
 *
 * This file has no imports so it can also run directly under Node for
 * validation against ruptures (see analysis/).
 */

export type Model = "level" | "trend";

/** A fitted segment over indices [start, end). value(i) = intercept + slope * (i - start). */
export type Fit = {
  start: number;
  end: number;
  intercept: number;
  slope: number;
};

export type Segmentation = {
  /** changePoints[k] holds k sorted indices; each is the first index of a new segment. */
  changePoints: number[][];
  /** cost[k]: total squared error with k change points. */
  cost: number[];
  /** Total squared error around the overall mean (for "variance explained"). */
  totalSS: number;
};

type Sums = {
  n: number;
  x0: number;
  px: Float64Array;
  pxx: Float64Array;
  py: Float64Array;
  pyy: Float64Array;
  pxy: Float64Array;
};

function prefixSums(y: number[]): Sums {
  const n = y.length;
  // Centre x and y to keep the sums well conditioned.
  const x0 = (n - 1) / 2;
  let mean = 0;
  for (const v of y) mean += v;
  mean /= n || 1;

  const px = new Float64Array(n + 1);
  const pxx = new Float64Array(n + 1);
  const py = new Float64Array(n + 1);
  const pyy = new Float64Array(n + 1);
  const pxy = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const x = i - x0;
    const v = y[i] - mean;
    px[i + 1] = px[i] + x;
    pxx[i + 1] = pxx[i] + x * x;
    py[i + 1] = py[i] + v;
    pyy[i + 1] = pyy[i] + v * v;
    pxy[i + 1] = pxy[i] + x * v;
  }
  return { n, x0, px, pxx, py, pyy, pxy };
}

function makeCost(s: Sums, model: Model) {
  const { px, pxx, py, pyy, pxy } = s;
  if (model === "level") {
    return (a: number, b: number) => {
      const sy = py[b] - py[a];
      const c = pyy[b] - pyy[a] - (sy * sy) / (b - a);
      return c > 0 ? c : 0;
    };
  }
  return (a: number, b: number) => {
    const m = b - a;
    const sx = px[b] - px[a];
    const sy = py[b] - py[a];
    const vxx = pxx[b] - pxx[a] - (sx * sx) / m;
    const vxy = pxy[b] - pxy[a] - (sx * sy) / m;
    const vyy = pyy[b] - pyy[a] - (sy * sy) / m;
    const c = vxx > 1e-9 ? vyy - (vxy * vxy) / vxx : vyy;
    return c > 0 ? c : 0;
  };
}

export function segment(
  y: number[],
  model: Model,
  maxK: number,
  minSize: number,
): Segmentation {
  const n = y.length;
  const sums = prefixSums(y);
  const cost = makeCost(sums, model);
  const totalSS = n ? makeCost(sums, "level")(0, n) : 0;

  const K = Math.max(0, Math.min(maxK, Math.floor(n / minSize) - 1));
  // best[k][t]: lowest cost of splitting y[0..t) into k + 1 segments.
  const best: Float64Array[] = [];
  const back: Int32Array[] = [];

  const first = new Float64Array(n + 1).fill(Infinity);
  for (let t = minSize; t <= n; t++) first[t] = cost(0, t);
  best.push(first);
  back.push(new Int32Array(n + 1));

  for (let k = 1; k <= K; k++) {
    const prev = best[k - 1];
    const cur = new Float64Array(n + 1).fill(Infinity);
    const arg = new Int32Array(n + 1);
    for (let t = (k + 1) * minSize; t <= n; t++) {
      let lo = Infinity;
      let at = 0;
      for (let s = k * minSize; s <= t - minSize; s++) {
        const c = prev[s] + cost(s, t);
        if (c < lo) {
          lo = c;
          at = s;
        }
      }
      cur[t] = lo;
      arg[t] = at;
    }
    best.push(cur);
    back.push(arg);
  }

  const changePoints: number[][] = [];
  const costs: number[] = [];
  for (let k = 0; k <= K; k++) {
    const cps: number[] = [];
    let t = n;
    for (let j = k; j >= 1; j--) {
      t = back[j][t];
      cps.push(t);
    }
    changePoints.push(cps.reverse());
    costs.push(best[k][n]);
  }
  return { changePoints, cost: costs, totalSS };
}

/** Least-squares fit of each segment between the given change points. */
export function fitSegments(y: number[], cps: number[], model: Model): Fit[] {
  const bounds = [0, ...cps, y.length];
  const fits: Fit[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i];
    const end = bounds[i + 1];
    const m = end - start;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let j = start; j < end; j++) {
      const x = j - start;
      sx += x;
      sy += y[j];
      sxx += x * x;
      sxy += x * y[j];
    }
    const vxx = sxx - (sx * sx) / m;
    const slope =
      model === "trend" && vxx > 1e-9 ? (sxy - (sx * sy) / m) / vxx : 0;
    fits.push({ start, end, slope, intercept: sy / m - slope * (sx / m) });
  }
  return fits;
}
