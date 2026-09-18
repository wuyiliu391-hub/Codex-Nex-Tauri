// Test protocol translation logic for Adapter (Chat / Anthropic / Ollama -> Codex Responses format)
import assert from "node:assert";

// 1. Validate Chat Completion message extraction
function extractChatMessages(req) {
  const out = [];
  const input = req.input || [];
  for (const item of input) {
    const role = item.role || "user";
    const textParts = [];
    if (typeof item.content === "string") {
      textParts.push(item.content);
    } else if (Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c && typeof c.text === "string") textParts.push(c.text);
      }
    }
    out.push({ role, content: textParts.join("\n") });
  }
  return out;
}

// 2. Validate Anthropic system + messages separation
function extractAnthropicMessages(req) {
  const all = extractChatMessages(req);
  const systemLines = [];
  const messages = [];
  for (const msg of all) {
    if (msg.role === "system") {
      systemLines.push(msg.content);
    } else {
      messages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content
      });
    }
  }
  return {
    system: systemLines.length ? systemLines.join("\n\n") : null,
    messages
  };
}

// Test Sample Codex Response payload
const sampleCodexRequest = {
  model: "gpt-4o",
  input: [
    { role: "system", content: "You are a helpful coding assistant." },
    { role: "user", content: [{ type: "input_text", text: "Write a hello world in Rust" }] }
  ],
  stream: true
};

const chatMessages = extractChatMessages(sampleCodexRequest);
assert.strictEqual(chatMessages.length, 2);
assert.strictEqual(chatMessages[0].role, "system");
assert.strictEqual(chatMessages[1].content, "Write a hello world in Rust");

const anthropicPayload = extractAnthropicMessages(sampleCodexRequest);
assert.strictEqual(anthropicPayload.system, "You are a helpful coding assistant.");
assert.strictEqual(anthropicPayload.messages.length, 1);
assert.strictEqual(anthropicPayload.messages[0].role, "user");
assert.strictEqual(anthropicPayload.messages[0].content, "Write a hello world in Rust");

console.log("ALL PROTOCOL TRANSLATION ASSERTIONS PASSED!");
