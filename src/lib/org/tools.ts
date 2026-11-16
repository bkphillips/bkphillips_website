/**
 * The functions the assistant may call. Each takes plain JSON and returns
 * plain JSON, computed from the model. The assistant never sees the raw data
 * and cannot ask about anyone outside the organization it is scoped to.
 */

import { ANALYSIS_MODEL, analyseSeries, drivers, isStep } from "./insights";
import { METRICS, monthLabel, type MetricKey, type OrgModel } from "./model";

export type ToolSpec = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
};

const metricKeys = METRICS.map((m) => m.key);
const leaderId = {
  type: "integer",
  description: "Id of the leader whose organization to look at, from find_orgs or org_summary.",
};
const metric = {
  type: "string",
  enum: metricKeys,
  description: METRICS.map((m) => `${m.key}: ${m.description}`).join(" "),
};

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "find_orgs",
    description:
      "Search for organizations by leader name, function, team or title. Returns matching leaders with their ids and organization sizes. Call this first when the user names a team or a person.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Name, team or function to search for." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "org_summary",
    description:
      "Current value of every metric for one organization, the value twelve months earlier, and its direct sub-organizations.",
    input_schema: {
      type: "object",
      properties: { leader_id: leaderId },
      required: ["leader_id"],
      additionalProperties: false,
    },
  },
  {
    name: "metric_history",
    description: "Monthly values of one metric for one organization across the 36 months of data.",
    input_schema: {
      type: "object",
      properties: { leader_id: leaderId, metric },
      required: ["leader_id", "metric"],
      additionalProperties: false,
    },
  },
  {
    name: "compare_sub_orgs",
    description:
      "One metric for each direct sub-organization of a leader in the latest month, sorted from highest to lowest. Use it to answer which teams are highest or lowest on something.",
    input_schema: {
      type: "object",
      properties: { leader_id: leaderId, metric },
      required: ["leader_id", "metric"],
      additionalProperties: false,
    },
  },
  {
    name: "detected_changes",
    description:
      "Lasting shifts and one-month spikes that the change point and anomaly models found in a metric for an organization, with the sub-organizations that moved most each time.",
    input_schema: {
      type: "object",
      properties: { leader_id: leaderId, metric },
      required: ["leader_id", "metric"],
      additionalProperties: false,
    },
  },
];

const round = (v: number, digits = 2) =>
  Number.isFinite(v) ? Number(v.toFixed(digits)) : null;

const isMetric = (v: unknown): v is MetricKey => metricKeys.includes(v as MetricKey);

function describe(model: OrgModel, id: number) {
  const p = model.people[id];
  return {
    leader_id: id,
    leader: p.name,
    title: p.title,
    organization: model.orgName(id),
    headcount: model.orgSize(id),
  };
}

export function runTool(
  model: OrgModel,
  scope: number,
  name: string,
  input: Record<string, unknown>,
): unknown {
  const inScope = (id: unknown): id is number =>
    typeof id === "number" &&
    Number.isInteger(id) &&
    id > 0 &&
    id < model.people.length &&
    model.reports[id].length > 0 &&
    model.isWithin(id, scope);
  const outOfScope = {
    error: "That organization does not exist or is outside what this user is viewing.",
  };

  if (name === "find_orgs") {
    const q = String(input.query ?? "").toLowerCase().trim();
    if (!q) return { error: "Empty query." };
    const words = q.split(/\s+/);
    const matches = model
      .leaders()
      .filter((id) => model.isWithin(id, scope))
      .filter((id) => {
        const p = model.people[id];
        const text = `${p.name} ${p.title} ${model.orgName(id)}`.toLowerCase();
        return words.every((w) => text.includes(w));
      })
      .slice(0, 8)
      .map((id) => describe(model, id));
    return { matches };
  }

  if (!inScope(input.leader_id)) return outOfScope;
  const id = input.leader_id;

  if (name === "org_summary") {
    const metrics = Object.fromEntries(
      METRICS.map((m) => {
        const rate = m.key === "voluntary" || m.key === "involuntary";
        return [
          m.key,
          {
            label: m.label,
            latest: round(model.value(id, m.key)),
            a_year_ago: round(model.value(id, m.key, model.last - 12)),
            ...(rate ? { last_12_months_total: round(model.trailingYear(id, m.key)) } : {}),
          },
        ];
      }),
    );
    return {
      ...describe(model, id),
      as_of: monthLabel(model.months[model.last]),
      metrics,
      sub_organizations: model.reports[id]
        .filter((r) => model.reports[r].length)
        .map((r) => describe(model, r))
        .sort((a, b) => b.headcount - a.headcount),
    };
  }

  if (!isMetric(input.metric)) return { error: `Unknown metric. Use one of: ${metricKeys.join(", ")}.` };
  const key = input.metric;
  const series = model.seriesFor(id)![key];

  if (name === "metric_history") {
    return {
      ...describe(model, id),
      metric: key,
      values: model.months
        .map((month, i) => ({ month, value: round(series[i]) }))
        .filter((row) => row.value !== null),
    };
  }

  if (name === "compare_sub_orgs") {
    return {
      ...describe(model, id),
      metric: key,
      as_of: monthLabel(model.months[model.last]),
      sub_organizations: model.reports[id]
        .filter((r) => model.reports[r].length)
        .map((r) => ({ ...describe(model, r), value: round(model.value(r, key)) }))
        .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)),
    };
  }

  if (name === "detected_changes") {
    const analysis = analyseSeries(series, ANALYSIS_MODEL[key]);
    return {
      ...describe(model, id),
      metric: key,
      changes: analysis.findings.map((f) => ({
        month: model.months[f.month],
        kind: f.kind === "spike" ? "one-month spike" : isStep(f) ? "lasting step" : "change of trend",
        before: round(f.before),
        after: round(f.after),
        ...(f.slopeBefore !== undefined
          ? { change_per_month_before: round(f.slopeBefore, 3), change_per_month_after: round(f.slopeAfter!, 3) }
          : {}),
        biggest_movers: drivers(model, id, key, f).map((d) => ({
          organization: d.org,
          leader: d.name,
          headcount: d.headcount,
          before: round(d.before),
          after: round(d.after),
        })),
      })),
    };
  }

  return { error: `Unknown tool: ${name}` };
}
