#!/usr/bin/env python3
"""Add the resolved official FY2020/21 CoB PDF endpoint as discovery fallback.

The CoB WordPress landing page intermittently omits its Download Manager link.
A successful diagnostic resolved the same official report to wpdmdl=15580.
This fallback changes discovery only: content must still be a valid PDF, is
SHA-256 hashed, parsed, and subjected to the full Sprint 3 release validators.
"""
from pathlib import Path

import harden_acquisition_v16

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v16.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")
    entry = '    "2020/21": "https://cob.go.ke/download/annual-county-governments-budget-implementation-review-report-fy-2020-21/?wpdmdl=15580",\n'
    if entry not in s:
        anchor = '    "2021/22": "https://cob.go.ke/wp-content/uploads/2022/09/Counties-Sep-2022-web.pdf",\n'
        if anchor not in s:
            raise RuntimeError("Expected FY2021/22 direct-fallback anchor missing")
        s = s.replace(anchor, entry + anchor, 1)
    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v17 applied")


if __name__ == "__main__":
    main()
