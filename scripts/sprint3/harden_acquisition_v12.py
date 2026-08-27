#!/usr/bin/env python3
"""Recover exact county-total budget/expenditure rows when narrative matching mixes scopes.

FY2019/20 Garissa exposed a strict-validator failure where the narrative matcher
paired the county's development-only budget (Kshs.4.451bn) with total expenditure
(Kshs.8.385bn), yielding an impossible 188.5% overall absorption. The same source
page contains the official economic-classification Total row:

    Total 10,868,381,277 8,418,472,730 8,385,320,325 100.0 77.2

This patch does not relax any validation. It only activates when the initially
matched budget/expenditure imply >130% absorption, and then requires an official
Total row whose own published absorption reconciles arithmetically before using
its budget and expenditure values. Development extraction remains unchanged.
"""
from pathlib import Path

import harden_acquisition_v11

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v11.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    old = '''    overall_calc = expenditure / budget * 100.0\n'''
    new = r'''    overall_calc = expenditure / budget * 100.0

    # Strict recovery for mixed-scope narrative matches. County economic-
    # classification tables publish a final Total row as:
    # Total <budget> <exchequer> <expenditure> 100.0 <absorption>.
    # Only use it when the initial pair is already impossible (>130%) and the
    # table row independently reconciles to its published absorption rate.
    if overall_calc > 130.0:
        total_row = re.search(
            r"(?:^|\s)Total\s+([0-9][0-9,]{5,})\s+([0-9][0-9,]{5,})\s+([0-9][0-9,]{5,})\s+100(?:\.0)?\s+([0-9]+(?:\.[0-9]+)?)\b",
            text,
            re.I,
        )
        if total_row:
            table_budget = _money_to_mn(total_row.group(1), None)
            table_expenditure = _money_to_mn(total_row.group(3), None)
            table_absorption = float(total_row.group(4))
            table_calc = table_expenditure / table_budget * 100.0 if table_budget > 0 else -1.0
            if (
                1 <= table_budget <= 200_000
                and 0 <= table_expenditure <= 220_000
                and 0 <= table_absorption <= 130
                and abs(table_calc - table_absorption) <= 1.0
            ):
                print(
                    "CoB total-row recovery",
                    county,
                    fy,
                    f"budget={table_budget:.3f}",
                    f"spend={table_expenditure:.3f}",
                    f"abs={table_absorption:.1f}",
                )
                budget = table_budget
                expenditure = table_expenditure
                overall_calc = table_calc
'''
    if old not in s:
        raise RuntimeError("Expected overall_calc anchor missing")
    s = s.replace(old, new, 1)

    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v12 applied")


if __name__ == "__main__":
    main()
