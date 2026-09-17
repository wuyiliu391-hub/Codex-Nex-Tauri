/**
 * Discovery views: Scheduled, Plugins and Pull Requests.
 *
 * Replaces discovery.js. Each page fetches its own data from a backend command
 * when entered; empty states are genuine empty responses, never seeded cards.
 * Run / enable actions go through real Tauri IPC — no local-only toggles.
 */

import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../src/js/i18n.js";
import { BlockCustom, PageHead, SettingsButton } from "./settings/primitives";
import { navigate } from "@/shell/useRoute";

interface JsonRecord {
  [key: string]: unknown;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asList(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.map(asRecord);
  const rec = asRecord(value);
  for (const key of ["data", "items", "tasks", "plugins", "pullRequests", "pull_requests"]) {
    if (Array.isArray(rec[key])) return (rec[key] as unknown[]).map(asRecord);
  }
  return [];
}

function text(rec: JsonRecord, ...keys: string[]): string {
  for (const key of keys) {
    if (typeof rec[key] === "string" && rec[key]) return rec[key] as string;
  }
  return "";
}

function label(key: string, fallback: string): string {
  return String(t(key, fallback));
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function Loading() {
  return <div className="discovery-loading">{label("discovery.loading", "Loading…")}</div>;
}

function Empty({ children }: { children: string }) {
  return <div className="discovery-empty"><h3>{children}</h3></div>;
}

function useBackendList(command: string, args: Record<string, unknown> = {}) {
  const [data, setData] = useState<JsonRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    void invoke<unknown>(command, args)
      .then((raw) => {
        if (active) setData(asList(raw));
      })
      .catch((err) => {
        if (active) setError(errText(err));
      });
    return () => {
      active = false;
    };
  }, [command, revision]);

  return { data, error, refresh: () => setRevision((v) => v + 1) };
}

/** Prefer explicit `enabled`; fall back to status text used by the local store. */
function pluginIsEnabled(item: JsonRecord): boolean {
  if (typeof item["enabled"] === "boolean") return item["enabled"] as boolean;
  const status = text(item, "status").toLowerCase();
  return status !== "disabled" && status !== "uninstalled";
}

function scheduledIsEnabled(item: JsonRecord): boolean {
  const status = text(item, "status").toLowerCase();
  return status !== "disabled" && status !== "paused";
}

export function DiscoveryView({ view }: { view: "scheduled" | "plugins" | "pullrequests" }) {
  if (view === "scheduled") return <ScheduledView />;
  if (view === "plugins") return <PluginsView />;
  return <PullRequestsView />;
}

