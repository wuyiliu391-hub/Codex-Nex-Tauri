"""Extract the complete app-server protocol surface from the official Rust source.

This is the single source of truth for the React rewrite's protocol layer.
Hand-writing these lists is what caused the current gap (8 of ~100 notifications
wired, 7 of 41 block types), so everything here is parsed, never transcribed.

Sources:
  src/backend/app-server-protocol/src/protocol/common.rs
    - ServerNotification enum  → method strings the server pushes to clients
    - ServerRequest enum       → method strings the server asks clients for
  codex-asar-extract/webview/assets/conversation-blocks-*.js
    - item type tags the official turn stream branches on
"""

import io
import json
import os
import re
import glob

COMMON = "src/backend/app-server-protocol/src/protocol/common.rs"
ASSETS = "codex-asar-extract/webview/assets"
OUT = "frontend/src/protocol/generated"

src = io.open(COMMON, encoding="utf-8", errors="replace").read()
lines = src.split("\n")


def enum_body(name):
    """Return the body of the `name! { ... }` macro invocation (brace matched).

    The protocol tables are declared with macros, not `pub enum`:
      server_notification_definitions! { TurnStarted => "turn/started" (...) }
    """
    m = re.search(r"^" + re.escape(name) + r"!\s*\{", src, re.MULTILINE)
    if not m:
        return None
    start = m.end() - 1
    depth = 0
    for i in range(start, len(src)):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                return src[start : i + 1]
    return None


def methods_of(body):
    """Parse method entries out of a definitions-macro body.

    Two declaration styles appear in common.rs:
      Variant => "method/name" (v2::Type),            // most entries
      #[strum(serialize = "method/name")] Variant(..) // e.g. account/login/completed
    """
    out = []
    pending_exp = None
    pending_strum = None
    for raw in body.split("\n"):
        line = raw.strip()

        if line.startswith("#[experimental("):
            m = re.search(r'#\[experimental\("([^"]+)"\)\]', line)
            pending_exp = m.group(1) if m else True
            continue

        m = re.match(r'#\[strum\(serialize\s*=\s*"([^"]+)"\)\]', line)
        if m:
            pending_strum = m.group(1)
            continue

        m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)\s*=>\s*"([^"]+)"', line)
        if m:
            out.append({"variant": m.group(1), "method": m.group(2), "experimental": pending_exp})
            pending_exp = None
            pending_strum = None
            continue

        # Tuple variant carrying its method name on a preceding strum attribute.
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*\(", line)
        if m and pending_strum:
            out.append({"variant": m.group(1), "method": pending_strum, "experimental": pending_exp})
            pending_exp = None
            pending_strum = None
            continue

        if line.startswith("#[") or line.startswith("//") or line == "":
            continue

        pending_exp = None
        pending_strum = None
    return out


notifications = methods_of(enum_body("server_notification_definitions") or "")
requests = methods_of(enum_body("server_request_definitions") or "")
client_requests = methods_of(enum_body("client_request_definitions") or "")
client_notifications = methods_of(enum_body("client_notification_definitions") or "")

# ── block types from the official turn stream ─────────────────────────
block_types = set()
cb = glob.glob(os.path.join(ASSETS, "conversation-blocks-*.js"))
if cb:
    js = io.open(cb[0], encoding="utf-8", errors="replace").read()
    for m in re.finditer(r"type===`([a-zA-Z0-9_-]+)`", js):
        block_types.add(m.group(1))
    for m in re.finditer(r"\.type===`([a-zA-Z0-9_-]+)`", js):
        block_types.add(m.group(1))

# ── status + phase vocabulary ─────────────────────────────────────────
statuses = set()
phases = set()
if cb:
    for m in re.finditer(r"status===`([a-zA-Z0-9_-]+)`", js):
        statuses.add(m.group(1))
    for m in re.finditer(r"phase===`([a-zA-Z0-9_-]+)`", js):
        phases.add(m.group(1))

report = {
    "notifications": notifications,
    "requests": requests,
    "clientRequests": client_requests,
    "clientNotifications": client_notifications,
    "blockTypes": sorted(block_types),
    "statuses": sorted(statuses),
    "phases": sorted(phases),
}

os.makedirs(OUT, exist_ok=True)
with io.open(os.path.join(OUT, "protocol.json"), "w", encoding="utf-8", newline="\n") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
    f.write("\n")

print("server notifications : %d (%d experimental)" % (len(notifications), sum(1 for n in notifications if n["experimental"])))
print("server requests      : %d" % len(requests))
print("client requests      : %d" % len(client_requests))
print("client notifications : %d" % len(client_notifications))
print("blockTypes           : %d" % len(block_types))
print("statuses             : %d -> %s" % (len(statuses), ", ".join(sorted(statuses))))
print("phases               : %d -> %s" % (len(phases), ", ".join(sorted(phases))))
print()
print("=== server notifications (first 15) ===")
for n in notifications[:15]:
    print("  %-46s %s%s" % (n["method"], n["variant"], "  [exp]" if n["experimental"] else ""))
print()
print("=== server requests ===")
for r in requests:
    print("  %-46s %s" % (r["method"], r["variant"]))
print()
print("wrote", os.path.join(OUT, "protocol.json"))
