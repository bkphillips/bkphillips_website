"use client";

import { hierarchy, partition, treemap, type HierarchyRectangularNode } from "d3-hierarchy";
import { arc } from "d3-shape";
import { useMemo, useState } from "react";
import { findGroup, groupPath, type GroupNode, type Shade } from "@/lib/org/hierarchy";
import { useWidth } from "@/lib/use-width";

type Node = HierarchyRectangularNode<GroupNode>;

type Props = {
  root: GroupNode;
  drillId: string;
  onDrill: (id: string) => void;
  shade: Shade;
  view: "sunburst" | "treemap";
};

const SHADE_LABEL: Record<Shade, string> = {
  span: "Span of control (direct reports per manager)",
  tenure: "Average tenure (years)",
};

/** Theme-aware sequential colour: from the surface colour toward the accent. */
const fill = (t: number) =>
  `color-mix(in oklab, var(--accent) ${Math.round(8 + t * 92)}%, var(--surface))`;
const textOn = (t: number | null) => (t !== null && t > 0.55 ? "var(--surface)" : "var(--ink)");

const clip = (text: string, chars: number) =>
  chars < 3 ? "" : text.length > chars ? `${text.slice(0, Math.max(1, chars - 1))}…` : text;

function prune(node: GroupNode, levels: number): GroupNode {
  return {
    ...node,
    children: levels > 0 ? node.children?.map((c) => prune(c, levels - 1)) : undefined,
  };
}

