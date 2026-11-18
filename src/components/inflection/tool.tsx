"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { InflectionChart } from "@/components/inflection/chart";
import { analyse, describeShifts, prepare } from "@/lib/inflection/analyze";
import {
  confidenceColor,
  describeShift,
  describeStretch,
  formatDate,
  formatPercent,
  formatRate,
  formatValue,
  shiftPercent,
} from "@/lib/inflection/format";
import { presets } from "@/lib/inflection/presets";
import type {
  Confidence,
  ExplainResponse,
  Explanation,
  SavedExplanations,
  SeriesData,
  ShiftEvent,
  SourceId,
} from "@/lib/inflection/types";
import type { Model } from "@/lib/segmentation";
import { useWidth } from "@/lib/use-width";

type Selection = { source: SourceId; id: string };

/** How firmly the reporting ties a cause to a shift, as shown beside its date. */
const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "Cause reported",
  medium: "Likely cause",
  low: "No clear cause",
};
type Loaded =
  | { key: string; data: SeriesData; error?: undefined }
  | { key: string; data?: undefined; error: string };

const keyOf = (s: Selection) => `${s.source}:${s.id}`;
const RANGES = [1, 2, 5, 10];
const DAY = 86_400_000;

/** The collapsed line for a shift: what moved, in a few characters. */
function shortChange(e: ShiftEvent, unit: string) {
  if (
    e.model === "trend" &&
    e.rateBefore !== undefined &&
    e.rateAfter !== undefined
  ) {
    return `${formatRate(e.rateBefore, e.log, unit)} → ${formatRate(e.rateAfter, e.log, unit)} a yr`;
  }
  return `${formatValue(e.before, unit)} → ${formatValue(e.after, unit)}`;
}

