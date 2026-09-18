/**
 * Discovery views: Scheduled, Plugins and Pull Requests.
 *
 * DOM contract matches src/js/discovery.js + discovery.css (change-note
 * react-ui-wails-baseline):
 *
 *   section.view.view-discovery
 *     .discovery-topbar > .tabs? + .actions > .btn-official[.chev] / .icon-btn-round
 *     .discovery-head > h2[.is-title-sm] + p.lede
 *     .discovery-search > svg + input
 *     .discovery-filters? > .chip + .filters-spacer
 *     .discovery-body[.is-wide]
 *       .discovery-section-label
 *       .suggestion-list > button.suggestion-card > .sug-ico + span > .sug-name/.sug-meta/.sug-desc
 *       .plugins-grid > .plugin-card > .pc-row1 > .pc-logo + (.pc-name/.pc-tag) + .ui-toggle
 *                          + .pc-desc + .pc-foot
 *       .pr-empty > h3 + p + .btn-official
 *
 * Expandable chevrons in discovery.css only target `.btn-official .chev`
 * (Create / Add primary pills) — there is no section-expand CSS contract for
 * list panels, so lists stay flat. Chevrons are rendered on official pills.
 *
 * Actions go through real Tauri IPC — no local-only toggles.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../src/js/i18n.js";
import { navigate } from "@/shell/useRoute";
import { ComposerPopover } from "@/shell/ComposerPopover";
import { pickProjectDirectory } from "@/state/appStore";

interface JsonRecord {
  [key: string]: unknown;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asList(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.map(asRecord);
  const rec = asRecord(value);
  for (const key of ["data", "items", "tasks", "plugins", "marketplaces", "skills", "pullRequests", "pull_requests"]) {
    if (Array.isArray(rec[key])) return (rec[key] as unknown[]).map(asRecord);
  }
  return [];
}

function text(rec: JsonRecord, ...keys: string[]): string {
  for (const key of keys) {
    if (typeof rec[key] === "string" && rec[key]) return rec[key] as string;
  }
  return "";
}

function label(key: string, fallback: string): string {
  return String(t(key, fallback));
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="7.7" cy="7.7" r="4.4" />
      <path d="m11 11 3.4 3.4" />
    </svg>
  );
}

function ChevronDown({ className = "chev" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="m5 7 4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Loading() {
  return (
    <div className="discovery-loading">
      <span className="spin" aria-hidden="true" />
      {label("discovery.loading", "Loading…")}
    </div>
  );
}

function Empty({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <div className="discovery-empty">
      <h3>{children}</h3>
      {action}
    </div>
  );
}

/**
 * Browser-dev fallback rows: mirrors the Rust `default_scheduled_tasks()` seed
 * so the page renders full content without a Tauri runtime (plain `npm run dev`
 * has no IPC and `invoke` rejects). The desktop app never hits this path —
 * its shell store seeds the same rows. Writes go to localStorage (same
 * fallback contract bridge.js documents for missing commands).
 */
const DEFAULT_SCHED_TASKS: JsonRecord[] = [
  {
    id: "daily-brief",
    title: "每日简报",
    desc: "以日历、未读电子邮件和优先事项摘要开启每个工作日",
    icon: "daily",
    cron: "0 9 * * *",
    status: "enabled",
  },
  {
    id: "weekly-review",
    title: "每周回顾",
    desc: "每周五将你最近的工作整理成简明的状态更新",
    icon: "weekly",
    cron: "0 10 * * 1",
    status: "enabled",
  },
  {
    id: "followup",
    title: "跟进监控",
    desc: "查看最近的电子邮箱和日历活动，并标记需要你关注的事项",
    icon: "followup",
    cron: "0 */4 * * *",
    status: "enabled",
  },
];

const SCHED_LOCAL_KEY = "codex.scheduled.tasks";

function useBackendList(
  command: string,
  args: Record<string, unknown> = {},
  opts: { fallback?: JsonRecord[]; localKey?: string } = {},
) {
  const [data, setData] = useState<JsonRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    void invoke<unknown>(command, args)
      .then((raw) => {
        if (active) {
          setData(asList(raw));
          setLocal(false);
        }
      })
      .catch((err) => {
        if (!active) return;
        if (opts.localKey) {
          try {
            const raw = localStorage.getItem(opts.localKey);
            if (raw) {
              setData(asList(JSON.parse(raw) as unknown));
              setLocal(true);
              return;
            }
          } catch {
            /* fall through to seed */
          }
        }
        if (opts.fallback) {
          setData(opts.fallback);
          setLocal(true);
          if (opts.localKey) {
            try {
              localStorage.setItem(opts.localKey, JSON.stringify(opts.fallback));
            } catch {
              /* preview only */
            }
          }
          return;
        }
        setError(errText(err));
      });
    return () => {
      active = false;
    };
  }, [command, revision]);

  const persistLocal = (next: JsonRecord[]): void => {
    setData(next);
    if (opts.localKey) {
      try {
        localStorage.setItem(opts.localKey, JSON.stringify(next));
      } catch {
        /* preview only */
      }
    }
  };

  return { data, error, local, persistLocal, refresh: () => setRevision((v) => v + 1) };
}

/** Status text used by the local scheduled-task store. */
function scheduledIsEnabled(item: JsonRecord): boolean {
  const status = text(item, "status").toLowerCase();
  return status !== "disabled" && status !== "paused";
}

