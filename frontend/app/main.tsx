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

// React-owned styles for surfaces the vanilla layer never had, plus the modal
// rules that modal.js used to inject at runtime.
import "./styles/approvals.css";
import "./styles/modal.css";
import "./styles/turn.css";
import "./styles/settings-general.css";

import { App } from "./App";
import { startEventBridge } from "./bridge/events";
import { installRouter } from "./shell/useRoute";
import { getPrefSection, loadPreferences } from "./state/preferencesStore";
import { startAppearance } from "./state/appearance";
import { applyLanguage, detectSystemLanguage } from "../src/js/i18n.js";
import { updateSettings as updateLegacySettings } from "../src/js/state.js";

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root container missing from index.html");
}

// Install the router before the first render so the initial route is known.
installRouter();

// Wire the protocol event bridge before first paint so no notification is lost.
void startEventBridge();

// Load shell preferences once; settings pages read them synchronously after.
// Then apply appearance to the document root (theme class, type ladder, fonts,
// datasets) and keep it in sync as preferences change.
void loadPreferences().then(() => {
  startAppearance();
  // Prefer explicit preference; else system locale (backend empty → zh-CN).
  const general = getPrefSection<{ language?: string }>("general");
  const bootLang = general?.language || detectSystemLanguage();
  updateLegacySettings({ language: bootLang });
  applyLanguage();
});

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The React tree owns the shell now; drop the splash after a minimum
// display window so the blossom + shimmer stays perceptible. Without this the
// removal below runs in the same task as render() — on a fast dev boot the
// loader is hidden before the browser ever paints it ("瞬间而过").
// 2200ms covers one full shimmer sweep (see index.html keyframes).
// Elapsed is measured from navigation start so slow loads don't pay extra.
const MIN_SPLASH_MS = 2200;
const bootElapsed =
  typeof performance !== "undefined" && performance.timeOrigin ? Date.now() - performance.timeOrigin : 0;
window.setTimeout(
  () => {
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
  },
  Math.max(0, MIN_SPLASH_MS - bootElapsed),
);
