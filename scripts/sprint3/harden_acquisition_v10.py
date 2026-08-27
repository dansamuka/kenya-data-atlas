#!/usr/bin/env python3
"""Use the FY2018/19 CoB consolidated county table as the primary parser.

The annual report's Table 2.5 publishes all 47 counties' recurrent/development/
total budget estimates, recurrent/development/total expenditure, and absorption
rates in one authoritative table.  Parsing that table is both more direct and
more robust than locating 47 OCR-sensitive narrative chapter openings.

This changes only FY2018/19.  It does not relax any numeric or 47-county gate.
"""
from pathlib import Path

import harden_acquisition_v9

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v9.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    validate_anchor = "\ndef _validate_year(fy: str, values: dict[str, dict], county_names: list[str]) -> None:\n"
    if validate_anchor not in s:
        raise RuntimeError("Expected _validate_year anchor missing")

    parser = r'''
def _parse_2018_consolidated_table(content: bytes, county_names: list[str]) -> dict[str, dict]:
    """Parse FY2018/19 Table 2.5 (47 county rows) from the official annual report."""
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        texts = [p.extract_text(x_tolerance=2, y_tolerance=3) or "" for p in pdf.pages]

    table_page = None
    for page_i, raw in enumerate(texts):
        flat = _norm(raw)
        if "Table 2.5" in flat and "County Budget Allocation" in flat and "Absorption Rate" in flat:
            table_page = page_i
            break
    if table_page is None:
        raise RuntimeError("2018/19: official Table 2.5 not found")

    # Each county row contains nine decimal values in this order:
    # recurrent/development/total budget; recurrent/development/total spend;
    # recurrent/development/overall absorption.  The table spans two pages;
    # a third page is included only as a defensive scan boundary.
    num_re = re.compile(r"-?\d[\d,]*\.\d+")
    parsed_rows = []
    for page_i in range(table_page, min(table_page + 3, len(texts))):
        for raw_line in texts[page_i].splitlines():
            line = _norm("".join(" " if ord(ch) < 32 else ch for ch in raw_line))
            if not line:
                continue
            if re.match(r"^Total\b", line, re.I):
                if len(parsed_rows) >= 47:
                    break
                continue
            matches = list(num_re.finditer(line))
            if len(matches) < 9:
                continue
            # Table data rows are the only lines in this bounded region with nine
            # decimal-valued cells. Ignore any extra OCR token after the ninth cell.
            values = [float(m.group(0).replace(",", "")) for m in matches[:9]]
            label = line[:matches[0].start()].strip()
            parsed_rows.append((label, values, page_i + 1))
            if len(parsed_rows) == 47:
                break
        if len(parsed_rows) == 47:
            break

    if len(parsed_rows) != 47:
        raise RuntimeError(f"2018/19 Table 2.5: expected 47 county rows, got {len(parsed_rows)}")

    # The official table is in the same canonical county order as the report's
    # county chapters. Verify the extracted row labels so a shifted row cannot
    # silently be assigned to the wrong county.
    def letters(value: str) -> str:
        return re.sub(r"[^a-z]", "", value.lower().replace("’", "'").replace("\u00ad", ""))

    found = {}
    for expected, (label, vals, source_page) in zip(COB_2013_ORDER, parsed_rows):
        got = letters(label)
        aliases = COUNTY_VARIANTS.get(expected, [expected])
        expected_forms = [letters(x) for x in aliases]
        label_ok = any(form and (form in got or got in form) for form in expected_forms)
        # The PDF line-wrap separates the first half of "Tharaka-Nithi" from the
        # numeric row on some extractors, leaving only "-Nithi" on the data line.
        if expected == "Tharaka-Nithi" and got.endswith("nithi"):
            label_ok = True
        if not label_ok:
            raise RuntimeError(
                f"2018/19 Table 2.5 row-order check failed: expected {expected!r}, got {label!r}"
            )

        budget_total = vals[2]
        expenditure_total = vals[5]
        development_absorption = vals[7]
        overall_absorption = vals[8]
        found[expected] = {
            "budget_total_ksh_mn": budget_total,
            "expenditure_total_ksh_mn": expenditure_total,
            "development_absorption_pct": development_absorption,
            "overall_absorption_pct": overall_absorption,
            "source_page": source_page,
            "rate_method": "published_table_2_5",
        }

    missing = [c for c in county_names if c not in found]
    if missing:
        raise RuntimeError(f"2018/19 Table 2.5 missing registry counties: {missing}")
    return found

'''
    s = s.replace(validate_anchor, parser + validate_anchor, 1)

    old_dispatch = '''        elif fy == "2014/15":\n            values = _parse_2014(content)\n        else:\n            values = _parse_narrative_year(content, fy, county_names)\n'''
    new_dispatch = '''        elif fy == "2014/15":\n            values = _parse_2014(content)\n        elif fy == "2018/19":\n            values = _parse_2018_consolidated_table(content, county_names)\n        else:\n            values = _parse_narrative_year(content, fy, county_names)\n'''
    if old_dispatch not in s:
        raise RuntimeError("Expected CoB year-dispatch block missing")
    s = s.replace(old_dispatch, new_dispatch, 1)

    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v10 applied")


if __name__ == "__main__":
    main()
