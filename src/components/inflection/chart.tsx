"use client";

import { scaleLinear, scaleLog, scaleUtc } from "d3-scale";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  confidenceColor,
  formatPercent,
  formatValue,
} from "@/lib/inflection/format";
import type { Confidence, Point, ShiftEvent } from "@/lib/inflection/types";
import type { Fit } from "@/lib/segmentation";

/** What the box shows when the pointer rests on a shift's numbered circle. */
export type ShiftDetail = {
  /** Average after the shift against the average before, in percent. */
  percent: number | null;
  headline: string;
  /** How firmly the news ties a cause to the shift, in words. */
  confidence?: string;
  /** The same, as a level: it sets the colour of the shift's circle. */
  level?: Confidence;
  summary?: string;
  /** What the model measured, when the headline is about the news instead. */
  note?: string;
};

type Props = {
  points: Point[];
  z: number[];
  fits: Fit[];
  cps: number[];
  events: ShiftEvent[];
  log: boolean;
  unit: string;
  selected: number | null;
  onSelect: (index: number | null) => void;
  /** Chart height in pixels. Defaults to 300 on narrow screens and 420 otherwise. */
  height?: number;
  /** One entry per shift, shown when its numbered circle is hovered or focused. */
  details?: ShiftDetail[];
};

const dateLabel = (t: number) =>
  new Date(t).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export function InflectionChart({
  points,
  z,
  fits,
  cps,
  events,
  log,
  unit,
  selected,
  onSelect,
  height,
  details,
}: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(960);
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<number | null>(null);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setW(Math.max(280, Math.round(entry.contentRect.width))),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const narrow = W < 560;
  const H = height ?? (narrow ? 300 : 420);
  const M = {
    top: 40,
    right: narrow ? 12 : 20,
    bottom: 30,
    left: narrow ? 44 : 58,
  };

  const scales = useMemo(() => {
    const lo = Math.min(...z);
    const hi = Math.max(...z);
    const pad = (hi - lo || 1) * 0.06;
    const x = scaleUtc()
      .domain([points[0][0], points[points.length - 1][0]])
      .range([M.left, W - M.right]);
    const y = scaleLinear()
      .domain([lo - pad, hi + pad])
      .range([H - M.bottom, M.top]);

    // Axis ticks are chosen in the series' own units, then placed in model space.
    let yTicks: { at: number; label: string }[];
    if (log) {
      let ticks = scaleLog()
        .domain([Math.exp(lo - pad), Math.exp(hi + pad)])
        .ticks(5);
      const stride = Math.ceil(ticks.length / 6);
      ticks = ticks.filter((_, i) => i % stride === 0);
      yTicks = ticks.map((v) => ({
        at: y(Math.log(v)),
        label: formatValue(v, unit),
      }));
    } else {
      yTicks = y
        .ticks(5)
        .map((v) => ({ at: y(v), label: formatValue(v, unit) }));
    }
    const fmt = x.tickFormat();
    const xTicks = x
      .ticks(narrow ? 4 : 8)
      .map((d) => ({ at: x(d), label: fmt(d) }));
    return { x, y, xTicks, yTicks };
  }, [points, z, log, unit, W, H, narrow, M.left, M.right, M.top, M.bottom]);

  const { x, y, xTicks, yTicks } = scales;

  const line = useMemo(
    () =>
      points
        .map(
          (p, i) =>
            `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(z[i]).toFixed(1)}`,
        )
        .join(""),
    [points, z, x, y],
  );

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const t = x.invert(e.clientX - box.left).getTime();
    // Binary search for the nearest observation.
    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (points[mid][0] < t) lo = mid;
      else hi = mid;
    }
    setHover(t - points[lo][0] < points[hi][0] - t ? lo : hi);
  };

  const band = selected !== null ? events[selected] : null;

  return (
    <div ref={frame} className="relative">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full touch-pan-y select-none"
        role="img"
        aria-label={`Line chart with ${cps.length} detected shifts marked by numbered vertical lines.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {/* Grid and axes */}
        {yTicks.map((t) => (
          <g key={`y-${t.label}`}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={t.at}
              y2={t.at}
              stroke="var(--line)"
              strokeWidth={1}
            />
            <text
              x={M.left - 8}
              y={t.at + 3.5}
              textAnchor="end"
              fontSize={10.5}
              fontFamily="var(--font-mono)"
              fill="var(--muted)"
            >
              {t.label}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={`x-${t.label}-${t.at}`}
            x={t.at}
            y={H - 9}
            textAnchor="middle"
            fontSize={10.5}
            fontFamily="var(--font-mono)"
            fill="var(--muted)"
          >
            {t.label}
          </text>
        ))}

        {/* News search window of the selected shift */}
        {band && (
          <rect
            x={x(Date.parse(band.windowStart))}
            y={M.top}
            width={Math.max(
              3,
              x(Date.parse(band.windowEnd)) - x(Date.parse(band.windowStart)),
            )}
            height={H - M.top - M.bottom}
            fill={confidenceColor(details?.[selected ?? -1]?.level)}
            opacity={0.14}
          />
        )}

        {/* Series */}
        <path
          d={line}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={1.3}
          strokeLinejoin="round"
          opacity={0.8}
        />

        {/* Fitted segments */}
        {fits.map((f) => (
          <line
            key={`fit-${f.start}-${f.end}`}
            x1={x(points[f.start][0])}
            x2={x(points[f.end - 1][0])}
            y1={y(f.intercept)}
            y2={y(f.intercept + f.slope * (f.end - 1 - f.start))}
            stroke="var(--accent)"
            strokeWidth={2.25}
            strokeLinecap="round"
          />
        ))}

        {/* Hover marker */}
        {hover !== null && (
          <g pointerEvents="none">
            <line
              x1={x(points[hover][0])}
              x2={x(points[hover][0])}
              y1={M.top}
              y2={H - M.bottom}
              stroke="var(--faint)"
              strokeWidth={1}
            />
            <circle
              cx={x(points[hover][0])}
              cy={y(z[hover])}
              r={4}
              fill="var(--surface)"
              stroke="var(--ink)"
              strokeWidth={1.5}
            />
          </g>
        )}

        {/* Change points */}
        {cps.map((c, i) => {
          const active = selected === i;
          const color = confidenceColor(details?.[i]?.level);
          return (
            <g
              key={c}
              transform={`translate(${x(points[c][0])},0)`}
              role="button"
              tabIndex={0}
              aria-label={`Shift ${i + 1}, ${dateLabel(points[c][0])}`}
              aria-pressed={active}
              className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-[var(--ink)]"
              onClick={() => onSelect(active ? null : i)}
              onFocus={() => setTip(i)}
              onBlur={() => setTip(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(active ? null : i);
                }
              }}
            >
              <rect
                x={-12}
                y={0}
                width={24}
                height={H - M.bottom}
                fill="transparent"
              />
              <line
                y1={M.top - 8}
                y2={H - M.bottom}
                stroke={color}
                strokeWidth={active ? 2 : 1.25}
                strokeDasharray={active ? undefined : "3 4"}
              />
              <circle
                cy={M.top - 20}
                r={active ? 12 : 10}
                fill={active ? color : "var(--surface)"}
                stroke={color}
                strokeWidth={1.5}
              />
              <text
                y={M.top - 16}
                textAnchor="middle"
                fontSize={11}
                fontFamily="var(--font-mono)"
                fontWeight={500}
                fill={active ? "var(--surface)" : color}
              >
                {i + 1}
              </text>
              {/* Hovering the circle itself, not the whole line, opens the details. */}
              <circle
                cy={M.top - 20}
                r={15}
                fill="transparent"
                onPointerEnter={() => setTip(i)}
                onPointerLeave={() => setTip(null)}
              />
            </g>
          );
        })}
      </svg>

      {tip !== null && details?.[tip] && cps[tip] !== undefined && (
        <div
          className="pointer-events-none absolute z-20 w-72 max-w-[calc(100%-1rem)] rounded-xl border border-line bg-surface p-3.5 shadow-lg"
          style={{
            top: M.top - 2,
            ...(x(points[cps[tip]][0]) > W / 2
              ? { right: Math.max(8, W - x(points[cps[tip]][0]) - 16) }
              : { left: Math.max(8, x(points[cps[tip]][0]) - 16) }),
          }}
        >
          <p className="flex items-baseline justify-between gap-3 font-mono text-[0.7rem] text-muted">
            <span>
              {tip + 1} · {dateLabel(points[cps[tip]][0])}
            </span>
            {details[tip].percent !== null && (
              <span
                className={
                  details[tip].percent! >= 0 ? "text-accent" : "text-alert"
                }
              >
                {details[tip].percent! >= 0 ? "▲" : "▼"}{" "}
                {formatPercent(details[tip].percent!)}
              </span>
            )}
          </p>
          <p className="mt-1.5 font-serif text-[1.05rem] leading-snug tracking-tight text-ink">
            {details[tip].headline}
          </p>
          {details[tip].confidence && (
            <p
              className="mt-1 font-mono text-[0.65rem]"
              style={{ color: confidenceColor(details[tip].level) }}
            >
              {details[tip].confidence}
            </p>
          )}
          {details[tip].summary && (
            <p className="mt-2 line-clamp-6 text-[0.8rem] leading-relaxed text-ink/90">
              {details[tip].summary}
            </p>
          )}
          {details[tip].note && (
            <p className="mt-2 text-[0.75rem] leading-snug text-muted">
              {details[tip].note}
            </p>
          )}
          <p className="mt-2 font-mono text-[0.62rem] text-faint">
            Click the circle for sources
          </p>
        </div>
      )}

      {hover !== null && tip === null && (
        <div
          className="pointer-events-none absolute top-11 z-10 rounded-md border border-line bg-paper px-2.5 py-1.5 font-mono text-[0.7rem] whitespace-nowrap text-ink shadow-sm"
          style={
            x(points[hover][0]) > W / 2
              ? { right: W - x(points[hover][0]) + 10 }
              : { left: x(points[hover][0]) + 10 }
          }
        >
          <span className="text-muted">{dateLabel(points[hover][0])}</span>
          <span className="ml-2">{formatValue(points[hover][1], unit)}</span>
        </div>
      )}
    </div>
  );
}
