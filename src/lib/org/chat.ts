import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { METRICS, monthLabel, type OrgModel } from "./model";
import { runTool, TOOL_SPECS } from "./tools";

const MODEL = process.env.ORG_CHAT_MODEL ?? "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 8;

export type ChatTurn = { role: "user" | "assistant"; content: string };

export class ChatError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

function systemPrompt(model: OrgModel, scope: number): string {
  const leader = model.people[scope];
  return `You are the assistant inside Org Health Explorer, an analytics tool for leaders and HR partners. It runs on ${model.company}, a fictional company whose data is entirely synthetic.

The person you are helping is viewing the organization "${model.orgName(scope)}" led by ${leader.name} (${leader.title}), leader_id ${scope}, ${model.orgSize(scope).toLocaleString("en-US")} people. Data covers ${monthLabel(model.months[0])} to ${monthLabel(model.months[model.last])}, monthly.

Metrics:
${METRICS.map((m) => `- ${m.label} (${m.key}): ${m.description}`).join("\n")}

Rules:
- Every number you state must come from a tool result in this conversation. If the tools cannot answer something, say so plainly.
- You can only see this organization and the teams inside it. If asked about others, say they are outside the current view.
- Answer in a few sentences of plain prose, leading with the answer. Name the months and teams involved. Use a short list only when comparing several teams.
- Attrition values are monthly rates; use last_12_months_total when someone asks for a yearly figure.
- Stay on the subject of this organization's data. Decline anything else in one sentence.`;
}

export async function answer(
  model: OrgModel,
  scope: number,
  history: ChatTurn[],
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ChatError("The assistant is not set up.", 503, "not_configured");
  // Fixed base URL: see lib/inflection/explain.ts.
  const client = new Anthropic({ apiKey, baseURL: "https://api.anthropic.com" });

  const tools: Anthropic.Beta.BetaTool[] = TOOL_SPECS.map((t) => ({ ...t, strict: true }));
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({
    role: t.role,
    content: t.content,
  }));

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        // If the model declines a request, retry on its default fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: systemPrompt(model, scope),
        tools,
        messages,
      });

      if (response.stop_reason === "refusal") {
        throw new ChatError("The assistant declined to answer that.", 422, "refused");
      }
      messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason === "pause_turn") continue;

      const calls = response.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
      );
      if (response.stop_reason !== "tool_use" || !calls.length) {
        const text = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
        if (!text) throw new ChatError("No answer came back. Try again.", 502, "empty");
        return text;
      }

      // Run every requested tool and return all results in one message.
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = calls.map((call) => {
        let output: unknown;
        try {
          output = runTool(model, scope, call.name, (call.input ?? {}) as Record<string, unknown>);
        } catch {
          output = { error: "The tool failed on that input." };
        }
        const failed = typeof output === "object" && output !== null && "error" in output;
        return {
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(output),
          ...(failed ? { is_error: true } : {}),
        };
      });
      messages.push({ role: "user", content: results });
    }
    throw new ChatError("That question took too many steps. Try a narrower one.", 502, "too_long");
  } catch (err) {
    if (err instanceof ChatError) throw err;
    if (
      err instanceof Anthropic.AuthenticationError ||
      err instanceof Anthropic.PermissionDeniedError
    ) {
      throw new ChatError("The assistant is not set up.", 503, "not_configured");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new ChatError("The assistant is busy. Try again shortly.", 429, "busy");
    }
    throw new ChatError("The assistant could not be reached.", 502, "upstream");
  }
}
