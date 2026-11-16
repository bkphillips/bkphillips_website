"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { noiseSigma, pelt, segments } from "@/lib/changepoint";
import { makeSeries } from "@/lib/series";

const M = { top: 34, right: 10, bottom: 14, left: 10 };

/** Slider position (0-100) to penalty multiplier: more sensitive = lower penalty. */
const penaltyFor = (sensitivity: number) =>
  40 * Math.pow(1.2 / 40, sensitivity / 100);

export function HeroChart() {
  const [seed, setSeed] = useState(11);
  const [sensitivity, setSensitivity] = useState(55);
  const [hover, setHover] = useState<number | null>(null);

  // Draw at the container's real pixel width so marks stay legible on phones.
  const frame = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(960);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setW(Math.max(280, Math.round(entry.contentRect.width))),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const H = W < 560 ? 250 : 330;

  const y = useMemo(() => makeSeries(seed), [seed]);

  const { cps, segs } = useMemo(() => {
    const sigma = noiseSigma(y);
    const penalty =
      penaltyFor(sensitivity) * sigma * sigma * Math.log(y.length);
    const found = pelt(y, penalty, 6);
    return { cps: found, segs: segments(y, found) };
  }, [y, sensitivity]);

  const { x, yPos, line } = useMemo(() => {
    const lo = Math.min(...y);
    const hi = Math.max(...y);
    const pad = (hi - lo) * 0.08;
    const xs = (i: number) =>
      M.left + (i / (y.length - 1)) * (W - M.left - M.right);
    const ys = (v: number) =>
      H -
      M.bottom -
      ((v - lo + pad) / (hi - lo + 2 * pad)) * (H - M.top - M.bottom);
    const d = y
      .map((v, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`)
      .join("");
    return { x: xs, yPos: ys, line: d };
  }, [y, W, H]);

  const hoverSeg =
    hover === null
      ? null
      : segs.findIndex((s) => hover >= s.start && hover < s.end);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(
      ((px - M.left) / (W - M.left - M.right)) * (y.length - 1),
    );
    setHover(Math.max(0, Math.min(y.length - 1, i)));
  };

  return (
    <figure className="rounded-2xl border border-line bg-surface">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line px-5 py-3.5 sm:px-6">
        <span className="eyebrow">
          Fig. 2 · Change point detection, running live
        </span>
        <span className="font-mono text-xs text-muted" aria-live="polite">
          {hover !== null && hoverSeg !== null && hoverSeg >= 0 ? (
            <>
              t = {hover} · value {y[hover].toFixed(2)} · regime {hoverSeg + 1}{" "}
              mean {segs[hoverSeg].mean.toFixed(2)}
            </>
          ) : (
            <>
              <span className="text-signal">{cps.length}</span>{" "}
              {cps.length === 1 ? "shift" : "shifts"} detected in {y.length}{" "}
              points
            </>
          )}
        </span>
      </figcaption>

      <div ref={frame}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-none select-none"
          role="img"
          aria-label={`A synthetic time series with ${cps.length} detected change points, each marked by a vertical line. Horizontal lines show the average of each regime.`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {/* Regime bands */}
          {segs.map((s, i) =>
            i % 2 ? (
              <rect
                key={`band-${s.start}`}
                x={x(s.start)}
                y={M.top - 8}
                width={x(s.end - 1) - x(s.start)}
                height={H - M.top - M.bottom + 16}
                fill="var(--line)"
                opacity={0.28}
              />
            ) : null,
          )}

          {/* Series */}
          <path
            key={seed}
            d={line}
            pathLength={1}
            className="draw"
            fill="none"
            stroke="var(--ink)"
            strokeWidth={1.4}
            strokeLinejoin="round"
            opacity={0.82}
          />

          {/* Regime means */}
          <g key={`means-${seed}`} className="fade-late">
            {segs.map((s) => (
              <line
                key={`mean-${s.start}-${s.end}`}
                x1={x(s.start)}
                x2={x(s.end - 1)}
                y1={yPos(s.mean)}
                y2={yPos(s.mean)}
                stroke="var(--accent)"
                strokeWidth={2.25}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>

          {/* Change points */}
          <g key={`cps-${seed}`} className="fade-late">
            {cps.map((c, i) => (
              <g key={c} transform={`translate(${x(c)},0)`}>
                <line
                  y1={M.top - 6}
                  y2={H - M.bottom + 6}
                  stroke="var(--signal)"
                  strokeWidth={1.25}
                  strokeDasharray="3 4"
                  vectorEffect="non-scaling-stroke"
                />
                <circle cy={M.top - 16} r={10} fill="var(--signal)" />
                <text
                  y={M.top - 12}
                  textAnchor="middle"
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                  fontWeight={500}
                  fill="var(--surface)"
                >
                  {i + 1}
                </text>
              </g>
            ))}
          </g>

          {/* Hover marker */}
          {hover !== null && (
            <g pointerEvents="none">
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={M.top}
                y2={H - M.bottom}
                stroke="var(--faint)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={x(hover)}
                cy={yPos(y[hover])}
                r={4}
                fill="var(--surface)"
                stroke="var(--ink)"
                strokeWidth={1.5}
              />
            </g>
          )}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-line px-5 py-3.5 sm:px-6">
        <label className="flex items-center gap-3 text-sm text-muted">
          <span>Sensitivity</span>
          <input
            type="range"
            className="slider w-36 sm:w-48"
            min={0}
            max={100}
            value={sensitivity}
            onChange={(e) => setSensitivity(Number(e.target.value))}
          />
        </label>
        <div className="flex items-center gap-5">
          <span className="hidden items-center gap-4 font-mono text-[0.7rem] text-muted md:flex">
            <span className="flex items-center gap-1.5">
              <span className="h-[3px] w-4 rounded-full bg-accent" /> regime
              mean
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-signal" /> change point
            </span>
          </span>
          <button
            type="button"
            onClick={() => setSeed((s) => s + 1)}
            className="rounded-full border border-line px-3.5 py-1.5 text-sm text-ink transition-colors hover:border-ink"
          >
            New series
          </button>
        </div>
      </div>
    </figure>
  );
}
