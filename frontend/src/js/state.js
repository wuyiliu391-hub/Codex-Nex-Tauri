// Single source of truth for the frontend.

export const store = {
  snapshot: {},
  settings: defaultSettings(),
  providers: [],
  projects: [],
  sessions: [],
  activeSessionId: null,
  activeSession: null,
  preferences: defaultPreferences(),
  shortcuts: defaultShortcuts(),
  plugins: defaultPlugins(),
  connections: [],
  scheduled: defaultScheduled(),
  pets: defaultPets(),
  archived: [],
  dependencies: [],
  hooks: [],
  mcpServers: [],
  sitePermissions: [],
  worktrees: [],
  notifications: [],
  memory: [],
  running: false,
  pendingApproval: null,
  onRefresh: null,
  _settingsPage: null,
};

export function defaultSettings() {
  return {
    theme: "light",
    defaultPermissions: "workspace",
    autoReview: true,
    fullAccess: false,
    activeProviderId: "",
    activeModel: "",
    shell: "powershell",
    terminalShell: "powershell",
    language: "en",
    mcpServer: false,
    mcpServerPort: 1455,
    fileOpenDestination: "editor",
    bottomPanel: true,
    followUpMode: "ask",
    suggestedPrompts: true,
    notifyTaskUpdates: true,
    notifyScheduled: true,
    approvalPolicy: "ask",
    sandbox: "relaxed",
    // Official model slider (T20d): low|medium|high|xhigh|ultra → 轻度/标准/深度/极高/Ultra
    modelReasoningEffort: "xhigh",
  };
}

export function defaultPreferences() {
  return {
    appearance: {
      theme: "system",
      accent: "blue",
      sidebarStyle: "default",
      uiFontFamily: "Segoe UI Variable",
      codeFontFamily: "Carlito",
      uiFontSize: 15,
      codeFontSize: 13,
      contrast: "standard",
      reduceMotion: false,
      pointerCursors: true,
      diffMarkers: true,
    },
    voice: {
      tts: false,
      hotkey: "Ctrl+Shift+Space",
      keepBar: true,
      dictionary: "",
      microphone: "Default",
      recent: [],
    },
    personalization: {
      personality: "friendly",
      customInstructions: "",
      memoryEnabled: true,
    },
    pets: {
      selected: "codex",
      directory: "",
      size: 100,
      asleep: false,
    },
    browser: {
      enabled: true,
      openTarget: "embedded",
      screenshots: "ask",
      downloads: "",
      permissions: { "https://": "allow" },
      developerMode: false,
      fullCdpAccess: false,
    },
    computerUse: {
      anyApp: false,
      allowlist: [],
    },
    git: {
      branchPrefix: "",
      mergeMethod: "squash",
      forcePush: false,
      draftPR: false,
      reviewDelivery: "comments",
      commitInstructions: "",
    },
    environments: { projects: [] },
    worktrees: { root: "", autoCleanup: true, retention: 15 },
  };
}

export function mergeSettings(next) {
  return { ...defaultSettings(), ...(next || {}) };
}

export function mergePreferences(next) {
  const defaults = defaultPreferences();
  const incoming = next || {};
  const out = { ...defaults };
  for (const key of Object.keys(defaults)) {
    out[key] = { ...defaults[key], ...(incoming[key] || {}) };
  }
  return out;
}

function defaultShortcuts() {
  return [
    // Essentials (screenshots 472-476)
    { id: "new-task", label: "New task", keys: ["Ctrl", "N"] },
    { id: "new-window", label: "New window", keys: ["Ctrl", "Shift", "N"] },
    { id: "new-projectless-task", label: "New projectless task", keys: ["Ctrl", "Alt", "O"] },
    { id: "open-folder", label: "Open folder...", keys: ["Ctrl", "O"] },
    { id: "close", label: "Close", keys: ["Ctrl", "W"] },
    { id: "settings", label: "Settings", keys: ["Ctrl", ","] },
    { id: "send", label: "Send message", keys: ["Enter"] },
    { id: "newline", label: "New line", keys: ["Shift", "Enter"] },
    { id: "fullscreen", label: "Toggle fullscreen", keys: ["F11"] },
    { id: "zoom-in", label: "Zoom in", keys: ["Ctrl", "Shift", "="] },
    { id: "zoom-out", label: "Zoom out", keys: ["Ctrl", "-"] },
    { id: "actual-size", label: "Actual size", keys: ["Ctrl", "0"] },
    { id: "quit", label: "Quit Codex", keys: ["Ctrl", "Q"] },
    // Composer
    { id: "focus-composer", label: "Focus composer", keys: ["Ctrl", "L"] },
    { id: "open-attachment", label: "Open attachment", keys: ["Ctrl", "U"] },
    { id: "toggle-full-access", label: "Toggle full access", keys: ["Ctrl", "Shift", "A"] },
    { id: "toggle-model", label: "Toggle model", keys: ["Ctrl", "/"] },
    { id: "accept", label: "Accept suggestion", keys: ["Tab"] },
    { id: "reject", label: "Reject suggestion", keys: ["Esc"] },
    // Coding / Terminal
    { id: "open-terminal", label: "Open terminal", keys: ["Ctrl", "`"] },
    { id: "next-terminal", label: "Next terminal", keys: ["Ctrl", "Shift", "`"] },
    { id: "interrupt", label: "Interrupt agent", keys: ["Ctrl", "C"] },
    { id: "approve", label: "Approve tool", keys: ["Ctrl", "Enter"] },
    { id: "deny", label: "Deny tool", keys: ["Esc"] },
    { id: "apply-diff", label: "Apply diff", keys: ["Ctrl", "Shift", "A"] },
    { id: "reject-diff", label: "Reject diff", keys: ["Ctrl", "Shift", "R"] },
    { id: "jump-to-file", label: "Jump to file", keys: ["Ctrl", "P"] },
    // Navigation
    { id: "toggle-sidebar", label: "Toggle sidebar", keys: ["Ctrl", "B"] },
    { id: "toggle-bottom-panel", label: "Toggle bottom panel", keys: ["Ctrl", "J"] },
    { id: "toggle-pinned-summary", label: "Toggle pinned summary", keys: ["Ctrl", "Shift", "P"] },
    { id: "back", label: "Back", keys: ["Ctrl", "["] },
    { id: "forward", label: "Forward", keys: ["Ctrl", "]"] },
    { id: "previous-task", label: "Previous task", keys: ["Ctrl", "Shift", "["] },
    { id: "next-task", label: "Next task", keys: ["Ctrl", "Shift", "]"] },
    { id: "find", label: "Find", keys: ["Ctrl", "F"] },
    { id: "search-projects", label: "Search projects", keys: ["Ctrl", "K"] },
    { id: "open-history", label: "Open history", keys: ["Ctrl", "H"] },
    // Plugins & browser
    { id: "open-browser", label: "Open browser", keys: ["Ctrl", "T"] },
    { id: "reload-browser", label: "Reload browser", keys: ["Ctrl", "R"] },
    { id: "focus-address", label: "Focus address bar", keys: ["Ctrl", "D"] },
    { id: "toggle-plugins", label: "Toggle plugins", keys: ["Ctrl", "Shift", "P"] },
    { id: "refresh-plugins", label: "Refresh plugins", keys: ["F5"] },
    { id: "run-plugin", label: "Run plugin", keys: ["Ctrl", "Shift", "R"] },
    { id: "marketplace", label: "Open marketplace", keys: ["Ctrl", "Shift", "M"] },
  ];
}

