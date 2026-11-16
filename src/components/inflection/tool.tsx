"use client";

import { useEffect, useMemo, useState } from "react";
import { InflectionChart } from "@/components/inflection/chart";
import { analyse, describeShifts, prepare } from "@/lib/inflection/analyze";
import { describeShift, formatDate } from "@/lib/inflection/format";
import { presets } from "@/lib/inflection/presets";
import type {
  ExplainResponse,
  Explanation,
  SeriesData,
  ShiftEvent,
  SourceId,
} from "@/lib/inflection/types";
import type { Model } from "@/lib/segmentation";

type Selection = { source: SourceId; id: string };
type Loaded =
  | { key: string; data: SeriesData; error?: undefined }
  | { key: string; data?: undefined; error: string };

const keyOf = (s: Selection) => `${s.source}:${s.id}`;
const RANGES = [1, 2, 5, 10];

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
      <div className="flex rounded-full border border-line p-0.5" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
              o.value === value ? "bg-ink text-paper" : "text-muted hover:text-ink"
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
  const [selection, setSelection] = useState<Selection>({ source: first.source, id: first.id });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [years, setYears] = useState(first.years);
  const [model, setModel] = useState<Model>(first.model);
  const [log, setLog] = useState(first.log);
  const [shifts, setShifts] = useState(first.shifts);
  const [selected, setSelected] = useState<number | null>(null);

  const [customSource, setCustomSource] = useState<SourceId>("yahoo");
  const [customText, setCustomText] = useState("");

  const [explained, setExplained] = useState<Record<string, Explanation>>({});
  const [overview, setOverview] = useState<{ key: string; text: string } | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [explainError, setExplainError] = useState<{ code: string; text: string } | null>(null);

  const key = keyOf(selection);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ source: selection.source, id: selection.id });
    fetch(`/api/series?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not load that series.");
        setLoaded({ key, data: body as SeriesData });
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setLoaded({ key, error: err.message });
      });
    return () => controller.abort();
  }, [selection, key]);

  const current = loaded?.key === key ? loaded : null;
  const data = current?.data;

  const prepared = useMemo(
    () => (data ? prepare(data.points, years, log) : null),
    [data, years, log],
  );
  const segmentation = useMemo(
    () => (prepared && prepared.z.length >= 20 ? analyse(prepared.z, model) : null),
    [prepared, model],
  );

  const maxShifts = segmentation ? segmentation.changePoints.length - 1 : 0;
  const k = Math.min(shifts, maxShifts);
  const result = useMemo(() => {
    if (!prepared || !segmentation) return null;
    const cps = segmentation.changePoints[k] ?? [];
    return { cps, ...describeShifts(prepared.points, prepared.z, cps, model, log) };
  }, [prepared, segmentation, k, model, log]);

  const explained$ = (e: ShiftEvent) => explained[`${key}:${e.date}:${e.model}`];
  const fitShare =
    segmentation && segmentation.totalSS > 0
      ? Math.round((1 - segmentation.cost[k] / segmentation.totalSS) * 100)
      : null;
  const overviewKey = result ? `${key}:${model}:${result.events.map((e) => e.date).join(",")}` : "";

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
        body: JSON.stringify({ source: selection.source, id: selection.id, events }),
      });
      const body = await res.json();
      if (!res.ok) {
        setExplainError({ code: body.code ?? "error", text: body.error ?? "Something went wrong." });
        return;
      }
      const out = body as ExplainResponse;
      setExplained((prev) => {
        const next = { ...prev };
        for (const x of out.explanations) next[`${key}:${x.date}:${model}`] = x;
        return next;
      });
      if (withOverview && out.overview) setOverview({ key: overviewKey, text: out.overview });
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
              <span className={`ml-2 text-xs ${active ? "text-paper/70" : "text-muted"}`}>
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
          choose({ source: customSource, id: customSource === "yahoo" ? id.toUpperCase() : id });
          // Sensible starting points: growth trends for prices, level shifts for attention.
          setModel(customSource === "yahoo" ? "trend" : "level");
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
          placeholder={customSource === "yahoo" ? "e.g. AAPL" : "e.g. Taylor Swift"}
          aria-label={customSource === "yahoo" ? "Ticker symbol" : "Article title"}
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

      {/* Chart card */}
      <figure className="mt-6 rounded-2xl border border-line bg-surface">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line px-5 py-3.5 sm:px-6">
          <span className="font-serif text-[1.25rem] tracking-tight">
            {data?.label ?? (current?.error ? "Series not available" : "Loading…")}
          </span>
          {data && result && (
            <span className="font-mono text-xs text-muted">
              <span className="text-signal">{result.cps.length}</span>{" "}
              {result.cps.length === 1 ? "shift" : "shifts"}
              {fitShare !== null && <> · fit explains {fitShare}% of the variation</>}
            </span>
          )}
        </figcaption>

        <div className="min-h-[300px] px-1 sm:min-h-[420px] sm:px-2">
          {current?.error ? (
            <p className="px-5 py-16 text-center text-muted">{current.error}</p>
          ) : !data || !prepared || !result ? (
            <p className="px-5 py-16 text-center text-muted">
              {data ? "Not enough data in this range to analyse." : "Loading data…"}
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
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-line px-5 py-3.5 sm:px-6">
          <label className="flex items-center gap-3 text-sm text-muted">
            <span>Shifts</span>
            <input
              type="range"
              className="slider w-32 sm:w-40"
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
              { value: "trend", label: "Trend changes" },
              { value: "level", label: "Level shifts" },
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

      {data && (
        <p className="mt-3 text-sm text-muted">
          Data:{" "}
          <a className="link" href={data.sourceUrl} target="_blank" rel="noreferrer">
            {data.sourceName}
          </a>
          {data.unit && <> · {data.unit}</>}
          {prepared && data.points.length > prepared.points.length && (
            <> · averaged into {prepared.points.length} points for analysis</>
          )}
        </p>
      )}

      {/* Shifts */}
      {data && result && result.events.length > 0 && (
        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">What changed</p>
              <h2 className="display mt-3 text-[clamp(1.6rem,3.2vw,2.2rem)]">
                {result.events.length} {result.events.length === 1 ? "shift" : "shifts"}, in order
              </h2>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => explain(result.events, true)}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
            >
              {busy ? "Searching the news…" : "Explain these shifts"}
            </button>
          </div>

          {explainError && (
            <p className="mt-5 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
              {explainError.code === "not_configured"
                ? "Explanations are switched off: this copy of the site has no API key yet. The shifts above are still computed live."
                : explainError.text}
            </p>
          )}

          {overview?.key === overviewKey && (
            <p className="mt-6 max-w-[70ch] font-serif text-[1.3rem] leading-[1.5] tracking-tight text-ink">
              {overview.text}
            </p>
          )}

          <ol className="mt-8">
            {result.events.map((e, i) => {
              const x = explained$(e);
              const waiting = pending.includes(e.date);
              const active = selected === i;
              return (
                <li
                  key={e.date}
                  className={`grid grid-cols-[2.75rem_1fr] border-t border-line py-6 last:border-b ${
                    active ? "bg-accent-soft/40" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(active ? null : i)}
                    aria-label={`Highlight shift ${i + 1} on the chart`}
                    aria-pressed={active}
                    className={`mt-0.5 grid size-7 place-items-center rounded-full border border-signal font-mono text-xs ${
                      active ? "bg-signal text-surface" : "text-signal"
                    }`}
                  >
                    {i + 1}
                  </button>
                  <div>
                    <p className="font-mono text-xs text-muted">{formatDate(e.date)}</p>
                    <h3 className="mt-1.5 font-serif text-[1.4rem] leading-snug tracking-tight">
                      {x?.headline ?? describeShift(e, data.unit)}
                    </h3>
                    {x && (
                      <p className="mt-1 text-sm text-muted">{describeShift(e, data.unit)}</p>
                    )}
                    {x ? (
                      <>
                        <p className="mt-3 max-w-[70ch] leading-relaxed text-ink/90">{x.summary}</p>
                        {x.sources.length > 0 && (
                          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                            {x.sources.map((s) => (
                              <li key={s.url}>
                                <a className="link text-muted" href={s.url} target="_blank" rel="noreferrer">
                                  {s.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => explain([e], false)}
                        className="link mt-2 text-sm text-muted disabled:opacity-50"
                      >
                        {waiting
                          ? `Searching news from ${formatDate(e.windowStart)} to ${formatDate(e.windowEnd)}…`
                          : "Explain this shift"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 max-w-[70ch] text-xs leading-relaxed text-faint">
            Explanations are written by an AI model from web search results and can be wrong.
            A shift that lines up with an event is not proof the event caused it. Nothing here
            is investment advice.
          </p>
        </section>
      )}
    </div>
  );
}
