#!/usr/bin/env python3
"""Harden late-year CoB economic-classification table parsing.

The FY2020/21–FY2023/24 reports use the same economic-classification concept but
PDF text extraction varies in three harmless ways: headings may say
"Expenditure Analysis by Economic Classification", row labels can be split as
"Expen- diture", and monetary cells may be printed either as raw shillings or
Ksh million decimals.  v14 was stricter than the source typography and fell
back to prose for otherwise usable official tables.

This patch broadens only those source-format forms.  It does not relax any
budget/expenditure range, component-rate, overall-rate, 47-county, or
arithmetic reconciliation gate.
"""
from pathlib import Path

import harden_acquisition_v14

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v14.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    replacements = [
        (
            'section = re.search(r"Expenditure\\s+by\\s+Economic\\s+Classification", text, re.I)',
            'section = re.search(r"(?:Expenditure(?:\\s+Analysis)?\\s+by\\s+)?Economic\\s+Classification", text, re.I)',
        ),
        (
            'raw = r"([0-9]{1,3}(?:,[0-9]{3})+)"',
            'raw = r"([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?)"',
        ),
        (
            'development = parse_row(r"(?:Total\\s+)?Development\\s+Expenditure", "development")',
            'development = parse_row(r"(?:Total\\s+)?Development(?:\\s+Expen(?:-\\s*)?diture)?", "development")',
        ),
        (
            'total = parse_row(r"Total(?!\\s+(?:Recurrent|Development|Pending))", "overall")',
            'total = parse_row(r"(?:Grand\\s+)?Total(?!\\s+(?:Recurrent|Development|Pending))", "overall")',
        ),
    ]
    for old, new in replacements:
        if old not in s:
            raise RuntimeError(f"Expected v14 source-format anchor missing: {old}")
        s = s.replace(old, new, 1)

    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v15 applied")


if __name__ == "__main__":
    main()