function scheduledIcon(type: string) {
  if (type === "weekly") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="3.5" y="4.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3.5 8h13M6.5 3.5v2M13.5 3.5v2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (type === "followup") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M5.5 3.5h9a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 15V5a1.5 1.5 0 0 1 1.5-1.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="m7.5 10 2 2 3.5-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 3.5a4 4 0 0 0-4 4v3.2l-1.3 2.1a.8.8 0 0 0 .7 1.2h9.2a.8.8 0 0 0 .7-1.2L14 10.7V7.5a4 4 0 0 0-4-4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8.5 15a1.8 1.8 0 0 0 3 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function sugIconClass(item: JsonRecord): string {
  const icon = text(item, "icon", "type", "schedule").toLowerCase();
  if (icon.includes("weekly") || icon.includes("week")) return "purple";
  if (icon.includes("follow") || icon.includes("monitor")) return "green";
  return "";
}

export function DiscoveryView({ view }: { view: "scheduled" | "plugins" | "pullrequests" }) {
  if (view === "scheduled") return <ScheduledView />;
  if (view === "plugins") return <PluginsView />;
  return <PullRequestsView />;
}

/** Repeat options behind the manual-create drawer (official menu: 间隔 / 每天 / 工作日 / 每周 / 自定义). */
const SCHED_REPEATS = ["daily", "weekdays", "weekly", "custom"] as const;
type SchedRepeat = (typeof SCHED_REPEATS)[number];

function repeatLabelId(repeat: SchedRepeat): string {
  if (repeat === "weekdays") return "scheduled.repeatWeekdays";
  if (repeat === "weekly") return "scheduled.repeatWeekly";
  if (repeat === "custom") return "scheduled.repeatCustom";
  return "scheduled.repeatDaily";
}

function isValidCron(cron: string): boolean {
  return /^\S+(\s+\S+){4}$/.test(cron.trim());
}

/** Build a cron from the drawer's repeat + quarter-hour time (weekly pins Friday, like the official default). */
function buildSchedCron(repeat: SchedRepeat, time: string, custom: string): string {
  if (repeat === "custom") return custom.trim();
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  const hour = String(Number(m?.[1] ?? "9"));
  const minute = String(Number(m?.[2] ?? "0"));
  if (repeat === "weekly") return `${minute} ${hour} * * 5`;
  if (repeat === "weekdays") return `${minute} ${hour} * * 1-5`;
  return `${minute} ${hour} * * *`;
}

/** Quarter-hour options for the Time menu (0:00 … 23:45, official style). */
const SCHED_TIMES: string[] = [];
for (let h = 0; h < 24; h += 1) {
  for (const min of ["00", "15", "30", "45"]) {
    SCHED_TIMES.push(`${h}:${min}`);
  }
}

/** Trigger + anchored menu matching the official drawer dropdowns (header + check on selected). */
function DrawerSelect({
  ariaLabel,
  header,
  value,
  display,
  options,
  glyph,
  menuClassName,
  onChange,
}: {
  ariaLabel: string;
  header?: string;
  value: string;
  display: string;
  options: { value: string; text: string }[];
  glyph?: "stepper" | "chev";
  menuClassName?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="sched-value-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        {display}
        {glyph === "stepper" ? (
          <svg viewBox="0 0 10 12" aria-hidden="true">
            <path d="M2 4l3-3 3 3M2 8l3 3 3-3" />
          </svg>
        ) : (
          <svg viewBox="0 0 10 6" aria-hidden="true">
            <path d="M1 1l4 4 4-4" />
          </svg>
        )}
      </button>
      {open && btnRef.current ? (
        <ComposerPopover
          className={`sched-menu-pop ${menuClassName ?? ""}`.trim()}
          align="end"
          prefer="below"
          anchorEl={btnRef.current}
          onClose={() => setOpen(false)}
        >
          {header ? <div className="sched-menu-head">{header}</div> : null}
          <div className="sched-menu-list" role="menu">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={o.value === value}
                className="sched-menu-item"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span>{o.text}</span>
                {o.value === value ? (
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2 6.5l2.5 2.5L10 3.5" />
                  </svg>
                ) : null}
              </button>
            ))}
          </div>
        </ComposerPopover>
      ) : null}
    </>
  );
}

/** Human schedule line ("工作日 8:00") from a cron; raw cron when unknown. */
function formatSchedule(item: JsonRecord): string {
  const cron = text(item, "cron").trim();
  const m = cron.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/);
  if (!m) return cron || text(item, "status");
  const minute = m[1] ?? "";
  const hour = m[2] ?? "";
  const weekday = (m[5] ?? "").toUpperCase();
  if (hour === "*" || hour.includes("/")) {
    const step = hour.includes("/") ? hour.split("/")[1] : "";
    if (step) {
      return label("scheduled.timeEveryHours", "Every {hours} hours").replaceAll("{hours}", step);
    }
    return cron;
  }
  const h = Number(hour);
  const time =
    minute === "0" && Number.isFinite(h) ? `${h}:00` : `${hour}:${minute.padStart(2, "0")}`;
  if (weekday === "5" || weekday === "FRI") {
    return label("scheduled.timeFriday", "Friday ({time})").replaceAll("{time}", time);
  }
  if (weekday === "1-5" || weekday === "MON-FRI" || weekday === "1,2,3,4,5") {
    return label("scheduled.timeWorkdays", "Workdays {time}").replaceAll("{time}", time);
  }
  if (weekday === "*") {
    return label("scheduled.timeDaily", "Daily {time}").replaceAll("{time}", time);
  }
  return cron;
}

/** Manual-create drawer: title + desc + run-in + repeat/time/notify, persisted via onSave.
 *  NOTE: `notify` is saved on the record but the desktop Rust struct has no such
 *  column yet, so it round-trips only in browser-localStorage preview until then. */
