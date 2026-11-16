import { answer, ChatError, type ChatTurn } from "@/lib/org/chat";
import { orgModel } from "@/lib/org/server";

export const maxDuration = 120;

const MAX_TURNS = 12;
const MAX_QUESTION = 600;
const PER_VISITOR_PER_HOUR = Number(process.env.ORG_CHAT_HOURLY_LIMIT ?? 15);
const TOTAL_PER_DAY = Number(process.env.ORG_CHAT_DAILY_LIMIT ?? 300);

// In-memory limits: a first line of defence only (they reset on restart and are
// per instance on serverless hosts). Set a spend limit on the API account too.
const visitors = new Map<string, number[]>();
const day = { key: "", count: 0 };

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

function parseHistory(input: unknown): ChatTurn[] | null {
  if (!Array.isArray(input) || !input.length || input.length > MAX_TURNS) return null;
  const turns: ChatTurn[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) return null;
    const { role, content } = raw as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    const text = content.trim();
    if (!text || text.length > (role === "user" ? MAX_QUESTION : 6000)) return null;
    turns.push({ role, content: text });
  }
  return turns[0].role === "user" && turns[turns.length - 1].role === "user" ? turns : null;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const model = await orgModel();
  const scope = body.scope;
  const history = parseHistory(body.messages);
  const validScope =
    typeof scope === "number" &&
    Number.isInteger(scope) &&
    scope > 0 &&
    scope < model.people.length &&
    model.reports[scope].length > 0;
  if (!validScope || !history) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "The assistant is not set up.", code: "not_configured" },
      { status: 503 },
    );
  }
  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!allow(visitor)) {
    return Response.json(
      { error: "Question limit reached for now. Try again later.", code: "limited" },
      { status: 429 },
    );
  }

  try {
    return Response.json({ reply: await answer(model, scope, history) });
  } catch (err) {
    if (err instanceof ChatError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return Response.json({ error: "Something went wrong.", code: "error" }, { status: 500 });
  }
}
