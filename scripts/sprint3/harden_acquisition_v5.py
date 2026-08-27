#!/usr/bin/env python3
"""Make Sprint 3 CoB narrative parsing position-aware within PDF pages.

FY2019/20 contains legitimate cases where adjacent county chapters share one
physical PDF page. Earlier hardening treated any duplicate page number as a
collision, even when two chapter headings started at different character offsets.

This patch keeps the strict chapter-indexed locator from v4 and distinguishes two
kinds of starts:
  * exact starts: a numbered chapter/subsection or county heading has a character
    offset on the resolved page;
  * fallback starts: v4 could only backtrack to an approximate page, so the page
    start is retained exactly as the previously proven parser did.

Only exact starts are allowed to share a page. This fixes legitimate same-page
chapters without pretending an approximate fallback has character-level precision.
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

    def start_pos_for(page_i: int, variants: list[str], chapter_no: int) -> tuple[int, bool]:
        raw = texts[page_i]
        pos = _section_heading_pos(raw, variants, chapter_no)
        if pos is not None:
            return pos, True

        # OCR can damage punctuation in the numbered chapter marker or insert
        # line breaks inside the county heading. Try flexible raw-text forms.
        for pattern in (_chapter_pattern(chapter_no, 1), _chapter_pattern(chapter_no)):
            m = re.search(pattern, raw, re.I)
            if m:
                return m.start(), True
        best = None
        for variant in variants:
            words = [re.escape(x) for x in _norm(variant).split()]
            county_pat = r"\s+".join(words) + r"\s+County(?:\s+Government)?\b"
            m = re.search(county_pat, raw, re.I)
            if m and (best is None or m.start() < best):
                best = m.start()
        if best is not None:
            return best, True

        # Preserve v4's proven approximate-page behaviour. This is not promoted
        # to a fake exact offset, and an approximate start may not share a page
        # with another county start.
        print("CoB start-position fallback", variants[0], fy, "chapter", chapter_no, "page", page_i + 1)
        return 0, False

    for county in county_names:
        variants = COUNTY_VARIANTS.get(county, [county])
        chapter_no = chapter_order[county]
        page_i = _find_section(texts, variants, fy, chapter_no, floor)
        start_pos, exact = start_pos_for(page_i, variants, chapter_no)
        section_starts[county] = (page_i, start_pos, exact)

    # A physical page may contain multiple county starts only if all starts are
    # exact and have distinct offsets. Approximate backtracks stay one-per-page.
    by_page = {}
    for county, (page_i, start_pos, exact) in section_starts.items():
        by_page.setdefault(page_i, []).append((start_pos, exact, county))
    ambiguous = {}
    for page_i, starts in by_page.items():
        if len(starts) <= 1:
            continue
        if any(not exact for _, exact, _ in starts):
            ambiguous[page_i + 1] = [county for _, _, county in starts]
            continue
        offsets = {}
        for start_pos, _, county in starts:
            offsets.setdefault(start_pos, []).append(county)
        duplicate_offsets = {pos: names for pos, names in offsets.items() if len(names) > 1}
        if duplicate_offsets:
            ambiguous[page_i + 1] = duplicate_offsets
        else:
            ordered_names = [county for _, _, county in sorted(starts)]
            print("CoB same-page chapter starts", fy, "page", page_i + 1, ordered_names)
    if ambiguous:
        raise RuntimeError(f"{fy}: ambiguous county section start(s): {ambiguous}")

    # Preserve the v4 parser's physical-page ordering for approximate starts;
    # exact offsets only refine ordering inside a shared page.
    ordered = sorted(
        (page_i, start_pos, chapter_order[county], county, exact)
        for county, (page_i, start_pos, exact) in section_starts.items()
    )

    found = {}
    for idx, (page_i, start_pos, chapter_no, county, exact) in enumerate(ordered):
        hard_stop = min(page_i + 6, len(texts))
        next_start = None
        if idx + 1 < len(ordered):
            next_page, next_pos, next_chapter, next_county, next_exact = ordered[idx + 1]
            next_start = (next_page, next_pos, next_chapter, next_county, next_exact)

        window_pages = []
        if next_start is not None and next_start[0] == page_i:
            # Guaranteed exact/distinct by the page-level validation above.
            next_pos = next_start[1]
            if not exact or not next_start[4] or next_pos <= start_pos:
                raise RuntimeError(f"{fy} {county}: invalid same-page section bounds {start_pos}:{next_pos}")
            window_pages.append(texts[page_i][start_pos:next_pos])
        else:
            window_pages.append(texts[page_i][start_pos if exact else 0:])
            if next_start is not None and next_start[0] < hard_stop:
                next_page, next_pos, _, _, next_exact = next_start
                window_pages.extend(texts[page_i + 1:next_page])
                if next_page < len(texts) and next_exact and next_pos > 0:
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
