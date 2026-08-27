#!/usr/bin/env python3
"""Tighten the Sprint 3 chapter-indexed CoB locator.

Runs the v2 acquisition hardening, then makes the strongest chapter match require
both the expected numbered subsection and the expected county title. This avoids
false matches on unrelated numbered material while retaining the OCR-resilient
subsection-backtrack path for damaged county headings.
"""
from pathlib import Path

import harden_acquisition_v2

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v2.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")
    old = '''    # 1) Expected 3.<n>.1 Overview subsection.\n    for page_i in range(floor, len(texts)):\n        flat = _norm(texts[page_i])\n        if re.search(_chapter_pattern(chapter_no, 1), flat, re.I) and re.search(r"Overview", flat, re.I):\n            return page_i\n'''
    new = '''    # 1) Expected 3.<n>.1 Overview subsection plus the expected county title.\n    # Bare numbered material is not enough because tables/figures can contain\n    # chapter-like decimals unrelated to the county chapter.\n    for page_i in range(floor, len(texts)):\n        flat = _norm(texts[page_i])\n        county_hit = any(\n            re.search(rf"{re.escape(_norm(v))}\\s+County(?:\\s+Government)?\\b", flat, re.I)\n            for v in variants\n        )\n        if county_hit and re.search(_chapter_pattern(chapter_no, 1), flat, re.I) and re.search(r"Overview", flat, re.I):\n            return page_i\n'''
    if old not in s:
        raise RuntimeError("Expected v2 strongest chapter-match block not found")
    p.write_text(s.replace(old, new, 1), encoding="utf-8")
    print("Sprint 3 acquisition hardening v3 applied")


if __name__ == "__main__":
    main()
