#!/usr/bin/env python3
"""Harden FY2018/19 CoB acquisition without weakening validation.

Two source-specific issues remain after v8:
1. CoB landing pages can intermittently fail even when a verified official
   WordPress Download Manager endpoint is known. Try verified direct fallbacks
   before scraping the landing page.
2. The FY2018/19 annual report commonly phrases total spending as
   "A total of Kshs.X billion was spent on both development and recurrent...".
   Add that exact amount-before-verb form to the expenditure extractor.
"""
from pathlib import Path

import harden_acquisition_v8

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v8.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    discover_start = s.index("def _discover_pdf(")
    discover_end = s.index("\ndef _clean_num", discover_start)
    new_discover = r'''def _discover_pdf(session: requests.Session, page_url: str, fy: str) -> tuple[str, bytes]:
    candidates: list[str] = []

    # Verified official WPD/direct endpoints are deterministic provenance and
    # should not depend on the availability of the surrounding landing page.
    direct = COB_DIRECT_FALLBACK.get(fy)
    if direct:
        candidates.append(direct)
        if "wpdmdl=" in direct and "refresh=" not in direct:
            candidates.append(direct + "&refresh=1")

    landing = None
    try:
        landing = _get(session, page_url, 90)
    except Exception as exc:
        print("CoB landing-page discovery failed; using verified direct fallback", fy, exc)

    if landing is not None:
        soup = BeautifulSoup(landing.text, "lxml")
        for a in soup.find_all("a", href=True):
            href = urljoin(landing.url, a["href"])
            if ".pdf" in href.lower():
                candidates.append(href)
        # WordPress Download Manager stores the actual file behind ?wpdmdl=... URLs.
        for tag in soup.find_all(True):
            for attr in ("href", "data-downloadurl", "data-url", "onclick"):
                val = str(tag.get(attr) or "")
                for hit in re.findall(r"(?:https?://[^\"'<>\s]+)?\?wpdmdl=\d+[^\"'<>\s]*", val, re.I):
                    candidates.append(urljoin(landing.url, hit))
        for hit in re.findall(r"(?:https?://[^\"'<>\s]+)?\?wpdmdl=\d+[^\"'<>\s]*", landing.text, re.I):
            candidates.append(urljoin(landing.url, hit))

    seen = set()
    for url in candidates:
        if url in seen:
            continue
        seen.add(url)
        try:
            r = _get(session, url, 180)
            if r.content[:4] == b"%PDF" and len(r.content) > 100_000:
                return url, r.content
        except Exception as exc:
            print("CoB PDF candidate failed", fy, url, exc)
    raise RuntimeError(f"{fy}: no official CoB PDF discovered from {page_url}")

'''
    s = s[:discover_start] + new_discover + s[discover_end + 1:]

    expenditure_anchor = '''    expenditure = _first_money(text, [\n'''
    if expenditure_anchor not in s:
        raise RuntimeError("Expected expenditure extractor anchor missing")
    extra_pattern = '''    expenditure = _first_money(text, [\n        r"(?:a\\s+)?total\\s+of\\s+(?:Kshs?|Ksh)\\.?\\s*([0-9][0-9,.]*)\\s*(billion|million)\\s+was\\s+spent\\s+on\\s+(?:both\\s+)?development\\s+and\\s+recurrent",\n'''
    s = s.replace(expenditure_anchor, extra_pattern, 1)

    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v9 applied")


if __name__ == "__main__":
    main()
