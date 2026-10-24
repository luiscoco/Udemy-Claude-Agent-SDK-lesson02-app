# Claude Agent SDK · S01 · Your first query()

A small TypeScript teaching application: one SDK query, no tools. The local host invokes the Agent SDK; Claude model inference happens through the configured API provider. This is separate from the earlier Managed Agents resource/session API examples.

## What you will learn

- One SDK entry point: Import query from @anthropic-ai/claude-agent-sdk. No agent class or create-agent API is required for this example.
- An async message iterator: query() returns an async iterator. for await...of receives messages as the SDK runtime works.
- A prompt and explicit options: The prompt describes the task. The model and options define the small teaching experiment.
- Assistant text versus final result: Read text content from assistant messages. Check result.subtype and is_error before reporting success.
- A local runtime and cloud model: The Agent SDK starts its runtime on the host. Claude model inference happens through the configured API provider.
- Configuration and observable evidence: Load .env on startup, keep the key server-side, and compare the status, turns and estimated cost with the event list.

## Configure and run

Use Node.js 24 or newer. From presentations:

```powershell
cd .\agent-sdk\lesson-s01-query
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

Edit .env using this safe example:

```dotenv
ANTHROPIC_API_KEY=your_api_key
CLAUDE_MODEL=claude-sonnet-4-6
PORT=3101
```

No Managed Agents IDs are required. The npm scripts load .env; the SDK does not load it itself. Keep optional dependencies enabled so the SDK runtime is installed. On Windows, see the Git Bash path example in .env.example if discovery fails.

```powershell
npm start
```

Open http://127.0.0.1:3101. Leave the terminal running. Restart after changing .env. Use the printed address if PORT changes. First open What you will learn, then How to run, run a small prompt in Application lab, inspect the UML, and follow Code walkthrough. All pages have the same navigation and theme control.

## Pages

- Application lab: `/`
- What you will learn: `/learn.html`
- Configure and run: `/run.html`
- Architecture and UML: `/architecture.html`
- Workflow with source snippets: `/walkthrough.html`

## Smallest query pattern

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Explain an AI agent in one sentence.",
  options: { tools: [], maxTurns: 1 },
})) {
  if (message.type === "result") {
    if (message.subtype === "success" && !message.is_error) {
      console.log(message.result);
    } else {
      console.error("Query failed:", message.subtype);
    }
  }
}
```

## How the app was built

### 01. Load configuration before the agent starts

The npm command loads the local .env into the host process. query inherits the server-side API key. The browser sees only a ready flag and model name.

Source: [package.json](package.json)

```powershell
tsx --env-file-if-exists=.env src/server.ts
```

### 02. Validate the student prompt

Reject empty or oversized input before the SDK starts. This keeps the classroom experiment bounded.

Source: [src/agent.ts](src/agent.ts)

```typescript
export function validatePrompt(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Enter a prompt first.");
  if (value.trim().length > 2000) throw new Error("Keep the prompt under 2,000 characters.");
  return value.trim();
}
```

### 03. Call query once with explicit options

The prompt is a string. tools: [] disables built-in tools; allowedTools: [] would only change approvals and is not the same setting. This lesson also ignores filesystem settings, configures no MCP servers or plugins, disables transcript persistence, and uses one turn with a small SDK budget. The SDK manages its model interaction; there is no manual Messages API tool loop.

Source: [src/agent.ts](src/agent.ts)

```typescript
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
```

### 04. Consume the async iterator

The for-await loop reads messages from the one query call; it does not make a new query for every message. A missing result is incomplete observation. finally closes the SDK query object.

Source: [src/agent.ts](src/agent.ts)

```typescript
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
```

### 05. Separate text from the final outcome

Initialization identifies the selected model and tools. Assistant text becomes the answer. Only a result with subtype success and is_error false establishes success. Preserve other subtypes rather than relabelling them as completed.

Source: [src/agent.ts](src/agent.ts)

```typescript
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
```

### 06. Forward selected evidence to the page

