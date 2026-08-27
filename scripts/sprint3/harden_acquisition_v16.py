#!/usr/bin/env python3
"""Reject table-of-contents false positives in late CoB county location.

A live FY2020/21 diagnostic showed Bungoma resolving to PDF page 13: the table
of contents, not the county chapter.  The TOC contains county names and numbered
subsections, so numbering alone is insufficient.  Real county opening pages
contain substantive fiscal text and a Ksh monetary value.

This patch strengthens only chapter location.  Extraction and all arithmetic
release gates remain unchanged.
"""
from pathlib import Path

import harden_acquisition_v15

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v15.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    start = s.index("def _find_section(")
    end = s.index("\ndef _extract_narrative", start)
    new_find = r'''def _find_section(texts: list[str], variants: list[str], fy: str, chapter_no: int, floor: int) -> int:
    fy_pat = re.escape(fy)

    def county_hit(flat: str) -> bool:
        return any(
            re.search(
                r"\s+".join(re.escape(x) for x in _norm(v).split()) + r"\s+County(?:\s+Government)?\b",
                flat,
                re.I,
            )
            for v in variants
        )

    def substantive(flat: str) -> bool:
        # TOC/list-of-figures pages contain county names and chapter numbers but
        # not the actual fiscal narrative. Require the target FY, budget language,
        # and at least one Kenya-shilling amount on the same page.
        return (
            re.search(fy_pat, flat, re.I) is not None
            and re.search(r"\bBudget\b", flat, re.I) is not None
            and re.search(r"\bKshs?\.?\s*[0-9]", flat, re.I) is not None
        )

    # 1) Expected opening subsection + county + Overview on a substantive page.
    for page_i in range(floor, len(texts)):
        flat = _norm(texts[page_i])
        if (substantive(flat) and county_hit(flat)
                and re.search(_chapter_pattern(chapter_no, 1), flat, re.I)
                and re.search(r"Overview", flat, re.I)):
            return page_i

    # 2) Explicit top-level chapter title, but only on a substantive page.
    for page_i in range(floor, len(texts)):
        flat = _norm(texts[page_i])
        if substantive(flat) and county_hit(flat) and re.search(_top_level_chapter_pattern(chapter_no), flat, re.I):
            return page_i

    # 3) County + requested FY overview/budget language with a monetary amount.
    for page_i in range(floor, len(texts)):
        flat = _norm(texts[page_i])
        if not (substantive(flat) and county_hit(flat)):
            continue
        if re.search(rf"Overview.{{0,320}}?(?:FY|Financial\s+Year)?.{{0,80}}?{fy_pat}.{{0,220}}?Budget", flat, re.I):
            return page_i

    # 4) OCR recovery: a later subsection is an anchor only. Prefer a nearby
    # substantive county page; never return a TOC page merely because it has the
    # right number/name combination.
    later = None
    later_pat = rf"3\s*\.\s*{chapter_no}\s*\.\s*[2-9]\b"
    for page_i in range(floor, len(texts)):
        flat = _norm(texts[page_i])
        if re.search(later_pat, flat, re.I) and substantive(flat):
            later = page_i
            break
    if later is not None:
        for page_i in range(max(floor, later - 3), later + 1):
            flat = _norm(texts[page_i])
            if county_hit(flat) and substantive(flat):
                print("CoB subsection-backtrack", variants[0], fy, "chapter", chapter_no, "page", page_i + 1)
                return page_i
        page_i = max(floor, later - 2)
        if substantive(_norm(texts[page_i])):
            print("CoB numeric-backtrack", variants[0], fy, "chapter", chapter_no, "page", page_i + 1)
            return page_i

    raise RuntimeError(f"county substantive section heading not found for {variants} in {fy} chapter 3.{chapter_no}")

'''
    s = s[:start] + new_find + s[end + 1:]
    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v16 applied")


if __name__ == "__main__":
    main()
