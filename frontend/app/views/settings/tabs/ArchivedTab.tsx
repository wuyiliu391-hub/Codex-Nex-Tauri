/**
 * Archived tasks tab — list of archived sessions with unarchive / delete-all.
 *
 * Ports renderArchived() from settings.js.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { Block, PageHead, SettingsButton } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface ArchivedSession {
  id: string;
  title: string;
}

function asSessions(raw: unknown): ArchivedSession[] {
  const rec = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(rec["data"])
      ? (rec["data"] as unknown[])
      : [];
  const out: ArchivedSession[] = [];
  for (const entry of list) {
    const s = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const id = typeof s["id"] === "string" ? s["id"] : null;
    if (!id) continue;
    out.push({
      id,
      title: typeof s["title"] === "string" ? s["title"] : typeof s["name"] === "string" ? s["name"] : "",
    });
  }
  return out;
}

export function ArchivedTab() {
  const [sessions, setSessions] = useState<ArchivedSession[] | null>(null);

  const refresh = useCallback(() => {
    void invoke<unknown>("list_sessions", { archived: true })
      .then((raw) => setSessions(asSessions(raw)))
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function unarchive(id: string): Promise<void> {
    try {
      await invoke("unarchive_session", { sessionId: id });
    } catch (err) {
      console.warn("[archived] unarchive failed", err);
    }
    refresh();
  }

  async function deleteAll(): Promise<void> {
    if (!window.confirm(label("archived.deleteAllConfirm"))) return;
    for (const s of sessions ?? []) {
      try {
        await invoke("delete_session", { sessionId: s.id });
      } catch {
        /* best effort */
      }
    }
    refresh();
  }

  return (
    <>
      <PageHead title={label("archived.title")} />
      <Block title={label("archived.list")}>
        {sessions === null ? (
          <div className="site-empty">{label("discovery.loading", "Loading…")}</div>
        ) : sessions.length === 0 ? (
          <div className="settings-card site-empty">{label("archived.empty")}</div>
        ) : (
          <div className="archived-list">
            {sessions.map((s) => (
              <div className="archived-item" key={s.id}>
                <span>{s.title || label("archived.untitled")}</span>
                <SettingsButton
                  label={label("archived.unarchive")}
                  onClick={() => void unarchive(s.id)}
                />
              </div>
            ))}
          </div>
        )}
        <SettingsButton
          label={label("archived.deleteAll")}
          kind="danger"
          onClick={() => void deleteAll()}
        />
      </Block>
    </>
  );
}
