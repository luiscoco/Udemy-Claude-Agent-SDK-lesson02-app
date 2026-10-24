import { test } from "node:test";
import assert from "node:assert/strict";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { projectMessage, validatePrompt } from "./agent.js";

test("validate the prompt before starting a runtime", () => {
  assert.equal(validatePrompt("  Hello  "), "Hello");
  for (const value of [null, " ", "x".repeat(2001)]) assert.throws(() => validatePrompt(value));
});
test("assistant text is evidence, not a completion signal", () => {
  const message = { type: "assistant", message: { content: [{ type: "text", text: "Hello" }, { type: "tool_use", name: "Read" }] } } as SDKMessage;
  assert.deepEqual(projectMessage(message), [{ type: "answer", text: "Hello" }]);
});
test("an SDK error flag must not become a successful run", () => {
  const result = { type: "result", subtype: "success", is_error: true, result: "API error", session_id: "test", total_cost_usd: 0, num_turns: 1 } as SDKMessage;
  assert.equal(projectMessage(result)[0].type, "result");
  assert.equal((projectMessage(result)[0] as { status: string }).status, "error");
});
test("keep turn-limit outcomes distinct from success", () => {
  const result = { type: "result", subtype: "error_max_turns", errors: ["Turn limit reached"], session_id: "test", total_cost_usd: 0.001, num_turns: 1 } as SDKMessage;
  const [event] = projectMessage(result);
  assert.ok(event.type === "result");
  assert.equal(event.status, "error_max_turns");
  assert.equal(event.text, "Turn limit reached");
});
