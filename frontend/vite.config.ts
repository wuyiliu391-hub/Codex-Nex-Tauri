import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The React app lives in frontend/app. The existing hand-written vanilla
// modules stay in frontend/src and are imported as static assets (CSS, fonts,
// pet spritesheets) while the rewrite proceeds batch by batch.
//
// publicDir is disabled on purpose: every asset goes through Vite's pipeline so
// url() references inside the existing stylesheets resolve correctly.
//
// Browser dev mode (`npm run dev:browser`, see docs/BROWSER-DEV.md):
//   * @tauri-apps/api/{core,event} are aliased onto app/devbridge/*, which
//     replays the shell command surface against a live codex-app-server.
//   * a WS proxy mounts /appserver → engine. The engine's websocket listener
//     rejects upgrades that carry an Origin header (transport/websocket.rs),
//     which every browser sends — the proxy connects server-side without one.

function appServerWsProxy(): Plugin {
  return {
    name: "codex-app-server-ws-proxy",
    configureServer(server) {
      // Lazy-import ws so the default (tauri) dev path never touches it.
      void import("ws").then(({ WebSocket, WebSocketServer }) => {
        const wss = new WebSocketServer({ noServer: true });
        const target =
          process.env["CODEX_APP_SERVER_WS"] ?? "ws://127.0.0.1:17457";
        server.httpServer?.on("upgrade", (req, socket, head) => {
          if (!req.url?.startsWith("/appserver")) return;
          wss.handleUpgrade(req, socket, head, (client) => {
            const upstream = new WebSocket(target);
            const outbox: unknown[] = [];
            upstream.on("open", () => {
              for (const m of outbox.splice(0)) {
                upstream.send(m as never);
              }
            });
            upstream.on("message", (data, isBinary) => {
              if (client.readyState === 1) client.send(data, { binary: isBinary });
            });
            upstream.on("error", (err) => {
              console.warn(`[ws-proxy] engine unreachable at ${target}: ${err.message}`);
              if (client.readyState === 1) client.close(1011, "upstream error");
            });
            upstream.on("close", () => client.close());
            client.on("message", (data, isBinary) => {
              if (upstream.readyState === 1) upstream.send(data as never, { binary: isBinary });
              else outbox.push(data);
            });
            client.on("close", () => upstream.close());
          });
        });
        console.info(`[ws-proxy] /appserver → ${target}`);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const browserBridge = mode === "browser";
  return {
    // root defaults to the directory holding this config (frontend/).
    publicDir: false,
    plugins: [react(), ...(browserBridge ? [appServerWsProxy()] : [])],
    resolve: {
      alias: {
        // Exact-match keys win over the bare "@" prefix alias below.
        ...(browserBridge
          ? {
              "@tauri-apps/api/core": fileURLToPath(
                new URL("./app/devbridge/tauri-core.ts", import.meta.url),
              ),
              "@tauri-apps/api/event": fileURLToPath(
                new URL("./app/devbridge/tauri-event.ts", import.meta.url),
              ),
            }
          : null),
        "@": fileURLToPath(new URL("./app", import.meta.url)),
        "@protocol": fileURLToPath(new URL("./src/protocol", import.meta.url)),
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      // Tauri ships a modern WebView2/WebKit, so we can target current engines.
      target: "es2022",
      sourcemap: true,
      rollupOptions: {
        output: {
          // Keep the entry predictable so tauri.conf.json can point at dist/.
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
    server: {
      port: 1420,
      strictPort: true,
    },
    clearScreen: false,
  };
});
