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
  /** Average of the series over the stretch before and the stretch after. */
  avgBefore?: number;
  avgAfter?: number;
  /** The stretch before the shift: when it began, and the fitted value at its start and end. */
  prior?: Stretch;
  /** The stretch after the shift, up to the next shift or the end of the data. */
  next?: Stretch;
};

export type Stretch = { from: string; to: string; start: number; end: number };

export type Confidence = "high" | "medium" | "low";

export type Explanation = {
  date: string;
  headline: string;
  /** How firmly the reporting ties the cause to the move. Set when a model wrote the summary. */
  confidence?: Confidence;
  /** Empty when only the news search is set up and no summary was written. */
  summary: string;
  /**
   * Articles behind the explanation. `source` and `date` come from the news
   * search; `also` is how many other articles it found about the same event.
   */
  sources: {
    title: string;
    url: string;
    source?: string;
    date?: string;
    also?: number;
  }[];
  /** How many articles the news search found around the shift. */
  found?: number;
};

/** Explanations prepared ahead of time for the example series at their default settings. */
export type SavedExplanations = {
  /** The day the news was searched and the summaries written. */
  asOf: string;
  series: Record<
    string,
    {
      years: number;
      model: Model;
      log: boolean;
      shifts: number;
      overview: string | null;
      explanations: Explanation[];
    }
  >;
};

export type ExplainResponse = {
  explanations: Explanation[];
  overview: string | null;
};
