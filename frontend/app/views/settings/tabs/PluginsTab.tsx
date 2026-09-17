/**
 * Plugins tab — the engine-reported MCP server list.
 *
 * Ports renderPlugins() from settings.js. Servers come from list_mcp_servers
 * (mcpServerStatus/list); adding a server writes through save_mcp_server.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { Block, PageHead, SettingsButton } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface McpServer {
  name: string;
  transport: string;
}

function asServers(raw: unknown): McpServer[] {
  const rec = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(rec["servers"])
    ? (rec["servers"] as unknown[])
    : Array.isArray(rec["data"])
      ? (rec["data"] as unknown[])
      : Array.isArray(raw)
        ? raw
        : [];
  return list.map((entry) => {
    const s = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    return {
      name: typeof s["name"] === "string" ? s["name"] : String(s["id"] ?? ""),
      transport: typeof s["transport"] === "string" ? s["transport"] : "",
    };
  });
}

export function PluginsTab() {
  const [servers, setServers] = useState<McpServer[] | null>(null);

  const refresh = useCallback(() => {
    void invoke<unknown>("list_mcp_servers")
      .then((raw) => setServers(asServers(raw)))
      .catch(() => setServers([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addServer(): Promise<void> {
    const name = window.prompt(label("plugins.mcpName"));
    if (!name) return;
    try {
      await invoke("save_mcp_server", {
        server: { name, transport: "stdio", command: "", enabled: true },
      });
    } catch (err) {
      console.warn("[plugins] save mcp server failed", err);
    }
    refresh();
  }

  return (
    <>
      <PageHead title={label("plugins.title")} />
      <Block title={label("plugins.mcpServers")}>
        {servers === null ? (
          <div className="site-empty">{label("discovery.loading", "Loading…")}</div>
        ) : servers.length === 0 ? (
          <div className="settings-card site-empty">{label("plugins.noMcp")}</div>
        ) : (
          <div className="plugin-list">
            {servers.map((s, i) => (
              <div className="plugin-row" key={i}>
                <div className="plugin-icon">M</div>
                <div>
                  <div className="plugin-name">{s.name}</div>
                  <div className="plugin-desc">{s.transport}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <SettingsButton
          label={label("plugins.addMcp")}
          kind="primary"
          onClick={() => void addServer()}
        />
      </Block>
    </>
  );
}
