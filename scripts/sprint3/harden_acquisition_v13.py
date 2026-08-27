#!/usr/bin/env python3
"""Scope the FY2019/20 OCR-title exception to FY2019/20 only.

v8 intentionally allowed an exact expected `3.<n>.1 ... Overview ... FY ... Budget`
marker to define a chapter start without also requiring the county name, because
FY2019/20 has damaged county-title OCR. Applied globally, that exception can make
later reports resolve table-of-contents/reference material as a county opening.
FY2020/21 exposed this as Bomet and Baringo sharing page 33 and Bomet then having
no total-expenditure sentence in its bounded window.

This hardening keeps the no-county-name exception ONLY for FY2019/20. Every
other narrative year must satisfy the exact opening marker AND the expected
county-name hit. No data/range/arithmetic validator is changed.
"""
from pathlib import Path

import harden_acquisition_v12

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v12.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    old = '''        if re.search(_chapter_pattern(chapter_no, 1), flat, re.I) and re.search(opening_context, flat, re.I):\n            return page_i\n'''
    new = '''        if (fy == "2019/20" or county_hit(flat)) and re.search(_chapter_pattern(chapter_no, 1), flat, re.I) and re.search(opening_context, flat, re.I):\n            return page_i\n'''
    if old not in s:
        raise RuntimeError("Expected v8 opening-marker exception block missing")
    s = s.replace(old, new, 1)

    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v13 applied")


if __name__ == "__main__":
    main()
