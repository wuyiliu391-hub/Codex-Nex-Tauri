"""Scan the frontend for CJK mojibake (UTF-8 bytes decoded as GBK/CP936).

The pets page shipped with strings like 杩蜂綘 / 杞婚噺绾 which are the UTF-8
encoding of 迷你 / 轻量级 read back as GBK. i18n files legitimately contain
CJK, so they are skipped.
"""

import io
import os
import glob

SKIP = {"i18n.js", "i18n-pages.js"}

# High-confidence mojibake glyphs: common in CP936 mis-decodes, rare in real text.
BAD = set(
    "\u9225\u950b\u93c2\u9428\u938b\u93c4\u9366\u93c3\u95bf\u935c\u7edb\u9385\u934f\u935a\u93a2\u5bf5\u5bee\u5be4"
    "\u93cb\u93cd\u9420\u93b6\u93c9\u93dc\u9357\u9355\u935e\u935f\u93c7\u93c2\u9423\u942a\u942b\u942d\u942e"
    "\u6749\u8702\u7ed8"
)

roots = ["frontend/src/js", "frontend/src/styles"]
files = []
for r in roots:
    files += glob.glob(os.path.join(r, "**", "*.*"), recursive=True)
files += glob.glob("frontend/src/*.html")

hits = 0
for path in sorted(set(files)):
    if os.path.basename(path) in SKIP:
        continue
    try:
        with io.open(path, encoding="utf-8") as f:
            lines = f.readlines()
    except Exception:
        continue
    for n, line in enumerate(lines, 1):
        found = sorted({ch for ch in line if ch in BAD})
        if found:
            hits += 1
            print("%s:%d  [%s]" % (path, n, " ".join(found)))
            print("    " + line.strip()[:130])

if hits == 0:
    print("NO MOJIBAKE FOUND")
else:
    print("\n%d suspicious line(s)" % hits)
