#!/usr/bin/env python3
"""Prefer county-level budget/expenditure narrative over economic subtables.

Late CoB reports publish the Atlas target totals in two semantically clear places:
- the county budget overview (approved/revised/supplementary total budget), and
- the county expenditure review (total amount spent).

Economic-classification tables are valuable corroboration/fallbacks, but their
component budgets can reflect a different presentation basis and should not
silently replace the published county total merely because their internal maths
reconciles. Flattened PDF text can also create false single-row regex matches.

This hardening therefore:
1. rejects non-reconciling single-row regex candidates as parser non-matches;
2. parses the county-level narrative first for total budget/expenditure;
3. uses a fully reconciled economic table only if those totals are unavailable;
4. allows a reconciled table development-absorption value to fill a genuinely
   missing narrative development rate, with provenance marked explicitly.

No range, 47-county, source, or budget/expenditure reconciliation gate is relaxed.
"""
from pathlib import Path

import harden_acquisition_v23

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v23.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    # A single-row candidate that does not reconcile is a failed PDF parse, not
    # evidence to ingest. Let the caller fall back to the official narrative.
    old_single = '''            if calc is None or abs(calc - published) > 1.0:\n                raise RuntimeError(\n                    f"{fy} {county}: {row_name} table absorption mismatch "\n                    f"published={published} calc={calc}"\n                )\n'''
    new_single = '''            if calc is None or abs(calc - published) > 1.0:\n                return None\n'''
    if old_single not in s:
        raise RuntimeError("Expected single-row mismatch block missing")
    s = s.replace(old_single, new_single, 1)

    # Keep a validated table candidate available, but do not return it before the
    # semantically primary county overview/expenditure narrative is parsed.
    old_early = '''    table_value = _economic_classification_values(text, county, fy)\n    if table_value is not None:\n        return table_value\n'''
    new_early = '''    table_value = _economic_classification_values(text, county, fy)\n'''
    if old_early not in s:
        raise RuntimeError("Expected early economic-table return block missing")
    s = s.replace(old_early, new_early, 1)

    old_missing = '''    if budget is None or expenditure is None:\n        raise RuntimeError(f"{fy} {county}: budget/expenditure not extracted (budget={budget}, expenditure={expenditure})")\n'''
    new_missing = '''    if budget is None or expenditure is None:\n        if table_value is not None:\n            return table_value\n        raise RuntimeError(f"{fy} {county}: budget/expenditure not extracted (budget={budget}, expenditure={expenditure})")\n'''
    if old_missing not in s:
        raise RuntimeError("Expected narrative missing-total block missing")
    s = s.replace(old_missing, new_missing, 1)

    # If the narrative has the county totals but lacks a development rate and
    # numerator/denominator, a fully reconciled official economic table is a valid
    # source-backed fallback for that one measure.
    calc_anchor = '    dev_calc = (dev_spend / dev_budget * 100.0) if (dev_budget and dev_budget > 0 and dev_spend is not None) else None\n'
    if calc_anchor not in s:
        raise RuntimeError("Expected development calculation anchor missing")
    s = s.replace(calc_anchor, '    dev_from_table = False\n' + calc_anchor, 1)

    old_dev_else = '''    elif dev_direct:\n        dev_abs = dev_direct[0]\n    else:\n        raise RuntimeError(f"{fy} {county}: development absorption not extracted or derivable")\n'''
    new_dev_else = '''    elif dev_direct:\n        dev_abs = dev_direct[0]\n    elif table_value is not None:\n        dev_abs = float(table_value["development_absorption_pct"])\n        dev_from_table = True\n    else:\n        raise RuntimeError(f"{fy} {county}: development absorption not extracted or derivable")\n'''
    if old_dev_else not in s:
        raise RuntimeError("Expected development fallback block missing")
    s = s.replace(old_dev_else, new_dev_else, 1)

    old_method = '''    methods.append("published_development" if (dev_direct and (dev_calc is None or any(abs(x-dev_abs)<1e-9 for x in dev_direct))) else "derived_development")\n'''
    new_method = '''    if dev_from_table:\n        methods.append("published_development_economic_table")\n    else:\n        methods.append("published_development" if (dev_direct and (dev_calc is None or any(abs(x-dev_abs)<1e-9 for x in dev_direct))) else "derived_development")\n'''
    if old_method not in s:
        raise RuntimeError("Expected development rate-method block missing")
    s = s.replace(old_method, new_method, 1)

    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v24 applied; county totals prefer narrative semantics")


if __name__ == "__main__":
    main()
