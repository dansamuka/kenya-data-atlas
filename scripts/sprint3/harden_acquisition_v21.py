#!/usr/bin/env python3
"""Apply the FY2020/21 CoB county-chapter numbering offset.

A source diagnostic against the official FY2020/21 report showed page 33 carrying
`3.2.1 Overview of FY 2020/21 Budget` and the Baringo economic-classification
rows, while the parser had assigned chapter 3.2 to Bomet. The report therefore
uses the same +1 county-chapter offset already established for FY2019/20.

This patch changes only the chapter index for FY2020/21. It does not alter any
financial extraction, range, provenance, or reconciliation rule.
"""
from pathlib import Path

import harden_acquisition_v20

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v20.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    old = '    chapter_offset = 1 if fy == "2019/20" else 0\n'
    new = '    chapter_offset = 1 if fy in {"2019/20", "2020/21"} else 0\n'
    if old not in s:
        raise RuntimeError("Expected v7 chapter_offset block missing")
    s = s.replace(old, new, 1)

    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v21 applied; FY2020/21 chapter offset corrected")


if __name__ == "__main__":
    main()
