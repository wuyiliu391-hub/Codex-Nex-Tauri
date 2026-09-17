/**
 * Application shell: titlebar + sidebar + main view host.
 *
 * Replaces shell.js. The view host currently renders an explicit "not migrated"
 * notice for views that still live in the vanilla layer — deliberately not a
 * fake screen, so it is always obvious what has and has not been ported.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TitleBar } from "./TitleBar";
import { Sidebar } from "./Sidebar";
import { navigate, useRoute } from "./useRoute";
import type { ShellContext } from "./actions";
import { getAppState, refreshAppState, setActiveSession } from "@/state/appStore";
import { HomeView } from "@/views/HomeView";

/** Views still served by the vanilla layer. */
const NOT_MIGRATED: Record<string, string> = {
  settings: "Settings (19 tabs)",
  scheduled: "Scheduled",
  plugins: "Plugins",
  pullrequests: "Pull requests",
};

function ViewHost({ view, sub }: { view: string; sub: string | null }) {
  if (view === "home") return <HomeView />;

  const pending = NOT_MIGRATED[view];
  if (!pending) {
    return (
      <section className="view">
        <div className="settings-page-head">
          <h1>{view}</h1>
          <p>Unknown view.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="view view-pending" data-view={view}>
      <div className="settings-page-head">
        <h1>{pending}</h1>
        <p>
          Not migrated yet — still served by the vanilla layer
          {sub ? ` (sub-page: ${sub})` : ""}.
        </p>
      </div>
    </section>
  );
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
        // The picker lives in the home view, which is not migrated yet.
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

  return (
    <>
      <TitleBar ctx={ctx} sidebarCollapsed={collapsed} onToggleSidebar={toggleSidebar} />
      <div id="app">
        <Sidebar ctx={ctx} collapsed={collapsed} />
        <main className="main" id="main">
          <ViewHost view={route.view} sub={route.sub} />
        </main>
      </div>
    </>
  );
}
