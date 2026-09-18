/**
 * Plugins tab — the engine-reported MCP server list plus plugin list.
 *
 * Ports renderPlugins() from settings.js. Servers come from list_mcp_servers
 * (mcpServerStatus/list); adding a server writes through save_mcp_server.
 * Enable/disable and test-connection use the dedicated engine commands.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { Block, PageHead, Segmented, SettingsButton, Switch } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface McpServer {
  name: string;
  transport: string;
  enabled: boolean;
  status: string;
  command: string;
}

interface PluginEntry {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function pickList(raw: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  const rec = asRecord(raw);
  for (const key of keys) {
    const v = rec[key];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function asServers(raw: unknown): McpServer[] {
  return pickList(raw, "servers", "data").map((entry) => {
    const s = asRecord(entry);
    return {
      name: typeof s["name"] === "string" ? s["name"] : String(s["id"] ?? ""),
      transport: typeof s["transport"] === "string" ? s["transport"] : "",
      enabled: s["enabled"] !== false,
      status: typeof s["status"] === "string" ? s["status"] : "",
      command: typeof s["command"] === "string" ? s["command"] : "",
    };
  }).filter((s) => s.name !== "");
}

function asPlugins(raw: unknown): PluginEntry[] {
  return pickList(raw, "plugins", "data").map((entry) => {
    const p = asRecord(entry);
    return {
      id: typeof p["id"] === "string" ? p["id"] : String(p["name"] ?? ""),
      name: typeof p["name"] === "string" ? p["name"] : String(p["id"] ?? ""),
      description: typeof p["description"] === "string" ? p["description"] : "",
      enabled: p["enabled"] !== false && p["uninstalled"] !== true,
    };
  }).filter((p) => p.id !== "");
}

export function PluginsTab() {
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [probeResult, setProbeResult] = useState<string>("");
  // Official 插件/MCP filter — plugins view first, matching the official default.
  const [filter, setFilter] = useState<"plugins" | "mcp">("plugins");

  const refresh = useCallback(() => {
    void invoke<unknown>("list_mcp_servers")
      .then((raw) => setServers(asServers(raw)))
      .catch(() => setServers([]));
    void invoke<unknown>("list_plugins")
      .then((raw) => setPlugins(asPlugins(raw)))
      .catch(() => setPlugins([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addServer(): Promise<void> {
    const name = window.prompt(label("plugins.mcpName"));
    if (!name) return;
    const transport = window.prompt(label("plugins.mcpTransport", "Transport"), "stdio") || "stdio";
    const command = window.prompt(label("plugins.mcpCommand", "Command"), "") || "";
    try {
      await invoke("save_mcp_server", {
        server: { name, transport, command, enabled: true },
      });
    } catch (err) {
      console.warn("[plugins] save mcp server failed", err);
    }
    refresh();
  }

  async function toggleServer(name: string, enabled: boolean): Promise<void> {
    try {
      await invoke("set_mcp_server_enabled", { name, enabled });
    } catch (err) {
      console.warn("[plugins] set_mcp_server_enabled failed", err);
    }
    refresh();
  }

  async function testConnection(server: McpServer): Promise<void> {
    setProbeResult(label("account.probing", "Probing…"));
    try {
      const result = await invoke<unknown>("test_mcp_connection", {
        server: {
          name: server.name,
          transport: server.transport,
          command: server.command,
          enabled: server.enabled,
        },
      });
      const rec = asRecord(result);
      const list = pickList(result, "servers", "data");
      const match = list
        .map((e) => asRecord(e))
        .find(
          (s) =>
            (typeof s["name"] === "string" && s["name"] === server.name) ||
            String(s["id"] ?? "") === server.name,
        );
      const status =
        (match && typeof match["status"] === "string" ? match["status"] : "") ||
        (typeof rec["status"] === "string" ? rec["status"] : "");
      setProbeResult(
        status
          ? `${server.name}: ${status}`
          : `${server.name}: ${label("account.probeOk", "ok")}`,
      );
    } catch (err) {
      setProbeResult(`${server.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function togglePlugin(id: string, enabled: boolean): Promise<void> {
    try {
      await invoke("set_plugin_enabled", { id, enabled });
    } catch (err) {
      console.warn("[plugins] set_plugin_enabled failed", err);
    }
    refresh();
  }

  return (
    <>
      {/* Official: 浏览目录 + 添加 (split dropdown) top-right of the page head.
          The 添加 dropdown is omitted — both entries need the L3 catalog
          backend, so a dead menu would be a fake control. */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <PageHead title={label("plugins.title")} desc={label("plugins.desc")} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 6 }}>
          {/* pending L3: plugin catalog browse flow */}
          <SettingsButton label={label("plugins.browseCatalog")} disabled />
        </div>
      </div>

      {/* Official 插件 N / MCP N filter pills — counts from the live lists. */}
      <div className="settings-block">
        <Segmented
          value={filter}
          options={[
            { value: "plugins", label: `${label("plugins.tabPlugins", "Plugins")} ${plugins.length}` },
            { value: "mcp", label: `${label("plugins.tabMcps", "MCP")} ${servers?.length ?? 0}` },
          ]}
          onChange={(v) => setFilter(v === "mcp" ? "mcp" : "plugins")}
        />
      </div>

      {filter === "plugins" ? (
        <Block>
          {plugins.length === 0 ? (
            <div className="site-empty">{label("plugins.noPlugins", "No plugins")}</div>
          ) : (
            <div className="plugin-list">
              {plugins.map((p) => (
                <div className="plugin-row" key={p.id}>
                  <div className="plugin-icon">P</div>
                  <div>
                    <div className="plugin-name">{p.name}</div>
                    <div className="plugin-desc">{p.description || p.id}</div>
                  </div>
                  <Switch
                    checked={p.enabled}
                    onChange={(v) => void togglePlugin(p.id, v)}
                  />
                </div>
              ))}
            </div>
          )}
        </Block>
      ) : (
        <Block title={label("plugins.mcpServers")}>
          {servers === null ? (
            <div className="site-empty">{label("discovery.loading", "Loading…")}</div>
          ) : servers.length === 0 ? (
            <div className="site-empty">{label("plugins.noMcp")}</div>
          ) : (
            <div className="plugin-list">
              {servers.map((s, i) => (
                <div className="plugin-row" key={s.name || i}>
                  <div className="plugin-icon">M</div>
                  <div>
                    <div className="plugin-name">{s.name}</div>
                    <div className="plugin-desc">
                      {[s.transport, s.status, s.command].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="provider-row-actions">
                    <SettingsButton
                      label={label("connections.test", "Test")}
                      onClick={() => void testConnection(s)}
                    />
                    <Switch
                      checked={s.enabled}
                      onChange={(v) => void toggleServer(s.name, v)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {probeResult ? <div className="site-empty">{probeResult}</div> : null}
          <div className="connections-foot">
            <SettingsButton
              label={label("plugins.addMcp")}
              kind="primary"
              onClick={() => void addServer()}
            />
          </div>
        </Block>
      )}
    </>
  );
}
