import { ExplainError, explainShifts } from "@/lib/inflection/explain";
import { isSourceId, loadSeries, validId } from "@/lib/inflection/sources";
import type { ExplainResponse, ShiftEvent } from "@/lib/inflection/types";

// Web search turns can take a while.
export const maxDuration = 300;

const MAX_EVENTS = 12;
const PER_VISITOR_PER_HOUR = Number(process.env.INFLECTION_HOURLY_LIMIT ?? 6);
const TOTAL_PER_DAY = Number(process.env.INFLECTION_DAILY_LIMIT ?? 150);

// In-memory limits and cache. These reset when the server restarts and are per
// instance on serverless hosts, so they are a first line of defence, not a budget:
// set a spend limit on the API account as well.
const visitors = new Map<string, number[]>();
const day = { key: "", count: 0 };
const cache = new Map<string, ExplainResponse>();

function allow(visitor: string): boolean {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  if (day.key !== today) {
    day.key = today;
    day.count = 0;
  }
  const recent = (visitors.get(visitor) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= PER_VISITOR_PER_HOUR || day.count >= TOTAL_PER_DAY) return false;
  recent.push(now);
  visitors.set(visitor, recent);
  day.count++;
  return true;
}

const isDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Accept only dates and numbers from the browser; the prompt text is built on the server. */
function parseEvents(input: unknown): ShiftEvent[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_EVENTS) return null;
  const events: ShiftEvent[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) return null;
    const e = raw as Record<string, unknown>;
    if (!isDate(e.date) || !isDate(e.windowStart) || !isDate(e.windowEnd)) return null;
    if (e.model !== "level" && e.model !== "trend") return null;
    if (!isNum(e.before) || !isNum(e.after) || typeof e.log !== "boolean") return null;
    const trend = e.model === "trend";
    if (trend && (!isNum(e.rateBefore) || !isNum(e.rateAfter))) return null;
    events.push({
      date: e.date,
      windowStart: e.windowStart,
      windowEnd: e.windowEnd,
      model: e.model,
      log: e.log,
      before: e.before,
      after: e.after,
      ...(trend ? { rateBefore: e.rateBefore as number, rateAfter: e.rateAfter as number } : {}),
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

  const key = JSON.stringify([source, id, events.map((e) => [e.date, e.model, e.log])]);
  const hit = cache.get(key);
  if (hit) return Response.json(hit);

  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!allow(visitor)) {
    return Response.json(
      { error: "Explanation limit reached for now. Try again later.", code: "limited" },
      { status: 429 },
    );
  }

  try {
    const series = await loadSeries(source, id);
    if (!series) {
      return Response.json({ error: "No data found for that name.", code: "series" }, { status: 404 });
    }
    const result = await explainShifts(series, events);
    if (cache.size > 300) cache.clear();
    cache.set(key, result);
    return Response.json(result);
  } catch (err) {
    if (err instanceof ExplainError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return Response.json(
      { error: "Could not load the series for this request.", code: "series" },
      { status: 502 },
    );
  }
}
