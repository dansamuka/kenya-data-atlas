#!/usr/bin/env python3
"""Pin the official CoB endpoints already resolved by successful diagnostics.

Live CoB landing pages are intermittently throttled. Successful source-inspection
runs resolved FY2022/23 to wpdmdl=15957 and FY2023/24 to wpdmdl=16104; FY2020/21
was pinned in v17 and FY2021/22 already has an official wp-content fallback.
These are discovery fallbacks only. Downloaded bytes must still be a valid PDF,
are hashed, parsed and must pass every Sprint 3 source/reconciliation validator.
"""
from pathlib import Path

import harden_acquisition_v18

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v18.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")
    additions = [
        ('    "2022/23": "https://cob.go.ke/download/county-governments-budget-implementation-review-report-for-the-financial-year-fy-2022-23/?wpdmdl=15957",\n',
         '    "2021/22": "https://cob.go.ke/wp-content/uploads/2022/09/Counties-Sep-2022-web.pdf",\n'),
        ('    "2023/24": "https://cob.go.ke/download/county-governments-budget-implementation-review-report-for-the-financial-year-2023-24/?wpdmdl=16104",\n',
         '    "2022/23": "https://cob.go.ke/download/county-governments-budget-implementation-review-report-for-the-financial-year-fy-2022-23/?wpdmdl=15957",\n'),
    ]
    for entry, anchor in additions:
        if entry in s:
            continue
        if anchor not in s:
            raise RuntimeError(f"Expected direct-fallback anchor missing: {anchor.strip()}")
        s = s.replace(anchor, anchor + entry, 1)
    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v19 applied")


if __name__ == "__main__":
    main()
