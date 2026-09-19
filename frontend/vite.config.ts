import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React app lives in frontend/app. The hand-written vanilla modules stay in
// frontend/src and are imported as static assets (CSS, fonts, pet spritesheets)
// while the rewrite proceeds batch by batch.
//
// publicDir is disabled on purpose: every asset goes through Vite's pipeline so
// url() references inside the existing stylesheets resolve correctly.
//
// Browser dev mode (`npm run dev:browser`, see docs/BROWSER-DEV.md):
//   `@tauri-apps/api/{core,event}` are aliased onto `app/devbridge/*`, which
//   replays the shell command surface in TypeScript.
//
//   There is NO WebSocket proxy and no external engine: the kernel is
//   in-process, so the browser cannot reach it. Browser mode simulates the
//   command surface instead. The old `appServerWsProxy` (which mounted
//   /appserver → ws://127.0.0.1:17457) was removed with the sidecar.

export default defineConfig(({ mode }) => {
  const browserBridge = mode === "browser";
  return {
    // root defaults to the directory holding this config (frontend/).
    publicDir: false,
    plugins: [react()],
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
