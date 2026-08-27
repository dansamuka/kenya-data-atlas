#!/usr/bin/env python3
"""Pin canonical official CoB download-manager fallbacks for FY2022/23 and FY2023/24.

The CoB WordPress landing pages occasionally return successfully without rendering a
usable download link. Both canonical `wpdmdl` endpoints below were observed from
successful official CoB downloads and are already used by the same acquisition code
when discovered dynamically. Adding them to COB_DIRECT_FALLBACK changes only source
retrieval reliability; source domain, PDF validation, parsing, arithmetic, coverage,
and provenance gates remain unchanged.
"""
from pathlib import Path

import harden_acquisition_v26

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v26.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    anchor = '    "2021/22": "https://cob.go.ke/wp-content/uploads/2022/09/Counties-Sep-2022-web.pdf",\n'
    additions = (
        '    "2022/23": "https://cob.go.ke/download/county-governments-budget-implementation-review-report-for-the-financial-year-fy-2022-23/?wpdmdl=15957",\n'
        '    "2023/24": "https://cob.go.ke/download/county-governments-budget-implementation-review-report-for-the-financial-year-2023-24/?wpdmdl=16104",\n'
    )

    if additions not in s:
        if anchor not in s:
            raise RuntimeError("Expected CoB direct-fallback anchor missing")
        s = s.replace(anchor, anchor + additions, 1)

    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v27 applied; official FY2022/23 and FY2023/24 fallbacks pinned")


if __name__ == "__main__":
    main()