/** Tracks the window's height, so the chart can be sized to keep the tool on one screen. */
function useViewportHeight() {
  const [height, setHeight] = useState(820);
  useEffect(() => {
    const read = () => setHeight(window.innerHeight);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return height;
}

function Segmented<T extends string | number>({
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
    <div className="flex items-center gap-2.5">
      <span className="text-sm text-muted">{label}</span>
      <div
        className="flex rounded-full border border-line p-0.5"
        role="group"
        aria-label={label}
      >
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
              o.value === value
                ? "bg-ink text-paper"
                : "text-muted hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function InflectionTool() {
  const first = presets[0];
  const [selection, setSelection] = useState<Selection>({
    source: first.source,
    id: first.id,
  });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [years, setYears] = useState(first.years);
  const [model, setModel] = useState<Model>(first.model);
  const [log, setLog] = useState(first.log);
  const [shifts, setShifts] = useState(first.shifts);
  const [selected, setSelected] = useState<number | null>(null);
  /** Whether the overall summary is open. It closes when a shift is opened. */
  const [storyOpen, setStoryOpen] = useState(false);

  const [customSource, setCustomSource] = useState<SourceId>("yahoo");
  const [customText, setCustomText] = useState("");

  const [saved, setSaved] = useState<SavedExplanations | null>(null);
  const [explained, setExplained] = useState<Record<string, Explanation>>({});
  const [overview, setOverview] = useState<{
    key: string;
    text: string;
  } | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [explainError, setExplainError] = useState<{
    code: string;
    text: string;
  } | null>(null);

  const [layout, layoutWidth] = useWidth<HTMLDivElement>(1056);
  const viewport = useViewportHeight();
  const list = useRef<HTMLOListElement>(null);
  // Side by side from 900px: the chart is then sized so that the series
  // picker, the chart and the list of shifts fit in one window.
  const wide = layoutWidth >= 900;
  const chartHeight = wide
    ? Math.min(440, Math.max(240, viewport - 507))
    : undefined;

  const key = keyOf(selection);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      source: selection.source,
      id: selection.id,
    });
    fetch(`/api/series?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok)
          throw new Error(body.error ?? "Could not load that series.");
        setLoaded({ key, data: body as SeriesData });
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setLoaded({ key, error: err.message });
      });
    return () => controller.abort();
  }, [selection, key]);

  // Explanations prepared ahead of time for the example series. If the file
  // is missing the tool still works; shifts are then explained on request.
  useEffect(() => {
    let live = true;
    fetch("/data/inflection-saved.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: SavedExplanations | null) => live && body && setSaved(body))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const current = loaded?.key === key ? loaded : null;
  const data = current?.data;

  const prepared = useMemo(
    () => (data ? prepare(data.points, years, log) : null),
    [data, years, log],
  );
  const segmentation = useMemo(
    () =>
      prepared && prepared.z.length >= 20 ? analyse(prepared.z, model) : null,
    [prepared, model],
  );

  const maxShifts = segmentation ? segmentation.changePoints.length - 1 : 0;
  const k = Math.min(shifts, maxShifts);
  const result = useMemo(() => {
    if (!prepared || !segmentation) return null;
    const cps = segmentation.changePoints[k] ?? [];
    return {
      cps,
      ...describeShifts(prepared.points, prepared.z, cps, model, log),
    };
  }, [prepared, segmentation, k, model, log]);

  // A saved explanation applies when the series is one of the examples at the
  // settings it was prepared with. The series are live, so a shift found today
  // can sit a few days from where it was when the news was searched: match
  // each one to the nearest saved date within its own search window.
  const savedMatch = useMemo(() => {
    const mine = saved?.series[key];
    const out = new Map<string, Explanation>();
    if (!mine || !result) return out;
    if (
      mine.years !== years ||
      mine.model !== model ||
      mine.log !== log ||
      mine.shifts !== k
    )
      return out;
    for (const e of result.events) {
      const at = Date.parse(e.date);
      const reach = Math.max(
        10 * DAY,
        (Date.parse(e.windowEnd) - Date.parse(e.windowStart)) / 2,
      );
      let best: Explanation | null = null;
      let gap = reach;
      for (const x of mine.explanations) {
        const d = Math.abs(Date.parse(x.date) - at);
        if (d <= gap) {
          gap = d;
          best = x;
        }
      }
      if (best) out.set(e.date, best);
    }
    return out;
  }, [saved, key, result, years, model, log, k]);

  const explained$ = (e: ShiftEvent) =>
    explained[`${key}:${e.date}:${e.model}`] ?? savedMatch.get(e.date);
  const fitShare =
    segmentation && segmentation.totalSS > 0
      ? Math.round((1 - segmentation.cost[k] / segmentation.totalSS) * 100)
      : null;
  const overviewKey = result
    ? `${key}:${model}:${result.events.map((e) => e.date).join(",")}`
    : "";
  const allSaved =
    !!result &&
    result.events.length > 0 &&
    result.events.every((e) => savedMatch.has(e.date));
  const overviewText =
    overview?.key === overviewKey
      ? overview.text
      : allSaved
        ? (saved?.series[key]?.overview ?? null)
        : null;
  const allExplained = !!result && result.events.every((e) => explained$(e));
  const anyExplained =
    !!result && result.events.some((e) => explained$(e)?.confidence);

  // Keep the open shift in view inside the list when it is chosen on the chart.
  useEffect(() => {
    if (selected === null) return;
    list.current
      ?.querySelector(`[data-shift="${selected}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  const choose = (next: Selection, defaults?: (typeof presets)[number]) => {
    setSelection(next);
    setSelected(null);
    setExplainError(null);
    if (defaults) {
      setYears(defaults.years);
      setModel(defaults.model);
      setLog(defaults.log);
      setShifts(defaults.shifts);
    }
  };

  const explain = async (events: ShiftEvent[], withOverview: boolean) => {
    const dates = events.map((e) => e.date);
    setPending((p) => [...p, ...dates]);
    setExplainError(null);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: selection.source,
          id: selection.id,
          events,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setExplainError({
          code: body.code ?? "error",
          text: body.error ?? "Something went wrong.",
        });
        return;
      }
      const out = body as ExplainResponse;
      setExplained((prev) => {
        const next = { ...prev };
        for (const x of out.explanations) next[`${key}:${x.date}:${model}`] = x;
        return next;
      });
      if (withOverview && out.overview)
        setOverview({ key: overviewKey, text: out.overview });
    } catch {
      setExplainError({ code: "network", text: "Could not reach the server." });
    } finally {
      setPending((p) => p.filter((d) => !dates.includes(d)));
    }
  };

  const busy = pending.length > 0;

  return (
    <div>
      {/* Series picker */}
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = selection.source === p.source && selection.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() => choose({ source: p.source, id: p.id }, p)}
              className={`rounded-full border px-3.5 py-1.5 text-left text-sm transition-colors ${
                active
                  ? "border-ink bg-ink text-paper"
                  : "border-line text-ink hover:border-ink/50"
              }`}
            >
              {p.name}
              <span
                className={`ml-2 text-xs ${active ? "text-paper/70" : "text-muted"}`}
              >
                {p.blurb}
              </span>
            </button>
          );
        })}
      </div>

      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const id = customText.trim();
          if (!id) return;
          choose({
            source: customSource,
            id: customSource === "yahoo" ? id.toUpperCase() : id,
          });
          // Every series starts on level shifts; trend changes are one click away.
          setModel("level");
          setLog(true);
          setYears(5);
          setShifts(5);
        }}
      >
        <span className="text-sm text-muted">Or try your own:</span>
        <select
          value={customSource}
          onChange={(e) => setCustomSource(e.target.value as SourceId)}
          aria-label="Type of series"
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink"
        >
          <option value="yahoo">Stock ticker</option>
          <option value="wikipedia">Wikipedia article</option>
        </select>
        <input
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          placeholder={
            customSource === "yahoo" ? "e.g. AAPL" : "e.g. Taylor Swift"
          }
          aria-label={
            customSource === "yahoo" ? "Ticker symbol" : "Article title"
          }
          maxLength={120}
          className="w-44 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink placeholder:text-faint"
        />
        <button
          type="submit"
          className="rounded-full border border-line px-3.5 py-1.5 text-sm text-ink transition-colors hover:border-ink"
        >
          Load
        </button>
      </form>

      {/* Chart on the left, the list of shifts on the right. */}
      <div
        ref={layout}
        className={`mt-5 grid gap-5 ${wide ? "grid-cols-[minmax(0,1fr)_23.5rem]" : ""}`}
      >
        <figure className="min-w-0 rounded-2xl border border-line bg-surface">
          <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line px-5 py-3 sm:px-6">
            <span className="font-serif text-[1.25rem] tracking-tight">
              {data?.label ??
                (current?.error ? "Series not available" : "Loading…")}
            </span>
            {data && result && (
              <span className="font-mono text-xs text-muted">
                <span className="text-signal">{result.cps.length}</span>{" "}
                {result.cps.length === 1 ? "shift" : "shifts"}
                {fitShare !== null && (
                  <> · fit explains {fitShare}% of the variation</>
                )}
              </span>
            )}
          </figcaption>

          <div
            className="px-1 sm:px-2"
            style={{ minHeight: chartHeight ?? 300 }}
          >
            {current?.error ? (
              <p className="px-5 py-16 text-center text-muted">
                {current.error}
              </p>
            ) : !data || !prepared || !result ? (
              <p className="px-5 py-16 text-center text-muted">
                {data
                  ? "Not enough data in this range to analyse."
                  : "Loading data…"}
              </p>
            ) : (
              <InflectionChart
                points={prepared.points}
                z={prepared.z}
                fits={result.fits}
                cps={result.cps}
                events={result.events}
                log={log}
                unit={data.unit}
                selected={selected}
                onSelect={setSelected}
                height={chartHeight}
                details={result.events.map((e) => {
                  const x = explained$(e);
                  return {
                    percent: shiftPercent(e),
                    headline: x?.headline ?? describeShift(e, data.unit),
                    confidence: x?.confidence && CONFIDENCE_LABEL[x.confidence],
                    level: x?.confidence,
                    summary: x?.summary || undefined,
                    note: x ? describeShift(e, data.unit) : undefined,
                  };
                })}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 border-t border-line px-5 py-3 sm:px-6">
            <label className="flex items-center gap-3 text-sm text-muted">
              <span>Shifts</span>
              <input
                type="range"
                className="slider w-28 sm:w-32"
                min={0}
                max={Math.max(maxShifts, 1)}
                value={k}
                onChange={(e) => {
                  setShifts(Number(e.target.value));
                  setSelected(null);
                }}
              />
              <span className="w-4 font-mono text-xs text-ink">{k}</span>
            </label>
            <Segmented
              label="Look for"
              value={model}
              onChange={(v) => {
                setModel(v);
                setSelected(null);
              }}
              options={[
                { value: "level", label: "Level shifts" },
                { value: "trend", label: "Trend changes" },
              ]}
            />
            <Segmented
              label="Range"
              value={years}
              onChange={(v) => {
                setYears(v);
                setSelected(null);
              }}
              options={RANGES.map((y) => ({ value: y, label: `${y}Y` }))}
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={log}
                onChange={(e) => {
                  setLog(e.target.checked);
                  setSelected(null);
                }}
                className="size-3.5 accent-[var(--ink)]"
              />
              Log scale
            </label>
          </div>
        </figure>

        {/* On a wide screen the list takes the chart's height and scrolls inside it. */}
        <aside className={wide ? "relative" : ""}>
          <div
            className={`flex flex-col rounded-2xl border border-line bg-surface ${wide ? "absolute inset-0" : ""}`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
              <p className="font-serif text-[1.25rem] tracking-tight whitespace-nowrap">
                What changed
              </p>
              {data && result && result.events.length > 0 && !allExplained && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => explain(result.events, true)}
                  className="rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
                >
                  {busy ? "Searching the news…" : "Explain these shifts"}
                </button>
              )}
              {anyExplained && (
                <span
                  className="flex items-center gap-x-2.5 font-mono text-[0.6rem] whitespace-nowrap text-muted"
                  aria-label="Colour key: cause reported, likely cause, no clear cause"
                >
                  {(
                    [
                      ["high", "Reported"],
                      ["medium", "Likely"],
                      ["low", "No cause"],
                    ] as const
                  ).map(([level, label]) => (
                    <span
                      key={level}
                      className="flex items-center gap-1"
                      title={CONFIDENCE_LABEL[level]}
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: confidenceColor(level) }}
                      />
                      {label}
                    </span>
                  ))}
                </span>
              )}
            </div>

            {explainError && (
              <p className="border-b border-line px-5 py-3 text-sm text-muted">
                {explainError.code === "not_configured"
                  ? "Explanations are switched off: this copy of the site has no news or AI key yet. The shifts are still computed live."
                  : explainError.text}
              </p>
            )}

            {!data || !result ? (
              <p className="px-5 py-8 text-sm text-muted">
                {current?.error ? "No shifts to show." : "Finding the shifts…"}
              </p>
            ) : result.events.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted">
                No shifts at this setting. Move the Shifts slider to look for
                some.
              </p>
            ) : (
              <ol
                ref={list}
                className="min-h-0 flex-1 divide-y divide-line overflow-y-auto"
              >
                {overviewText && (
                  <li>
                    <button
                      type="button"
                      aria-expanded={storyOpen}
                      onClick={() => {
                        setStoryOpen(!storyOpen);
                        setSelected(null);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-5 py-1.5 text-left"
                    >
                      <span className="text-sm">The story in brief</span>
                      <span
                        aria-hidden="true"
                        className="font-mono text-xs text-faint"
                      >
                        {storyOpen ? "−" : "+"}
                      </span>
                    </button>
                    {storyOpen && (
                      <p className="px-5 pb-4 font-serif text-[1.05rem] leading-[1.45] tracking-tight text-ink">
                        {overviewText}
                      </p>
                    )}
                  </li>
                )}
                {result.events.map((e, i) => {
                  const x = explained$(e);
                  const waiting = pending.includes(e.date);
                  const open = selected === i;
                  const pct = shiftPercent(e);
                  return (
                    <li
                      key={e.date}
                      data-shift={i}
                      className={open ? "bg-accent-soft/40" : ""}
                    >
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => {
                          setSelected(open ? null : i);
                          setStoryOpen(false);
                        }}
                        className="flex w-full items-center gap-3 px-5 py-1.5 text-left"
                      >
                        {/* The same colour as this shift's circle on the chart. */}
                        <span
                          className={`grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[0.7rem] ${
                            open ? "text-surface" : ""
                          }`}
                          style={{
                            borderColor: confidenceColor(x?.confidence),
                            ...(open
                              ? {
                                  backgroundColor: confidenceColor(
                                    x?.confidence,
                                  ),
                                }
                              : { color: confidenceColor(x?.confidence) }),
                          }}
                        >
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-xs text-ink">
                            {formatDate(e.date)}
                          </span>
                          <span className="block truncate font-mono text-[0.65rem] text-faint">
                            {shortChange(e, data.unit)}
                          </span>
                        </span>
                        {pct !== null && (
                          <span
                            className={`shrink-0 font-mono text-sm ${pct >= 0 ? "text-accent" : "text-alert"}`}
                            title="Average after this shift against the average before it"
                          >
                            {pct >= 0 ? "▲" : "▼"} {formatPercent(pct)}
                          </span>
                        )}
                        <span
                          aria-hidden="true"
                          className="w-3 shrink-0 font-mono text-xs text-faint"
                        >
                          {open ? "−" : "+"}
                        </span>
                      </button>

                      {open && (
                        <div className="animate-[fade_0.3s_ease_both] px-5 pb-5">
                          <h3 className="font-serif text-[1.2rem] leading-snug tracking-tight">
                            {x?.headline ?? describeShift(e, data.unit)}
                          </h3>
                          {x?.confidence && (
                            <span
                              className="mt-2 inline-block rounded-full border px-2 py-0.5 font-mono text-[0.65rem]"
                              style={{
                                borderColor: confidenceColor(x.confidence),
                                color: confidenceColor(x.confidence),
                              }}
                            >
                              {CONFIDENCE_LABEL[x.confidence]}
                            </span>
                          )}
                          {x?.summary && (
                            <p className="mt-2.5 text-[0.92rem] leading-relaxed text-ink/90">
                              {x.summary}
                            </p>
                          )}
                          <p className="mt-3 text-sm text-muted">
                            {x && <>{describeShift(e, data.unit)}. </>}
                            {pct !== null && (
                              <>
                                On average the series was {formatPercent(pct)}{" "}
                                after this point compared with before.
                              </>
                            )}
                          </p>
                          {/* What the series did on each side of the shift. */}
                          {e.prior && e.next && (
                            <p className="mt-2 font-mono text-[0.66rem] leading-relaxed text-faint">
                              Before, {describeStretch(e, e.prior, data.unit)}
                              <br />
                              After, {describeStretch(e, e.next, data.unit)}
                            </p>
                          )}
                          {x && x.sources.length > 0 && (
                            <ul className="mt-3 space-y-1.5 text-sm">
                              {x.sources.map((s) => (
                                <li key={s.url}>
                                  <a
                                    className="link text-muted"
                                    href={s.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {s.title}
                                  </a>
                                  {(s.source || s.date) && (
                                    <span className="ml-2 font-mono text-[0.66rem] whitespace-nowrap text-faint">
                                      {[s.source, s.date && formatDate(s.date)]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </span>
                                  )}
                                  {s.also ? (
                                    <span
                                      className="ml-2 font-mono text-[0.66rem] whitespace-nowrap text-accent"
                                      title="Other articles the search found about the same event"
                                    >
                                      +{s.also} on this story
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}
                          {x?.found ? (
                            <p className="mt-2.5 font-mono text-[0.64rem] text-faint">
                              Chosen from {x.found} articles published around
                              this date.
                            </p>
                          ) : null}
                          {!x && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => explain([e], false)}
                              className="link mt-3 text-sm text-muted disabled:opacity-50"
                            >
                              {waiting
                                ? `Searching news from ${formatDate(e.windowStart)} to ${formatDate(e.windowEnd)}…`
                                : "Explain this shift"}
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </aside>
      </div>

      <p className="mt-3 max-w-[110ch] text-xs leading-relaxed text-faint">
        {data && (
          <>
            Data:{" "}
            <a
              className="link"
              href={data.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {data.sourceName}
            </a>
            {data.unit && <> · {data.unit}</>}
            {prepared && data.points.length > prepared.points.length && (
              <> · averaged into {prepared.points.length} points for analysis</>
            )}
            .{" "}
          </>
        )}
        {allSaved && saved && (
          <>News and summaries saved {formatDate(saved.asOf)}. </>
        )}
        The percentage beside each shift compares the series&rsquo; average
        after it with the average before. Articles are matched by keyword and
        date through NewsAPI.ai, and summaries are written by an AI model; both
        can be wrong. A shift that lines up with an event is not proof the event
        caused it. Nothing here is investment advice.
      </p>
    </div>
  );
}
