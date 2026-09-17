/**
 * Generic settings data tab for settings whose dedicated backend command has
 * not been ported yet.
 *
 * This is intentionally not a fake settings page: when an endpoint exists we
 * call it and render its real result; when it does not exist we show an honest
 * capability notice. The component gives every official tab a React route
 * without inventing controls that cannot affect the engine.
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { PageHead, SettingsButton } from "../primitives";

interface Props {
  id: string;
  title: string;
  command?: string;
  args?: Record<string, unknown>;
}

function label(key: string, fallback: string): string {
  return String(t(key, fallback));
}

export function BackendSettingsTab({ id, title, command, args = {} }: Props) {
  const [value, setValue] = useState<unknown>(null);
  const [loading, setLoading] = useState(Boolean(command));
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    if (!command) {
      setLoading(false);
      setValue(null);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setError(null);
    void invoke(command, args)
      .then((raw) => {
        if (!active) return;
        setValue(raw);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [command, revision]);

  return (
    <>
      <PageHead title={title} />
      <section className="settings-block">
        <div className="settings-section-heading">
          <h2>{command ? label("settings.backendData", "Backend data") : label("settings.capability", "Capability")}</h2>
          {command ? (
            <SettingsButton
              label={label("pets.refresh", "Refresh")}
              onClick={() => setRevision((v) => v + 1)}
            />
          ) : null}
        </div>
        <div className="settings-card">
          {!command ? (
            <div className="site-empty">
              {label(
                "settings.endpointUnavailable",
                `No native app-server endpoint is wired for ${id} yet. This tab is rendered by React, but no fake controls are shown.`,
              )}
            </div>
          ) : loading ? (
            <div className="site-empty">{label("discovery.loading", "Loading…")}</div>
          ) : error ? (
            <div className="site-empty">
              {label("settings.backendError", "Backend request failed")}: {error}
            </div>
          ) : (
            <pre className="settings-json-output">
              {JSON.stringify(value, null, 2)}
            </pre>
          )}
        </div>
      </section>
    </>
  );
}
