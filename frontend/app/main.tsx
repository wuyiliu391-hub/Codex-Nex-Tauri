import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Reuse the existing stylesheets as-is — they are already 1:1 with the official
// Codex look, so the rewrite only replaces the rendering layer, not the theme.
import "../src/styles/tokens.css";
import "../src/styles/official-tokens.css";
import "../src/styles/reset.css";
import "../src/styles/shell.css";
import "../src/styles/components.css";
import "../src/styles/controls.css";
import "../src/styles/home.css";
import "../src/styles/discovery.css";
import "../src/styles/settings.css";
import "../src/styles/settings-pages.css";
import "../src/styles/dark.css";

// React-owned styles for surfaces the vanilla layer never had.
import "./styles/approvals.css";

import { App } from "./App";
import { startEventBridge } from "./bridge/events";
import { installRouter } from "./shell/useRoute";

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root container missing from index.html");
}

// Install the router before the first render so the initial route is known.
installRouter();

// Wire the protocol event bridge before first paint so no notification is lost.
void startEventBridge();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The React tree owns the shell now; drop the splash.
document.body.classList.remove("is-booting");
const splash = document.getElementById("startup-loader");
if (splash) {
  splash.classList.add("is-hidden");
  setTimeout(() => splash.remove(), 400);
}
const failSafe = (window as unknown as { __codexSplashFailSafe?: number }).__codexSplashFailSafe;
if (failSafe !== undefined) {
  clearTimeout(failSafe);
  (window as unknown as { __codexSplashFailSafe?: number }).__codexSplashFailSafe = undefined;
}
