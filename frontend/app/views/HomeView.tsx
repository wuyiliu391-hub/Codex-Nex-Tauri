/**
 * Home view — the conversation surface.
 *
 * Composes three things:
 *   - the blank-home guide (hero), shown only when there is no history and no
 *     live turn, matching the official empty state
 *   - the composer
 *   - the turn stream (already-ported part)
 *
 * Sending is driven entirely through the backend: `new_session` when no thread
 * is open, then `send_message`. Nothing is faked locally.
 */

import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../src/js/i18n.js";
import { Composer } from "./Composer";
import { TurnStream } from "./TurnStream";
import {
  refreshAppState,
  saveSettings,
  setActiveSession,
  setEngineStatus,
  useAppState,
  type SettingsState,
} from "@/state/appStore";
import { loadThreadFromSession } from "@/state/turnStore";
import { useTurnState } from "@/state/hooks";

/**
 * Prompt cards — same keys/order/DOM as vanilla home.js renderPromptCards.
 * Keys must match i18n `home.prompt.*` (explore|build|review|fix). A wrong key
 * makes `t()` return the raw key (the "home.prompt.explain" screenshot).
 */
const PROMPT_CARDS = [
  {
    key: "explore",
    color: "blue",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="9" cy="9" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="m13 13 3.2 3.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "build",
    color: "purple",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M12.5 3.5 16.5 7.5 8 16H4v-4L12.5 3.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="m11 5 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "review",
    color: "green",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4 4.5h12v11H4z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 8h6M7 11h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "fix",
    color: "orange",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M11 3.5c2.2 1 3.5 3.2 3.5 5.7 0 1.4-.5 2.7-1.3 3.7L16 15.7 14.7 17l-2.8-2.8A6 6 0 0 1 5 9.2C5 6.7 6.3 4.5 8.5 3.5L10 6l1-2.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
] as const;

function Hero() {
  return (
    <div className="home-center" id="home-empty">
      <div className="home-hero" aria-hidden="true">
        <svg viewBox="0 0 21 21" fill="currentColor">
          <path d="M11.65 18.34a4.3 4.3 0 0 1-2.89-1.19 4.4 4.4 0 0 1-1.3.22 4.4 4.4 0 0 1-3.56-1.83 4.3 4.3 0 0 1-.43-4.14A4.3 4.3 0 0 1 5.11 5.14a4.4 4.4 0 0 1 2.89-2.34 4.3 4.3 0 0 1 4.04.76 4.3 4.3 0 0 1 4.34 1.15 4.3 4.3 0 0 1 1.15 4.13 4.3 4.3 0 0 1-1.52 5.52 4.4 4.4 0 0 1-4.36 3.98ZM7.57 16.28a2.4 2.4 0 0 0 1.44-.35l3.1-1.78a.5.5 0 0 0 .16-.31v-1.42l-3.99 2.3a.8.8 0 0 1-.73 0l-3.11-1.8v.31a2.4 2.4 0 0 0 .4 1.55 2.4 2.4 0 0 0 1.14 1.1 2.4 2.4 0 0 0 1.59.4Z" />
        </svg>
      </div>
      <h1 className="home-title">{String(t("home.title", "What should we build?"))}</h1>
      <div className="prompt-cards" id="prompt-cards">
        {PROMPT_CARDS.map((card) => {
          const label = String(t(`home.prompt.${card.key}`, card.key));
          return (
            <button
              className="prompt-card"
              key={card.key}
              type="button"
              data-prompt={card.key}
              onClick={() =>
                window.dispatchEvent(new CustomEvent("codex:use-prompt", { detail: label }))
              }
            >
              <span className={`pc-ico ${card.color}`}>{card.icon}</span>
              <span className="pc-label">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function HomeView() {
  const { settings, activeSessionId, projects, loaded } = useAppState();
  const turn = useTurnState();

  const running = turn.active;

  // Keep the shell's active session in sync when a thread is created.
  const onSessionCreated = useCallback((id: string) => {
    setActiveSession(id);
  }, []);

  const onRefresh = useCallback(() => {
    void refreshAppState();
  }, []);

  const onSettingsChange = useCallback((patch: Partial<SettingsState>) => {
    void saveSettings(patch);
  }, []);

  // Hydrate history whenever the active session changes (sidebar / stepTask).
  // Skip while a turn is already live for this thread — the composer creates
  // the session and begins the user turn in the same tick, and a reload here
  // would wipe that optimistic bubble.
  useEffect(() => {
    if (!activeSessionId) return;
    if (turn.active && turn.sessionId === activeSessionId) return;
    void loadThreadFromSession(activeSessionId);
  }, [activeSessionId, turn.active, turn.sessionId]);

  // Prompt cards dispatch codex:use-prompt; Composer owns the controlled
  // textarea and applies the fill via setText (not a DOM value poke).

  // Probe engine status once; result is stored for the empty-state / diagnostics.
  useEffect(() => {
    void invoke<{ connected?: boolean; initialize?: Record<string, unknown> }>("engine_status")
      .then((raw) => {
        setEngineStatus({
          connected: raw?.connected === true,
          initialize: raw?.initialize ?? null,
        });
      })
      .catch(() => {
        setEngineStatus({ connected: false, initialize: null });
      });
  }, []);

  const hasHistory = turn.order.length > 0;
  const showHero = !hasHistory && !running;

  return (
    <section className="view view-home" id="view-home">
      <div className={`home-main-col${showHero ? " is-empty" : ""}`} id="home-main-col">
        {showHero ? <Hero /> : null}

        <div className="thread" id="thread">
          <TurnStream />
        </div>

        <Composer
          running={running}
          activeSessionId={activeSessionId}
          settings={settings}
          onSettingsChange={onSettingsChange}
          onSessionCreated={onSessionCreated}
          onRefresh={onRefresh}
        />


      </div>
    </section>
  );
}
