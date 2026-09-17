/**
 * Environments tab — the projects list.
 *
 * Ports renderEnvironments() from settings.js. Projects are a shell preference
 * list (name + path); the engine has no separate project concept. Add/remove
 * mutate the list and persist via save_preferences (real IPC).
 */

import { useState } from "react";
import { t } from "../../../../src/js/i18n.js";
import { saveSection, usePrefSection } from "@/state/preferencesStore";
import { Block, PageHead, SettingsButton } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface EnvironmentProject {
  name: string;
  path?: string;
}

interface EnvironmentsPrefs {
  projects?: EnvironmentProject[];
}

export function EnvironmentsTab() {
  const prefs = usePrefSection<EnvironmentsPrefs>("environments");
  const projects = Array.isArray(prefs.projects) ? prefs.projects : [];
  const [busy, setBusy] = useState(false);

  async function persist(next: EnvironmentProject[]): Promise<void> {
    setBusy(true);
    try {
      await saveSection("environments", { projects: next });
    } finally {
      setBusy(false);
    }
  }

  function addProject(): void {
    const path = window.prompt(label("environments.path", "Project path"), "");
    if (!path) return;
    const name =
      window.prompt(label("environments.name", "Project name"), path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path) ||
      path;
    void persist([...projects, { name, path }]);
  }

  function removeProject(index: number): void {
    const next = projects.filter((_, i) => i !== index);
    void persist(next);
  }

  return (
    <>
      <PageHead title={label("environments.title")} />
      <Block
        title={label("environments.projects")}
        extra={
          <SettingsButton
            label={label("environments.add", "Add project")}
            kind="primary"
            action="add-environment"
            disabled={busy}
            onClick={addProject}
          />
        }
      >
        {projects.length === 0 ? (
          <div className="settings-card site-empty">{label("environments.empty")}</div>
        ) : (
          <div className="env-list">
            {projects.map((p, i) => (
              <div className="plugin-row" key={`${p.path ?? ""}-${i}`}>
                <div className="plugin-icon">E</div>
                <div>
                  <div className="plugin-name">{p.name}</div>
                  <div className="plugin-desc">{p.path ?? ""}</div>
                </div>
                <SettingsButton
                  label={label("action.delete", "Delete")}
                  kind="danger"
                  disabled={busy}
                  onClick={() => removeProject(i)}
                />
              </div>
            ))}
          </div>
        )}
      </Block>
    </>
  );
}
