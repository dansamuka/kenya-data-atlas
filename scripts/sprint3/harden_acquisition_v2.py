#!/usr/bin/env python3
"""Apply Sprint 3 acquisition hardening before source acquisition.

This script reuses the proven national-source hardening from the original
workflow, then replaces only the CoB narrative chapter locator with a
chapter-indexed, OCR-resilient implementation.
"""
from pathlib import Path
import textwrap

ROOT = Path(__file__).resolve().parents[2]


def apply_existing_hardening() -> None:
    workflow = (ROOT / ".github/workflows/sprint3-acquire.yml").read_text(encoding="utf-8")
    marker = "          python - <<'PY'\n"
    start = workflow.index(marker) + len(marker)
    end = workflow.index("\n          PY\n", start)
    code = textwrap.dedent(workflow[start:end])
    old_cwd = Path.cwd()
    try:
        # The reused block uses repository-relative paths.
        import os
        os.chdir(ROOT)
        exec(compile(code, ".github/workflows/sprint3-acquire.yml:hardening", "exec"), {})
    finally:
        os.chdir(old_cwd)


def apply_cob_v2() -> None:
    q = ROOT / "scripts/sprint3/acquire_cob_history.py"
    t = q.read_text(encoding="utf-8")

    direct_2018 = '    "2018/19": "https://cob.go.ke/download/county-governments-annual-budget-implementation-review-report-fy-2018-19/?wpdmdl=15011",\n'
    if direct_2018 not in t:
        anchor = '    "2021/22": "https://cob.go.ke/wp-content/uploads/2022/09/Counties-Sep-2022-web.pdf",\n'
        if anchor not in t:
            raise RuntimeError("Expected CoB direct-fallback anchor missing")
        t = t.replace(anchor, direct_2018 + anchor, 1)

    find_start = t.index("def _section_heading_pos(")
    find_end = t.index("\ndef _extract_narrative", find_start)
    new_find = r'''def _chapter_pattern(chapter_no: int, subsection: int | None = None):
    if subsection is None:
        return rf"3\s*\.\s*{chapter_no}\b"
    return rf"3\s*\.\s*{chapter_no}\s*\.\s*{subsection}\b"


def _section_heading_pos(raw: str, variants: list[str], chapter_no: int):
    # Numbered chapter/subsection markers are unique even when county names also
    # appear in contents pages, tables and figures.
    for pattern in (_chapter_pattern(chapter_no, 1), _chapter_pattern(chapter_no)):
        m = re.search(pattern, raw, re.I)
        if m:
            return m.start()
    best = None
    for variant in variants:
        v = re.escape(_norm(variant))
        m = re.search(rf"{v}\s+County(?:\s+Government)?\b", raw, re.I)
        if m and (best is None or m.start() < best):
            best = m.start()
    return best


def _find_chapter_floor(texts: list[str]) -> int:
    # Narrative reports consistently begin county chapters with 3.1 Baringo.
    # Requiring a substantive budget cue excludes the table of contents.
    for page_i, raw in enumerate(texts):
        if page_i < 15:
            continue
        flat = _norm(raw)
        if re.search(_chapter_pattern(1), flat, re.I) and re.search(r"Baringo\s+County", flat, re.I):
            if re.search(r"Overview|Approved|Supplementary|Budget", flat, re.I):
                return page_i
    return 20


def _find_section(texts: list[str], variants: list[str], fy: str, chapter_no: int, floor: int) -> int:
    fy_pat = re.escape(fy)

    # 1) Expected 3.<n>.1 Overview subsection.
    for page_i in range(floor, len(texts)):
        flat = _norm(texts[page_i])
        if re.search(_chapter_pattern(chapter_no, 1), flat, re.I) and re.search(r"Overview", flat, re.I):
            return page_i

    # 2) Expected chapter number plus county title.
    for page_i in range(floor, len(texts)):
        flat = _norm(texts[page_i])
        if not re.search(_chapter_pattern(chapter_no), flat, re.I):
            continue
        if any(re.search(rf"{re.escape(_norm(v))}\s+County(?:\s+Government)?\b", flat, re.I) for v in variants):
            return page_i

    # 3) County title plus requested fiscal-year overview, but only within the
    # substantive chapter region, never the front-matter summary pages.
    for page_i in range(floor, len(texts)):
        flat = _norm(texts[page_i])
        county_hit = any(
            re.search(rf"{re.escape(_norm(v))}\s+County(?:\s+Government)?\b", flat, re.I)
            for v in variants
        )
        if not county_hit:
            continue
        if re.search(rf"Overview.{{0,240}}?(?:FY|Financial\s+Year).{{0,80}}?{fy_pat}.{{0,100}}?Budget", flat, re.I):
            return page_i

    # 4) OCR-resilient recovery. Later numbered subsections generally survive
    # even when the county title or 3.<n>.1 line is damaged. Find the earliest
    # 3.<n>.[2-9] marker then backtrack up to three pages to the opening.
    later = None
    for page_i in range(floor, len(texts)):
        flat = _norm(texts[page_i])
        if re.search(rf"3\s*\.\s*{chapter_no}\s*\.\s*[2-9]\b", flat, re.I):
            later = page_i
            break
    if later is not None:
        for page_i in range(max(floor, later - 3), later + 1):
            flat = _norm(texts[page_i])
            county_hit = any(
                re.search(rf"{re.escape(_norm(v))}\s+County(?:\s+Government)?\b", flat, re.I)
                for v in variants
            )
            overview = bool(re.search(rf"Overview.{{0,260}}?{fy_pat}.{{0,120}}?Budget", flat, re.I))
            if county_hit or overview:
                print("CoB subsection-backtrack", variants[0], fy, "chapter", chapter_no, "page", page_i + 1)
                return page_i
        page_i = max(floor, later - 2)
        print("CoB numeric-backtrack", variants[0], fy, "chapter", chapter_no, "page", page_i + 1)
        return page_i

    raise RuntimeError(f"county section heading not found for {variants} in {fy} chapter 3.{chapter_no}")

'''
    t = t[:find_start] + new_find + t[find_end + 1 :]

    parse_start = t.index("def _parse_narrative_year(")
    parse_end = t.index("\ndef _validate_year", parse_start)
    new_parse = r'''def _parse_narrative_year(content: bytes, fy: str, county_names: list[str]) -> dict[str, dict]:
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        texts = [p.extract_text(x_tolerance=2, y_tolerance=3) or "" for p in pdf.pages]

    floor = _find_chapter_floor(texts)
    chapter_order = {name: i + 1 for i, name in enumerate(COB_2013_ORDER)}
    section_pages = {}
    for county in county_names:
        variants = COUNTY_VARIANTS.get(county, [county])
        chapter_no = chapter_order[county]
        section_pages[county] = _find_section(texts, variants, fy, chapter_no, floor)

    reverse = {}
    for county, p in section_pages.items():
        reverse.setdefault(p, []).append(county)
    collisions = {p + 1: names for p, names in reverse.items() if len(names) > 1}
    if collisions:
        raise RuntimeError(f"{fy}: duplicate county section page(s): {collisions}")

    ordered = sorted((page_i, chapter_order[county], county) for county, page_i in section_pages.items())
    found = {}
    for idx, (page_i, chapter_no, county) in enumerate(ordered):
        variants = COUNTY_VARIANTS.get(county, [county])
        start_pos = _section_heading_pos(texts[page_i], variants, chapter_no)
        first_page = texts[page_i][start_pos if start_pos is not None else 0 :]
        window_pages = [first_page]
        hard_stop = min(page_i + 6, len(texts))
        if idx + 1 < len(ordered):
            next_page, next_chapter, next_county = ordered[idx + 1]
            if next_page < hard_stop:
                window_pages.extend(texts[page_i + 1 : next_page])
                next_variants = COUNTY_VARIANTS.get(next_county, [next_county])
                next_pos = _section_heading_pos(texts[next_page], next_variants, next_chapter)
                if next_pos is not None and next_pos > 0:
                    prefix = texts[next_page][:next_pos]
                    if _norm(prefix):
                        window_pages.append(prefix)
            else:
                window_pages.extend(texts[page_i + 1 : hard_stop])
        else:
            window_pages.extend(texts[page_i + 1 : hard_stop])

        window = "\n".join(window_pages)
        value = _extract_narrative(window, county, fy)
        value["source_page"] = page_i + 1
        found[county] = value
    return found

'''
    t = t[:parse_start] + new_parse + t[parse_end + 1 :]
    q.write_text(t, encoding="utf-8")


def main() -> None:
    apply_existing_hardening()
    apply_cob_v2()
    print("Sprint 3 acquisition hardening v2 applied")


if __name__ == "__main__":
    main()
