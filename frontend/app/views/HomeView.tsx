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
import { useI18n } from "@/shell/useI18n";
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
  useI18n();
  return (
    <div className="home-center" id="home-empty">
      <div className="home-hero" aria-hidden="true">
        {/* Official Codex mark from user-provided codex.svg (currentColor). */}
        <svg
          viewBox="0 0 24 24"
          width="100%"
          height="100%"
          fill="currentColor"
          fillRule="evenodd"
          style={{ flex: "none", lineHeight: 1 }}
        >
          <title>Codex</title>
          <path
            clipRule="evenodd"
            d="M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z"
          />
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
