/**
 * Finds what changed in a monthly metric: lasting shifts (change point
 * detection) and one-month spikes (anomaly detection), and which parts of the
 * organization drove each one.
 */

import { fitSegments, segment, type Fit, type Model } from "../segmentation";
import type { MetricKey, OrgModel } from "./model";

export type Finding = {
  kind: "shift" | "spike";
  /** Month index where the new regime starts, or where the spike happened. */
  month: number;
  /** Fitted value just before and just after (for a spike: expected vs. actual). */
  before: number;
  after: number;
  /** Trend metrics only: change per month before and after the shift. */
  slopeBefore?: number;
  slopeAfter?: number;
};

export type Analysis = {
  /** First month with data. */
  start: number;
  findings: Finding[];
  /** Fitted value for each month from `start` (spikes excluded). */
  fitted: number[];
};

/**
 * Stock metrics drift as an organization grows, so they are fitted with
 * straight-line segments; flow metrics are fitted with flat levels.
 */
export const ANALYSIS_MODEL: Record<MetricKey, Model> = {
  headcount: "trend",
  span: "trend",
  layers: "trend",
  coloc: "trend",
  tenure: "trend",
  attendance: "level",
  voluntary: "level",
  involuntary: "level",
};

const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
const quantile = (values: number[], q: number) => {
  const s = sorted(values);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};