function defaultPlugins() {
  return [
    { id: "browser", name: "Browser", desc: "Open web pages and inspect live content.", installed: true, tag: "Plugins", logoLetter: "B" },
    { id: "visualize", name: "Visualize", desc: "Create visual previews and diagrams.", installed: true, tag: "Plugins", logoLetter: "V" },
    { id: "codex-mcp", name: "Codex MCP Server", desc: "Expose Codex capabilities to local MCP clients.", installed: false, tag: "MCPs", logoLetter: "M" },
    { id: "marketplace", name: "Marketplace", desc: "Browse and install more plugins.", installed: false, tag: "Marketplace", logoLetter: "+" },
  ];
}

function defaultScheduled() {
  return [
    { id: "daily", title: "Daily brief", desc: "Get a summary of what happened yesterday and what is planned today.", icon: "daily", cron: "0 9 * * *", status: "enabled" },
    { id: "weekly", title: "Weekly review", desc: "Review open tasks, merged PRs, and blockers from the week.", icon: "weekly", cron: "0 10 * * 1", status: "enabled" },
    { id: "followup", title: "Follow-up monitor", desc: "Check in on tasks that have been waiting for a response.", icon: "followup", cron: "0 */4 * * *", status: "enabled" },
  ];
}

function defaultPets() {
  return [
    { id: "codex", name: "Codex", selected: true, desc: "A helpful desk companion.", thumb: "assets/pets/codex-spritesheet-v6-BRBFriCM.webp" },
    { id: "dewey", name: "Dewey", selected: false, desc: "Bookworm with a monocle.", thumb: "assets/pets/dewey-spritesheet-v5-D1KFAW8x.webp" },
    { id: "bsod", name: "Bluey", selected: false, desc: "Crashes the party (in blue).", thumb: "assets/pets/bsod-spritesheet-v5-DMVBNs4E.webp" },
    { id: "fire", name: "Fireball", selected: false, desc: "Hot-headed speed-runner.", thumb: "assets/pets/fireball-spritesheet-v5-CcKkFG0_.webp" },
    { id: "hoots", name: "Hoots", selected: false, desc: "Wise owl who plans ahead.", thumb: "assets/pets/hoots-spritesheet-v8-hys0ZOs6.webp" },
    { id: "null", name: "Null Signal", selected: false, desc: "Quiet hacker ghost.", thumb: "assets/pets/null-signal-spritesheet-v7-B59v4kgD.webp" },
    { id: "rocky", name: "Rocky", selected: false, desc: "Tiny rolling boulder.", thumb: "assets/pets/rocky-spritesheet-v5-CXtdFM3V.webp" },
    { id: "seedy", name: "Seedy", selected: false, desc: "Plant-based partner.", thumb: "assets/pets/seedy-spritesheet-v10-A9vkGoq7.webp" },
    { id: "stack", name: "Stacky", selected: false, desc: "Tall stack of surprises.", thumb: "assets/pets/stacky-spritesheet-v6-Y0DWcgq_.webp" },
  ];
}

export function setSessionActive(id) {
  store.activeSessionId = id;
  store.activeSession = store.sessions.find((s) => s.id === id) || null;
  store.running = store.activeSession?.runtime?.status === "running";
  document.dispatchEvent(new CustomEvent("codex:active-session"));
  // persist so the same session is restored on restart
  if (id) {
    window.go?.main?.App?.SetActiveSession?.(id).catch(() => {});
  }
}

export function updateSettings(patch) {
  store.settings = { ...store.settings, ...patch };
}
