#!/usr/bin/env python3
"""List the frontend asset paths embedded in a built Tauri exe.

Tauri stores the asset manifest as plain strings even when the payload itself
is compressed, so the manifest pins which frontend revision was built. This is
how we determined that the binary stuck on the splash screen was built from
f8caa55 (the revision carrying a bridge.js syntax error) rather than from the
fix: the manifest listed 18 js files and no pets-data.js.

Usage:
    python scripts/probe-exe-assets.py [path/to/app.exe]

Default path is the desktop build output used during development.
"""

import os
import re
import sys

DEFAULT_EXE = r"C:\Users\Administrator\Desktop\target\release\codex-tauri.exe"

# Markers that identify specific revisions. Add new ones as the frontend grows.
MARKERS = {
    "pets-data.js (35c5e43+)": b"pets-data",
    "IDLE_LOOP_SCALE (35c5e43+)": b"IDLE_LOOP_SCALE",
    "lookFrameFromPointer (35c5e43+)": b"lookFrameFromPointer",
    "settingsRuntimeFingerprint (35c5e43+)": b"settingsRuntimeFingerprint",
    "extractProjectsFromSessions (f8caa55+)": b"extractProjectsFromSessions",
    "buildMessagesFromTimeline (f8caa55+)": b"buildMessagesFromTimeline",
}


def main() -> int:
    exe = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_EXE
    if not os.path.exists(exe):
        print("not found:", exe)
        return 1

    size = os.path.getsize(exe)
    print("exe : %s" % exe)
    print("size: %d bytes (%.2f MB)" % (size, size / 1048576))
    print("mtime: %s" % __import__("datetime").datetime.fromtimestamp(os.path.getmtime(exe)))

    with open(exe, "rb") as f:
        data = f.read()

    js = sorted({m.decode() for m in re.findall(rb"js/[a-zA-Z0-9_.-]+\.js", data)})
    css = sorted({m.decode() for m in re.findall(rb"styles/[a-zA-Z0-9_.-]+\.css", data)})

    print("\n=== embedded js (%d) ===" % len(js))
    for p in js:
        print("  " + p)
    print("\n=== embedded css (%d) ===" % len(css))
    for p in css:
        print("  " + p)

    print("\n=== revision markers ===")
    for label, needle in MARKERS.items():
        print("  %-42s %s" % (label, "present" if needle in data else "absent"))

    has_pets_data = b"js/pets-data.js" in data
    print("\n=== conclusion ===")
    print("  pets-data.js embedded:", has_pets_data)
    print("  => built from        :", "35c5e43 or later" if has_pets_data else "BEFORE 35c5e43 (stale)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
