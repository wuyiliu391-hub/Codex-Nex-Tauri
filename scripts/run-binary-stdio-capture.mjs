// Live Stdio JSON-RPC capture runner for codex.exe app-server
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import readline from "node:readline";

const binPath = resolve("src-tauri/binaries/codex-app-server-x86_64-pc-windows-msvc.exe");

console.log(`[STDIO-TEST] Spawning: ${binPath} app-server --listen stdio://`);

const child = spawn(binPath, ["app-server", "--listen", "stdio://"], {
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});

const rl = readline.createInterface({
  input: child.stdout,
  crlfDelay: Infinity,
});

child.stderr.on("data", (chunk) => {
  const line = chunk.toString().trim();
  if (line) {
    console.error(`[STDIO-STDERR] ${line}`);
  }
});

let messageSeq = 0;
const receivedMessages = [];

rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  messageSeq++;
  console.log(`\n<<< [SERVER -> CLIENT] (seq=${messageSeq}):\n${line}`);
  try {
    const parsed = JSON.parse(line);
    receivedMessages.push(parsed);

    // If we just got the initialize response, send initialized notification then query config & models
    if (parsed.id === "init-1" && parsed.result) {
      sendInitialized();
      setTimeout(sendModelList, 300);
      setTimeout(sendConfigRead, 600);
      setTimeout(shutdown, 1500);
    }
  } catch (err) {
    console.warn(`[PARSE-WARN] Not valid JSON: ${line}`);
  }
});

function send(msg) {
  const jsonStr = JSON.stringify(msg);
  console.log(`\n>>> [CLIENT -> SERVER]:\n${jsonStr}`);
  child.stdin.write(jsonStr + "\n");
}

function sendInitialize() {
  send({
    id: "init-1",
    method: "initialize",
    params: {
      clientInfo: {
        name: "codex-tauri-client",
        title: "Codex Desktop",
        version: "0.1.0"
      },
      capabilities: {
        experimentalApi: true
      }
    }
  });
}

function sendInitialized() {
  send({
    method: "initialized",
    params: {}
  });
}

function sendModelList() {
  send({
    id: "req-models-2",
    method: "model/list",
    params: {}
  });
}

function sendConfigRead() {
  send({
    id: "req-config-3",
    method: "config/read",
    params: {}
  });
}

function shutdown() {
  console.log("\n[STDIO-TEST] All requests executed. Closing stdin...");
  child.stdin.end();
  setTimeout(() => {
    try { child.kill(); } catch {}
    process.exit(0);
  }, 500);
}

// Kick off handshake
sendInitialize();
