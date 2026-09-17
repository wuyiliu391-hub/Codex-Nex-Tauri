/**
 * Modal dialog. Replaces the imperative openModal() from modal.js.
 *
 * Same contract as the vanilla control: Esc and backdrop dismiss when
 * dismissible, focus lands on the primary action, and onClose fires exactly
 * once with the reason.
 *
 * Styling moved out of the injected <style> block into app/styles/modal.css,
 * using the same tokens so the appearance is unchanged.
 */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export interface ModalAction {
  label: string;
  variant?: "primary" | "ghost";
  /** Defaults to true. Set false to keep the dialog open. */
  closeOnClick?: boolean;
  onClick?: (close: (reason?: string) => void) => void;
}

interface ModalProps {
  open: boolean;
  title?: string;
  children?: ReactNode;
  actions?: ModalAction[];
  /** Esc / backdrop close. Defaults to true. */
  dismissible?: boolean;
  onClose: (reason: string) => void;
}

export function Modal({
  open,
  title = "",
  children,
  actions = [],
  dismissible = true,
  onClose,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Guard so onClose fires once per open cycle even if Esc and backdrop race.
  const closingRef = useRef(false);

  useEffect(() => {
    if (!open) {
      closingRef.current = false;
      return;
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" || !dismissible || closingRef.current) return;
      e.stopPropagation();
      e.preventDefault();
      closingRef.current = true;
      onClose("escape");
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, dismissible, onClose]);

  // Focus the primary action for keyboard users, as the vanilla modal did.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const primary = panel.querySelector<HTMLButtonElement>(".ui-button--primary");
    const first = primary ?? panel.querySelector<HTMLButtonElement>(".ui-button");
    first?.focus();
  }, [open]);

  if (!open) return null;

  function close(reason: string): void {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose(reason);
  }

  return (
    <div className="ui-modal-root" role="presentation">
      <div
        className="ui-modal-backdrop"
        onClick={() => {
          if (dismissible) close("backdrop");
        }}
      />
      <div
        className="ui-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title || undefined}
        ref={panelRef}
      >
        <h2 className="ui-modal-title">{title}</h2>
        <div className="ui-modal-body">{children}</div>
        <div className="ui-modal-actions">
          {actions.map((action, i) => (
            <button
              type="button"
              key={`${action.label}-${i}`}
              className={
                action.variant === "primary"
                  ? "ui-button ui-button--primary"
                  : action.variant === "ghost"
                    ? "ui-button ui-button--ghost"
                    : "ui-button"
              }
              onClick={() => {
                const keepOpen = action.closeOnClick === false;
                try {
                  action.onClick?.(close);
                } catch (err) {
                  console.error("[modal] action failed", err);
                }
                if (!keepOpen) close(`action:${action.label}`);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
