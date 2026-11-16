import { noiseSigma, pelt, segments } from "@/lib/changepoint";
import { makeSeries } from "@/lib/series";
import type { Project } from "@/content/projects";

/** Small illustration for each project, drawn from real computation where possible. */
export function ProjectArt({ slug }: { slug: Project["slug"] }) {
  return slug === "inflection" ? <InflectionArt /> : <OrgArt />;
}

function InflectionArt() {
  const W = 480;
  const H = 220;
  const y = makeSeries(4, 150);
  const sigma = noiseSigma(y);
  const cps = pelt(y, 5 * sigma * sigma * Math.log(y.length), 6);
  const segs = segments(y, cps);
  const lo = Math.min(...y);
  const hi = Math.max(...y);
  const x = (i: number) => 24 + (i / (y.length - 1)) * (W - 48);
  const yy = (v: number) => H - 30 - ((v - lo) / (hi - lo)) * (H - 80);
  const d = y
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${yy(v).toFixed(1)}`)
    .join("");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--ink)" strokeWidth={1.2} opacity={0.75} />
      {segs.map((s) => (
        <line
          key={s.start}
          x1={x(s.start)}
          x2={x(s.end - 1)}
          y1={yy(s.mean)}
          y2={yy(s.mean)}
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
      {cps.map((c) => (
        <g key={c} transform={`translate(${x(c)},0)`}>
          <line y1={34} y2={H - 22} stroke="var(--signal)" strokeDasharray="3 4" />
          <rect x={-22} y={14} width={44} height={16} rx={8} fill="var(--signal)" />
          <rect x={-15} y={20.5} width={30} height={3} rx={1.5} fill="var(--surface)" opacity={0.9} />
        </g>
      ))}
    </svg>
  );
}

function OrgArt() {
  const W = 480;
  const H = 220;
  // A small three-level org: one leader, four managers, uneven spans.
  const spans = [3, 5, 2, 4];
  const total = spans.reduce((a, b) => a + b, 0);
  const leafGap = (W - 60) / (total - 1);
  const root = { x: W / 2, y: 34 };
  let cursor = 0;
  const managers = spans.map((n) => {
    const first = 30 + cursor * leafGap;
    const last = 30 + (cursor + n - 1) * leafGap;
    const leaves = Array.from({ length: n }, (_, i) => 30 + (cursor + i) * leafGap);
    cursor += n;
    return { x: (first + last) / 2, y: 110, leaves };
  });
  const elbow = (x1: number, y1: number, x2: number, y2: number) => {
    const mid = (y1 + y2) / 2;
    return `M${x1},${y1}V${mid}H${x2}V${y2}`;
  };
  const highlight = 1; // the widest span

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden="true">
      {managers.map((m, i) => (
        <g key={i}>
          <path
            d={elbow(root.x, root.y, m.x, m.y)}
            fill="none"
            stroke={i === highlight ? "var(--accent)" : "var(--line)"}
            strokeWidth={i === highlight ? 1.75 : 1.25}
          />
          {m.leaves.map((lx) => (
            <path
              key={lx}
              d={elbow(m.x, m.y, lx, 184)}
              fill="none"
              stroke={i === highlight ? "var(--accent)" : "var(--line)"}
              strokeWidth={i === highlight ? 1.75 : 1.25}
            />
          ))}
        </g>
      ))}
      {managers.map((m, i) => (
        <g key={`n-${i}`}>
          {m.leaves.map((lx) => (
            <circle
              key={lx}
              cx={lx}
              cy={186}
              r={6.5}
              fill={i === highlight ? "var(--accent)" : "var(--surface)"}
              stroke={i === highlight ? "var(--accent)" : "var(--faint)"}
              strokeWidth={1.25}
            />
          ))}
          <rect
            x={m.x - 17}
            y={m.y - 10}
            width={34}
            height={20}
            rx={10}
            fill={i === highlight ? "var(--accent)" : "var(--surface)"}
            stroke={i === highlight ? "var(--accent)" : "var(--faint)"}
            strokeWidth={1.25}
          />
          <text
            x={m.x}
            y={m.y + 4}
            textAnchor="middle"
            fontSize={10.5}
            fontFamily="var(--font-mono)"
            fill={i === highlight ? "var(--surface)" : "var(--muted)"}
          >
            {m.leaves.length}
          </text>
        </g>
      ))}
      <rect x={root.x - 22} y={root.y - 12} width={44} height={24} rx={12} fill="var(--ink)" />
      <text
        x={root.x}
        y={root.y + 4}
        textAnchor="middle"
        fontSize={10.5}
        fontFamily="var(--font-mono)"
        fill="var(--paper)"
      >
        {total + spans.length}
      </text>
    </svg>
  );
}
