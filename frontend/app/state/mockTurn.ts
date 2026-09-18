/**
 * Mock turn player — frontend-only demo for visual comparison with official.
 *
 * Feeds a canned notification script through the REAL `reduceNotification`
 * path, so the thread renders exactly as a live turn would (reasoning block,
 * plan, agent deltas, command execution, token usage, completion). No engine
 * traffic happens. Enter via the 模拟回合 pill; stop/Escape cancels.
 */

import type { NotificationMethod } from "../../src/protocol/notifications";
import { reduceNotification } from "./notificationReducer";
import { finishTurn } from "./turnStore";

let timers: number[] = [];

function emit(method: string, params: Record<string, unknown>, delayMs: number): void {
  timers.push(
    window.setTimeout(() => {
      reduceNotification({
        method: method as NotificationMethod,
        params,
        receivedAt: Date.now(),
      });
    }, delayMs),
  );
}

export function mockTurnPlaying(): boolean {
  return timers.length > 0;
}

/** Cancel a playing mock and close the turn as interrupted. */
export function cancelMockTurn(): void {
  if (!timers.length) return;
  for (const t of timers) window.clearTimeout(t);
  timers = [];
  finishTurn("interrupted", Date.now());
}

function finish(delayMs: number): void {
  timers.push(
    window.setTimeout(() => {
      timers = [];
    }, delayMs),
  );
}

/** Play one canned turn that echoes the user's text. */
export function playMockTurn(sessionId: string, userText: string): void {
  cancelMockTurn();
  const short = userText.length > 24 ? `${userText.slice(0, 24)}…` : userText;
  let at = 350;

  emit("turn/started", { threadId: sessionId, turnId: "mock-turn-1" }, at);

  const reasoning = "mock-reasoning-1";
  const thoughts = ["收到，我先看一下项目现状。", "核对最近的改动和待办，", "再决定从哪一步开始。"];
  for (const chunk of thoughts) {
    at += 380;
    emit("item/reasoning/textDelta", { itemId: reasoning, delta: chunk }, at);
  }

  at += 300;
  emit(
    "turn/plan/updated",
    {
      plan: [
        { step: "查看项目现状", status: "completed" },
        { step: "回复并确认下一步", status: "in_progress" },
      ],
    },
    at,
  );

  const answer = "mock-answer-1";
  const reply = [`好的，你说的是“${short}”。`, "我已经看过项目现状，", "下一步我建议先对齐这个方案。"];
  for (const chunk of reply) {
    at += 380;
    emit("item/agentMessage/delta", { itemId: answer, delta: chunk }, at);
  }

  at += 300;
  // Sample mirrors the official screenshot's file (10-line HTML head).
  const fileDiff = [
    "--- /dev/null",
    "+++ b/pelican-riding-swan.html",
    "@@ -0,0 +1,10 @@",
    "+<!doctype html>",
    '+<html lang="zh-CN">',
    "+<head>",
    '+  <meta charset="utf-8" />',
    '+  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    "+  <title>鹈鹕骑天鹅</title>",
    "+  <style>",
    "+    :root {",
    "+      color-scheme: light;",
    '+      font-family: "Segoe UI", "Microsoft YaHei", sans-serif;',
    "+    }",
    "+  </style>",
  ].join("\n");
  emit("item/started", { id: "mock-file-1", itemType: "fileChange", path: "pelican-riding-swan.html" }, at);
  at += 250;
  emit("item/fileChange/patchUpdated", { itemId: "mock-file-1", path: "pelican-riding-swan.html", diff: fileDiff }, at);
  at += 250;
  emit(
    "item/completed",
    { id: "mock-file-1", itemType: "fileChange", status: "completed", path: "pelican-riding-swan.html", diff: fileDiff },
    at,
  );

  at += 300;
  emit(
    "item/started",
    { id: "mock-exec-1", type: "commandExecution", command: "npm run typecheck" },
    at,
  );
  const output = ["> tsc --noEmit", "EXIT:0"];
  for (const chunk of output) {
    at += 380;
    emit("item/commandExecution/outputDelta", { itemId: "mock-exec-1", delta: chunk }, at);
  }
  at += 300;
  emit(
    "item/completed",
    {
      id: "mock-exec-1",
      type: "commandExecution",
      status: "completed",
      command: "npm run typecheck",
      output: output.join("\n"),
    },
    at,
  );

  at += 300;
  emit(
    "thread/tokenUsage/updated",
    { inputTokens: 1284, outputTokens: 312, totalTokens: 1596 },
    at,
  );

  at += 300;
  emit(
    "item/agentMessage/delta",
    { itemId: "mock-closing-1", delta: "已创建该文件，双击即可打开查看动画。", phase: "final_answer" },
    at,
  );

  at += 300;
  emit("turn/completed", { status: "completed" }, at);
  finish(at + 100);
}
