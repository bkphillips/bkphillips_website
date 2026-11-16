import type { Model } from "@/lib/segmentation";

export type SourceId = "yahoo" | "wikipedia" | "owid";

/** [timestamp in ms, value] */
export type Point = [number, number];

export type SeriesData = {
  source: SourceId;
  id: string;
  label: string;
  /** What the numbers are, e.g. "USD" or "daily pageviews". */
  unit: string;
  sourceName: string;
  sourceUrl: string;
  points: Point[];
};

export type Preset = {
  source: SourceId;
  id: string;
  name: string;
  blurb: string;
  model: Model;
  log: boolean;
  years: number;
  shifts: number;
};

/** One change point, described in plain numbers so the server can build the prompt itself. */
export type ShiftEvent = {
  /** ISO date (YYYY-MM-DD) of the first observation in the new regime. */
  date: string;
  windowStart: string;
  windowEnd: string;
  model: Model;
  /** Level before and after, in the series' own units. */
  before: number;
  after: number;
  /** Trend model only: growth per year before and after. Percent if `log`, else units. */
  rateBefore?: number;
  rateAfter?: number;
  log: boolean;
};

export type Explanation = {
  date: string;
  headline: string;
  summary: string;
  sources: { title: string; url: string }[];
};

export type ExplainResponse = {
  explanations: Explanation[];
  overview: string | null;
};
