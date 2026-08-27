#!/usr/bin/env python3
"""Tighten Sprint 3 CoB chapter-start detection.

The FY2019/20 probe showed that a generic `3.<n>` match can land on late
subsections such as `3.16.10`, because a regex word boundary also matches before
the next dot. A county name elsewhere on that page then made a late chapter page
look like the opening page.

This hardening makes exact starts heading-specific:
  1. `3.<n>.1 ... Overview` with the expected county;
  2. an explicit top-level `3.<n> <County> County` heading, where `<n>` is not
     followed by another numeric subsection;
  3. county title + FY overview/budget language.

Later numbered subsections are recovery anchors only. They trigger a wider
backtrack to the chapter opening; they never count as the opening themselves.
"""
from pathlib import Path

import harden_acquisition_v5

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v5.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    # The official FY2019/20 WordPress Download Manager endpoint was resolved
    # during the successful diagnostic probe. Pin it as a fallback so a transient
    # landing-page/download-button failure does not make the source undiscoverable.
    direct_2019 = '    "2019/20": "https://cob.go.ke/download/county-governments-budget-implementation-review-report-for-the-fy-2019-20/?wpdmdl=15308",\n'
    if direct_2019 not in s:
        anchor = '    "2021/22": "https://cob.go.ke/wp-content/uploads/2022/09/Counties-Sep-2022-web.pdf",\n'
        if anchor not in s:
            raise RuntimeError("Expected CoB direct-fallback anchor missing")
        s = s.replace(anchor, direct_2019 + anchor, 1)

    pos_start = s.index("def _section_heading_pos(")
    pos_end = s.index("\ndef _find_chapter_floor", pos_start)
    new_pos = r'''def _top_level_chapter_pattern(chapter_no: int):
    # Match 3.<n> only when it is not followed by another numeric subsection.
    return rf"3\s*\.\s*{chapter_no}(?!\s*\.\s*\d)\b"


def _section_heading_pos(raw: str, variants: list[str], chapter_no: int):
    # 1) The opening subsection is the strongest exact start marker.
    m = re.search(_chapter_pattern(chapter_no, 1), raw, re.I)
    if m:
        return m.start()

    # 2) Explicit top-level chapter title. Require the county name close after
    # the number so a later 3.<n>.10 subsection cannot masquerade as a start.
    for variant in variants:
        words = [re.escape(x) for x in _norm(variant).split()]
        county_pat = r"\s+".join(words) + r"\s+County(?:\s+Government)?\b"
        m = re.search(rf"{_top_level_chapter_pattern(chapter_no)}.{{0,100}}?{county_pat}", raw, re.I | re.S)
        if m:
            return m.start()

    # 3) County heading itself, preferably coupled to Overview shortly after.
    best = None
    for variant in variants:
        words = [re.escape(x) for x in _norm(variant).split()]
        county_pat = r"\s+".join(words) + r"\s+County(?:\s+Government)?\b"
        for m in re.finditer(county_pat, raw, re.I):
            tail = _norm(raw[m.start():min(len(raw), m.start() + 700)])
            score = 2 if re.search(r"Overview", tail, re.I) else 1
            candidate = (score, -m.start(), m.start())
            if best is None or candidate > best:
                best = candidate
    return best[2] if best is not None else None

'''
    s = s[:pos_start] + new_pos + s[pos_end + 1:]

    find_start = s.index("def _find_section(")
    find_end = s.index("\ndef _extract_narrative", find_start)
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

    # 1) Expected opening subsection + county + Overview.
    for page_i in range(floor, len(texts)):
        flat = _norm(texts[page_i])
        if county_hit(flat) and re.search(_chapter_pattern(chapter_no, 1), flat, re.I) and re.search(r"Overview", flat, re.I):
            return page_i

    # 2) Explicit top-level chapter title only; 3.<n>.10 etc. are excluded.
    for page_i in range(floor, len(texts)):
        flat = _norm(texts[page_i])
        if not county_hit(flat):
            continue
        if re.search(_top_level_chapter_pattern(chapter_no), flat, re.I):
            return page_i

    # 3) County + requested FY overview/budget language in the substantive region.
    for page_i in range(floor, len(texts)):
        flat = _norm(texts[page_i])
        if not county_hit(flat):
            continue
        if re.search(rf"Overview.{{0,320}}?(?:FY|Financial\s+Year)?.{{0,80}}?{fy_pat}.{{0,160}}?Budget", flat, re.I):
            return page_i

    # 4) OCR recovery: find the earliest surviving later subsection, then search
    # backward up to six pages for a real county opening. Later subsections never
    # directly become section starts.
    later = None
    later_pat = rf"3\s*\.\s*{chapter_no}\s*\.\s*(?:[2-9]|1\d)\b"
    for page_i in range(floor, len(texts)):
        flat = _norm(texts[page_i])
        if re.search(later_pat, flat, re.I):
            later = page_i
            break
    if later is not None:
        back_start = max(floor, later - 6)
        candidates = []
        for page_i in range(back_start, later + 1):
            flat = _norm(texts[page_i])
            hit = county_hit(flat)
            if not hit:
                continue
            overview = bool(re.search(r"Overview", flat, re.I))
            budget = bool(re.search(rf"(?:FY|Financial\s+Year)?.{{0,80}}?{fy_pat}.{{0,180}}?Budget", flat, re.I))
            top = bool(re.search(_top_level_chapter_pattern(chapter_no), flat, re.I))
            score = (4 if top else 0) + (3 if overview else 0) + (2 if budget else 0)
            candidates.append((score, -page_i, page_i))
        if candidates:
            # Prefer semantic evidence; for equal evidence prefer the earliest page.
            page_i = max(candidates)[2]
            print("CoB subsection-backtrack", variants[0], fy, "chapter", chapter_no, "page", page_i + 1)
            return page_i

        # Last-resort page estimate is intentionally approximate and logged. Keep
        # it conservative: six pages before the first surviving later subsection.
        page_i = back_start
        print("CoB numeric-backtrack", variants[0], fy, "chapter", chapter_no, "page", page_i + 1)
        return page_i

    raise RuntimeError(f"county section heading not found for {variants} in {fy} chapter 3.{chapter_no}")

'''
    s = s[:find_start] + new_find + s[find_end + 1:]
    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v6 applied")


if __name__ == "__main__":
    main()