const median = (values: number[]) => {
  const s = sorted(values);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const MAX_SHIFTS = 4;

export function analyseSeries(values: ArrayLike<number>, model: Model = "level"): Analysis {
  let start = 0;
  while (start < values.length && Number.isNaN(values[start])) start++;
  let end = values.length;
  while (end > start && Number.isNaN(values[end - 1])) end--;
  const y: number[] = [];
  for (let i = start; i < end; i++) {
    y.push(Number.isNaN(values[i]) ? (y[y.length - 1] ?? 0) : values[i]);
  }
  const n = y.length;
  if (n < 12) return { start, findings: [], fitted: [...y] };
  const typical = Math.abs(median(y));

  // 1. Spikes: points far from a rolling median. A median filter keeps real
  //    steps intact, so a lasting shift is not mistaken for a spike. The noise
  //    scale also looks at the 90th percentile so that series which are mostly
  //    zero (attrition in a small team) do not flag every non-zero month.
  const rolling = y.map((_, i) => median(y.slice(Math.max(0, i - 2), Math.min(n, i + 3))));
  const resid = y.map((v, i) => Math.abs(v - rolling[i]));
  const scale = Math.max(1.4826 * median(resid), quantile(resid, 0.9) / 1.645, 0.02 * typical, 1e-9);
  const spikes = new Set<number>();
  resid.forEach((r, i) => {
    if (r > 6 * scale) spikes.add(i);
  });
  const clean = y.map((v, i) => (spikes.has(i) ? rolling[i] : v));

  // 2. Shifts: the best segmentation for each number of shifts, then the
  //    number that pays for itself under a BIC-style penalty.
  const diffs = clean.slice(1).map((v, i) => v - clean[i]);
  const dmed = median(diffs);
  const sigma = Math.max(
    (1.4826 * median(diffs.map((d) => Math.abs(d - dmed)))) / Math.SQRT2,
    0.01 * typical,
    1e-9,
  );
  const minSize = model === "trend" ? 4 : 3;
  // A series that is zero most months (exits in a small team) has no stable
  // level to shift, so only spikes are reported for it.
  const mostlyZero = y.filter((v) => v === 0).length > n / 2;
  const seg = segment(clean, model, mostlyZero ? 0 : MAX_SHIFTS, minSize);
  const penalty = 6 * sigma * sigma * Math.log(n);
  let best = 0;
  for (let k = 1; k < seg.cost.length; k++) {
    if (seg.cost[k] + k * penalty < seg.cost[best] + best * penalty) best = k;
  }
  // 3. Drop shifts too small to matter, weakest first, refitting each time.
  const floor = 0.07 * Math.max(typical, y.reduce((sum, v) => sum + Math.abs(v), 0) / n);
  const material = (a: Fit, b: Fit) => {
    const step = Math.abs(b.intercept - (a.intercept + a.slope * (a.end - 1 - a.start)));
    const bend = Math.abs(b.slope - a.slope) * 6; // what the new slope adds up to in six months
    return Math.max(step, bend) / floor;
  };
  const cps = [...seg.changePoints[best]];
  let fits = fitSegments(clean, cps, model);
  while (cps.length) {
    const scores = cps.map((_, i) => material(fits[i], fits[i + 1]));
    const weakest = scores.indexOf(Math.min(...scores));
    if (scores[weakest] >= 1) break;
    cps.splice(weakest, 1);
    fits = fitSegments(clean, cps, model);
  }
  const fitted = fits.flatMap((f) =>
    Array.from({ length: f.end - f.start }, (_, j) => f.intercept + f.slope * j),
  );

  const findings: Finding[] = [
    ...cps.map((c, i): Finding => {
      const a = fits[i];
      const b = fits[i + 1];
      return {
        kind: "shift",
        month: start + c,
        before: a.intercept + a.slope * (a.end - 1 - a.start),
        after: b.intercept,
        ...(model === "trend" ? { slopeBefore: a.slope, slopeAfter: b.slope } : {}),
      };
    }),
    ...[...spikes].map(
      (i): Finding => ({ kind: "spike", month: start + i, before: rolling[i], after: y[i] }),
    ),
  ].sort((a, b) => a.month - b.month);

  return { start, findings, fitted };
}

/** True when a shift is mainly a sudden step, not just a change of slope. */
export function isStep(f: Finding): boolean {
  const size = Math.abs(f.after - f.before);
  const drift = Math.max(Math.abs(f.slopeBefore ?? 0), Math.abs(f.slopeAfter ?? 0));
  return f.slopeBefore === undefined || size > 2.5 * drift;
}

export type Driver = {
  leaderId: number;
  name: string;
  org: string;
  headcount: number;
  before: number;
  after: number;
};

/**
 * Which direct sub-organizations moved most around a finding. Movement is
 * weighted by each sub-organization's share of headcount, so a small team with
 * a large swing does not outrank a large team that moved the total.
 */
export function drivers(
  model: OrgModel,
  leaderId: number,
  key: MetricKey,
  finding: Finding,
  top = 3,
): Driver[] {
  const m = finding.month;
  const ref = Math.max(m - 1, 0);
  const from = Math.max(m - 3, 0);
  const to = Math.min(finding.kind === "spike" ? m : m + 2, model.last);
  // Only sub-organizations whose leader held the seat throughout, so a change
  // of leader is not mistaken for a change in the metric.
  const subs = model
    .reportsAt(ref)
    [leaderId].filter(
      (id) =>
        model.seriesFor(id) &&
        model.managerOf(id, from) === leaderId &&
        model.managerOf(id, to) === leaderId,
    );
  const total = model.orgSize(leaderId, ref) || 1;
  const mean = (id: number, from: number, to: number) => {
    const s = model.seriesFor(id)![key];
    let sum = 0;
    let count = 0;
    for (let i = Math.max(from, 0); i <= Math.min(to, model.last); i++) {
      if (!Number.isNaN(s[i])) {
        sum += s[i];
        count++;
      }
    }
    return count ? sum / count : NaN;
  };

  return subs
    .map((id) => {
      const before = mean(id, m - 3, m - 1);
      const after = finding.kind === "spike" ? mean(id, m, m) : mean(id, m, m + 2);
      const headcount = model.orgSize(id, ref);
      const weight = key === "headcount" ? 1 : headcount / total;
      return {
        leaderId: id,
        name: model.people[id].name,
        org: model.orgName(id, ref),
        headcount,
        before,
        after,
        score: Math.abs(after - before) * weight,
      };
    })
    .filter((d) => Number.isFinite(d.score) && d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, top)
    .map((d) => ({
      leaderId: d.leaderId,
      name: d.name,
      org: d.org,
      headcount: d.headcount,
      before: d.before,
      after: d.after,
    }));
}
