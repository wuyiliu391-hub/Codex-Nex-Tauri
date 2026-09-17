/**
 * Shared settings layout primitives.
 *
 * Direct equivalents of the helpers settings.js used to build HTML strings
 * (pageHead / block / blockCustom / row / button / inputEl). Reusing the same
 * class names means the existing stylesheets apply unchanged.
 */

import type { ReactNode } from "react";

export function PageHead({
  title,
  desc = "",
  compact = false,
}: {
  title: string;
  desc?: string;
  compact?: boolean;
}) {
  return (
    <div className={`settings-page-head${compact ? " compact" : ""}`}>
      <h1>{title}</h1>
      {desc ? <p>{desc}</p> : null}
    </div>
  );
}

export function Block({
  title,
  children,
  extra,
}: {
  title?: string;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <section className="settings-block">
      {title ? (
        <div className="settings-section-heading">
          <h2>{title}</h2>
          {extra}
        </div>
      ) : null}
      <div className="settings-card">{children}</div>
    </section>
  );
}

/** A block whose body is arbitrary markup rather than a card of rows. */
export function BlockCustom({
  title,
  children,
  extra,
}: {
  title?: string;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <section className="settings-block">
      {title ? (
        <div className="settings-section-heading">
          <h2>{title}</h2>
          {extra}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Row({
  label,
  desc,
  control,
  className = "",
}: {
  label: string;
  desc?: string;
  control: ReactNode;
  className?: string;
}) {
  return (
    <div className={`settings-row ${className}`.trim()}>
      <div className="settings-row-copy">
        <div className="settings-row-title">{label}</div>
        {desc ? <div className="settings-row-description">{desc}</div> : null}
      </div>
      <div className="settings-row-control">{control}</div>
    </div>
  );
}

export function SettingsButton({
  label,
  kind = "",
  disabled = false,
  onClick,
  action,
}: {
  label: string;
  kind?: "" | "primary" | "danger" | "ghost";
  disabled?: boolean;
  onClick?: () => void;
  /** Kept for parity with the vanilla data-action attributes. */
  action?: string;
}) {
  return (
    <button
      className={`settings-button ${kind}`.trim()}
      type="button"
      data-action={action}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** Toggle switch — mirrors settings.js's switchEl(). */
export function Switch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="settings-switch">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span />
    </label>
  );
}

/** Segmented control — mirrors settings.js's segmented(). */
export function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={option.value === value ? "is-active" : ""}
          data-value={option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Multiline text — mirrors settings.js's textarea usage. */
export function TextArea({
  value,
  onChange,
  ariaLabel,
  rows = 8,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  rows?: number;
}) {
  return (
    <textarea
      className="settings-textarea"
      value={value}
      rows={rows}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextInput({
  name,
  value,
  placeholder = "",
  onChange,
  type = "text",
}: {
  name: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  type?: "text" | "password" | "number";
}) {
  return (
    <input
      className="settings-input"
      type={type}
      data-input={name}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