function ScheduledView() {
  const { data, error, refresh } = useBackendList("list_scheduled_tasks");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((item) => {
      if (!q) return true;
      return ["title", "name", "description", "desc"].some((key) => text(item, key).toLowerCase().includes(q));
    });
  }, [data, query]);

  async function runTask(id: string): Promise<void> {
    if (!id || busyId) return;
    setBusyId(id);
    setActionError(null);
    try {
      await invoke("run_scheduled_task", { id });
      refresh();
    } catch (err) {
      setActionError(errText(err));
    } finally {
      setBusyId(null);
    }
  }

  async function saveToggle(item: JsonRecord): Promise<void> {
    const id = text(item, "id");
    if (!id || !data || busyId) return;
    const nextStatus = scheduledIsEnabled(item) ? "disabled" : "enabled";
    const nextTasks = data.map((task) =>
      text(task, "id") === id ? { ...task, status: nextStatus } : task,
    );
    setBusyId(id);
    setActionError(null);
    try {
      await invoke("save_scheduled_tasks", { tasks: nextTasks });
      refresh();
    } catch (err) {
      setActionError(errText(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="view view-discovery" id="view-scheduled">
      <PageHead title={label("discovery.scheduled", "Scheduled")} desc={label("discovery.scheduledDesc", "Tasks scheduled by the backend.")} />
      <BlockCustom>
        <div className="discovery-toolbar">
          <input className="discovery-search-input" placeholder={label("discovery.searchScheduled", "Search scheduled tasks")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <SettingsButton label={label("pets.refresh", "Refresh")} onClick={refresh} />
        </div>
        {actionError ? <div className="approval-card-error">{actionError}</div> : null}
      </BlockCustom>
      {error ? <Empty>{error}</Empty> : data === null ? <Loading /> : list.length === 0 ? <Empty>{label("discovery.noScheduled", "No scheduled tasks")}</Empty> : (
        <BlockCustom title={label("discovery.suggestions", "Scheduled tasks")}>
          <div className="suggestion-list">
            {list.map((item, i) => {
              const id = text(item, "id", "title");
              const enabled = scheduledIsEnabled(item);
              return (
                <div className="suggestion-card" key={String(item.id ?? item.title ?? i)}>
                  <div className="suggestion-card-title">{text(item, "title", "name")}</div>
                  <div className="suggestion-card-desc">{text(item, "desc", "description")}</div>
                  <div className="suggestion-card-meta">{text(item, "status", "cron", "schedule")}</div>
                  <div className="pc-foot">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!id || busyId !== null}
                      data-run-scheduled={id}
                      onClick={() => void runTask(id)}
                    >
                      {label("action.run", "Run")}
                    </button>
                    <button
                      type="button"
                      className="ui-toggle"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={text(item, "title", "name") || id}
                      disabled={!id || busyId !== null}
                      data-scheduled-toggle={id}
                      onClick={() => void saveToggle(item)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </BlockCustom>
      )}
    </section>
  );
}

function PluginsView() {
  const { data, error, refresh } = useBackendList("list_plugins");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((item) => !q || ["name", "id", "description", "desc"].some((key) => text(item, key).toLowerCase().includes(q)));
  }, [data, query]);

  async function togglePlugin(item: JsonRecord): Promise<void> {
    const id = text(item, "id", "name");
    if (!id || busyId) return;
    const next = !pluginIsEnabled(item);
    setBusyId(id);
    setActionError(null);
    try {
      await invoke("set_plugin_enabled", { id, enabled: next });
      refresh();
    } catch (err) {
      setActionError(errText(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="view view-discovery" id="view-plugins">
      <PageHead title={label("discovery.plugins", "Plugins")} desc={label("discovery.pluginsDesc", "Plugins reported by the engine.")} />
      <BlockCustom>
        <div className="discovery-toolbar">
          <input className="discovery-search-input" placeholder={label("discovery.searchPlugins", "Search plugins")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <SettingsButton label={label("pets.refresh", "Refresh")} onClick={refresh} />
        </div>
        {actionError ? <div className="approval-card-error">{actionError}</div> : null}
      </BlockCustom>
      {error ? <Empty>{error}</Empty> : data === null ? <Loading /> : list.length === 0 ? <Empty>{label("discovery.noPlugins", "No plugins reported")}</Empty> : (
        <BlockCustom title={label("discovery.installed", "Installed")}>
          <div className="plugins-grid">
            {list.map((item, i) => {
              const id = text(item, "id", "name");
              const name = text(item, "name", "id");
              const enabled = pluginIsEnabled(item);
              return (
                <div className="plugin-card" key={String(item.id ?? item.name ?? i)} data-plugin-id={id}>
                  <div className="plugin-card-title">{name}</div>
                  <div className="plugin-card-desc">{text(item, "desc", "description")}</div>
                  <div className="plugin-card-meta">{text(item, "status", "version")}</div>
                  <div className="pc-foot">
                    <button
                      type="button"
                      className="ui-toggle"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={name || id}
                      disabled={!id || busyId !== null}
                      data-plugin-toggle={id}
                      onClick={() => void togglePlugin(item)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </BlockCustom>
      )}
    </section>
  );
}

function PullRequestsView() {
  const { data, error, refresh } = useBackendList("list_pull_requests");

  return (
    <section className="view view-discovery" id="view-pullrequests">
      <PageHead title={label("discovery.pullrequests", "Pull requests")} desc={label("discovery.pullrequestsDesc", "Pull requests reported by the backend.")} />
      <BlockCustom>
        <div className="discovery-toolbar">
          <SettingsButton label={label("pets.refresh", "Refresh")} onClick={refresh} />
          <SettingsButton label={label("discovery.newTask", "New task")} onClick={() => navigate("home")} />
        </div>
      </BlockCustom>
      {error ? <Empty>{error}</Empty> : data === null ? <Loading /> : data.length === 0 ? <Empty>{label("discovery.noPullRequests", "No pull requests")}</Empty> : (
        <BlockCustom title={label("discovery.pullrequests", "Pull requests")}>
          <div className="plugins-grid">
            {data.map((item, i) => (
              <div className="plugin-card" key={String(item.id ?? item.number ?? i)}>
                <div className="plugin-card-title">{text(item, "title", "name", "id")}</div>
                <div className="plugin-card-desc">{text(item, "body", "description", "desc")}</div>
                <div className="plugin-card-meta">{text(item, "state", "status", "author")}</div>
              </div>
            ))}
          </div>
        </BlockCustom>
      )}
    </section>
  );
}
