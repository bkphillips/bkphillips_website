import {
  fitSegments,
  segment,
  type Fit,
  type Model,
  type Segmentation,
} from "@/lib/segmentation";
import type { Point, ShiftEvent } from "./types";

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
/** Detection runs on at most this many points; longer series are averaged into buckets. */
const MAX_POINTS = 900;
export const MAX_SHIFTS = 12;

export type Prepared = {
  points: Point[];
  /** Values the model sees: log of the value on a log scale, otherwise the value. */
  z: number[];
};

export function prepare(all: Point[], years: number, log: boolean): Prepared {
  if (!all.length) return { points: [], z: [] };
  const from = all[all.length - 1][0] - years * YEAR;
  let pts = all.filter((p) => p[0] >= from && (!log || p[1] > 0));

  if (pts.length > MAX_POINTS) {
    const size = Math.ceil(pts.length / MAX_POINTS);
    const out: Point[] = [];
    for (let i = 0; i < pts.length; i += size) {
      const chunk = pts.slice(i, i + size);
      const mean = chunk.reduce((s, p) => s + p[1], 0) / chunk.length;
      out.push([chunk[chunk.length - 1][0], mean]);
    }
    pts = out;
  }
  return { points: pts, z: pts.map((p) => (log ? Math.log(p[1]) : p[1])) };
}

export function analyse(
  z: number[],
  model: Model,
): Segmentation & { minSize: number } {
  const minSize = Math.max(
    model === "trend" ? 5 : 4,
    Math.round(z.length * 0.025),
  );
  return { ...segment(z, model, MAX_SHIFTS, minSize), minSize };
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function describeShifts(
  points: Point[],
  z: number[],
  cps: number[],
  model: Model,
  log: boolean,
): { fits: Fit[]; events: ShiftEvent[] } {
  const fits = fitSegments(z, cps, model);
  const inv = (v: number) => (log ? Math.exp(v) : v);

  /** Growth per year: percent on a log scale, otherwise units. */
  const rate = (f: Fit) => {
    const span = (points[f.end - 1][0] - points[f.start][0]) / YEAR;
    if (span <= 0) return 0;
    const perYear = (f.slope * (f.end - 1 - f.start)) / span;
    return log ? (Math.exp(perYear) - 1) * 100 : perYear;
  };

  const average = (f: Fit) => {
    let sum = 0;
    for (let j = f.start; j < f.end; j++) sum += points[j][1];
    return sum / (f.end - f.start);
  };

  const events = cps.map((c, i): ShiftEvent => {
    const a = fits[i];
    const b = fits[i + 1];
    const step = points[c][0] - points[c - 1][0];
    const stretch = (f: Fit) => ({
      from: iso(points[f.start][0]),
      to: iso(points[f.end - 1][0]),
      start: inv(f.intercept),
      end: inv(f.intercept + f.slope * (f.end - 1 - f.start)),
    });
    return {
      date: iso(points[c][0]),
      // News window: a cause usually comes before the first observation of the
      // new regime, so look further back than forward.
      windowStart: iso(points[c][0] - Math.max(14 * DAY, 2 * step)),
      windowEnd: iso(points[c][0] + Math.max(5 * DAY, step)),
      prior: stretch(a),
      next: stretch(b),
      avgBefore: average(a),
      avgAfter: average(b),
      model,
      log,
      before: inv(a.intercept + a.slope * (a.end - 1 - a.start)),
      after: inv(b.intercept),
      ...(model === "trend" ? { rateBefore: rate(a), rateAfter: rate(b) } : {}),
    };
  });
  return { fits, events };
}
