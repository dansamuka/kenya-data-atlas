#!/usr/bin/env python3
"""Accept both 'program' and 'programme' in CoB development-absorption prose.

The FY2022/23 Wajir chapter states: "Expenditure on development programs
represented an absorption rate of 76.5 percent." The existing source-backed
late-year pattern handled British 'programme/programmes' only. This patch widens
that single lexical variant to program/programs/programme/programmes. It changes
no values and relaxes no arithmetic, range, coverage, or provenance checks.
"""
from pathlib import Path

import harden_acquisition_v25

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v25.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    old = r'''        r"Expenditure\s+on\s+development\s+programmes?\s+represented\s+an?\s+absorption\s+rate\s+of\s+([0-9]+(?:\.[0-9]+)?)\s*per\s*cent",
'''
    new = r'''        r"Expenditure\s+on\s+development\s+program(?:me)?s?\s+represented\s+an?\s+absorption\s+rate\s+of\s+([0-9]+(?:\.[0-9]+)?)\s*per\s*cent",
'''
    if old not in s:
        if new in s:
            print("Sprint 3 acquisition hardening v26 already applied")
            return
        raise RuntimeError("Expected development-programme absorption pattern missing")

    s = s.replace(old, new, 1)
    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v26 applied; program/programme variants accepted")


if __name__ == "__main__":
    main()
