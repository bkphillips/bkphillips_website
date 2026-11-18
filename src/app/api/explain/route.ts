import { ExplainError, explainShifts } from "@/lib/inflection/explain";
import { isSourceId, loadSeries, validId } from "@/lib/inflection/sources";
import type { ExplainResponse, ShiftEvent } from "@/lib/inflection/types";

// Web search turns can take a while.
export const maxDuration = 300;

const MAX_EVENTS = 12;
// Limits are counted in shifts, because cost follows shifts: each one is a news
// search (5 tokens for dates older than 30 days) plus its share of a model call.
// Clicking "Explain this shift" six times costs the same as one "Explain these
// shifts" for six, and is limited the same.
const SHIFTS_PER_VISITOR_PER_HOUR = Number(
  process.env.INFLECTION_HOURLY_LIMIT ?? 40,
);
const SHIFTS_PER_DAY = Number(process.env.INFLECTION_DAILY_LIMIT ?? 150);
// No limits on a developer's own machine.
const LIMITED = process.env.NODE_ENV === "production";

// In-memory limits and cache. These reset when the server restarts and are per
// instance on serverless hosts, so they are a first line of defence, not a budget:
// set a spend limit on the API accounts as well.
const visitors = new Map<string, { at: number; shifts: number }[]>();
const day = { key: "", shifts: 0 };
const cache = new Map<string, ExplainResponse>();

function allow(visitor: string, shifts: number): boolean {
  if (!LIMITED) return true;
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  if (day.key !== today) {
    day.key = today;
    day.shifts = 0;
  }
  const recent = (visitors.get(visitor) ?? []).filter(
    (r) => now - r.at < 3_600_000,
  );
  const used = recent.reduce((sum, r) => sum + r.shifts, 0);
  if (
    used + shifts > SHIFTS_PER_VISITOR_PER_HOUR ||
    day.shifts + shifts > SHIFTS_PER_DAY
  ) {
    return false;
  }
  recent.push({ at: now, shifts });
  visitors.set(visitor, recent);
  day.shifts += shifts;
  return true;
}

const isDate = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v));
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** Accept only dates and numbers from the browser; the prompt text is built on the server. */
function parseEvents(input: unknown): ShiftEvent[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_EVENTS)
    return null;
  const events: ShiftEvent[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) return null;
    const e = raw as Record<string, unknown>;
    if (!isDate(e.date) || !isDate(e.windowStart) || !isDate(e.windowEnd))
      return null;
    if (e.model !== "level" && e.model !== "trend") return null;
    if (!isNum(e.before) || !isNum(e.after) || typeof e.log !== "boolean")
      return null;
    const trend = e.model === "trend";
    const stretch = (v: unknown) => {
      if (typeof v !== "object" || v === null) return undefined;
      const s = v as Record<string, unknown>;
      return isDate(s.from) && isDate(s.to) && isNum(s.start) && isNum(s.end)
        ? { from: s.from, to: s.to, start: s.start, end: s.end }
        : undefined;
    };
    const prior = stretch(e.prior);
    const next = stretch(e.next);
    if (trend && (!isNum(e.rateBefore) || !isNum(e.rateAfter))) return null;
    events.push({
      date: e.date,
      windowStart: e.windowStart,
      windowEnd: e.windowEnd,
      model: e.model,
      log: e.log,
      before: e.before,
      after: e.after,
      ...(trend
        ? {
            rateBefore: e.rateBefore as number,
            rateAfter: e.rateAfter as number,
          }
        : {}),
      ...(prior ? { prior } : {}),
      ...(next ? { next } : {}),
    });
  }
  return events;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const source = typeof body.source === "string" ? body.source : "";
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const events = parseEvents(body.events);
  if (!isSourceId(source) || !validId(source, id) || !events) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const key = JSON.stringify([
    source,
    id,
    events.map((e) => [e.date, e.model, e.log]),
  ]);
  const hit = cache.get(key);
  if (hit) return Response.json(hit);

  const visitor =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!allow(visitor, events.length)) {
    return Response.json(
      {
        error:
          "The hourly limit on explanations has been reached. Try again in a while.",
        code: "limited",
      },
      { status: 429 },
    );
  }

  try {
    const series = await loadSeries(source, id);
    if (!series) {
      return Response.json(
        { error: "No data found for that name.", code: "series" },
        { status: 404 },
      );
    }
    const result = await explainShifts(series, events);
    if (cache.size > 300) cache.clear();
    cache.set(key, result);
    return Response.json(result);
  } catch (err) {
    if (err instanceof ExplainError) {
      return Response.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    return Response.json(
      { error: "Could not load the series for this request.", code: "series" },
      { status: 502 },
    );
  }
}
