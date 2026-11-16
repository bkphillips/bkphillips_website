/**
 * In-memory model of the synthetic company (see analysis/generate_org.py).
 *
 * The data file holds one row per person with their manager history, so the
 * model can rebuild the reporting tree for any month and roll metrics up to
 * every manager in a single bottom-up pass per month.
 *
 * Pure TypeScript with no browser or server dependencies: the page, the
 * assistant's tools and the tests all use this same code.
 */

export type RawOrg = {
  meta: {
    company: string;
    seed: number;
    months: string[];
    events: { month: number; label: string; detail: string }[];
  };
  functions: string[];
  teams: string[];
  locations: string[];
  titles: string[];
  people: [
    id: number,
    name: string,
    title: number,
    level: number,
    fn: number,
    team: number,
    loc: number,
    hire: number,
    exit: number,
    exitType: number,
    managerHistory: number[],
    attendance: string,
  ][];
};

export type Person = {
  id: number;
  name: string;
  title: string;
  level: number;
  /** Index into `functions`, or -1 for the CEO. */
  fn: number;
  team: number;
  loc: number;
  /** Month index of hire; negative means before the data starts. */
  hire: number;
  /** Month index of exit, or -1 if still employed. */
  exit: number;
  /** 0 = still here, 1 = voluntary, 2 = involuntary. */
  exitType: number;
  /** Flat pairs: [month, managerId, month, managerId, ...]. */
  hist: number[];
  /** One base-36 character per month employed: days in office per week, times two. */
  att: string;
};

export type MetricKey =
  | "headcount"
  | "span"
  | "layers"
  | "coloc"
  | "attendance"
  | "voluntary"
  | "involuntary"
  | "tenure";

export type MetricDef = {
  key: MetricKey;
  label: string;
  short: string;
  unit: string;
  digits: number;
  description: string;
};

export const METRICS: MetricDef[] = [
  {
    key: "headcount",
    label: "Headcount",
    short: "Headcount",
    unit: "",
    digits: 0,
    description: "People in this organization, including its leader.",
  },
  {
    key: "span",
    label: "Span of control",
    short: "Span",
    unit: "",
    digits: 1,
    description: "Average number of direct reports per manager.",
  },
  {
    key: "layers",
    label: "Layers from the CEO",
    short: "Layers",
    unit: "",
    digits: 2,
    description: "Average number of reporting steps between an employee and the CEO.",
  },
  {
    key: "coloc",
    label: "Manager co-location",
    short: "Co-location",
    unit: "%",
    digits: 0,
    description: "Share of employees who work in the same office as their manager.",
  },
  {
    key: "attendance",
    label: "Office attendance",
    short: "Attendance",
    unit: " days/wk",
    digits: 1,
    description: "Average days per week in the office.",
  },
  {
    key: "voluntary",
    label: "Voluntary attrition",
    short: "Voluntary",
    unit: "%",
    digits: 1,
    description: "Share of the organization that resigned in the month.",
  },
  {
    key: "involuntary",
    label: "Involuntary attrition",
    short: "Involuntary",
    unit: "%",
    digits: 1,
    description: "Share of the organization that left involuntarily in the month.",
  },
  {
    key: "tenure",
    label: "Average tenure",
    short: "Tenure",
    unit: " yrs",
    digits: 1,
    description: "Average years since hire.",
  },
];

export const metricDef = (key: MetricKey) => METRICS.find((m) => m.key === key)!;

