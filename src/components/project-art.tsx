import { noiseSigma, pelt, segments } from "@/lib/changepoint";
import { makeSeries } from "@/lib/series";
import type { Project } from "@/content/projects";

/** Small illustration for each project, drawn from real computation where possible. */
export function ProjectArt({ slug }: { slug: Project["slug"] }) {
  if (slug === "inflection") return <InflectionArt />;
  if (slug === "nightly") return <NightlyArt />;
  return slug === "taste-map" ? <TasteArt /> : <OrgArt />;
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
      <path
        d={d}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.2}
        opacity={0.75}
      />
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
          <line
            y1={34}
            y2={H - 22}
            stroke="var(--signal)"
            strokeDasharray="3 4"
          />
          <rect
            x={-22}
            y={14}
            width={44}
            height={16}
            rx={8}
            fill="var(--signal)"
          />
          <rect
            x={-15}
            y={20.5}
            width={30}
            height={3}
            rx={1.5}
            fill="var(--surface)"
            opacity={0.9}
          />
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
    const leaves = Array.from(
      { length: n },
      (_, i) => 30 + (cursor + i) * leafGap,
    );
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
      <rect
        x={root.x - 22}
        y={root.y - 12}
        width={44}
        height={24}
        rx={12}
        fill="var(--ink)"
      />
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

function NightlyArt() {
  const W = 480;
  const H = 220;
  const cols = 26;
  const rows = 10;
  const size = 15;
  const left = (W - cols * size) / 2;
  // Two price peaks on a small grid, standing in for a city's price surface.
  const bump = (c: number, r: number, cx: number, cy: number, w: number) =>
    Math.exp(-((c - cx) ** 2 + (r - cy) ** 2 * 2.2) / w);
  const squares = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // A deterministic scatter leaves gaps, like blocks with no listings.
      const gap = ((c * 7 + r * 13 + c * r) % 11) / 11;
      const v = Math.min(
        1,
        0.95 * bump(c, r, 8, 4, 26) + 0.7 * bump(c, r, 19, 6, 18),
      );
      if (v < 0.12 + gap * 0.16) continue;
      squares.push({ x: left + c * size, y: 28 + r * size, v });
    }
  }
  const pick = { x: left + 8.5 * size, y: 28 + 4.5 * size };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden="true">
      {squares.map((s) => (
        <rect
          key={`${s.x}-${s.y}`}
          x={s.x + 0.75}
          y={s.y + 0.75}
          width={size - 1.5}
          height={size - 1.5}
          rx={1.5}
          fill="var(--accent)"
          opacity={0.14 + 0.86 * s.v}
        />
      ))}
      <circle
        cx={pick.x}
        cy={pick.y}
        r={11}
        fill="none"
        stroke="var(--surface)"
        strokeWidth={5}
      />
      <circle
        cx={pick.x}
        cy={pick.y}
        r={11}
        fill="none"
        stroke="var(--signal)"
        strokeWidth={2.5}
      />
      <line
        x1={left}
        x2={W - left}
        y1={198}
        y2={198}
        stroke="var(--line)"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <line
        x1={170}
        x2={318}
        y1={198}
        y2={198}
        stroke="var(--accent)"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <circle
        cx={232}
        cy={198}
        r={6}
        fill="var(--ink)"
        stroke="var(--surface)"
        strokeWidth={2}
      />
    </svg>
  );
}

function TasteArt() {
  const W = 480;
  const H = 220;
  // A deterministic scatter of films in loose groups, one group lit up.
  const groups = [
    { x: 110, y: 78, n: 26, spread: 44, lit: false },
    { x: 205, y: 150, n: 30, spread: 50, lit: false },
    { x: 300, y: 84, n: 34, spread: 52, lit: true },
    { x: 392, y: 150, n: 24, spread: 42, lit: false },
  ];
  let seed = 11;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const dots = groups.flatMap((g) =>
    Array.from({ length: g.n }, () => {
      const angle = next() * Math.PI * 2;
      const reach = Math.sqrt(next()) * g.spread;
      return {
        x: g.x + Math.cos(angle) * reach * 1.25,
        y: g.y + Math.sin(angle) * reach * 0.8,
        r: 2 + next() * 3.2,
        lit: g.lit ? 1 - reach / (g.spread * 1.15) : 0,
      };
    }),
  );
  const rated = dots.filter((d) => d.lit > 0.55).slice(0, 3);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden="true">
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x.toFixed(1)}
          cy={d.y.toFixed(1)}
          r={d.r.toFixed(1)}
          fill={d.lit > 0 ? "var(--accent)" : "var(--faint)"}
          opacity={d.lit > 0 ? (0.3 + 0.7 * d.lit).toFixed(2) : 0.35}
        />
      ))}
      {rated.map((d, i) => (
        <circle
          key={i}
          cx={d.x.toFixed(1)}
          cy={d.y.toFixed(1)}
          r={(d.r + 2.5).toFixed(1)}
          fill="var(--signal)"
          stroke="var(--surface)"
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );
}
