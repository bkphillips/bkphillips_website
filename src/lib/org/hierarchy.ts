/**
 * Groupings of the current organization for the sunburst and treemap:
 * by department (the reporting tree) or by location, then function, then team.
 */

import type { OrgModel } from "./model";

export type GroupNode = {
  id: string;
  name: string;
  /** Extra line for tooltips, e.g. the leader of a department. */
  detail?: string;
  /** Number of employees. */
  value: number;
  /** Average direct reports per manager in the group; null if it has no managers. */
  span: number | null;
  /** Average tenure in years. */
  tenure: number;
  children?: GroupNode[];
};

export type Grouping = "department" | "location";
export type Shade = "span" | "tenure";

type Tally = { people: number; managers: number; reports: number; tenureMonths: number };

const empty = (): Tally => ({ people: 0, managers: 0, reports: 0, tenureMonths: 0 });

function add(model: OrgModel, t: Tally, id: number) {
  const direct = model.reports[id].length;
  t.people += 1;
  t.tenureMonths += model.last - model.people[id].hire;
  if (direct) {
    t.managers += 1;
    t.reports += direct;
  }
}

const finish = (t: Tally) => ({
  value: t.people,
  span: t.managers ? t.reports / t.managers : null,
  tenure: t.people ? t.tenureMonths / t.people / 12 : 0,
});

/** Label for a group inside its parent: the team name near the top, the leader's name below that. */
function shortName(model: OrgModel, id: number): string {
  const p = model.people[id];
  const level = model.path(id).length - 1;
  if (level === 1) return model.functions[p.fn];
  if (level === 2 && p.team) return model.teams[p.team];
  return p.name;
}

/** Department view: each manager's organization, labelled by function and team near the top. */
function byDepartment(model: OrgModel, leader: number): GroupNode {
  const build = (id: number, depth: number): { node: GroupNode; tally: Tally } => {
    const p = model.people[id];
    const own = empty();
    add(model, own, id);
    const children: GroupNode[] = [];
    const total = empty();

    for (const kid of model.reports[id]) {
      if (model.reports[kid].length) {
        const sub = build(kid, depth + 1);
        children.push(sub.node);
        total.people += sub.tally.people;
        total.managers += sub.tally.managers;
        total.reports += sub.tally.reports;
        total.tenureMonths += sub.tally.tenureMonths;
      } else {
        add(model, own, kid);
      }
    }
    total.people += own.people;
    total.managers += own.managers;
    total.reports += own.reports;
    total.tenureMonths += own.tenureMonths;

    // The leader and any individual contributors reporting straight to them.
    if (children.length) {
      children.push({
        id: `${id}:direct`,
        name: own.people > 1 ? `${p.name}'s direct team` : p.name,
        detail: p.title,
        ...finish(own),
      });
    }
    return {
      tally: total,
      node: {
        id: String(id),
        name: depth === 0 ? model.orgName(id) : shortName(model, id),
        detail: `${p.name}, ${p.title}`,
        ...finish(total),
        children: children.length ? children : undefined,
      },
    };
  };
  return build(leader, 0).node;
}

/** Location view: office, then function, then team, for everyone under the leader. */
function byLocation(model: OrgModel, leader: number): GroupNode {
  const tallies = new Map<string, Tally>();
  const bump = (key: string, id: number) => {
    let t = tallies.get(key);
    if (!t) tallies.set(key, (t = empty()));
    add(model, t, id);
  };

  const stack = [leader];
  while (stack.length) {
    const id = stack.pop()!;
    const p = model.people[id];
    const fn = p.fn < 0 ? "Executive" : model.functions[p.fn];
    const team = model.teams[p.team] || "Leadership";
    const loc = model.locations[p.loc];
    bump("", id);
    bump(loc, id);
    bump(`${loc}|${fn}`, id);
    bump(`${loc}|${fn}|${team}`, id);
    stack.push(...model.reports[id]);
  }

  const childrenOf = (prefix: string, depth: number): GroupNode[] | undefined => {
    if (depth > 3) return undefined;
    const out: GroupNode[] = [];
    for (const [key, tally] of tallies) {
      if (!key) continue;
      const parts = key.split("|");
      if (parts.length !== depth) continue;
      if (prefix && !key.startsWith(`${prefix}|`)) continue;
      out.push({
        id: `loc:${key}`,
        name: parts[parts.length - 1],
        detail: parts.slice(0, -1).join(" · ") || undefined,
        ...finish(tally),
        children: childrenOf(key, depth + 1),
      });
    }
    return out.length ? out.sort((a, b) => b.value - a.value) : undefined;
  };

  return {
    id: "loc:",
    name: model.orgName(leader),
    detail: "All locations",
    ...finish(tallies.get("")!),
    children: childrenOf("", 1),
  };
}

export function buildGroups(model: OrgModel, leader: number, grouping: Grouping): GroupNode {
  return grouping === "department" ? byDepartment(model, leader) : byLocation(model, leader);
}

export function findGroup(root: GroupNode, id: string): GroupNode | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const hit = findGroup(child, id);
    if (hit) return hit;
  }
  return null;
}

/** Ancestors of a group from the root down to it (inclusive). */
export function groupPath(root: GroupNode, id: string): GroupNode[] {
  if (root.id === id) return [root];
  for (const child of root.children ?? []) {
    const rest = groupPath(child, id);
    if (rest.length) return [root, ...rest];
  }
  return [];
}
