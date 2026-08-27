#!/usr/bin/env python3
"""Apply the FY2019/20 CoB county-chapter numbering offset.

The FY2019/20 annual report inserts a non-county section before the county
chapters. Its county chapters are therefore numbered one higher than the
canonical 47-county order: Bungoma (county-order 3) is chapter 3.4, Busia is
3.5, Kirinyaga is 3.16, Narok is 3.34, etc.

Earlier parsers assumed chapter number == county order, which made them anchor
on the preceding county's late subsection. This patch changes the chapter index
for FY2019/20 only; earlier years that already pass all 47 counties are untouched.
"""
from pathlib import Path

import harden_acquisition_v6

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v6.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    old = '    chapter_order = {name: i + 1 for i, name in enumerate(COB_2013_ORDER)}\n'
    new = '''    chapter_offset = 1 if fy == "2019/20" else 0\n    chapter_order = {name: i + 1 + chapter_offset for i, name in enumerate(COB_2013_ORDER)}\n'''
    if old not in s:
        raise RuntimeError("Expected narrative chapter_order block missing")
    s = s.replace(old, new, 1)

    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v7 applied")


if __name__ == "__main__":
    main()
