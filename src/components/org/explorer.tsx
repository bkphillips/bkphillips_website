"use client";

import { useEffect, useMemo, useState } from "react";
import { Assistant } from "@/components/org/assistant";
import { HierarchyView } from "@/components/org/hierarchy-views";
import { MetricChart, Sparkline } from "@/components/org/metric-chart";
import { OrgChart } from "@/components/org/org-chart";
import { buildGroups, type Grouping, type Shade } from "@/lib/org/hierarchy";
import { ANALYSIS_MODEL, analyseSeries, drivers, isStep, type Finding } from "@/lib/org/insights";
import {
  formatMetric,
  METRICS,
  metricDef,
  monthLabel,
  OrgModel,
  type MetricKey,
  type RawOrg,
} from "@/lib/org/model";

type View = "sunburst" | "treemap" | "chart";
const RATES: MetricKey[] = ["voluntary", "involuntary"];

function Tabs<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-full border border-line p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
            o.value === value ? "bg-ink text-paper" : "text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function signed(value: number, digits: number, unit: string) {
  const text = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${text}${unit}`;
}

function describeFinding(key: MetricKey, f: Finding): string {
  const def = metricDef(key);
  if (f.kind === "spike") {
    return `${f.after > f.before ? "Spiked" : "Dipped"} to ${formatMetric(key, f.after)} against a typical ${formatMetric(key, f.before)}`;
  }
  if (isStep(f)) {
    return `Stepped ${f.after > f.before ? "up" : "down"} from ${formatMetric(key, f.before)} to ${formatMetric(key, f.after)}`;
  }
  return `Trend changed from ${signed(f.slopeBefore!, def.digits + 1, def.unit)} to ${signed(f.slopeAfter!, def.digits + 1, def.unit)} a month`;
}

export function OrgExplorer() {
  const [model, setModel] = useState<OrgModel | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [metric, setMetric] = useState<MetricKey>("span");
  const [showPlanted, setShowPlanted] = useState(false);
  const [view, setView] = useState<View>("sunburst");
  const [grouping, setGrouping] = useState<Grouping>("department");
  const [shade, setShade] = useState<Shade>("span");
  const [drill, setDrill] = useState<{ key: string; id: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/org/data")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then((raw: RawOrg) => live && setModel(new OrgModel(raw)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const leader = picked ?? model?.ceo ?? 0;

  const analyses = useMemo(() => {
    const series = model?.seriesFor(leader);
    if (!model || !series) return null;
    return Object.fromEntries(
      METRICS.map((m) => [m.key, analyseSeries(series[m.key], ANALYSIS_MODEL[m.key])]),
    ) as Record<MetricKey, ReturnType<typeof analyseSeries>>;
  }, [model, leader]);

  const groups = useMemo(
    () => (model ? buildGroups(model, leader, grouping) : null),
    [model, leader, grouping],
  );

  const options = useMemo(() => {
    if (!model) return null;
    const functions = model.reports[model.ceo].filter((id) => model.reports[id].length);
    return {
      functions,
      teams: functions.flatMap((f) => model.reports[f].filter((id) => model.reports[id].length)),
    };
  }, [model]);

  if (failed) {
    return (
      <p className="rounded-2xl border border-line bg-surface px-6 py-16 text-center text-muted">
        The company data could not be loaded. Reload the page to try again.
      </p>
    );
  }
  if (!model || !analyses || !groups || !options) {
    return (
      <p className="rounded-2xl border border-line bg-surface px-6 py-16 text-center text-muted">
        Loading the company…
      </p>
    );
  }

  const series = model.seriesFor(leader)!;
  const person = model.people[leader];
  const trail = model.path(leader);
  const listed = leader === model.ceo || options.functions.includes(leader) || options.teams.includes(leader);
  const def = metricDef(metric);
  const analysis = analyses[metric];
  const drillKey = `${leader}:${grouping}`;
  const drillId = drill?.key === drillKey ? drill.id : groups.id;
  const focus = (id: number) => {
    setPicked(id);
    window.scrollTo({ top: document.getElementById("org-top")?.offsetTop ?? 0, behavior: "smooth" });
  };

  const kpi = (key: MetricKey) => {
    const rate = RATES.includes(key);
    const now = rate ? model.trailingYear(leader, key) : model.value(leader, key);
    const then = rate
      ? model.trailingYear(leader, key, model.last - 12)
      : model.value(leader, key, model.last - 12);
    const d = metricDef(key);
    return {
      now,
      delta: Number.isFinite(now - then) ? signed(now - then, d.digits, d.unit === "%" ? " pts" : "") : null,
      note: rate ? "last 12 months" : null,
    };
  };

  return (
    <div id="org-top" className="scroll-mt-24">
      {/* Which organization */}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <nav className="flex flex-wrap items-center gap-x-1.5 text-sm" aria-label="Reporting line">
            {trail.map((id, i) => (
              <span key={id} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-faint">/</span>}
                {i < trail.length - 1 ? (
                  <button type="button" className="link text-muted" onClick={() => setPicked(id)}>
                    {model.orgName(id)}
                  </button>
                ) : (
                  <span className="text-muted">{model.orgName(id)}</span>
                )}
              </span>
            ))}
          </nav>
          <h2 className="display mt-3 text-[clamp(1.8rem,4vw,2.6rem)]">{model.orgName(leader)}</h2>
          <p className="mt-2 text-sm text-muted">
            Led by {person.name}, {person.title} · {model.orgSize(leader).toLocaleString("en-US")} people ·
            data through {monthLabel(model.months[model.last], true)}
          </p>
        </div>
        <label className="flex items-center gap-2.5 text-sm text-muted">
          Organization
          <select
            value={leader}
            onChange={(e) => setPicked(Number(e.target.value))}
            className="max-w-[16rem] rounded-full border border-line bg-surface px-3.5 py-2 text-sm text-ink"
          >
            <option value={model.ceo}>{model.company} (whole company)</option>
            {!listed && <option value={leader}>{model.orgName(leader)}</option>}
            <optgroup label="Functions">
              {options.functions.map((id) => (
                <option key={id} value={id}>
                  {model.orgName(id)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Teams">
              {options.teams.map((id) => (
                <option key={id} value={id}>
                  {model.orgName(id)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {METRICS.map((m) => {
          const k = kpi(m.key);
          const active = m.key === metric;
          const found = analyses[m.key].findings.length;
          return (
            <button
              key={m.key}
              type="button"
              aria-pressed={active}
              onClick={() => setMetric(m.key)}
              className={`rounded-2xl border bg-surface p-4 text-left transition-colors sm:p-5 ${
                active ? "border-ink" : "border-line hover:border-ink/40"
              }`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-[0.8rem] leading-tight text-muted">{m.label}</span>
                {found > 0 && (
                  <span className="rounded-full border border-signal px-1.5 font-mono text-[0.65rem] text-signal">
                    {found}
                  </span>
                )}
              </span>
              <span className="mt-2 block font-serif text-[1.75rem] leading-none tracking-tight text-ink sm:text-[2rem]">
                {formatMetric(m.key, k.now)}
              </span>
              <span className="mt-1.5 block font-mono text-[0.68rem] text-muted">
                {k.delta ? `${k.delta} vs a year ago` : " "}
                {k.note && <span className="text-faint"> · {k.note}</span>}
              </span>
              <span className="mt-3 block">
                <Sparkline values={series[m.key]} analysis={analyses[m.key]} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected metric */}
      <figure className="mt-6 rounded-2xl border border-line bg-surface">
        <figcaption className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line px-5 py-3.5 sm:px-6">
          <span>
            <span className="font-serif text-[1.25rem] tracking-tight">{def.label}</span>
            <span className="ml-3 text-sm text-muted">{def.description}</span>
          </span>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showPlanted}
              onChange={(e) => setShowPlanted(e.target.checked)}
              className="size-3.5 accent-[var(--ink)]"
            />
            Show planted events
          </label>
        </figcaption>
        <div className="px-1 pt-2 sm:px-2">
          <MetricChart
            model={model}
            metric={metric}
            values={series[metric]}
            analysis={analysis}
            showPlanted={showPlanted}
          />
        </div>
        <div className="border-t border-line px-5 py-5 sm:px-6">
          {analysis.findings.length === 0 ? (
            <p className="text-sm text-muted">
              No lasting shifts or one-month spikes detected in this metric for this organization.
            </p>
          ) : (
            <ol className="space-y-5">
              {analysis.findings.map((f, i) => {
                const movers = drivers(model, leader, metric, f);
                const planted = model.events.find((e) => Math.abs(e.month - f.month) <= 1);
                return (
                  <li key={`${f.kind}-${f.month}`} className="grid grid-cols-[2.25rem_1fr]">
                    <span className="mt-0.5 grid size-6 place-items-center rounded-full border border-signal font-mono text-[0.7rem] text-signal">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-mono text-xs text-muted">
                        {monthLabel(model.months[f.month], true)} ·{" "}
                        {f.kind === "spike" ? "one-month anomaly" : "lasting shift"}
                      </p>
                      <p className="mt-1 font-serif text-[1.2rem] leading-snug tracking-tight">
                        {describeFinding(metric, f)}
                      </p>
                      {movers.length > 0 && (
                        <p className="mt-1.5 text-sm leading-relaxed text-muted">
                          Biggest movers:{" "}
                          {movers.map((d, j) => (
                            <span key={d.leaderId}>
                              {j > 0 && "; "}
                              <button type="button" className="link text-ink" onClick={() => focus(d.leaderId)}>
                                {d.org}
                              </button>{" "}
                              ({formatMetric(metric, d.before)} → {formatMetric(metric, d.after)})
                            </span>
                          ))}
                        </p>
                      )}
                      {showPlanted && planted && (
                        <p className="mt-1.5 text-sm text-accent">
                          Matches the planted event: {planted.label}. {planted.detail}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </figure>
      <p className="mt-3 max-w-[80ch] text-sm leading-relaxed text-muted">
        The green line is the model&rsquo;s fit. Numbered markers are what it found: lasting shifts
        from change point detection, and one-month anomalies from a rolling-median filter. Tick
        &ldquo;Show planted events&rdquo; to compare against the events written into the data.
      </p>

      {/* Structure */}
      <section className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Structure</p>
            <h2 className="display mt-3 text-[clamp(1.6rem,3.2vw,2.2rem)]">
              How {model.orgName(leader)} is built
            </h2>
          </div>
          <Tabs
            label="Visualization"
            value={view}
            onChange={setView}
            options={[
              { value: "sunburst", label: "Sunburst" },
              { value: "treemap", label: "Treemap" },
              { value: "chart", label: "Org chart" },
            ]}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
          {view === "chart" ? (
            <OrgChart key={leader} model={model} root={leader} onFocus={focus} />
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
                <label className="flex items-center gap-2.5 text-sm text-muted">
                  Group by
                  <select
                    value={grouping}
                    onChange={(e) => setGrouping(e.target.value as Grouping)}
                    className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm text-ink"
                  >
                    <option value="department">Department</option>
                    <option value="location">Location</option>
                  </select>
                </label>
                <label className="flex items-center gap-2.5 text-sm text-muted">
                  Shade by
                  <select
                    value={shade}
                    onChange={(e) => setShade(e.target.value as Shade)}
                    className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm text-ink"
                  >
                    <option value="span">Span of control</option>
                    <option value="tenure">Average tenure</option>
                  </select>
                </label>
              </div>
              <HierarchyView
                root={groups}
                drillId={drillId}
                onDrill={(id) => setDrill({ key: drillKey, id })}
                shade={shade}
                view={view}
              />
            </>
          )}
        </div>
      </section>

      {/* Assistant */}
      <section className="mt-14">
        <p className="eyebrow">Assistant</p>
        <h2 className="display mt-3 text-[clamp(1.6rem,3.2vw,2.2rem)]">Ask about this organization</h2>
        <div className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <Assistant key={leader} scope={leader} orgName={model.orgName(leader)} />
        </div>
      </section>
    </div>
  );
}
