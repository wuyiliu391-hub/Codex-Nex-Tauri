/**
 * Worktrees tab — root, fetch/cleanup preferences and the worktree list.
 *
 * Ports renderWorktrees() from settings.js to the official v26.911 layout.
 * The root is a shell preference (text input + the real directory picker);
 * the list comes from the engine (worktree/list rpc).
 */

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { saveSection, usePrefSection } from "@/state/preferencesStore";
import { Block, PageHead, Row, SettingsButton, Switch, TextInput } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface WorktreesPrefs {
  root?: string;
  autoFetch?: boolean;
  autoCleanup?: boolean;
  retention?: number;
}

interface WorktreeEntry {
  branch: string;
  path: string;
  status: string;
}

function asWorktrees(raw: unknown): WorktreeEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const rec = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    return {
      branch: typeof rec["branch"] === "string" ? rec["branch"] : "",
      path: typeof rec["path"] === "string" ? rec["path"] : "",
      status: typeof rec["status"] === "string" ? rec["status"] : "active",
    };
  });
}

export function WorktreesTab() {
  const prefs = usePrefSection<WorktreesPrefs>("worktrees");
  const [worktrees, setWorktrees] = useState<WorktreeEntry[]>([]);

  async function pickRoot(): Promise<void> {
    try {
      const picked = await invoke<string | string[] | null>("plugin:dialog|open", {
        options: { directory: true, multiple: false, title: label("worktrees.pickRoot", "Pick worktree root") },
      });
      const path = Array.isArray(picked) ? picked[0] : picked;
      if (typeof path === "string" && path) {
        await saveSection("worktrees", { root: path });
        try {
          const raw = await invoke<unknown>("rpc_raw", {
            method: "worktree/list",
            params: { root: path },
          });
          setWorktrees(asWorktrees(raw));
        } catch {
          setWorktrees([]);
        }
      }
    } catch (err) {
      console.warn("[worktrees] pick root failed", err);
    }
  }

  async function refresh(): Promise<void> {
    try {
      const raw = await invoke<unknown>("rpc_raw", {
        method: "worktree/list",
        params: { root: prefs.root ?? "" },
      });
      setWorktrees(asWorktrees(raw));
    } catch {
      setWorktrees([]);
    }
  }

  return (
    <>
      <PageHead title={label("worktrees.title")} />

      <Block>
        <Row
          label={label("worktrees.root")}
          desc={label("worktrees.rootDesc")}
          control={
            <>
              <TextInput
                name="worktreesRoot"
                value={prefs.root ?? ""}
                onChange={(v) => void saveSection("worktrees", { root: v })}
              />
              <SettingsButton label={label("worktrees.change", "Change")} onClick={() => void pickRoot()} />
            </>
          }
        />
        <Row
          label={label("worktrees.fetchBeforeCreate")}
          desc={label("worktrees.fetchBeforeCreateDesc")}
          control={
            <Switch
              checked={prefs.autoFetch === true}
              onChange={(v) => void saveSection("worktrees", { autoFetch: v })}
            />
          }
        />
        <Row
          label={label("worktrees.autoDelete")}
          desc={label("worktrees.autoDeleteDesc")}
          control={
            <Switch
              checked={prefs.autoCleanup !== false}
              onChange={(v) => void saveSection("worktrees", { autoCleanup: v })}
            />
          }
        />
        <Row
          label={label("worktrees.limit")}
          desc={label("worktrees.limitDesc")}
          control={
            <TextInput
              name="worktreesRetention"
              type="number"
              value={String(prefs.retention ?? 15)}
              onChange={(v) => {
                const n = Number.parseInt(v, 10);
                if (Number.isFinite(n)) void saveSection("worktrees", { retention: n });
              }}
            />
          }
        />
      </Block>

      <Block>
        {worktrees.length === 0 ? (
          <div className="site-empty">
            <div>{label("worktrees.emptyTitle", "No worktrees yet")}</div>
            <SettingsButton label={label("worktrees.refresh")} onClick={() => void refresh()} />
            <div>{label("worktrees.emptyHint", "")}</div>
          </div>
        ) : (
          <div className="worktree-list">
            {worktrees.map((w, i) => (
              <div className="plugin-row" key={i}>
                <div className="plugin-icon">W</div>
                <div>
                  <div className="plugin-name">{w.branch || w.status || "worktree"}</div>
                  <div className="plugin-desc">{w.path}</div>
                </div>
                <span>{w.status}</span>
              </div>
            ))}
          </div>
        )}
      </Block>
    </>
  );
}
