#!/usr/bin/env python3
"""Make Sprint 3 CoB narrative parsing position-aware within PDF pages.

FY2019/20 contains legitimate cases where the end/opening of adjacent county
chapters share one physical PDF page. Earlier hardening treated a duplicate page
number as a collision, even when the two chapter headings began at different
character offsets on that page.

This patch keeps the strict chapter-indexed locator from v4, but records each
section start as (page_index, character_offset). Windows are then sliced exactly
from one county start coordinate to the next. Two counties may share a page, but
they may never share the same start coordinate, and chapter coordinates must be
strictly increasing in the canonical 3.1..3.47 order.
"""
from pathlib import Path

import harden_acquisition_v4

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v4.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    parse_start = s.index("def _parse_narrative_year(")
    parse_end = s.index("\ndef _validate_year", parse_start)
    new_parse = r'''def _parse_narrative_year(content: bytes, fy: str, county_names: list[str]) -> dict[str, dict]:
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        texts = [p.extract_text(x_tolerance=2, y_tolerance=3) or "" for p in pdf.pages]

    floor = _find_chapter_floor(texts)
    chapter_order = {name: i + 1 for i, name in enumerate(COB_2013_ORDER)}
    section_starts = {}

    def start_pos_for(page_i: int, variants: list[str], chapter_no: int) -> int:
        raw = texts[page_i]
        pos = _section_heading_pos(raw, variants, chapter_no)
        if pos is not None:
            return pos

        # OCR can damage punctuation in the numbered chapter marker or insert
        # line breaks inside the county heading. Try flexible raw-text forms
        # before falling back to the start of the already-validated page.
        for pattern in (_chapter_pattern(chapter_no, 1), _chapter_pattern(chapter_no)):
            m = re.search(pattern, raw, re.I)
            if m:
                return m.start()
        best = None
        for variant in variants:
            words = [re.escape(x) for x in _norm(variant).split()]
            county_pat = r"\s+".join(words) + r"\s+County(?:\s+Government)?\b"
            m = re.search(county_pat, raw, re.I)
            if m and (best is None or m.start() < best):
                best = m.start()
        if best is not None:
            return best

        print("CoB start-position fallback", variants[0], fy, "chapter", chapter_no, "page", page_i + 1)
        return 0

    for county in county_names:
        variants = COUNTY_VARIANTS.get(county, [county])
        chapter_no = chapter_order[county]
        page_i = _find_section(texts, variants, fy, chapter_no, floor)
        start_pos = start_pos_for(page_i, variants, chapter_no)
        section_starts[county] = (page_i, start_pos)

    # Same physical page is legitimate. Same exact start coordinate is not.
    reverse = {}
    for county, coord in section_starts.items():
        reverse.setdefault(coord, []).append(county)
    collisions = {
        f"page {page_i + 1} offset {start_pos}": names
        for (page_i, start_pos), names in reverse.items()
        if len(names) > 1
    }
    if collisions:
        raise RuntimeError(f"{fy}: duplicate county section coordinate(s): {collisions}")

    # The report's county chapters are canonically ordered 3.1..3.47. Enforce
    # that the resolved physical coordinates follow that order strictly; this
    # catches a false OCR match without forbidding legitimate same-page starts.
    chapter_sections = sorted(
        (chapter_order[county], section_starts[county][0], section_starts[county][1], county)
        for county in county_names
    )
    previous = None
    for chapter_no, page_i, start_pos, county in chapter_sections:
        coord = (page_i, start_pos)
        if previous is not None and coord <= previous:
            raise RuntimeError(
                f"{fy}: non-monotonic county chapter start at 3.{chapter_no} {county}: "
                f"page {page_i + 1} offset {start_pos} after {previous}"
            )
        previous = coord

    found = {}
    for idx, (chapter_no, page_i, start_pos, county) in enumerate(chapter_sections):
        hard_stop = min(page_i + 6, len(texts))
        next_coord = None
        if idx + 1 < len(chapter_sections):
            _, next_page, next_pos, _ = chapter_sections[idx + 1]
            next_coord = (next_page, next_pos)

        window_pages = []
        if next_coord is not None and next_coord[0] == page_i:
            # Adjacent county starts later on this same physical page.
            next_pos = next_coord[1]
            if next_pos <= start_pos:
                raise RuntimeError(f"{fy} {county}: invalid same-page section bounds {start_pos}:{next_pos}")
            window_pages.append(texts[page_i][start_pos:next_pos])
        else:
            window_pages.append(texts[page_i][start_pos:])
            if next_coord is not None and next_coord[0] < hard_stop:
                next_page, next_pos = next_coord
                window_pages.extend(texts[page_i + 1:next_page])
                if next_page < len(texts) and next_pos > 0:
                    prefix = texts[next_page][:next_pos]
                    if _norm(prefix):
                        window_pages.append(prefix)
            else:
                window_pages.extend(texts[page_i + 1:hard_stop])

        window = "\n".join(window_pages)
        if not _norm(window):
            raise RuntimeError(f"{fy} {county}: empty county section window")
        value = _extract_narrative(window, county, fy)
        value["source_page"] = page_i + 1
        found[county] = value

    return found

'''
    p.write_text(s[:parse_start] + new_parse + s[parse_end + 1:], encoding="utf-8")
    print("Sprint 3 acquisition hardening v5 applied")


if __name__ == "__main__":
    main()
