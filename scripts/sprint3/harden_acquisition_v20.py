#!/usr/bin/env python3
"""Assert the v14 economic-table helper survives the v16 locator replacement.

v19 exposed a runtime NameError because the first v16 implementation replaced
everything from `_find_section` through `_extract_narrative`, accidentally deleting
`_economic_classification_values` inserted by v14. v16 now replaces only the
locator. This version gate makes that regression explicit and release-blocking.
"""
from pathlib import Path

import harden_acquisition_v19

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v19.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")
    if "def _economic_classification_values(" not in s:
        raise RuntimeError("economic-classification helper lost during hardening chain")
    if "table_value = _economic_classification_values(text, county, fy)" not in s:
        raise RuntimeError("economic-classification helper is not wired into narrative extraction")
    print("Sprint 3 acquisition hardening v20 applied; economic table helper preserved")


if __name__ == "__main__":
    main()
