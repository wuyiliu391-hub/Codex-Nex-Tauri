/**
 * Discovery views: Scheduled, Plugins and Pull Requests.
 *
 * Replaces discovery.js. Each page fetches its own data from a backend command
 * when entered; empty states are genuine empty responses, never seeded cards.
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
        if (active) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, [command, revision]);

  return { data, error, refresh: () => setRevision((v) => v + 1) };
}

export function DiscoveryView({ view }: { view: "scheduled" | "plugins" | "pullrequests" }) {
  if (view === "scheduled") return <ScheduledView />;
  if (view === "plugins") return <PluginsView />;
  return <PullRequestsView />;
}

function ScheduledView() {
  const { data, error, refresh } = useBackendList("list_scheduled_tasks");
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((item) => {
      if (!q) return true;
      return ["title", "name", "description", "desc"].some((key) => text(item, key).toLowerCase().includes(q));
    });
  }, [data, query]);

  return (
    <section className="view view-discovery" id="view-scheduled">
      <PageHead title={label("discovery.scheduled", "Scheduled")} desc={label("discovery.scheduledDesc", "Tasks scheduled by the backend.")} />
      <BlockCustom>
        <div className="discovery-toolbar">
          <input className="discovery-search-input" placeholder={label("discovery.searchScheduled", "Search scheduled tasks")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <SettingsButton label={label("pets.refresh", "Refresh")} onClick={refresh} />
        </div>
      </BlockCustom>
      {error ? <Empty>{error}</Empty> : data === null ? <Loading /> : list.length === 0 ? <Empty>{label("discovery.noScheduled", "No scheduled tasks")}</Empty> : (
        <BlockCustom title={label("discovery.suggestions", "Scheduled tasks")}>
          <div className="suggestion-list">
            {list.map((item, i) => (
              <div className="suggestion-card" key={String(item.id ?? item.title ?? i)}>
                <div className="suggestion-card-title">{text(item, "title", "name")}</div>
                <div className="suggestion-card-desc">{text(item, "desc", "description")}</div>
                <div className="suggestion-card-meta">{text(item, "status", "cron", "schedule")}</div>
              </div>
            ))}
          </div>
        </BlockCustom>
      )}
    </section>
  );
}

function PluginsView() {
  const { data, error, refresh } = useBackendList("list_plugins");
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((item) => !q || ["name", "id", "description", "desc"].some((key) => text(item, key).toLowerCase().includes(q)));
  }, [data, query]);

  return (
    <section className="view view-discovery" id="view-plugins">
      <PageHead title={label("discovery.plugins", "Plugins")} desc={label("discovery.pluginsDesc", "Plugins reported by the engine.")} />
      <BlockCustom>
        <div className="discovery-toolbar">
          <input className="discovery-search-input" placeholder={label("discovery.searchPlugins", "Search plugins")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <SettingsButton label={label("pets.refresh", "Refresh")} onClick={refresh} />
        </div>
      </BlockCustom>
      {error ? <Empty>{error}</Empty> : data === null ? <Loading /> : list.length === 0 ? <Empty>{label("discovery.noPlugins", "No plugins reported")}</Empty> : (
        <BlockCustom title={label("discovery.installed", "Installed")}>
          <div className="plugins-grid">
            {list.map((item, i) => (
              <div className="plugin-card" key={String(item.id ?? item.name ?? i)}>
                <div className="plugin-card-title">{text(item, "name", "id")}</div>
                <div className="plugin-card-desc">{text(item, "desc", "description")}</div>
                <div className="plugin-card-meta">{text(item, "status", "version")}</div>
              </div>
            ))}
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
