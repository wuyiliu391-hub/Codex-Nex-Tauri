/**
 * Hash router — `#view` or `#view/subpage`.
 *
 * Same URL shape as the vanilla router so existing deep links keep working.
 * Exposed through useSyncExternalStore so any component can read the route
 * without a provider.
 */

import { useSyncExternalStore } from "react";

export interface Route {
  view: string;
  sub: string | null;
}

function parse(hash: string): Route {
  const raw = (hash || "#home").replace(/^#/, "") || "home";
  const [view, ...rest] = raw.split("/");
  return { view: view || "home", sub: rest.join("/") || null };
}

let current: Route = parse(typeof window !== "undefined" ? window.location.hash : "");
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Route {
  return current;
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getRoute(): Route {
  return current;
}

/** Navigate to a view, optionally with a sub-page. */
export function navigate(view: string, sub?: string): void {
  const target = sub ? `${view}/${sub}` : view;
  if (window.location.hash !== `#${target}`) {
    window.location.hash = target;
  }
}

/** Begin listening for hash changes. Returns a teardown function. */
export function installRouter(): () => void {
  const onChange = (): void => {
    current = parse(window.location.hash);
    emit();
  };
  window.addEventListener("hashchange", onChange);
  onChange();
  return () => window.removeEventListener("hashchange", onChange);
}