export function HierarchyView({ root, drillId, onDrill, shade, view }: Props) {
  const [frame, W] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<{ node: GroupNode; x: number; y: number } | null>(null);

  const current = findGroup(root, drillId) ?? root;
  const trail = groupPath(root, current.id);
  const parent = trail.length > 1 ? trail[trail.length - 2] : null;

  const size = Math.min(W, 600);
  const H = view === "sunburst" ? size : W < 560 ? 420 : 500;

  const nodes = useMemo(() => {
    const h = hierarchy(prune(current, view === "sunburst" ? 3 : 2))
      .sum((d) => (d.children?.length ? 0 : d.value))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    if (view === "sunburst") {
      return partition<GroupNode>().size([2 * Math.PI, size / 2])(h).descendants();
    }
    return treemap<GroupNode>()
      .size([W, H])
      .paddingOuter((d) => (d.depth === 0 ? 0 : 3))
      .paddingTop((d) => (d.depth === 1 ? 22 : 0))
      .paddingInner((d) => (d.depth === 0 ? 8 : 2))
      .round(true)(h)
      .descendants();
  }, [current, view, size, W, H]);

  // Colour scale over what is on screen, clamped to the 5th-95th percentile
  // so one unusual team does not wash out the rest.
  const scale = useMemo(() => {
    const values = nodes
      .filter((d) => d.depth > 0)
      .map((d) => d.data[shade])
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    if (!values.length) return { lo: 0, hi: 1, of: () => null as number | null };
    const lo = values[Math.floor(values.length * 0.05)];
    const hi = values[Math.min(values.length - 1, Math.floor(values.length * 0.95))];
    return {
      lo,
      hi,
      of: (v: number | null) =>
        v === null ? null : hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5,
    };
  }, [nodes, shade]);

  const colour = (d: Node) => {
    const t = scale.of(d.data[shade]);
    return t === null ? "var(--line)" : fill(t);
  };

  const hoverProps = (d: Node) => ({
    onPointerMove: (e: React.PointerEvent) => {
      const box = frame.current?.getBoundingClientRect();
      if (box) setTip({ node: d.data, x: e.clientX - box.left, y: e.clientY - box.top });
    },
    onPointerLeave: () => setTip(null),
  });

  /** Clicking drills into a group; a leaf drills into its parent group instead. */
  const target = (d: Node) =>
    d.data.children?.length ? d.data.id : d.depth > 1 && d.parent ? d.parent.data.id : null;
  const drillProps = (d: Node) => {
    const id = target(d);
    if (!id || id === current.id) return {};
    return {
      role: "button" as const,
      tabIndex: 0,
      "aria-label": `Open ${d.data.name}, ${d.data.value.toLocaleString("en-US")} people`,
      style: { cursor: "pointer" },
      onClick: () => {
        setTip(null);
        onDrill(id);
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onDrill(id);
        }
      },
    };
  };

  const arcPath = arc<Node>()
    .startAngle((d) => d.x0)
    .endAngle((d) => d.x1)
    .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.006))
    .padRadius(size / 4)
    .innerRadius((d) => d.y0 + 1)
    .outerRadius((d) => d.y1 - 1);

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm" aria-label="Drill-down path">
        {trail.map((g, i) => (
          <span key={g.id} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-faint">/</span>}
            {i < trail.length - 1 ? (
              <button type="button" className="link text-muted" onClick={() => onDrill(g.id)}>
                {g.name}
              </button>
            ) : (
              <span className="text-ink">
                {g.name} <span className="font-mono text-xs text-muted">{g.value.toLocaleString("en-US")}</span>
              </span>
            )}
          </span>
        ))}
      </nav>

      <div ref={frame} className="relative mt-4">
        {view === "sunburst" ? (
          <svg
            width={size}
            height={size}
            viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
            className="mx-auto block max-w-full select-none"
            role="img"
            aria-label={`Sunburst of ${current.name}: ring segments sized by headcount.`}
          >
            {(nodes as Node[])
              .filter((d) => d.depth > 0)
              .map((d) => {
                const angle = (((d.x0 + d.x1) / 2) * 180) / Math.PI;
                const mid = (d.y0 + d.y1) / 2;
                const room = (d.x1 - d.x0) * mid > 13;
                const label = room ? clip(d.data.name, Math.floor((d.y1 - d.y0 - 10) / 6.1)) : "";
                return (
                  <g key={d.data.id} {...drillProps(d)} {...hoverProps(d)} className="outline-none [&:focus-visible>path]:stroke-[var(--ink)]">
                    <path d={arcPath(d) ?? ""} fill={colour(d)} stroke="var(--surface)" strokeWidth={0.5} />
                    {label && (
                      <text
                        transform={`rotate(${angle - 90}) translate(${mid},0) rotate(${angle < 180 ? 0 : 180})`}
                        textAnchor="middle"
                        dy="0.35em"
                        fontSize={10.5}
                        fill={textOn(scale.of(d.data[shade]))}
                        pointerEvents="none"
                      >
                        {label}
                      </text>
                    )}
                  </g>
                );
              })}
            {/* Centre: the current group; click to go up a level. */}
            <g
              {...(parent
                ? {
                    role: "button" as const,
                    tabIndex: 0,
                    "aria-label": `Back up to ${parent.name}`,
                    style: { cursor: "pointer" },
                    onClick: () => onDrill(parent.id),
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onDrill(parent.id);
                      }
                    },
                  }
                : {})}
              className="outline-none [&:focus-visible>circle]:stroke-[var(--ink)]"
            >
              <circle r={(nodes[0] as Node).y1 - 3} fill="var(--paper)" stroke="var(--line)" />
              <text textAnchor="middle" y={-8} fontFamily="var(--font-serif)" fontSize={size < 420 ? 14 : 17} fill="var(--ink)">
                {clip(current.name, size < 420 ? 14 : 20)}
              </text>
              <text textAnchor="middle" y={12} fontFamily="var(--font-mono)" fontSize={11} fill="var(--muted)">
                {current.value.toLocaleString("en-US")} people
              </text>
              {parent && (
                <text textAnchor="middle" y={30} fontSize={10.5} fill="var(--muted)">
                  ↑ back up
                </text>
              )}
            </g>
          </svg>
        ) : (
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="block w-full select-none"
            role="img"
            aria-label={`Treemap of ${current.name}: rectangles sized by headcount.`}
          >
            {(nodes as Node[])
              .filter((d) => d.depth > 0)
              .map((d) => {
                const w = d.x1 - d.x0;
                const h = d.y1 - d.y0;
                const group = d.depth === 1 && !!d.children;
                const t = scale.of(d.data[shade]);
                return (
                  <g key={d.data.id} transform={`translate(${d.x0},${d.y0})`} {...drillProps(d)} {...hoverProps(d)} className="outline-none [&:focus-visible>rect]:stroke-[var(--ink)]">
                    <rect
                      width={Math.max(0, w)}
                      height={Math.max(0, h)}
                      rx={group ? 6 : 3}
                      fill={group ? "var(--paper)" : colour(d)}
                      stroke={group ? "var(--line)" : "none"}
                    />
                    {group
                      ? w > 44 && (
                          <text x={7} y={15} fontSize={11.5} fontWeight={500} fill="var(--ink)" pointerEvents="none">
                            {clip(d.data.name, Math.floor((w - 50) / 6.3))}
                            <tspan fontFamily="var(--font-mono)" fontSize={10} fill="var(--muted)" dx={6}>
                              {w > 90 ? d.data.value.toLocaleString("en-US") : ""}
                            </tspan>
                          </text>
                        )
                      : w > 46 &&
                        h > 20 && (
                          <text x={6} y={15} fontSize={10.5} fill={textOn(t)} pointerEvents="none">
                            {clip(d.data.name, Math.floor((w - 10) / 5.9))}
                            {h > 36 && (
                              <tspan x={6} dy={13} fontFamily="var(--font-mono)" fontSize={10} opacity={0.85}>
                                {d.data.value.toLocaleString("en-US")}
                              </tspan>
                            )}
                          </text>
                        )}
                  </g>
                );
              })}
          </svg>
        )}

        {tip && (
          <div
            className="pointer-events-none absolute z-10 w-56 rounded-lg border border-line bg-paper px-3 py-2.5 text-xs shadow-sm"
            style={{
              top: Math.max(0, tip.y + 14),
              ...(tip.x > W / 2 ? { right: W - tip.x + 12 } : { left: tip.x + 12 }),
            }}
          >
            <p className="text-sm font-medium text-ink">{tip.node.name}</p>
            {tip.node.detail && <p className="mt-0.5 text-muted">{tip.node.detail}</p>}
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 font-mono text-[0.7rem]">
              <dt className="text-muted">Employees</dt>
              <dd className="text-right text-ink">{tip.node.value.toLocaleString("en-US")}</dd>
              <dt className="text-muted">Span of control</dt>
              <dd className="text-right text-ink">{tip.node.span === null ? "–" : tip.node.span.toFixed(1)}</dd>
              <dt className="text-muted">Average tenure</dt>
              <dd className="text-right text-ink">{tip.node.tenure.toFixed(1)} yrs</dd>
            </dl>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>{SHADE_LABEL[shade]}</span>
        <span className="font-mono">{scale.lo.toFixed(1)}</span>
        <span
          className="h-2.5 w-28 rounded-full border border-line"
          style={{ background: `linear-gradient(to right, ${fill(0)}, ${fill(1)})` }}
        />
        <span className="font-mono">{scale.hi.toFixed(1)}</span>
        <span className="text-faint">Size shows number of employees. Click a segment to drill in.</span>
      </div>
    </div>
  );
}
