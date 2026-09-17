/**
 * Application shell: titlebar + sidebar + main view host.
 *
 * DOM contract (matches the vanilla index.html the stylesheets were written for):
 *   body > #root(display:contents) > .app-toolbar + #app > .sidebar + .main
 * The settings view is a SIBLING of .main, not a child: shell.css hides both
 * .sidebar and .main when body.settings-open is set, and lets #view-settings
 * fill #app. Rendering settings inside .main would hide it along with .main.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TitleBar } from "./TitleBar";
import { Sidebar } from "./Sidebar";
import { navigate, useRoute } from "./useRoute";
import { dispatchAction, type ShellContext } from "./actions";
import { getAppState, openProjectPicker, refreshAppState, setActiveSession } from "@/state/appStore";
import { getSnapshot as getTurnSnapshot, loadThreadFromSession } from "@/state/turnStore";
import { useShortcutDispatcher, type ShortcutBinding } from "./useShortcuts";
import { MENU_TREE, isSeparator } from "./menuTree";
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

/** Rust Shortcut.keys is a single string ("Ctrl+N"); split into the list form. */
function parseKeys(raw: string): string[] {
  return raw
    .split("+")
    .map((k) => k.trim())
    .filter(Boolean);
}

function normaliseBindings(raw: unknown): ShortcutBinding[] {
  if (!Array.isArray(raw)) return [];
  const out: ShortcutBinding[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const id = typeof rec["id"] === "string" ? rec["id"] : typeof rec["action"] === "string" ? rec["action"] : null;
    if (!id) continue;
    const keysRaw = rec["keys"];
    const keys = Array.isArray(keysRaw)
      ? keysRaw.map(String)
      : typeof keysRaw === "string" && keysRaw
        ? parseKeys(keysRaw)
        : [];
    if (!keys.length) continue;
    out.push({
      id,
      label: typeof rec["label"] === "string" ? rec["label"] : id,
      keys,
    });
  }
  return out;
}

/** Fallback bindings from the menu tree so shortcuts work before list_shortcuts lands. */
function menuFallbackBindings(): ShortcutBinding[] {
  const out: ShortcutBinding[] = [];
  for (const entries of Object.values(MENU_TREE)) {
    for (const entry of entries) {
      if (isSeparator(entry) || !entry.keys) continue;
      out.push({ id: entry.action, label: entry.key, keys: parseKeys(entry.keys) });
    }
  }
  return out;
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [bindings, setBindings] = useState<ShortcutBinding[]>(() => menuFallbackBindings());
  const route = useRoute();
  const ctxRef = useRef<ShellContext | null>(null);

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

  // User-editable shortcuts from the shell store; menu tree is the fallback.
  useEffect(() => {
    void invoke<unknown>("list_shortcuts")
      .then((raw) => {
        const list = normaliseBindings(raw);
        if (list.length) setBindings(list);
      })
      .catch(() => {
        /* keep menu-tree fallback */
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
        void openProjectPicker();
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
        const turn = getTurnSnapshot();
        if (!(turn.active && turn.sessionId === next.id)) {
          void loadThreadFromSession(next.id);
        }
        navigate("home");
      },
    }),
    [toggleSidebar],
  );
  ctxRef.current = ctx;

  // Global shortcuts → real dispatchAction (same code path as the titlebar menus).
  useShortcutDispatcher(
    bindings,
    useCallback((id: string) => {
      const shell = ctxRef.current;
      if (shell) dispatchAction(id, shell);
    }, []),
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
