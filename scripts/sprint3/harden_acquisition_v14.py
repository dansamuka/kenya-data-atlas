#!/usr/bin/env python3
"""Prefer audited economic-classification rows for late CoB annual reports.

FY2020/21 onward exposes stable county-level economic-classification tables even
when the surrounding prose changes. Two official layouts occur:

* FY2020/21 style: label, total budget, exchequer, total expenditure, absorption.
* FY2021/22+ style: label, County Executive budget, County Assembly budget,
  County Executive expenditure, County Assembly expenditure, then two component
  absorption rates.

The Atlas needs county total budget/expenditure and development/overall
absorption. This patch reads those published rows first, sums Executive + Assembly
where necessary, and independently checks every available published percentage.
It does not weaken any existing range/arithmetic validator. Narrative extraction
remains the fallback when a complete economic-classification pair is unavailable.
"""
from pathlib import Path

import harden_acquisition_v13

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v13.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    anchor = '''def _extract_narrative(window: str, county: str, fy: str) -> dict:\n    text = _norm(window)\n'''
    replacement = r'''def _economic_classification_values(text: str, county: str, fy: str):
    """Return strict county totals from the published economic-classification table.

    The search is confined to the county window *after* the explicit economic-
    classification heading, preventing Total rows from revenue/pending-bill/fund
    tables from being mistaken for expenditure totals.
    """
    section = re.search(r"Expenditure\s+by\s+Economic\s+Classification", text, re.I)
    if not section:
        return None
    econ = text[section.start():section.start() + 7000]

    raw = r"([0-9]{1,3}(?:,[0-9]{3})+)"
    pct = r"([0-9]+(?:\.[0-9]+)?)"

    def to_mn(token: str) -> float:
        return _money_to_mn(token, None)

    def parse_row(label: str, row_name: str):
        # Executive + Assembly layout: four currency cells then two published
        # component absorption rates.
        split = re.search(
            rf"{label}\s+{raw}\s+{raw}\s+{raw}\s+{raw}\s+{pct}\s+{pct}\b",
            econ,
            re.I,
        )
        if split:
            b_exec, b_assembly, s_exec, s_assembly = [to_mn(split.group(i)) for i in range(1, 5)]
            p_exec, p_assembly = float(split.group(5)), float(split.group(6))
            for budget_part, spend_part, published, component in (
                (b_exec, s_exec, p_exec, "executive"),
                (b_assembly, s_assembly, p_assembly, "assembly"),
            ):
                if budget_part > 0:
                    calc = spend_part / budget_part * 100.0
                    if abs(calc - published) > 1.0:
                        raise RuntimeError(
                            f"{fy} {county}: {row_name} {component} table absorption mismatch "
                            f"published={published} calc={calc:.2f}"
                        )
            budget = b_exec + b_assembly
            spend = s_exec + s_assembly
            calc = spend / budget * 100.0 if budget > 0 else None
            return budget, spend, calc, "economic_classification_split"

        # Single county-total layout: budget, exchequer, expenditure, absorption.
        single = re.search(
            rf"{label}\s+{raw}\s+{raw}\s+{raw}\s+{pct}\b",
            econ,
            re.I,
        )
        if single:
            budget, _exchequer, spend = [to_mn(single.group(i)) for i in range(1, 4)]
            published = float(single.group(4))
            calc = spend / budget * 100.0 if budget > 0 else None
            if calc is None or abs(calc - published) > 1.0:
                raise RuntimeError(
                    f"{fy} {county}: {row_name} table absorption mismatch "
                    f"published={published} calc={calc}"
                )
            return budget, spend, published, "economic_classification_total"
        return None

    development = parse_row(r"(?:Total\s+)?Development\s+Expenditure", "development")
    total = parse_row(r"Total(?!\s+(?:Recurrent|Development|Pending))", "overall")
    if not development or not total:
        return None

    dev_budget, dev_spend, dev_abs, dev_method = development
    budget, spend, overall, total_method = total
    if not (1 <= budget <= 200_000 and 0 <= spend <= 220_000):
        raise RuntimeError(f"{fy} {county}: economic-classification total out of range {budget}/{spend}")
    if not (0 <= overall <= 130 and 0 <= dev_abs <= 180):
        raise RuntimeError(f"{fy} {county}: economic-classification absorption out of range {overall}/{dev_abs}")
    if dev_budget <= 0 or dev_spend < 0:
        raise RuntimeError(f"{fy} {county}: invalid development economic-classification row")

    # Cross-check the returned rates from the same official numerator/denominator.
    if abs(spend / budget * 100.0 - overall) > 1.0:
        raise RuntimeError(f"{fy} {county}: economic-classification overall ratio failed")
    if abs(dev_spend / dev_budget * 100.0 - dev_abs) > 1.0:
        raise RuntimeError(f"{fy} {county}: economic-classification development ratio failed")

    return {
        "budget_total_ksh_mn": budget,
        "expenditure_total_ksh_mn": spend,
        "development_absorption_pct": dev_abs,
        "overall_absorption_pct": overall,
        "rate_method": f"{total_method}+{dev_method}",
    }


def _extract_narrative(window: str, county: str, fy: str) -> dict:
    text = _norm(window)
    table_value = _economic_classification_values(text, county, fy)
    if table_value is not None:
        return table_value
'''
    if anchor not in s:
        raise RuntimeError("Expected _extract_narrative anchor missing")
    s = s.replace(anchor, replacement, 1)

    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v14 applied")


if __name__ == "__main__":
    main()
