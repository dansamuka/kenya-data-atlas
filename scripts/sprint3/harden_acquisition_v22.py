#!/usr/bin/env python3
"""Scope late CoB table schemas and recover explicit development absorption prose.

Diagnostics against official reports established three distinct behaviours:
- the economic-classification parser is a late-report parser and must not run on
  pre-FY2020/21 reports;
- FY2020/21 uses the single county-total table layout, while FY2021/22 onward
  commonly uses the Executive/Assembly split layout;
- several reports explicitly state "Expenditure on development programmes
  represented an absorption rate of X per cent", even where PDF table cells are
  hyphenated or contain '-' Assembly components.

This patch encodes those source schemas. It does not relax any arithmetic, range,
47-county, provenance, or final budget/expenditure reconciliation gate.
"""
from pathlib import Path

import harden_acquisition_v21

ROOT = Path(__file__).resolve().parents[2]
LATE_FYS = {"2020/21", "2021/22", "2022/23", "2023/24"}


def main() -> None:
    harden_acquisition_v21.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    # The economic-classification parser was designed for the four late report
    # families. Earlier reports have their own annex/narrative extraction paths.
    sig = 'def _economic_classification_values(text: str, county: str, fy: str):\n'
    if sig not in s:
        raise RuntimeError("Economic-classification helper signature missing")
    s = s.replace(
        sig,
        sig + '    if fy not in {"2020/21", "2021/22", "2022/23", "2023/24"}:\n        return None\n',
        1,
    )

    # FY2020/21 is the documented single-total layout. Do not let a long row plus
    # neighbouring values accidentally satisfy the later Executive/Assembly regex.
    split_anchor = '        split = re.search(\n'
    if split_anchor not in s:
        raise RuntimeError("Economic split-row anchor missing")
    s = s.replace(
        split_anchor,
        '        split = None if fy == "2020/21" else re.search(\n',
        1,
    )

    # A value above 130 cannot be a component absorption percentage in these
    # tables; treat that regex hit as a schema non-match, not as financial data.
    pct_anchor = '            p_exec, p_assembly = float(split.group(5)), float(split.group(6))\n'
    if pct_anchor not in s:
        raise RuntimeError("Economic component percentage anchor missing")
    s = s.replace(
        pct_anchor,
        pct_anchor + '            if not (0 <= p_exec <= 130 and 0 <= p_assembly <= 130):\n                return None\n',
        1,
    )

    # Explicit official prose used in FY2021/22+ (and some neighbouring layouts).
    # The returned percentage is still reconciled against any available official
    # development numerator/denominator by the existing downstream logic.
    dev_anchor = '    dev_direct = _pct_candidates(text, [\n'
    if dev_anchor not in s:
        raise RuntimeError("Development absorption candidate anchor missing")
    s = s.replace(
        dev_anchor,
        dev_anchor + '        r"Expenditure\\s+on\\s+development\\s+programmes?\\s+represented\\s+an?\\s+absorption\\s+rate\\s+of\\s+([0-9]+(?:\\.[0-9]+)?)\\s*per\\s*cent",\n',
        1,
    )

    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v22 applied; late schemas scoped and explicit development rates enabled")


if __name__ == "__main__":
    main()
