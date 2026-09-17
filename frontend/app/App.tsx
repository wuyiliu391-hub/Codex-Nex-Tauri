/**
 * Root component.
 *
 * Responsibilities are deliberately narrow: wire the protocol event channels
 * into the stores, then hand off to AppShell. The router is installed in
 * main.tsx before render so the first paint already knows the route.
 */

import { useEffect } from "react";
import { onNotification, onServerRequest } from "./bridge/events";
import { reduceNotification } from "./state/notificationReducer";
import { addPendingRequest, removePendingRequest } from "./state/turnStore";
import { AppShell } from "./shell/AppShell";

export function App() {
  // Notifications drive the turn store.
  useEffect(() => onNotification(reduceNotification), []);

  // Server→client requests block the turn until answered, so they get their own
  // channel and their own UI surface.
  useEffect(
    () =>
      onServerRequest((env) => {
        addPendingRequest({
          id: env.id,
          method: env.method,
          params: env.params,
          receivedAt: env.receivedAt,
        });
      }),
    [],
  );

  // A request the server resolves itself (e.g. timed out) must disappear.
  useEffect(
    () =>
      onNotification((env) => {
        if (env.method !== "serverRequest/resolved") return;
        const id = env.params["requestId"] ?? env.params["request_id"];
        if (typeof id === "string" || typeof id === "number") removePendingRequest(id);
      }),
    [],
  );

  return <AppShell />;
}
