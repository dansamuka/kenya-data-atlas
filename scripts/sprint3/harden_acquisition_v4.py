#!/usr/bin/env python3
"""Refine Sprint 3 CoB subsection backtracking for FY2019/20+ reports."""
from pathlib import Path

import harden_acquisition_v3

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v3.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")
    old = '''            overview = bool(re.search(rf"Overview.{{0,260}}?{fy_pat}.{{0,120}}?Budget", flat, re.I))\n            if county_hit or overview:\n                print("CoB subsection-backtrack", variants[0], fy, "chapter", chapter_no, "page", page_i + 1)\n                return page_i\n'''
    new = '''            if county_hit:\n                print("CoB subsection-backtrack", variants[0], fy, "chapter", chapter_no, "page", page_i + 1)\n                return page_i\n'''
    if old not in s:
        raise RuntimeError("Expected v3 subsection-backtrack block not found")
    p.write_text(s.replace(old, new, 1), encoding="utf-8")
    print("Sprint 3 acquisition hardening v4 applied")


if __name__ == "__main__":
    main()
