"use client";

import { hierarchy, tree } from "d3-hierarchy";
import { useMemo, useState } from "react";
import type { OrgModel } from "@/lib/org/model";

type Props = {
  model: OrgModel;
  root: number;
  /** Make a manager's organization the one the whole page looks at. */
  onFocus: (id: number) => void;
};

type Item = { id: number; children: Item[] };

const CARD_W = 228;
const CARD_H = 40;
const ROW = 48;
const COL = 268;

const clip = (text: string, chars: number) =>
  text.length > chars ? `${text.slice(0, chars - 1)}…` : text;

export function OrgChart({ model, root, onFocus }: Props) {
  const [open, setOpen] = useState<Set<number>>(() => new Set([root]));

  const layout = useMemo(() => {
    const build = (id: number): Item => ({
      id,
      children: open.has(id)
        ? [...model.reports[id]]
            .sort(
              (a, b) =>
                model.orgSize(b) - model.orgSize(a) ||
                model.people[a].name.localeCompare(model.people[b].name),
            )
            .map(build)
        : [],
    });
    const h = tree<Item>().nodeSize([ROW, COL])(hierarchy(build(root)));
    const nodes = h.descendants();
    const top = Math.min(...nodes.map((d) => d.x));
    const bottom = Math.max(...nodes.map((d) => d.x));
    const right = Math.max(...nodes.map((d) => d.y));
    return { nodes, links: h.links(), top, height: bottom - top + ROW, width: right + CARD_W + 2 };
  }, [model, root, open]);

  const toggle = (id: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Fixed span scale so colours mean the same thing wherever you are in the tree.
  const spanShade = (span: number) =>
    `color-mix(in oklab, var(--accent) ${Math.round(14 + Math.min(1, Math.max(0, (span - 2) / 10)) * 86)}%, var(--surface))`;

  return (
    <div>
      <div className="max-h-[600px] overflow-auto rounded-xl border border-line bg-paper p-4">
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 ${layout.top - ROW / 2} ${layout.width} ${layout.height}`}
          className="block select-none"
          role="tree"
          aria-label="Org chart. Select a manager to show or hide their direct reports."
        >
          {layout.links.map((l) => {
            const x1 = l.source.y + CARD_W;
            const mid = x1 + (COL - CARD_W) / 2;
            return (
              <path
                key={`${l.source.data.id}-${l.target.data.id}`}
                d={`M${x1},${l.source.x}H${mid}V${l.target.x}H${l.target.y}`}
                fill="none"
                stroke="var(--line)"
              />
            );
          })}
          {layout.nodes.map((d) => {
            const p = model.people[d.data.id];
            const reports = model.reports[p.id].length;
            const expanded = open.has(p.id);
            return (
              <g key={p.id} transform={`translate(${d.y},${d.x - CARD_H / 2})`}>
                <g
                  role="treeitem"
                  aria-expanded={reports ? expanded : undefined}
                  aria-label={`${p.name}, ${p.title}${reports ? `, ${reports} direct reports, organization of ${model.orgSize(p.id)}` : ""}`}
                  tabIndex={reports ? 0 : -1}
                  style={{ cursor: reports ? "pointer" : "default" }}
                  className="outline-none [&:focus-visible>rect]:stroke-[var(--ink)]"
                  onClick={() => reports && toggle(p.id)}
                  onKeyDown={(e) => {
                    if (reports && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      toggle(p.id);
                    }
                  }}
                >
                  <title>{`${p.name} · ${p.title} · ${model.locations[p.loc]}`}</title>
                  <rect width={CARD_W} height={CARD_H} rx={7} fill="var(--surface)" stroke={expanded ? "var(--ink)" : "var(--line)"} />
                  <rect width={5} height={CARD_H - 12} x={6} y={6} rx={2.5} fill={reports ? spanShade(reports) : "var(--line)"} />
                  <text x={18} y={17} fontSize={12.5} fontWeight={500} fill="var(--ink)">
                    {clip(p.name, 20)}
                  </text>
                  <text x={18} y={31} fontSize={10} fill="var(--muted)">
                    {clip(`${p.title} · ${model.locations[p.loc]}`, reports ? 30 : 38)}
                  </text>
                  {reports > 0 && (
                    <text x={CARD_W - (d.depth > 0 ? 34 : 10)} y={17} textAnchor="end" fontSize={10} fontFamily="var(--font-mono)" fill="var(--muted)">
                      {model.orgSize(p.id).toLocaleString("en-US")} {expanded ? "▾" : "▸"}
                    </text>
                  )}
                </g>
                {reports > 0 && d.depth > 0 && (
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${model.orgName(p.id)} in the dashboard`}
                    style={{ cursor: "pointer" }}
                    className="outline-none [&:focus-visible>rect]:stroke-[var(--ink)] [&:hover>rect]:fill-[var(--accent-soft)]"
                    onClick={() => onFocus(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onFocus(p.id);
                      }
                    }}
                  >
                    <title>View this organization in the dashboard</title>
                    <rect x={CARD_W - 28} y={6} width={22} height={CARD_H - 12} rx={5} fill="transparent" stroke="var(--line)" />
                    <text x={CARD_W - 17} y={25} textAnchor="middle" fontSize={13} fill="var(--accent)">
                      ↗
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-3 text-xs text-muted">
        Select a manager to show their direct reports. The arrow opens that organization in the
        dashboard above. The coloured bar shows how many direct reports a manager has (darker is
        more).
      </p>
    </div>
  );
}
