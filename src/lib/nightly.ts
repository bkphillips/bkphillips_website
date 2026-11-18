/** Shapes of public/data/nightly.json, written by analysis/build_nightly.py. */

export type Kind = "entire" | "private" | "hotel";
export type Combo = { kind: Kind; long: 0 | 1; guests: number };

/** Low, typical and high nightly price, then the number of comparable
 *  listings nearby. A bare number means too few comparables for an estimate. */
export type Estimate = [lo: number, mid: number, hi: number, n: number];
export type Entry = number | Estimate;
/** x and y on the map, neighbourhood index, then one entry per combination. */
export type Cell = [x: number, y: number, hood: number, entries: Entry[]];

export type Hood = {
  name: string;
  borough: string;
  d: string;
  n19: number;
  n26: number;
  s19: number;
  s26: number;
};

type Method = {
  name: string;
  medianAbs: number;
  medianPct: number;
  rmse: number;
};
type Share = { n: number; actual: number };
type Years<T> = { y2019: T; y2026: T };

export type NightlyData = {
  meta: {
    snapshot: string;
    listings: number;
    priced: number;
    priceMin: number;
    priceMax: number;
    cellKm: number;
    nearKm: number;
    minNear: number;
    view: [number, number];
    /** The box holding most listings, as x0, y0, x1, y1 on the map. */
    core: [number, number, number, number];
    cellPx: number;
    combos: Combo[];
  };
  city: { n: number; median: number | null }[];
  cells: Cell[];
  hoods: Hood[];
  model: {
    rows: { priced: number; train: number; calibrate: number; test: number };
    methods: Method[];
    coverage: {
      target: number;
      actual: number;
      beforeAdjust: number;
      widenPct: number;
      medianWidthRatio: number;
      byKind: Record<Kind, Share>;
      byStay: { short: Share; long: Share };
    };
  };
  compare: {
    total: Years<number>;
    short: Years<number>;
    nightBins: string[];
    nights: Years<number[]>;
    boroughs: string[];
    byBorough: Years<number[]> & { short2019: number[]; short2026: number[] };
    shortNow: {
      total: number;
      hotel: number;
      registered: number;
      exempt: number;
      none: number;
    };
  };
};

export const KIND_LABEL: Record<Kind, string> = {
  entire: "Entire place",
  private: "Private room",
  hotel: "Hotel room",
};

export const STAY_LABEL = ["A few nights", "A month or more"] as const;

/** Guest choices offered for each kind, as [value the model uses, label]. */
export const GUESTS: Record<Kind, [number, string][]> = {
  entire: [
    [2, "1–2"],
    [4, "3–4"],
    [6, "5–6"],
  ],
  private: [
    [1, "1"],
    [2, "2"],
  ],
  hotel: [
    [2, "1–2"],
    [4, "3–4"],
  ],
};

export const dollars = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;
export const count = (n: number) => n.toLocaleString("en-US");
export const percent = (share: number, digits = 0) =>
  `${(share * 100).toFixed(digits)}%`;

export const isEstimate = (e: Entry | undefined): e is Estimate =>
  Array.isArray(e);

export const comboIndex = (
  combos: Combo[],
  kind: Kind,
  long: number,
  guests: number,
) =>
  combos.findIndex(
    (c) => c.kind === kind && c.long === long && c.guests === guests,
  );
