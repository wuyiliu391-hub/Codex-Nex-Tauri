/**
 * Application shell: titlebar + sidebar + main view host.
 *
 * DOM contract (matches the vanilla index.html the stylesheets were written for):
 *   body > #root(display:contents) > .app-toolbar + #app > .sidebar + .main
 * The settings view is a SIBLING of .main, not a child: shell.css hides both
 * .sidebar and .main when body.settings-open is set, and lets #view-settings
 * fill #app. Rendering settings inside .main would hide it along with .main.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TitleBar } from "./TitleBar";
import { Sidebar } from "./Sidebar";
import { navigate, useRoute } from "./useRoute";
import type { ShellContext } from "./actions";
import { getAppState, refreshAppState, setActiveSession } from "@/state/appStore";
import { HomeView } from "@/views/HomeView";
import { DiscoveryView } from "@/views/DiscoveryView";
import { SettingsShell } from "@/views/settings/SettingsShell";

function ViewHost({ view }: { view: string }) {
  if (view === "scheduled" || view === "plugins" || view === "pullrequests") {
    return <DiscoveryView view={view} />;
  }
  // Home is the default for every other (and unknown) route.
  return <HomeView />;
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const route = useRoute();

  // Load engine-backed data once at startup.
  useEffect(() => {
    void refreshAppState();
  }, []);

  // Restore the persisted sidebar state.
  useEffect(() => {
    void invoke<Record<string, unknown>>("get_settings")
      .then((settings) => {
        if (settings && settings["sidebarCollapsed"] === true) setCollapsed(true);
      })
      .catch(() => {
        /* settings are optional; default to expanded */
      });
  }, []);

  // The stylesheet collapses the sidebar via `body.sidebar-collapsed`
  // (shell.css:91-114), not a class on the aside. Keep the body class in sync
  // with React state so the existing rules keep working unchanged.
  useEffect(() => {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
  }, [collapsed]);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      // Persist best-effort: the shell must not block on the backend here.
      void invoke<Record<string, unknown>>("get_settings")
        .then((settings) =>
          invoke("save_settings", { settings: { ...(settings ?? {}), sidebarCollapsed: next } }),
        )
        .catch(() => {});
      return next;
    });
  }, []);

  const ctx: ShellContext = useMemo(
    () => ({
      navigate,
      toggleSidebar,
      focusComposer: () => {
        const el = document.getElementById("composer-input");
        if (el instanceof HTMLTextAreaElement) el.focus();
      },
      addProject: () => {
        window.dispatchEvent(new CustomEvent("codex:add-project"));
      },
      stepTask: (direction: 1 | -1) => {
        const sessions = getAppState().sessions.filter((s) => !s.archived);
        if (!sessions.length) return;
        const activeId = getAppState().activeSessionId;
        const index = sessions.findIndex((s) => s.id === activeId);
        const nextIndex = (index + direction + sessions.length) % sessions.length;
        const next = sessions[nextIndex];
        if (!next) return;
        setActiveSession(next.id);
        navigate("home");
      },
    }),
    [toggleSidebar],
  );

  const isSettings = route.view === "settings";

  return (
    <>
      <TitleBar ctx={ctx} sidebarCollapsed={collapsed} onToggleSidebar={toggleSidebar} />
      <div id="app">
        <Sidebar ctx={ctx} collapsed={collapsed} />
        {/* Settings is a sibling of .main: body.settings-open hides .main and
            .sidebar and lets #view-settings fill #app (shell.css:94-97). */}
        <main className="main" id="main" hidden={isSettings}>
          <ViewHost view={route.view} />
        </main>
        {isSettings ? <SettingsShell /> : null}
      </div>
    </>
  );
}
