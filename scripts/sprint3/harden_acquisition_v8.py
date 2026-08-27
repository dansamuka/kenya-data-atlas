#!/usr/bin/env python3
"""Prefer exact FY-specific 3.<n>.1 Overview markers for CoB chapter starts.

After applying the FY2019/20 +1 chapter offset, marker diagnostics show that the
actual county openings are unambiguous even where county-title OCR matching is
fragile: e.g. Kilifi starts at 3.15.1 on page 146 and Narok at 3.34.1 on page
298. Requiring a county-name hit in the strongest locator path caused those
valid openings to be skipped and later county mentions to be selected instead.

This patch makes an exact expected `3.<n>.1` marker authoritative only when it
is coupled to `Overview`, the requested fiscal year, and `Budget`. All fallback
paths remain strict and unchanged; numeric/data validation is not relaxed.
"""
from pathlib import Path

import harden_acquisition_v7

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v7.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    old = '''    # 1) Expected opening subsection + county + Overview.\n    for page_i in range(floor, len(texts)):\n        flat = _norm(texts[page_i])\n        if county_hit(flat) and re.search(_chapter_pattern(chapter_no, 1), flat, re.I) and re.search(r"Overview", flat, re.I):\n            return page_i\n'''
    new = '''    # 1) Exact expected opening subsection plus FY-specific Overview/Budget.\n    # The chapter number is already FY-corrected; requiring the county name here\n    # is counterproductive when OCR damages only the title. A later subsection\n    # cannot satisfy the exact .1 marker, and the FY/Budget context excludes\n    # unrelated numbered material.\n    opening_context = rf"Overview.{{0,220}}?(?:FY|Financial\\s+Year)?.{{0,80}}?{fy_pat}.{{0,180}}?Budget"\n    for page_i in range(floor, len(texts)):\n        flat = _norm(texts[page_i])\n        if re.search(_chapter_pattern(chapter_no, 1), flat, re.I) and re.search(opening_context, flat, re.I):\n            return page_i\n'''
    if old not in s:
        raise RuntimeError("Expected v7 strongest chapter-start block missing")
    s = s.replace(old, new, 1)

    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v8 applied")


if __name__ == "__main__":
    main()
