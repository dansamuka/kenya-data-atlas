#!/usr/bin/env python3
"""Recognise ordinal supplementary-budget wording in late CoB reports.

Some Controller of Budget county chapters state the authoritative headline total as,
for example, "approved second supplementary budget for the FY 2022/23 was
Kshs.9.11 billion". Earlier Sprint 3 patterns recognised "approved supplementary
budget" but not an ordinal between approved and supplementary, and did not permit
the fiscal-year phrase before "was". In PDF text, billion/million may also be
line-wrapped as "bil- lion" / "mil- lion".

This patch adds one high-specificity, generic county-budget pattern ahead of the
broader fallbacks. It does not add a county-specific value and does not relax any
reconciliation or range check.
"""
from pathlib import Path

import harden_acquisition_v24

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v24.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    anchor = '    budget = _first_money(text, [\n'
    if anchor not in s:
        raise RuntimeError("Expected budget pattern-list anchor missing")

    pattern = r'''        r"(?:the\s+county(?:'s|’s)?\s+)?(?:approved|revised)\s+(?:(?:first|second|third|fourth|fifth|final|[1-9](?:st|nd|rd|th))\s+)?supplementary\s+budget(?:\s+for\s+(?:the\s+)?(?:FY\s*)?\d{4}/\d{2})?\s+(?:was|is|of|amounted\s+to)\s*(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|bil-\s*lion|million|mil-\s*lion)",
'''

    # Idempotent once a successful acquisition has baked the generated parser back
    # into the working branch.
    if pattern not in s:
        s = s.replace(anchor, anchor + pattern, 1)

    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v25 applied; ordinal supplementary budgets recognised")


if __name__ == "__main__":
    main()
