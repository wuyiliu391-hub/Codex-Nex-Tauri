/**
 * Force re-render when the interface language changes.
 *
 * React components call `t()` during render. Vanilla `applyLanguage()` only
 * patches `data-i18n` DOM nodes, so chrome that never remounts (TitleBar
 * menus, etc.) kept the boot language forever. This hook subscribes to the
 * i18n revision counter that `applyLanguage()` bumps.
 */
import { useSyncExternalStore } from "react";
import { getLangRevision, subscribeLang } from "../../src/js/i18n.js";

export function useI18n(): number {
  return useSyncExternalStore(subscribeLang, getLangRevision, getLangRevision);
}