export function formatMetric(key: MetricKey, value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  const def = metricDef(key);
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: def.digits,
    maximumFractionDigits: def.digits,
  })}${def.unit}`;
}

export type Series = Record<MetricKey, Float32Array>;

export class OrgModel {
  readonly company: string;
  readonly months: string[];
  readonly last: number;
  readonly events: RawOrg["meta"]["events"];
  readonly functions: string[];
  readonly teams: string[];
  readonly locations: string[];
  readonly remote: number;
  /** Indexed by person id (ids start at 1). */
  readonly people: Person[] = [];
  readonly ceo: number;

  /** managerByMonth[m][id]: manager id, 0 for the CEO, -1 if not employed that month. */
  private readonly managerByMonth: Int32Array[] = [];
  private readonly headcountByMonth: Int32Array[] = [];
  private readonly series = new Map<number, Series>();

  /** Latest month: direct reports of each person. */
  readonly reports: number[][];

  constructor(raw: RawOrg) {
    this.company = raw.meta.company;
    this.months = raw.meta.months;
    this.last = this.months.length - 1;
    this.events = raw.meta.events;
    this.functions = raw.functions;
    this.teams = raw.teams;
    this.locations = raw.locations;
    this.remote = raw.locations.indexOf("Remote");

    let ceo = 0;
    for (const r of raw.people) {
      this.people[r[0]] = {
        id: r[0],
        name: r[1],
        title: raw.titles[r[2]],
        level: r[3],
        fn: r[4],
        team: r[5],
        loc: r[6],
        hire: r[7],
        exit: r[8],
        exitType: r[9],
        hist: r[10],
        att: r[11],
      };
      if (r[4] < 0) ceo = r[0];
    }
    this.ceo = ceo;
    this.compute();
    this.reports = this.reportsAt(this.last);
  }

  isActive(id: number, month: number): boolean {
    return (this.managerByMonth[month]?.[id] ?? -1) >= 0;
  }

  managerOf(id: number, month = this.last): number {
    return this.managerByMonth[month][id];
  }

  /** People in the organization led by `id` in a given month (leader included). */
  orgSize(id: number, month = this.last): number {
    return this.headcountByMonth[month][id];
  }

  seriesFor(id: number): Series | undefined {
    return this.series.get(id);
  }

  value(id: number, key: MetricKey, month = this.last): number {
    return this.series.get(id)?.[key][month] ?? NaN;
  }

  /** Sum of a monthly rate over the 12 months ending at `month` (e.g. yearly attrition). */
  trailingYear(id: number, key: MetricKey, month = this.last): number {
    const s = this.series.get(id)?.[key];
    if (!s) return NaN;
    let sum = 0;
    let count = 0;
    for (let i = Math.max(month - 11, 0); i <= month; i++) {
      if (!Number.isNaN(s[i])) {
        sum += s[i];
        count++;
      }
    }
    return count ? (sum / count) * 12 : NaN;
  }

  /** Days per week in the office for one person in one month. */
  attendance(p: Person, month: number): number {
    const i = month - Math.max(p.hire, 0);
    return i >= 0 && i < p.att.length ? parseInt(p.att[i], 36) / 2 : NaN;
  }

  reportsAt(month: number): number[][] {
    const mgr = this.managerByMonth[month];
    const out: number[][] = Array.from({ length: this.people.length }, () => []);
    for (let id = 1; id < this.people.length; id++) {
      if (mgr[id] > 0) out[mgr[id]].push(id);
    }
    return out;
  }

  /** Chain of managers from the CEO down to `id` (inclusive). */
  path(id: number, month = this.last): number[] {
    const out: number[] = [];
    for (let cur = id; cur > 0; cur = this.managerByMonth[month][cur]) out.push(cur);
    return out.reverse();
  }

  isWithin(id: number, leader: number, month = this.last): boolean {
    for (let cur = id; cur > 0; cur = this.managerByMonth[month][cur]) {
      if (cur === leader) return true;
    }
    return false;
  }

  /** A short name for the organization a person leads (as of `month`). */
  orgName(id: number, month = this.last): string {
    const p = this.people[id];
    if (p.fn < 0) return this.company;
    const depth = this.path(id, month).length - 1;
    if (depth === 1) return this.functions[p.fn];
    if (depth === 2 && p.team) return `${this.functions[p.fn]} · ${this.teams[p.team]}`;
    return `${p.name}'s team`;
  }

  /** Current managers, largest organizations first. */
  leaders(minSize = 1): number[] {
    const out: number[] = [];
    for (let id = 1; id < this.people.length; id++) {
      if (this.reports[id].length && this.orgSize(id) >= minSize) out.push(id);
    }
    return out.sort((a, b) => this.orgSize(b) - this.orgSize(a));
  }

  private compute() {
    const n = this.people.length;
    const months = this.months.length;
    const cursor = new Int32Array(n); // position in each person's manager history

    for (let m = 0; m < months; m++) {
      const mgr = new Int32Array(n).fill(-1);
      const kids = new Int32Array(n);
      for (let id = 1; id < n; id++) {
        const p = this.people[id];
        if (p.hire > m || (p.exit >= 0 && p.exit <= m)) continue;
        let c = cursor[id];
        while (c + 2 < p.hist.length && p.hist[c + 2] <= m) c += 2;
        cursor[id] = c;
        mgr[id] = p.hist[c + 1];
      }
      for (let id = 1; id < n; id++) if (mgr[id] > 0) kids[mgr[id]]++;

      // Depth below the CEO, then visit deepest first so children roll up into parents.
      const depth = new Int32Array(n).fill(-1);
      const depthOf = (id: number): number => {
        if (depth[id] >= 0) return depth[id];
        return (depth[id] = mgr[id] > 0 ? depthOf(mgr[id]) + 1 : 0);
      };
      const order: number[] = [];
      for (let id = 1; id < n; id++) {
        if (mgr[id] >= 0) {
          depthOf(id);
          order.push(id);
        }
      }
      order.sort((a, b) => depth[b] - depth[a]);

      const hc = new Int32Array(n);
      const managers = new Int32Array(n);
      const depthSum = new Float64Array(n);
      const withManager = new Int32Array(n);
      const colocated = new Int32Array(n);
      const attendance = new Float64Array(n);
      const tenure = new Float64Array(n);
      const quits = new Int32Array(n);
      const fired = new Int32Array(n);

      for (const id of order) {
        const p = this.people[id];
        hc[id] += 1;
        managers[id] += kids[id] > 0 ? 1 : 0;
        depthSum[id] += depth[id];
        if (mgr[id] > 0) {
          withManager[id] += 1;
          if (p.loc !== this.remote && p.loc === this.people[mgr[id]].loc) colocated[id] += 1;
        }
        attendance[id] += this.attendance(p, m) || 0;
        tenure[id] += m - p.hire;
        if (p.exit === m + 1) (p.exitType === 1 ? quits : fired)[id] += 1;

        const up = mgr[id];
        if (up > 0) {
          hc[up] += hc[id];
          managers[up] += managers[id];
          depthSum[up] += depthSum[id];
          withManager[up] += withManager[id];
          colocated[up] += colocated[id];
          attendance[up] += attendance[id];
          tenure[up] += tenure[id];
          quits[up] += quits[id];
          fired[up] += fired[id];
        }
      }

      for (const id of order) {
        if (!kids[id]) continue;
        let s = this.series.get(id);
        if (!s) {
          s = Object.fromEntries(
            METRICS.map((d) => [d.key, new Float32Array(months).fill(NaN)]),
          ) as Series;
          this.series.set(id, s);
        }
        s.headcount[m] = hc[id];
        s.span[m] = (hc[id] - 1) / managers[id];
        s.layers[m] = depthSum[id] / hc[id];
        s.coloc[m] = withManager[id] ? (colocated[id] / withManager[id]) * 100 : NaN;
        s.attendance[m] = attendance[id] / hc[id];
        s.tenure[m] = tenure[id] / hc[id] / 12;
        // Exits are recorded against the month they happen, using last month's org.
        if (m + 1 < months) {
          s.voluntary[m + 1] = (quits[id] / hc[id]) * 100;
          s.involuntary[m + 1] = (fired[id] / hc[id]) * 100;
        }
      }

      this.managerByMonth.push(mgr);
      this.headcountByMonth.push(hc);
    }
  }
}

export function monthLabel(iso: string, long = false): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: long ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
