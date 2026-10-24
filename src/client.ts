export {};
const $ = (id: string) => document.getElementById(id)!;
let running = false;
let finalResult = false;
const addEvent = (type: string, detail: string) => {
  const row = document.createElement("li"); const label = document.createElement("strong");
  label.textContent = type; const body = document.createElement("span"); body.textContent = detail;
  row.append(label, body); $("events").append(row);
};
async function configure() {
  const config = await (await fetch("/api/config")).json();
  ($("prompt") as HTMLTextAreaElement).value = config.defaultPrompt;
  $("model").textContent = config.model;
  $("configuration").textContent = config.ready ? "API key configured on the server" : "Setup needed: add your API key in .env";
  ($("run") as HTMLButtonElement).disabled = !config.ready;
}
$("form").addEventListener("submit", async (event) => {
  event.preventDefault(); if (running) return;
  running = true; finalResult = false; ($("run") as HTMLButtonElement).disabled = true;
  $("answer").textContent = ""; $("events").replaceChildren(); $("status").textContent = "Running";
  $("cost").textContent = "—"; $("turns").textContent = "—"; $("session").textContent = "—";
  let answer = "";
  try {
    const response = await fetch("/api/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: ($("prompt") as HTMLTextAreaElement).value }) });
    if (!response.ok) throw new Error(await response.text());
    const reader = response.body!.getReader(); const decoder = new TextDecoder(); let buffer = "";
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
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let at: number;
      while ((at = buffer.indexOf("\n")) !== -1) { consume(buffer.slice(0, at)); buffer = buffer.slice(at + 1); }
      if (done) { if (buffer.trim()) consume(buffer); break; }
    }
    if (!finalResult && $("status").textContent !== "Error") throw new Error("The stream ended without a final result. Inspect the event list.");
  } catch (error) { $("status").textContent = "Error"; $("answer").textContent = error instanceof Error ? error.message : "The run failed."; }
  finally { running = false; ($("run") as HTMLButtonElement).disabled = false; }
});
configure().catch(() => { $("configuration").textContent = "Cannot reach the local server. Restart npm start."; });
