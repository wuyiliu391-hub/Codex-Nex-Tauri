/**
 * Environments tab — the projects list.
 *
 * Ports renderEnvironments() from settings.js. Projects are a shell preference
 * list (name + path); the engine has no separate project concept.
 */

import { t } from "../../../../src/js/i18n.js";
import { usePrefSection } from "@/state/preferencesStore";
import { Block, PageHead } from "../primitives";

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

  return (
    <>
      <PageHead title={label("environments.title")} />
      <Block title={label("environments.projects")}>
        {projects.length === 0 ? (
          <div className="settings-card site-empty">{label("environments.empty")}</div>
        ) : (
          <div className="env-list">
            {projects.map((p, i) => (
              <div className="plugin-row" key={i}>
                <div className="plugin-icon">E</div>
                <div>
                  <div className="plugin-name">{p.name}</div>
                  <div className="plugin-desc">{p.path ?? ""}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Block>
    </>
  );
}
