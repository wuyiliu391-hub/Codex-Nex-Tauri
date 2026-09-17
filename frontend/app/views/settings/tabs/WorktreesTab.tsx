/**
 * Worktrees tab — root picker, refresh and the worktree list.
 *
 * Ports renderWorktrees() from settings.js. The root is a shell preference;
 * the list comes from the engine (RefreshWorktrees).
 */

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { saveSection, usePrefSection } from "@/state/preferencesStore";
import { Block, PageHead, SettingsButton } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface WorktreesPrefs {
  root?: string;
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

      <Block title={label("worktrees.root")}>
        <div className="worktree-root">{prefs.root || label("worktrees.notSet")}</div>
        <SettingsButton label={label("worktrees.pickRoot")} onClick={() => void pickRoot()} />
        <SettingsButton label={label("worktrees.refresh")} onClick={() => void refresh()} />
      </Block>

      <Block title={label("worktrees.list")}>
        {worktrees.length === 0 ? (
          <div className="settings-card site-empty">{label("worktrees.empty")}</div>
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