function ManualSchedDrawer({
  tasks,
  closing,
  onSave,
  onDone,
}: {
  tasks: JsonRecord[];
  closing?: boolean;
  onSave: (tasks: JsonRecord[]) => Promise<void>;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [repeat, setRepeat] = useState<SchedRepeat>("daily");
  const [time, setTime] = useState("9:00");
  const [customCron, setCustomCron] = useState("");
  const [notify, setNotify] = useState("important");
  const [busy, setBusy] = useState(false);

  const canSave =
    title.trim().length > 0 &&
    desc.trim().length > 0 &&
    (repeat !== "custom" || isValidCron(customCron)) &&
    !busy;

  async function save(): Promise<void> {
    if (!canSave) return;
    setBusy(true);
    try {
      await onSave([
        ...tasks,
        {
          id: `manual-${Date.now()}`,
          title: title.trim(),
          desc: desc.trim(),
          icon: "",
          cron: buildSchedCron(repeat, time, customCron),
          status: "enabled",
          notify,
        },
      ]);
      onDone();
    } catch {
      setBusy(false);
    }
  }

  return (
    <aside
      className={`sched-drawer${closing ? " is-closing" : ""}`}
      aria-label={label("scheduled.drawerNew", "New")}
    >
      <div className="sched-drawer-head">
        <span>{label("scheduled.drawerNew", "New")}</span>
        <button
          type="button"
          className="icon-btn-round"
          aria-label={label("action.close", "Close")}
          onClick={onDone}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>
      <input
        type="text"
        className="sched-title-input"
        placeholder={label("scheduled.drawerTitlePh", "Scheduled task title")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="sched-desc-input"
        placeholder={label("scheduled.drawerDescPh", "Describe what ChatGPT should do")}
        value={desc}
        rows={4}
        onChange={(e) => setDesc(e.target.value)}
      />
      <div className="sched-section">{label("scheduled.drawerDetails", "Details")}</div>
      <div className="sched-row-card">
        <span>{label("scheduled.drawerRunIn", "Run in")}</span>
        <DrawerSelect
          ariaLabel={label("scheduled.drawerRunIn", "Run in")}
          value="new-chat"
          display={label("scheduled.drawerNewChat", "New chat for this task")}
          options={[{ value: "new-chat", text: label("scheduled.drawerNewChat", "New chat for this task") }]}
          onChange={() => undefined}
        />
      </div>
      <div className="sched-section">{label("scheduled.drawerFreq", "Frequency")}</div>
      <div className="sched-freq-card">
        <div className="sched-row">
          <span>{label("scheduled.drawerRepeat", "Repeat")}</span>
          <DrawerSelect
            ariaLabel={label("scheduled.drawerRepeat", "Repeat")}
            header={label("scheduled.menuInterval", "Interval")}
            glyph="stepper"
            value={repeat}
            display={label(repeatLabelId(repeat), repeat)}
            options={SCHED_REPEATS.map((r) => ({ value: r, text: label(repeatLabelId(r), r) }))}
            onChange={(v) => {
              const next = SCHED_REPEATS.find((r) => r === v) ?? "daily";
              setRepeat(next);
            }}
          />
        </div>
        {repeat === "custom" ? (
          <label className="sched-row">
            <span>{label("scheduled.fieldCron", "Schedule (cron)")}</span>
            <input
              type="text"
              className="sched-cron-input"
              placeholder="0 8 * * 1-5"
              value={customCron}
              onChange={(e) => setCustomCron(e.target.value)}
            />
          </label>
        ) : (
          <div className="sched-row">
            <span>Time</span>
            <DrawerSelect
              ariaLabel="Time"
              value={time}
              display={time}
              menuClassName="sched-menu-time"
              options={SCHED_TIMES.map((t) => ({ value: t, text: t }))}
              onChange={setTime}
            />
          </div>
        )}
        <div className="sched-row">
          <span>{label("scheduled.drawerNotify", "Notifications")}</span>
          <DrawerSelect
            ariaLabel={label("scheduled.drawerNotify", "Notifications")}
            value={notify}
            display={
              notify === "failures"
                ? label("scheduled.notifyFailures", "Only on failure")
                : label("scheduled.notifyImportant", "Important updates")
            }
            options={[
              { value: "important", text: label("scheduled.notifyImportant", "Important updates") },
              { value: "failures", text: label("scheduled.notifyFailures", "Only on failure") },
            ]}
            onChange={setNotify}
          />
        </div>
      </div>
      <div className="sched-drawer-foot">
        <button type="button" className="btn-official" disabled={!canSave} onClick={() => void save()}>
          {label("action.create", "Create")}
        </button>
      </div>
    </aside>
  );
}

function ScheduledView() {
  const { data, error, local, persistLocal, refresh } = useBackendList("list_scheduled_tasks", {}, {
    fallback: DEFAULT_SCHED_TASKS,
    localKey: SCHED_LOCAL_KEY,
  });
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const drawerTimer = useRef<number | null>(null);
  const createBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    return () => {
      if (drawerTimer.current !== null) window.clearTimeout(drawerTimer.current);
    };
  }, []);

  const openDrawer = (): void => {
    if (drawerTimer.current !== null) window.clearTimeout(drawerTimer.current);
    setDrawerClosing(false);
    setManualOpen(true);
  };

  const closeDrawer = (): void => {
    setDrawerClosing(true);
    if (drawerTimer.current !== null) window.clearTimeout(drawerTimer.current);
    drawerTimer.current = window.setTimeout(() => {
      setManualOpen(false);
      setDrawerClosing(false);
    }, 220);
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((item) => {
      if (!q) return true;
      return ["title", "name", "description", "desc"].some((key) =>
        text(item, key).toLowerCase().includes(q),
      );
    });
  }, [data, query]);

  async function saveToggle(item: JsonRecord): Promise<void> {
    const id = text(item, "id");
    if (!id || !data || busyId) return;
    const nextStatus = scheduledIsEnabled(item) ? "disabled" : "enabled";
    const nextTasks = data.map((task) =>
      text(task, "id") === id ? { ...task, status: nextStatus } : task,
    );
    if (local) {
      persistLocal(nextTasks);
      return;
    }
    setBusyId(id);
    setActionError(null);
    try {
      await invoke("save_scheduled_tasks", { tasks: nextTasks });
      refresh();
    } catch (err) {
      setActionError(errText(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="view view-discovery" id="view-scheduled">
      <div className="discovery-topbar">
        <div />
        <div className="actions">
          <button
            ref={createBtnRef}
            className="btn-official"
            type="button"
            aria-haspopup="menu"
            aria-expanded={createOpen}
            onClick={() => setCreateOpen((v) => !v)}
            data-create-scheduled
          >
            {label("action.create", "Create")}
            <ChevronDown />
          </button>
        </div>
      </div>
      {createOpen && createBtnRef.current ? (
        <ComposerPopover
          className="create-menu"
          align="end"
          prefer="below"
          anchorEl={createBtnRef.current}
          onClose={() => setCreateOpen(false)}
        >
          <button
            type="button"
            className="composer-menu-item"
            onClick={() => {
              setCreateOpen(false);
              navigate("home");
              // Home composer mounts on navigation; deliver after commit.
              window.setTimeout(() => {
                window.dispatchEvent(
                  new CustomEvent<string>("codex:use-prompt", {
                    detail: label(
                      "scheduled.chatPrompt",
                      "Let's set up a scheduled task together.",
                    ),
                  }),
                );
              }, 0);
            }}
          >
            <span className="menu-icon">
              <svg viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="9" cy="9" r="6" />
              </svg>
            </span>
            <span>
              <strong>{label("scheduled.createWithChat", "Create with ChatGPT")}</strong>
            </span>
          </button>
          <button
            type="button"
            className="composer-menu-item"
            onClick={() => {
              setCreateOpen(false);
              openDrawer();
            }}
          >
            <span className="menu-icon">
              <svg viewBox="0 0 18 18" aria-hidden="true">
                <path d="M4 16l1-3.5L14.5 3a1.7 1.7 0 0 1 2.5 2.5L7.5 15 4 16Z" />
              </svg>
            </span>
            <span>
              <strong>{label("scheduled.createManual", "Set up manually")}</strong>
            </span>
          </button>
        </ComposerPopover>
      ) : null}
      <div className="discovery-head">
        <h2>{label("discovery.scheduled", "Scheduled")}</h2>
        <p className="lede">{label("discovery.scheduledDesc", "Tasks scheduled by the backend.")}</p>
      </div>
      <div className="sched-layout">
        <div className="sched-main">
          <div className="discovery-search">
            <SearchIcon />
            <input
              type="text"
              placeholder={label("discovery.searchScheduled", "Search scheduled tasks")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-scheduled-search
            />
          </div>
          <div className="discovery-body" id="scheduled-body">
        {actionError ? (
          <div className="discovery-empty">
            <p>{actionError}</p>
          </div>
        ) : null}
        {error ? (
          <Empty>{error}</Empty>
        ) : data === null ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty>{label("discovery.noScheduled", "No scheduled tasks")}</Empty>
        ) : (
          <>
            <div className="discovery-section-label">
              {label("discovery.suggestions", "Scheduled tasks")}
            </div>
            <div className="suggestion-list">
              {list.map((item, i) => {
                const id = text(item, "id", "title");
                const enabled = scheduledIsEnabled(item);
                const iconType = text(item, "icon", "type", "schedule");
                return (
                  <button
                    type="button"
                    className="suggestion-card"
                    key={String(item.id ?? item.title ?? i)}
                    disabled={busyId !== null}
                    aria-pressed={enabled}
                    aria-label={text(item, "title", "name") || id}
                    data-scheduled-toggle={id}
                    onClick={() => void saveToggle(item)}
                  >
                    <span className={`sug-ico ${sugIconClass(item)}`.trim()}>
                      {scheduledIcon(iconType)}
                    </span>
                    <span>
                      <span className="sug-name">{text(item, "title", "name")}</span>
                      <span className="sug-meta">{formatSchedule(item)}</span>
                      <span className="sug-desc">{text(item, "desc", "description")}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        </div>
        </div>
        {manualOpen ? (
          <ManualSchedDrawer
            tasks={data ?? []}
            closing={drawerClosing}
            onSave={async (next) => {
              if (local) {
                persistLocal(next);
                return;
              }
              await invoke("save_scheduled_tasks", { tasks: next });
            }}
            onDone={() => {
              closeDrawer();
              refresh();
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

/** Plugin logo: manifest logo (data URL or remote) with letter-tile fallback. */
function PluginLogo({ entry, className }: { entry: JsonRecord; className?: string }) {
  const logo = text(entry, "logo");
  const name = text(entry, "displayName", "name") || "P";
  const brand = text(entry, "brandColor");
  if (logo) {
    return <img className={className ?? "pc-logo-img"} src={logo} alt="" draggable={false} />;
  }
  return (
    <span
      className="pc-logo-fallback"
      style={brand ? { background: brand } : undefined}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/** "…" menu per directory card: install, or enable/disable + uninstall. */
function PluginMenu({
  entry,
  busy,
  onInstall,
  onToggle,
  onUninstall,
}: {
  entry: JsonRecord;
  busy: boolean;
  onInstall: () => void;
  onToggle: () => void;
  onUninstall: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  const installed = String(text(entry, "id")) !== "" && entry.installed === true;
  const enabled = entry.enabled === true;
  const installable = entry.installable !== false;
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="icon-btn-round"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label("plugins.more", "More")}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="4" cy="9" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="14" cy="9" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {open && ref.current ? (
        <ComposerPopover
          className="create-menu"
          align="end"
          prefer="below"
          anchorEl={ref.current}
          onClose={() => setOpen(false)}
        >
          {!installed ? (
            <button
              type="button"
              className="composer-menu-item"
              disabled={!installable || busy}
              title={text(entry, "reason")}
              onClick={() => {
                setOpen(false);
                onInstall();
              }}
            >
              <span>
                <strong>{label("plugins.install", "Install")}</strong>
              </span>
            </button>
          ) : (
            <>
              <button
                type="button"
                className="composer-menu-item"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  onToggle();
                }}
              >
                <span>
                  <strong>
                    {enabled
                      ? label("plugins.disable", "Disable")
                      : label("plugins.enable", "Enable")}
                  </strong>
                </span>
              </button>
              <button
                type="button"
                className="composer-menu-item is-danger"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  onUninstall();
                }}
              >
                <span>
                  <strong>{label("plugins.uninstall", "Uninstall")}</strong>
                </span>
              </button>
            </>
          )}
        </ComposerPopover>
      ) : null}
    </>
  );
}

/** Marketplace dialog: suggested official repo, custom source, browse + install. */
function MarketDialog({
  markets,
  catalog,
  busy,
  onClose,
  onAddMarket,
  onRemoveMarket,
  onInstall,
}: {
  markets: JsonRecord[];
  catalog: JsonRecord[];
  busy: boolean;
  onClose: () => void;
  onAddMarket: (source: string) => void;
  onRemoveMarket: (name: string) => void;
  onInstall: (market: string, plugin: string) => void;
}) {
  const [source, setSource] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const suggested = "openai/plugins";
  const addedNames = new Set(markets.map((m) => text(m, "name")));
  return (
    <div className="plug-overlay" onClick={onClose}>
      <div
        className="plug-dialog"
        role="dialog"
        aria-label={label("plugins.marketTitle", "Add marketplace")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="plug-dialog-head">
          <h3>{label("plugins.marketTitle", "Add marketplace")}</h3>
          <button
            type="button"
            className="icon-btn-round"
            aria-label={label("action.close", "Close")}
            onClick={onClose}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>
        {!addedNames.has(suggested) ? (
          <div className="plug-suggest">
            <div>
              <div className="pc-name">{suggested}</div>
              <div className="pc-tag">{label("plugins.suggestDesc", "Official open-source plugin collection")}</div>
            </div>
            <button
              type="button"
              className="btn-official"
              disabled={busy}
              onClick={() => onAddMarket(suggested)}
            >
              {label("plugins.marketAdd", "Add")}
            </button>
          </div>
        ) : null}
        <div className="plug-addrow">
          <input
            type="text"
            value={source}
            placeholder={label("plugins.marketPh", "owner/repo, Git URL or local folder")}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && source.trim() && !busy) onAddMarket(source.trim());
            }}
          />
          <button
            type="button"
            className="btn-official"
            disabled={!source.trim() || busy}
            onClick={() => onAddMarket(source.trim())}
          >
            {label("plugins.marketAdd", "Add")}
          </button>
        </div>
        <div className="plug-market-list">
          {markets.map((m) => {
            const name = text(m, "name");
            const count = Number(m.pluginCount ?? 0);
            const isOpen = expanded === name;
            const entries = catalog.filter((e) => text(e, "market") === name);
            return (
              <div className="plug-market" key={name || text(m, "displayName")}>
                <div className="plug-market-row">
                  <button
                    type="button"
                    className="plug-market-name"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : name)}
                  >
                    {text(m, "displayName", "name")}
                    <span className="pc-tag">
                      {count}
                      <ChevronDown />
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => onRemoveMarket(name)}
                  >
                    {label("plugins.remove", "Remove")}
                  </button>
                </div>
                {isOpen ? (
                  <div className="plug-market-entries">
                    {entries.length === 0 ? (
                      <div className="pc-tag">{label("discovery.noPlugins", "No plugins")}</div>
                    ) : (
                      entries.map((e) => (
                        <div className="plug-entry" key={text(e, "id", "name")}>
                          <PluginLogo entry={e} className="plug-entry-logo" />
                          <div className="plug-entry-text">
                            <div className="pc-name">{text(e, "displayName", "name")}</div>
                            <div className="pc-tag">{text(e, "description")}</div>
                          </div>
                          {e.installed === true ? (
                            <span className="pc-tag">{label("discovery.installed", "Installed")}</span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={e.installable === false || busy}
                              title={text(e, "reason")}
                              onClick={() => onInstall(name, text(e, "name"))}
                            >
                              {label("plugins.install", "Install")}
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PluginsView() {
  const [tab, setTab] = useState<"plugins" | "skills">("plugins");
  const [query, setQuery] = useState("");
  const [installed, setInstalled] = useState<JsonRecord[]>([]);
  const [markets, setMarkets] = useState<JsonRecord[]>([]);
  const [catalog, setCatalog] = useState<JsonRecord[]>([]);
  const [skills, setSkills] = useState<JsonRecord[]>([]);
  const [engineSkills, setEngineSkills] = useState<JsonRecord[]>([]);
  const [skillScope, setSkillScope] = useState<"system" | "plugins">("system");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scope, setScope] = useState<"public" | "personal">("public");
  const [installedOnly, setInstalledOnly] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);

  async function reloadAll(): Promise<void> {
    setLoading(true);
    setNotice(null);
    try {
      const [insRaw, mkRaw] = await Promise.all([
        invoke<unknown>("plugin_installed").catch(() => ({ plugins: [] })),
        invoke<unknown>("plugin_marketplaces").catch(() => ({ marketplaces: [] })),
      ]);
      const insList = asList(insRaw);
      setInstalled(insList);
      const mkList = asList(mkRaw);
      setMarkets(mkList);
      const parts = await Promise.all(
        mkList.map((m) =>
          invoke<unknown>("plugin_marketplace_plugins", {
            marketplace: text(m, "name"),
          })
            .then((v) =>
              asList(v).map((e) => ({
                ...e,
                market: text(m, "name"),
                marketName: text(m, "displayName", "name"),
              })),
            )
            .catch(() => [] as JsonRecord[]),
        ),
      );
      setCatalog(parts.flat());
      const [skRaw, engRaw] = await Promise.all([
        invoke<unknown>("plugin_skills").catch(() => ({ skills: [] })),
        invoke<unknown>("list_skills").catch(() => ({ skills: [] })),
      ]);
      setSkills(asList(skRaw));
      setEngineSkills(asList(engRaw));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reloadAll();
  }, []);

  async function runGuarded(id: string, fn: () => Promise<unknown>): Promise<void> {
    if (busyId) return;
    setBusyId(id);
    setNotice(null);
    try {
      await fn();
      await reloadAll();
    } catch (err) {
      setNotice(errText(err));
    } finally {
      setBusyId(null);
    }
  }

  const install = (market: string, plugin: string): Promise<void> =>
    runGuarded(`install:${market}/${plugin}`, () =>
      invoke("plugin_install", { marketplace: market, plugin }),
    );

  const toggleInstalled = (item: JsonRecord): Promise<void> => {
    const id = text(item, "id");
    if (!id) return Promise.resolve();
    const enabled = String(item.enabled).toLowerCase() === "true";
    return runGuarded(`toggle:${id}`, () =>
      invoke("plugin_set_enabled", { id, enabled: !enabled }),
    );
  };

  const uninstall = (item: JsonRecord): Promise<void> => {
    const id = text(item, "id");
    if (!id) return Promise.resolve();
    return runGuarded(`uninstall:${id}`, () => invoke("plugin_uninstall", { id }));
  };

  const addLocal = async (): Promise<void> => {
    setAddOpen(false);
    const dir = await pickProjectDirectory();
    if (!dir) return;
    await runGuarded(`local:${dir}`, () => invoke("plugin_add_local", { path: dir }));
  };

  const q = query.trim().toLowerCase();
  const matchQ = (item: JsonRecord): boolean => {
    if (!q) return true;
    return ["displayName", "name", "id", "description", "desc"].some((key) =>
      text(item, key).toLowerCase().includes(q),
    );
  };
  const installedIds = useMemo(
    () => new Set(installed.map((i) => text(i, "id"))),
    [installed],
  );

  const directory = useMemo(() => {
    const groups = new Map<string, JsonRecord[]>();
    for (const e of catalog) {
      const personal = text(e, "market") === "local";
      if (scope === "personal" && !personal) continue;
      if (scope === "public" && personal) continue;
      const id = text(e, "id");
      if (installedOnly && !installedIds.has(id)) continue;
      if (!matchQ(e)) continue;
      const cat = text(e, "category") || label("plugins.other", "Other");
      const arr = groups.get(cat) ?? [];
      arr.push(e);
      groups.set(cat, arr);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, scope, installedOnly, installedIds, q]);

  const visibleInstalled = useMemo(
    () => installed.filter((i) => matchQ(i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installed, q],
  );
  const visibleSkills = useMemo(() => {
    const seen = new Set<string>();
    const all: JsonRecord[] = [];
    for (const s of [...engineSkills, ...skills]) {
      const key =
        text(s, "name").toLowerCase() || text(s, "description").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      all.push(s);
    }
    if (!q) return all;
    return all.filter((s) =>
      ["displayName", "name", "description", "plugin"].some((key) =>
        text(s, key).toLowerCase().includes(q),
      ),
    );
  }, [engineSkills, skills, q]);
  const scopedSkills = useMemo(() => {
    const base = skillScope === "system" ? engineSkills : skills;
    if (!q) return base;
    return base.filter((s) =>
      ["displayName", "name", "description", "plugin"].some((key) =>
        text(s, key).toLowerCase().includes(q),
      ),
    );
  }, [engineSkills, skills, skillScope, q]);

  const createSkill = (): void => {
    setAddOpen(false);
    navigate("home");
    // Composer mounts on navigation; deliver after commit.
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent<string>("codex:use-prompt", {
          detail: label("skills.createPrompt", "Help me create a new skill."),
        }),
      );
    }, 0);
  };

  return (
    <section className="view view-discovery" id="view-plugins">
      <div className="discovery-topbar">
        <div className="tabs">
          <button
            className={`tab${tab === "plugins" ? " is-active" : ""}`}
            type="button"
            data-plugins-tab="plugins"
            onClick={() => setTab("plugins")}
          >
            {label("discovery.plugins", "Plugins")}
          </button>
          <button
            className={`tab${tab === "skills" ? " is-active" : ""}`}
            type="button"
            data-plugins-tab="skills"
            onClick={() => setTab("skills")}
          >
            {label("plugins.skills", "Skills")}
          </button>
        </div>
        <div className="actions">
          <button
            className="icon-btn-round"
            type="button"
            aria-label={label("pets.refresh", "Refresh")}
            onClick={() => void reloadAll()}
            data-plugins-refresh
          >
            <svg viewBox="0 0 18 18">
              <path
                d="M4 9a5 5 0 0 1 8.5-3.5M14 9a5 5 0 0 1-8.5 3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M12.5 3.5v2.5H10M5.5 14.5V12H8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            className="icon-btn-round"
            type="button"
            aria-label={label("settings.plugins", "Plugins")}
            onClick={() => navigate("settings", "plugins")}
            data-plugins-settings
          >
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <circle
                cx="9"
                cy="9"
                r="2.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M9 1.8v2.4M9 13.8v2.4M1.8 9h2.4M13.8 9h2.4M3.9 3.9l1.7 1.7M12.4 12.4l1.7 1.7M14.1 3.9l-1.7 1.7M5.6 12.4l-1.7 1.7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            ref={addBtnRef}
            className="btn-official"
            type="button"
            aria-haspopup="menu"
            aria-expanded={addOpen}
            onClick={() => setAddOpen((v) => !v)}
            data-plugins-add
          >
            {label("discovery.add", "Add")}
            <ChevronDown />
          </button>
        </div>
      </div>
      {addOpen && addBtnRef.current ? (
        <ComposerPopover
          className="create-menu"
          align="end"
          prefer="below"
          anchorEl={addBtnRef.current}
          onClose={() => setAddOpen(false)}
        >
          {tab === "skills" ? (
            <button
              type="button"
              className="composer-menu-item"
              onClick={createSkill}
            >
              <span className="menu-icon">
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  <path d="M9 2.2 15.3 5.6 9 9 2.7 5.6 9 2.2ZM2.7 5.6v6.8L9 15.8l6.3-3.4V5.6M9 9v6.8" />
                </svg>
              </span>
              <span>
                <strong>{label("skills.create", "Create skill")}</strong>
              </span>
            </button>
          ) : (
            <>
              <button
                type="button"
                className="composer-menu-item"
                onClick={() => {
                  setAddOpen(false);
                  setMarketOpen(true);
                }}
              >
                <span className="menu-icon">
                  <svg viewBox="0 0 18 18" aria-hidden="true">
                    <circle cx="9" cy="9" r="6" />
                  </svg>
                </span>
                <span>
                  <strong>{label("plugins.addFromMarket", "Add from marketplace")}</strong>
                </span>
              </button>
              <button
                type="button"
                className="composer-menu-item"
                onClick={() => void addLocal()}
              >
                <span className="menu-icon">
                  <svg viewBox="0 0 18 18" aria-hidden="true">
                    <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h4l1.5 2h5.5A1.5 1.5 0 0 1 16 7.5v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 2 12.5v-7Z" />
                  </svg>
                </span>
                <span>
                  <strong>{label("plugins.addFromLocal", "Add from local folder")}</strong>
                </span>
              </button>
            </>
          )}
        </ComposerPopover>
      ) : null}
      <div className="discovery-head">
        <h2>
          {tab === "plugins"
            ? label("discovery.plugins", "Plugins")
            : label("plugins.skills", "Skills")}
        </h2>
        <p className="lede">
          {tab === "plugins"
            ? label("plugins.lede", "Use Codex in the tools you already use.")
            : label("skills.lede", "Extend Codex with task-specific skills.")}
        </p>
      </div>
      <div className="discovery-search">
        <SearchIcon />
        <input
          type="text"
          placeholder={
            tab === "plugins"
              ? label("plugins.search", "Search plugins")
              : label("skills.search", "Search skills")
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-plugins-search
        />
      </div>
      <div className="discovery-body is-wide" id="plugins-body">
        {notice ? (
          <div className="discovery-empty">
            <p>{notice}</p>
          </div>
        ) : null}
        {loading ? (
          <Loading />
        ) : tab === "skills" ? (
          <>
            <div className="discovery-section-label">
              {label("discovery.installed", "Installed")}
            </div>
            {visibleSkills.length === 0 ? (
              <Empty>{label("skills.none", "No installed skills")}</Empty>
            ) : (
              <div className="skill-grid">
                {visibleSkills.map((s, i) => (
                  <div
                    className="skill-row"
                    key={String(s.pluginId ?? s.plugin ?? "") + String(text(s, "name") || i)}
                    title={label("discovery.installed", "Installed")}
                  >
                    <span className="skill-ico">
                      <PluginLogo entry={s} className="skill-ico-img" />
                    </span>
                    <span className="skill-text">
                      <span className="skill-name">{text(s, "displayName", "name")}</span>
                      <span className="skill-desc">{text(s, "description")}</span>
                    </span>
                    <svg className="skill-check" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M2 6.5l2.5 2.5L10 3.5" />
                    </svg>
                  </div>
                ))}
              </div>
            )}
            <div className="discovery-filters">
              <button
                type="button"
                className={`chip${skillScope === "system" ? " is-active" : ""}`}
                onClick={() => setSkillScope("system")}
              >
                {label("skills.system", "System")}
              </button>
              <button
                type="button"
                className={`chip${skillScope === "plugins" ? " is-active" : ""}`}
                onClick={() => setSkillScope("plugins")}
              >
                {label("discovery.plugins", "Plugins")}
              </button>
              <span className="filters-spacer" />
            </div>
            {scopedSkills.length === 0 ? (
              <Empty>{label("skills.none", "No installed skills")}</Empty>
            ) : (
              <div className="skill-grid">
                {scopedSkills.map((s, i) => (
                  <div
                    className="skill-row"
                    key={String(s.pluginId ?? s.plugin ?? "") + String(text(s, "name") || i)}
                    title={label("discovery.installed", "Installed")}
                  >
                    <span className="skill-ico">
                      <PluginLogo entry={s} className="skill-ico-img" />
                    </span>
                    <span className="skill-text">
                      <span className="skill-name">{text(s, "displayName", "name")}</span>
                      <span className="skill-desc">{text(s, "description")}</span>
                    </span>
                    <svg className="skill-check" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M2 6.5l2.5 2.5L10 3.5" />
                    </svg>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="discovery-section-label">
              {label("discovery.installed", "Installed")}
            </div>
            <div className="plug-installed-row">
              <div className="plug-strip">
                {visibleInstalled.length === 0 ? (
                  <span className="pc-tag">{label("plugins.noneInstalled", "Nothing installed yet")}</span>
                ) : (
                  visibleInstalled.map((item) => {
                    const id = text(item, "id");
                    const enabled = item.enabled === true;
                    return (
                      <button
                        key={id || text(item, "name")}
                        type="button"
                        className={`plug-tile${enabled ? "" : " is-off"}`}
                        title={`${text(item, "displayName", "name")} — ${enabled ? label("plugins.disable", "Disable") : label("plugins.enable", "Enable")}`}
                        disabled={busyId !== null}
                        data-plugin-toggle={id}
                        onClick={() => void toggleInstalled(item)}
                      >
                        <PluginLogo entry={item} className="plug-tile-logo" />
                      </button>
                    );
                  })
                )}
              </div>
              <button
                className="icon-btn-round"
                type="button"
                aria-label={label("settings.plugins", "Plugins")}
                onClick={() => navigate("settings", "plugins")}
              >
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  <circle
                    cx="9"
                    cy="9"
                    r="2.4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M9 1.8v2.4M9 13.8v2.4M1.8 9h2.4M13.8 9h2.4M3.9 3.9l1.7 1.7M12.4 12.4l1.7 1.7M14.1 3.9l-1.7 1.7M5.6 12.4l-1.7 1.7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="discovery-filters">
              <button
                type="button"
                className={`chip${scope === "public" ? " is-active" : ""}`}
                onClick={() => setScope("public")}
              >
                {label("plugins.public", "Public")}
              </button>
              <button
                type="button"
                className={`chip${scope === "personal" ? " is-active" : ""}`}
                onClick={() => setScope("personal")}
              >
                {label("plugins.personal", "Personal")}
              </button>
              <span className="filters-spacer" />
              <button
                type="button"
                className="icon-btn-round"
                aria-pressed={installedOnly}
                aria-label={label("plugins.installedOnly", "Installed only")}
                title={label("plugins.installedOnly", "Installed only")}
                onClick={() => setInstalledOnly((v) => !v)}
              >
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  <path
                    d="M2.5 3.5h13L10.5 9.6v4.6l-3 1.6V9.6L2.5 3.5Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            {markets.length === 0 ? (
              <div className="pr-empty">
                <h3>{label("plugins.emptyDir", "No plugin directory yet")}</h3>
                <p>{label("plugins.emptyDirDesc", "Add the official open-source collection or your own marketplace to browse plugins.")}</p>
                <div className="plug-cta-row">
                  <button
                    className="btn-official"
                    type="button"
                    disabled={busyId !== null}
                    onClick={() =>
                      void runGuarded("market:openai/plugins", () =>
                        invoke("plugin_marketplace_add", { source: "openai/plugins" }),
                      )
                    }
                  >
                    {label("plugins.addSuggested", "Add openai/plugins")}
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setMarketOpen(true)}
                  >
                    {label("plugins.addFromMarket", "Add from marketplace")}
                  </button>
                </div>
              </div>
            ) : directory.length === 0 ? (
              <Empty>{label("discovery.noPlugins", "No plugins")}</Empty>
            ) : (
              directory.map(([cat, items]) => (
                <div className="plug-section" key={cat}>
                  <div className="discovery-section-label">{cat}</div>
                  <div className="plugins-grid">
                    {items.map((item) => {
                      const id = text(item, "id");
                      const key = id || `${text(item, "market")}/${text(item, "name")}`;
                      const installedId = installedIds.has(id) ? id : "";
                      const enabledEntry = installed.find((x) => text(x, "id") === id);
                      return (
                        <div className="plugin-card" key={key} data-plugin-id={id}>
                          <div className="pc-row1">
                            <div className="pc-logo">
                              <PluginLogo entry={item} className="pc-logo-img" />
                            </div>
                            <div>
                              <div className="pc-name">{text(item, "displayName", "name")}</div>
                              <div className="pc-tag">{text(item, "marketName", "market")}</div>
                            </div>
                            <PluginMenu
                              entry={{ ...item, installed: installedId !== "", enabled: enabledEntry?.enabled === true }}
                              busy={busyId !== null}
                              onInstall={() => void install(text(item, "market"), text(item, "name"))}
                              onToggle={() => {
                                const rec = installed.find((x) => text(x, "id") === id);
                                if (rec) void toggleInstalled(rec);
                              }}
                              onUninstall={() => {
                                const rec = installed.find((x) => text(x, "id") === id);
                                if (rec) void uninstall(rec);
                              }}
                            />
                          </div>
                          <div className="pc-desc">{text(item, "description", "desc")}</div>
                          {item.installable === false && text(item, "reason") ? (
                            <div className="pc-tag">{text(item, "reason")}</div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
      {marketOpen ? (
        <MarketDialog
          markets={markets}
          catalog={catalog}
          busy={busyId !== null}
          onClose={() => setMarketOpen(false)}
          onAddMarket={(source) =>
            void runGuarded(`market:${source}`, () =>
              invoke("plugin_marketplace_add", { source }),
            )
          }
          onRemoveMarket={(name) =>
            void runGuarded(`rmmarket:${name}`, () =>
              invoke("plugin_marketplace_remove", { name }),
            )
          }
          onInstall={(market, plugin) => void install(market, plugin)}
        />
      ) : null}
    </section>
  );
}

function PullRequestsView() {
  const { data, error, refresh } = useBackendList("list_pull_requests");

  return (
    <section className="view view-discovery" id="view-pullrequests">
      <div className="discovery-head">
        <h2 className="is-title-sm">{label("discovery.pullrequests", "Pull requests")}</h2>
      </div>
      <div className="discovery-body" id="prs-body">
        {error ? (
          <div className="pr-empty">
            <h3>{label("discovery.ghRequired", "GitHub CLI required")}</h3>
            <p>{error}</p>
            <button className="btn-official" type="button" data-pr-recheck onClick={refresh}>
              {label("discovery.checkAgain", "Check again")}
            </button>
          </div>
        ) : data === null ? (
          <Loading />
        ) : data.length === 0 ? (
          <div className="pr-empty">
            <h3>{label("discovery.ghRequired", "GitHub CLI required")}</h3>
            <p>{label("discovery.ghDesc", "Install and authenticate GitHub CLI to see pull requests.")}</p>
            <button className="btn-official" type="button" data-pr-recheck onClick={refresh}>
              {label("discovery.checkAgain", "Check again")}
            </button>
          </div>
        ) : (
          <div className="plugins-grid">
            {data.map((item, i) => (
              <div
                className="plugin-card"
                key={String(item.id ?? item.number ?? i)}
                data-pr-id={text(item, "id", "number")}
              >
                <div className="pc-row1">
                  <div className="pc-logo">
                    {(text(item, "number", "id") || "P").replace(/^#/, "").charAt(0) || "P"}
                  </div>
                  <div>
                    <div className="pc-name">{text(item, "title", "name", "id")}</div>
                    <div className="pc-tag">{text(item, "state", "status", "author")}</div>
                  </div>
                </div>
                <div className="pc-desc">{text(item, "body", "description", "desc")}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
