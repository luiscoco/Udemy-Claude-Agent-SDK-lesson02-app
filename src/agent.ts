import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const DEFAULT_PROMPT = "Explain what an AI agent is in two short sentences.";
export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
export type LabEvent =
  | { type: "started"; text: string }
  | { type: "initialized"; model: string; tools: number }
  | { type: "answer"; text: string }
  | { type: "result"; status: string; text: string; sessionId: string; costUsd: number; turns: number }
  | { type: "error"; text: string };

export function validatePrompt(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Enter a prompt first.");
  if (value.trim().length > 2000) throw new Error("Keep the prompt under 2,000 characters.");
  return value.trim();
}

// Project only student-facing evidence, never the runtime's raw configuration.
export function projectMessage(message: SDKMessage): LabEvent[] {
  if (message.type === "system" && message.subtype === "init") {
    return [{ type: "initialized", model: message.model, tools: message.tools.length }];
  }
  if (message.type === "assistant") {
    return message.message.content.flatMap((block) =>
      block.type === "text" ? [{ type: "answer" as const, text: block.text }] : [],
    );
  }
  if (message.type === "result") {
    const success = message.subtype === "success" && !message.is_error;
    return [{ type: "result", status: success ? "success" : message.subtype === "success" ? "error" : message.subtype,
      text: message.subtype === "success" ? message.result : message.errors.join("\n"),
      sessionId: message.session_id, costUsd: message.total_cost_usd, turns: message.num_turns }];
  }
  return [];
}

export async function runAgent(prompt: string, emit: (event: LabEvent) => void, abortController = new AbortController()) {
  const cwd = fileURLToPath(new URL("../.runtime/", import.meta.url));
  await mkdir(cwd, { recursive: true });
  emit({ type: "started", text: "Calling query() once. Waiting for the SDK messages…" });
  let gotResult = false;

  // One SDK entry point. for await consumes its async message iterator.
  const conversation = query({
    prompt,
    options: {
      model: MODEL,
      tools: [],
      settingSources: [],
      mcpServers: {},
      plugins: [],
      persistSession: false,
      maxTurns: 1,
      maxBudgetUsd: 0.10,
      cwd,
      abortController,
    },
  });
  try {
    for await (const message of conversation) {
      for (const event of projectMessage(message)) {
        if (event.type === "result") gotResult = true;
        emit(event);
      }
    }
    if (!gotResult && !abortController.signal.aborted) throw new Error("The SDK ended without a result message.");
  } finally {
    conversation.close();
  }
}
