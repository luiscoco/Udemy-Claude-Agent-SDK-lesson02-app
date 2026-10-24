import { DEFAULT_PROMPT, runAgent, validatePrompt } from "./agent.js";

const prompt = validatePrompt(process.argv.slice(2).join(" ") || DEFAULT_PROMPT);
try {
  await runAgent(prompt, (event) => {
    if (event.type === "answer") console.log(event.text);
    if (event.type === "result") {
      console.log(`\nResult: ${event.status} · Turns: ${event.turns} · Cost: $${event.costUsd.toFixed(4)}`);
      if (event.status !== "success") { console.error(event.text); process.exitCode = 1; }
    }
  });
} catch {
  console.error("The query failed. Check .env, API access, the model and the setup guide.");
  process.exitCode = 1;
}
