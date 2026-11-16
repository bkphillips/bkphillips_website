import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { describeShift, formatDate } from "./format";
import type { ExplainResponse, Explanation, SeriesData, ShiftEvent } from "./types";

const MODEL = process.env.INFLECTION_MODEL ?? "claude-opus-5-5";

const SYSTEM = `You write short, sourced explanations for Inflection, a public data tool. A statistical model has found dates where a time series changed behaviour. For each date, search the web for what happened around then that most plausibly explains the change, and write it up for a general reader.

How to work:
- Search for reporting from the stated window. The model dates a shift at the first observation of the new regime, so the cause is often a few days earlier.
- Prefer primary reporting from established outlets and official releases.
- Be honest about how strong the link is. If sources tie the event to the move, say so. If the timing only lines up, say it "coincided with" the event. If nothing convincing turns up, say no clear cause was found; do not guess.
- Describe what happened. Give no forecasts and no investment advice.

Output format, exactly:

### 1
A headline of at most ten words, no full stop
Two or three sentences of explanation.

Repeat for each numbered shift, in order. If there is more than one shift, finish with:

### Overview
Three to five sentences telling the story of the whole series across these shifts.

Write plain prose. Use no markdown other than the "###" section markers.`;

function buildPrompt(series: SeriesData, events: ShiftEvent[]): string {
  const lines = events.map(
    (e, i) =>
      `${i + 1}. ${formatDate(e.date)}: ${describeShift(e, series.unit)}. Look at news from ${formatDate(e.windowStart)} to ${formatDate(e.windowEnd)}.`,
  );
  return [
    `Series: ${series.label}`,
    `Units: ${series.unit || "not stated"}`,
    `Data source: ${series.sourceName}`,
    "",
    "Shifts found:",
    ...lines,
  ].join("\n");
}

type Cite = { pos: number; url: string; title: string };

function parse(text: string, cites: Cite[], events: ShiftEvent[]): ExplainResponse {
  const marker = /^###\s*(\d+|overview)\s*$/gim;
  const marks: { key: string; start: number; body: number }[] = [];
  for (let m = marker.exec(text); m; m = marker.exec(text)) {
    marks.push({ key: m[1].toLowerCase(), start: m.index, body: m.index + m[0].length });
  }

  const explanations: Explanation[] = [];
  let overview: string | null = null;

  marks.forEach((mark, i) => {
    const end = marks[i + 1]?.start ?? text.length;
    const body = text.slice(mark.body, end).trim();
    if (mark.key === "overview") {
      overview = body || null;
      return;
    }
    const event = events[Number(mark.key) - 1];
    if (!event || !body) return;
    const [headline, ...rest] = body.split("\n").filter((line) => line.trim());
    const seen = new Set<string>();
    const sources = cites
      .filter((c) => c.pos >= mark.start && c.pos < end)
      .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
      .slice(0, 4)
      .map(({ url, title }) => ({ url, title }));
    explanations.push({
      date: event.date,
      headline: headline.replace(/^[#*\s]+|[*.\s]+$/g, ""),
      summary: rest.join(" ").trim(),
      sources,
    });
  });

  return { explanations, overview };
}

export class ExplainError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

export async function explainShifts(
  series: SeriesData,
  events: ShiftEvent[],
): Promise<ExplainResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ExplainError("Explanations are not set up.", 503, "not_configured");
  }
  // The base URL is fixed so a stray ANTHROPIC_BASE_URL in the shell that
  // started the server cannot redirect requests that carry this key.
  const client = new Anthropic({ apiKey, baseURL: "https://api.anthropic.com" });

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: buildPrompt(series, events) },
  ];
  let text = "";
  const cites: Cite[] = [];

  try {
    // A long web search turn can pause; resending the conversation resumes it.
    for (let attempt = 0; attempt < 4; attempt++) {
      const message = await client.beta.messages
        .stream({
          model: MODEL,
          max_tokens: 32000,
          // If the model declines a request, retry on its default fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system: SYSTEM,
          tools: [
            {
              type: "web_search_20260209",
              name: "web_search",
              max_uses: Math.min(2 * events.length + 2, 16),
            },
          ],
          messages,
        })
        .finalMessage();

      for (const block of message.content) {
        if (block.type !== "text") continue;
        for (const c of block.citations ?? []) {
          if (c.type === "web_search_result_location") {
            cites.push({ pos: text.length, url: c.url, title: c.title ?? new URL(c.url).hostname });
          }
        }
        text += block.text;
      }

      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        continue;
      }
      if (message.stop_reason === "refusal") {
        throw new ExplainError("The model declined to explain this series.", 422, "refused");
      }
      break;
    }
  } catch (err) {
    if (err instanceof ExplainError) throw err;
    if (
      err instanceof Anthropic.AuthenticationError ||
      err instanceof Anthropic.PermissionDeniedError
    ) {
      throw new ExplainError("Explanations are not set up.", 503, "not_configured");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new ExplainError("The explanation service is busy. Try again shortly.", 429, "busy");
    }
    if (err instanceof Anthropic.APIError) {
      throw new ExplainError("The explanation service returned an error.", 502, "upstream");
    }
    throw new ExplainError("The explanation service could not be reached.", 502, "upstream");
  }

  const result = parse(text, cites, events);
  if (!result.explanations.length) {
    throw new ExplainError("No explanation came back. Try again.", 502, "empty");
  }
  return result;
}
