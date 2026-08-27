#!/usr/bin/env python3
"""Allow substantive exact county-opening markers without a clean county title.

Late CoB PDFs occasionally damage or omit the county title in extracted text even
though the numbered `3.<n>.1 Overview of FY ... Budget` opening survives.  v16
correctly rejected table-of-contents hits by requiring substantive fiscal content
(FY + Budget + Ksh amount), but it also required the county title on that same
page. That rejected legitimate Kirinyaga, Lamu and Mombasa openings.

For the strongest locator only, an exact expected `.1` opening marker plus
Overview and substantive fiscal content is sufficient. TOC pages remain excluded
because they do not contain a Ksh budget amount. All numeric/reconciliation gates
remain unchanged.
"""
from pathlib import Path

import harden_acquisition_v17

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v17.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")
    old = '''        if (substantive(flat) and county_hit(flat)\n                and re.search(_chapter_pattern(chapter_no, 1), flat, re.I)\n                and re.search(r"Overview", flat, re.I)):\n            return page_i\n'''
    new = '''        if (substantive(flat)\n                and re.search(_chapter_pattern(chapter_no, 1), flat, re.I)\n                and re.search(r"Overview", flat, re.I)):\n            return page_i\n'''
    if old not in s:
        raise RuntimeError("Expected v16 strongest locator block missing")
    s = s.replace(old, new, 1)
    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v18 applied")


if __name__ == "__main__":
    main()
