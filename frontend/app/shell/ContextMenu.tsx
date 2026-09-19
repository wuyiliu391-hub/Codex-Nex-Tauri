/**
 * ContextMenu for task-row (session right-click menu)
 * 
 * Tauri context menu implementation with delete option
 */

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadThreadFromSession, resetTurn } from "@/state/turnStore";
import { setActiveSession, refreshAppState } from "@/state/appStore";
import { navigate } from "./useRoute";

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  sessionId: string | null;
}

export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    sessionId: null,
  });

  async function handleDeleteSession(): Promise<void> {
    if (!state.sessionId) return;
    
    // Secondary confirmation to prevent accidental deletion
    if (!window.confirm("确定要删除此会话吗？")) return;
    
    try {
      await invoke("delete_session", { sessionId: state.sessionId });
      
      // Reset current turn if deleted session was active
      resetTurn();
      setActiveSession(null);
      
      await refreshAppState();
    } catch (err) {
      console.error("[context-menu] delete_session failed", err);
    } finally {
      setState((s) => ({ ...s, visible: false }));
    }
  }

  /**
   * Show context menu with viewport boundary detection
   * Automatically adjusts coordinates if menu would overflow screen edges
   */
  function show(e: React.MouseEvent, sessionId: string): void {
    e.preventDefault();
    e.stopPropagation();
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Estimate menu size (adjust based on actual CSS)
    const MENU_WIDTH = 180;  // Width + padding/border from shell.css
    const MENU_HEIGHT = 60;  // Height for ~3 items
    
    // Calculate adjusted position to stay within viewport
    let adjustedX = e.clientX;
    let adjustedY = e.clientY;
    
    // Check right edge overflow
    if (e.clientX + MENU_WIDTH > viewportWidth) {
      adjustedX = Math.max(0, viewportWidth - MENU_WIDTH);
    }
    
    // Check bottom edge overflow
    if (e.clientY + MENU_HEIGHT > viewportHeight) {
      adjustedY = Math.max(0, viewportHeight - MENU_HEIGHT);
    }
    
    // Also ensure we don't go negative (top/left edge)
    adjustedX = Math.max(0, adjustedX);
    adjustedY = Math.max(0, adjustedY);
    
    setState({
      visible: true,
      x: adjustedX,
      y: adjustedY,
      sessionId,
    });
  }

  function hide(): void {
    setState((s) => ({ ...s, visible: false }));
  }

  return { state, show, hide, handleDeleteSession };
}
