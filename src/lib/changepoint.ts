/**
 * Change point detection for shifts in the mean of a series.
 *
 * PELT (Pruned Exact Linear Time; Killick, Fearnhead & Eckley, 2012) with an
 * L2 segment cost. It minimises
 *
 *   sum over segments of [ sum (y - segment mean)^2 ]  +  penalty * (number of change points)
 *
 * exactly, and prunes candidate split points that can never be optimal.
 */

export type Segment = { start: number; end: number; mean: number };

/** Robust noise estimate from first differences (median absolute deviation). */
export function noiseSigma(y: number[]): number {
  if (y.length < 3) return 1;
  const d = y.slice(1).map((v, i) => v - y[i]);
  const med = median(d);
  const mad = median(d.map((v) => Math.abs(v - med)));
  return (mad * 1.4826) / Math.SQRT2 || 1;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * @param y        the series
 * @param penalty  cost added per change point (higher = fewer change points)
 * @param minSize  minimum number of points in a segment
 * @returns        sorted change point indices (each is the first index of a new segment)
 */
export function pelt(y: number[], penalty: number, minSize = 5): number[] {
  const n = y.length;
  if (n < 2 * minSize) return [];

  // Prefix sums give O(1) segment cost.
  const s1 = new Float64Array(n + 1);
  const s2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    s1[i + 1] = s1[i] + y[i];
    s2[i + 1] = s2[i] + y[i] * y[i];
  }
  const cost = (a: number, b: number) => {
    const sum = s1[b] - s1[a];
    return s2[b] - s2[a] - (sum * sum) / (b - a);
  };

  const best = new Float64Array(n + 1).fill(Infinity);
  const prev = new Int32Array(n + 1);
  best[0] = -penalty;
  let candidates = [0];

  for (let t = minSize; t <= n; t++) {
    let bestCost = Infinity;
    let bestStart = 0;
    for (const s of candidates) {
      const c = best[s] + cost(s, t) + penalty;
      if (c < bestCost) {
        bestCost = c;
        bestStart = s;
      }
    }
    best[t] = bestCost;
    prev[t] = bestStart;

    // Prune: a start that is already worse than the best here can never win later.
    candidates = candidates.filter((s) => best[s] + cost(s, t) <= bestCost);
    const next = t + 1 - minSize;
    if (next >= minSize) candidates.push(next);
  }

  const cps: number[] = [];
  for (let t = prev[n]; t > 0; t = prev[t]) cps.push(t);
  return cps.reverse();
}

export function segments(y: number[], cps: number[]): Segment[] {
  const bounds = [0, ...cps, y.length];
  return bounds.slice(0, -1).map((start, i) => {
    const end = bounds[i + 1];
    let sum = 0;
    for (let j = start; j < end; j++) sum += y[j];
    return { start, end, mean: sum / (end - start) };
  });
}
