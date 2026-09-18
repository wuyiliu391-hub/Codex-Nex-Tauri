// Dump clean readable log of the stdio JSON-RPC handshake
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import readline from "node:readline";

const binPath = resolve("src-tauri/binaries/codex-app-server-x86_64-pc-windows-msvc.exe");

const child = spawn(binPath, ["app-server", "--listen", "stdio://"], {
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});

const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });

function send(msg) {
  const s = JSON.stringify(msg);
  console.log(`\n=== [CLIENT -> SERVER (stdin)] ===\n${s}`);
  child.stdin.write(s + "\n");
}

let step = 0;

rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  console.log(`\n=== [SERVER -> CLIENT (stdout)] ===\n${line}`);

  const obj = JSON.parse(line);
  if (obj.id === "1") {
    // 收到 initialize 回应，发送 initialized 通知
    send({ method: "initialized", params: {} });
    setTimeout(() => {
      send({ id: "2", method: "model/list", params: {} });
    }, 200);
  } else if (obj.id === "2") {
    // 收到 model/list 回应，发送退出关闭
    setTimeout(() => {
      child.stdin.end();
      setTimeout(() => process.exit(0), 200);
    }, 200);
  }
});

// 发送初始化
send({
  id: "1",
  method: "initialize",
  params: {
    clientInfo: { name: "codex-tauri", title: "Codex Desktop", version: "0.1.0" },
    capabilities: { experimentalApi: true }
  }
});
