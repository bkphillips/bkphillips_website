"use client";

import { useState } from "react";
import type { Analysis } from "@/lib/org/insights";
import { formatMetric, monthLabel, type MetricKey, type OrgModel } from "@/lib/org/model";
import { useWidth } from "@/lib/use-width";

/** Tiny trend line for a KPI card, with a dot at each detected change. */
export function Sparkline({ values, analysis }: { values: ArrayLike<number>; analysis: Analysis }) {
  const W = 200;
  const H = 40;
  const pts: [number, number][] = [];
  for (let i = 0; i < values.length; i++) if (!Number.isNaN(values[i])) pts.push([i, values[i]]);
  if (pts.length < 2) return <svg viewBox={`0 0 ${W} ${H}`} className="block h-10 w-full" />;
  const lo = Math.min(...pts.map((p) => p[1]));
  const hi = Math.max(...pts.map((p) => p[1]));
  const x = (i: number) => 3 + (i / (values.length - 1)) * (W - 6);
  const y = (v: number) => H - 5 - ((v - lo) / (hi - lo || 1)) * (H - 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-10 w-full" aria-hidden="true">
      <path
        d={pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("")}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.4}
        opacity={0.75}
        vectorEffect="non-scaling-stroke"
      />
      {analysis.findings.map((f) => (
        <line
          key={`${f.kind}-${f.month}`}
          x1={x(f.month)}
          x2={x(f.month)}
          y1={2}
          y2={H - 2}
          stroke="var(--signal)"
          strokeWidth={1.5}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

type Props = {
  model: OrgModel;
  metric: MetricKey;
  values: ArrayLike<number>;
  analysis: Analysis;
  showPlanted: boolean;
};

export function MetricChart({ model, metric, values, analysis, showPlanted }: Props) {
  const [frame, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const narrow = W < 560;
  const H = narrow ? 260 : 340;
  const M = { top: 38, right: 16, bottom: 28, left: narrow ? 40 : 52 };
  const n = values.length;

  const finite: number[] = [];
  for (let i = 0; i < n; i++) if (!Number.isNaN(values[i])) finite.push(values[i]);
  let lo = Math.min(...finite, ...analysis.fitted);
  let hi = Math.max(...finite, ...analysis.fitted);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.1;
  lo = lo >= 0 && lo - pad < 0 ? 0 : lo - pad;
  hi += pad;

  const x = (i: number) => M.left + (i / (n - 1)) * (W - M.left - M.right);
  const y = (v: number) => H - M.bottom - ((v - lo) / (hi - lo)) * (H - M.top - M.bottom);

  let line = "";
  let pen = false;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(values[i])) {
      pen = false;
      continue;
    }
    line += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(values[i]).toFixed(1)}`;
    pen = true;
  }
  const fit = analysis.fitted
    .map((v, j) => {
      const i = analysis.start + j;
      // Break the fitted line at each shift so steps show as steps.
      const jump = analysis.findings.some((f) => f.kind === "shift" && f.month === i);
      return `${j === 0 || jump ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    })
    .join("");

  const yTicks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const xTicks = model.months.map((m, i) => ({ i, m })).filter(({ i }) => i % (narrow ? 12 : 6) === 2);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left - M.left) / (W - M.left - M.right)) * (n - 1));
    setHover(i >= 0 && i < n && !Number.isNaN(values[i]) ? i : null);
  };

  return (
    <div ref={frame} className="relative">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full touch-pan-y select-none"
        role="img"
        aria-label={`Monthly values with ${analysis.findings.length} detected changes marked.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={M.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fontFamily="var(--font-mono)" fill="var(--muted)">
              {formatMetric(metric, t).replace(/ (days\/wk|yrs)$/, "")}
            </text>
          </g>
        ))}
        {xTicks.map(({ i, m }) => (
          <text key={m} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10.5} fontFamily="var(--font-mono)" fill="var(--muted)">
            {monthLabel(m)}
          </text>
        ))}

        {showPlanted &&
          model.events.map((e) => (
            <g key={e.label} transform={`translate(${x(e.month)},0)`}>
              <line y1={M.top} y2={H - M.bottom} stroke="var(--faint)" strokeWidth={1} />
              <text
                x={e.month > n * 0.7 ? -5 : 5}
                y={H - M.bottom - 6}
                textAnchor={e.month > n * 0.7 ? "end" : "start"}
                fontSize={10}
                fontFamily="var(--font-mono)"
                fill="var(--muted)"
              >
                {e.label}
              </text>
            </g>
          ))}

        <path d={line} fill="none" stroke="var(--ink)" strokeWidth={1.4} strokeLinejoin="round" opacity={0.8} />
        <path d={fit} fill="none" stroke="var(--accent)" strokeWidth={2.25} strokeLinecap="round" />

        {analysis.findings.map((f, i) => (
          <g key={`${f.kind}-${f.month}`} transform={`translate(${x(f.month)},0)`}>
            {f.kind === "shift" ? (
              <line y1={M.top - 8} y2={H - M.bottom} stroke="var(--signal)" strokeWidth={1.25} strokeDasharray="3 4" />
            ) : (
              <>
                <line y1={M.top - 8} y2={y(f.after) - 8} stroke="var(--signal)" strokeWidth={1.25} strokeDasharray="3 4" />
                <circle cy={y(f.after)} r={6} fill="none" stroke="var(--signal)" strokeWidth={1.75} />
              </>
            )}
            <circle cy={M.top - 20} r={10} fill="var(--surface)" stroke="var(--signal)" strokeWidth={1.5} />
            <text y={M.top - 16} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono)" fontWeight={500} fill="var(--signal)">
              {i + 1}
            </text>
          </g>
        ))}

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={H - M.bottom} stroke="var(--faint)" />
            <circle cx={x(hover)} cy={y(values[hover])} r={4} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.5} />
          </g>
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-10 z-10 rounded-md border border-line bg-paper px-2.5 py-1.5 font-mono text-[0.7rem] whitespace-nowrap text-ink shadow-sm"
          style={x(hover) > W / 2 ? { right: W - x(hover) + 10 } : { left: x(hover) + 10 }}
        >
          <span className="text-muted">{monthLabel(model.months[hover])}</span>
          <span className="ml-2">{formatMetric(metric, values[hover])}</span>
        </div>
      )}
    </div>
  );
}
