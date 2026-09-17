import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React app lives in frontend/app. The existing hand-written vanilla
// modules stay in frontend/src and are imported as static assets (CSS, fonts,
// pet spritesheets) while the rewrite proceeds batch by batch.
//
// publicDir is disabled on purpose: every asset goes through Vite's pipeline so
// url() references inside the existing stylesheets resolve correctly.
export default defineConfig({
  // root defaults to the directory holding this config (frontend/).
  publicDir: false,
  plugins: [react()],
  resolve: {
    alias: {
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
});