The server writes JSON lines while the SDK runs. The response close event and a 90-second timeout abort this sample’s local run; finally releases the busy flag. These controls are web-app plumbing around the simple SDK example.

Source: [src/server.ts](src/server.ts)

```typescript
const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90_000);
      res.on("close", () => { if (!res.writableEnded) controller.abort(); });
      res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
      const emit = (event: unknown) => { if (!res.destroyed) res.write(JSON.stringify(event) + "\n"); };
      try { await runAgent(prompt, emit, controller); }
      catch { emit({ type: "error", text: controller.signal.aborted ? "The run was cancelled or timed out. Try a shorter prompt." : "The SDK could not finish. Check your API key, model access and the setup troubleshooting section." }); }
      finally { clearTimeout(timer); busy = false; if (!res.destroyed) res.end(); }
```

### 07. Render returned text safely

The browser assigns assistant text to textContent and keeps final status separate. The stream decoder buffers partial JSON lines, so a network chunk is not assumed to be a complete message.

Source: [src/client.ts](src/client.ts)

```typescript
const consume = (line: string) => {
      if (!line.trim()) return;
      const data = JSON.parse(line);
      if (data.type === "answer") { answer += (answer ? "\n\n" : "") + data.text; $("answer").textContent = answer; }
      else if (data.type === "result") {
        finalResult = true; $("status").textContent = data.status === "success" ? "Success" : data.status;
        $("cost").textContent = "$" + data.costUsd.toFixed(4); $("turns").textContent = String(data.turns); $("session").textContent = data.sessionId;
        if (!answer || data.status !== "success") $("answer").textContent = data.text;
      } else if (data.type === "error") { $("status").textContent = "Error"; $("answer").textContent = data.text; }
      addEvent(data.type, data.type === "initialized" ? `${data.model} · ${data.tools} tools` : data.type === "result" ? `${data.status} · final SDK result` : data.type === "answer" ? "Assistant text received" : data.text || "");
    };
```

## Terminal version and verification

```powershell
npm run agent -- "Explain an AI agent in one sentence."
npm test
npm run build:client
python scripts/build-pages.py
```

The terminal and web versions share src/agent.ts. npm test validates types, inputs and message/result interpretation without API calls. build:client is needed after editing src/client.ts; a generated browser asset is provided so npm start does not rebuild every time. build-pages refreshes documentation from the actual source.

## Boundaries

One fresh query per run, no tools, no MCP servers, no plugins, no transcript persistence and no resume UI. The web host allows one active query, aborts after 90 seconds, and aborts when its browser connection closes. The SDK turn and budget settings are limits for this lesson, not a billing guarantee. The displayed cost is an SDK estimate. The SDK session ID is not a Managed Agents resource ID. This trusted local teaching host binds to 127.0.0.1 and is not a multi-user deployment. Source snippets and the UML describe this implementation; web transport events are not additional SDK message types.

## Official references

- [Agent SDK quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart)
- [TypeScript SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript)
- [Permissions and tool availability](https://code.claude.com/docs/en/agent-sdk/permissions)

The lesson pins @anthropic-ai/claude-agent-sdk 0.3.310. node_modules, .env, runtime files and teaching media are ignored by Git.

## Starting the app again

If this app already owns the configured port, npm start prints its existing URL and exits cleanly. Open that URL, or press Ctrl+C in the original terminal before restarting after configuration or source changes. If another service owns the port, the message explains how to stop it or choose a different PORT in .env.

## Clone this application

```powershell
git clone https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson02-app.git
cd .\Udemy-Claude-Agent-SDK-lesson02-app
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start
```

The repository name uses lesson02 as requested; this sample is labelled S01 inside the application. If you cloned the repository, run commands from its root and skip the presentations-specific cd command above.

## Repository contents

This repository includes the TypeScript application, all five student pages, coloured code snippets, UML SVG, stylesheet, mascot, browser assets, tests, configuration template and lockfile. The documentation generator works with these bundled assets and needs no sibling lesson. Videos, audio, PowerPoint files, teaching-material, node_modules, runtime data and the real .env stay local and are excluded from Git.
