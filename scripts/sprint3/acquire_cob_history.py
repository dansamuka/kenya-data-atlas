#!/usr/bin/env python3
"""Acquire Controller of Budget county history for Data Sprint 3.

The annual CoB reports do not use one stable table layout across FY 2013/14–FY
2023/24. The first two reports contain rotated consolidated annexes; later reports
are most reliably read from the county section headings and their opening budget
implementation narrative. This parser therefore uses explicit annex decoders for
the first two years and a heading-anchored narrative parser for later years.

Only official annual CoB reports are used. No county value is allocated below
county level. Overall/development absorption is derived from official numerator /
denominator amounts only when a directly stated published rate cannot be recovered
reliably from the same county section.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

import pdfplumber
import requests
from bs4 import BeautifulSoup

COB_PAGES = {
    "2013/14": "https://cob.go.ke/download/annual-county-governments-budget-implementation-review-report-fy-20132014/",
    "2014/15": "https://cob.go.ke/download/annual-county-governments-budget-implementation-review-report-fy-201415/",
    "2015/16": "https://cob.go.ke/download/annual-county-budget-implementation-review-report-fy-2015-16/",
    "2016/17": "https://cob.go.ke/download/annual-county-governments-budget-implementation-review-report-fy-201617/",
    "2017/18": "https://cob.go.ke/download/annual-county-governments-budget-implementation-review-report-for-fy-2017-18/",
    "2018/19": "https://cob.go.ke/download/county-governments-annual-budget-implementation-review-report-fy-2018-19/",
    "2019/20": "https://cob.go.ke/download/county-governments-budget-implementation-review-report-for-the-fy-2019-20/",
    "2020/21": "https://cob.go.ke/download/annual-county-governments-budget-implementation-review-report-fy-2020-21/",
    "2021/22": "https://cob.go.ke/download/county-governments-annual-budget-implementation-review-report-for-the-fy-2021-22/",
    "2022/23": "https://cob.go.ke/download/county-governments-budget-implementation-review-report-for-the-financial-year-fy-2022-23/",
    "2023/24": "https://cob.go.ke/download/county-governments-budget-implementation-review-report-for-the-financial-year-2023-24/",
}

COB_DIRECT_FALLBACK = {
    "2013/14": "https://cob.go.ke/download/annual-county-governments-budget-implementation-review-report-fy-20132014/?wpdmdl=7639",
    "2014/15": "https://cob.go.ke/download/annual-county-governments-budget-implementation-review-report-fy-201415/?wpdmdl=9317",
    "2015/16": "https://cob.go.ke/download/annual-county-budget-implementation-review-report-fy-2015-16/?wpdmdl=10035",
    "2016/17": "https://cob.go.ke/download/annual-county-governments-budget-implementation-review-report-fy-201617/?wpdmdl=10487",
    "2017/18": "https://cob.go.ke/download/annual-county-governments-budget-implementation-review-report-for-fy-2017-18/?wpdmdl=14829",
    "2018/19": "https://cob.go.ke/download/county-governments-annual-budget-implementation-review-report-fy-2018-19/?wpdmdl=15011",
    "2019/20": "https://cob.go.ke/download/county-governments-budget-implementation-review-report-for-the-fy-2019-20/?wpdmdl=15308",
    "2020/21": "https://cob.go.ke/download/annual-county-governments-budget-implementation-review-report-fy-2020-21/?wpdmdl=15580",
    "2021/22": "https://cob.go.ke/wp-content/uploads/2022/09/Counties-Sep-2022-web.pdf",
    "2022/23": "https://cob.go.ke/download/county-governments-budget-implementation-review-report-for-the-financial-year-fy-2022-23/?wpdmdl=15957",
    "2023/24": "https://cob.go.ke/download/county-governments-budget-implementation-review-report-for-the-financial-year-2023-24/?wpdmdl=16104",
}

COUNTY_VARIANTS = {
    "Taita Taveta": ["Taita Taveta", "Taita/Taveta", "Taita-Taveta"],
    "Tharaka-Nithi": ["Tharaka-Nithi", "Tharaka Nithi", "Tharaka -Nithi", "Tharaka- Nithi"],
    "Murang'a": ["Murang'a", "Murang’a", "Muranga"],
    "Trans Nzoia": ["Trans Nzoia", "Trans-Nzoia"],
    "Elgeyo/Marakwet": ["Elgeyo/Marakwet", "Elgeyo Marakwet", "Elgeyo-Marakwet", "Elgeyo/ Marakwet"],
    "Homa Bay": ["Homa Bay", "Homabay"],
    "Nairobi": ["Nairobi City", "Nairobi"],
}

# Annex 3 order in the FY 2013/14 source. The four source pages are rotated 180°.
COB_2013_ORDER = [
    "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo/Marakwet", "Embu", "Garissa", "Homa Bay", "Isiolo", "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi", "Kirinyaga",
    "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu", "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa", "Murang'a", "Nairobi",
    "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua", "Nyeri", "Samburu", "Siaya", "Taita Taveta", "Tana River", "Tharaka-Nithi", "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga",
    "Wajir", "West Pokot",
]

# Annex 1 order in the FY 2014/15 source, split over two rotated pages.
COB_2014_ORDER = [
    "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo/Marakwet", "Embu", "Garissa", "Homa Bay", "Isiolo", "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi", "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu", "Machakos", "Makueni", "Mandera",
    "Marsabit", "Meru", "Migori", "Mombasa", "Murang'a", "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua", "Nyeri", "Samburu", "Siaya", "Taita Taveta", "Tana River", "Tharaka-Nithi", "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot",
]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", str(s or "").replace("\u2019", "'").replace("\u2013", "-").replace("\u2014", "-")).strip()


def _key(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", _norm(s).lower()).strip()


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _get(session: requests.Session, url: str, timeout: int = 120) -> requests.Response:
    last = None
    for attempt in range(4):
        try:
            r = session.get(url, timeout=timeout, allow_redirects=True)
            if r.ok:
                return r
            last = RuntimeError(f"HTTP {r.status_code} for {url}")
        except Exception as exc:  # pragma: no cover - network retry
            last = exc
        time.sleep(2 ** attempt)
    raise RuntimeError(f"fetch failed: {url}: {last}")


def _discover_pdf(session: requests.Session, page_url: str, fy: str) -> tuple[str, bytes]:
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

def _clean_num(value):
    raw = str(value or "").strip().replace(",", "").replace("%", "")
    raw = re.sub(r"[^0-9.\-]", "", raw)
    if not raw or raw in {"-", "."}:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _reversed_numeric_row(table, row_index: int, count: int) -> list[float]:
    values = []
    for cell in table[row_index]:
        raw = "".join(str(cell or "").split())
        if not raw:
            continue
        rev = raw[::-1]
        if not re.fullmatch(r"-?\d[\d,]*(?:\.\d+)?%?", rev):
            continue
        value = _clean_num(rev)
        if value is not None:
            values.append(value)
    if len(values) < count:
        raise RuntimeError(f"rotated annex row {row_index}: decoded {len(values)}/{count} values")
    return values[:count]


def _parse_2013(content: bytes) -> dict[str, dict]:
    found: dict[str, dict] = {}
    offset = 0
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page_index, count in zip([223, 224, 225, 226], [15, 15, 15, 2]):
            tables = pdf.pages[page_index].extract_tables() or []
            if not tables:
                raise RuntimeError(f"2013/14 Annex 3 page {page_index + 1}: no extractable table")
            table = max(tables, key=lambda t: sum(len(r or []) for r in t))
            budget = _reversed_numeric_row(table, 12, count)
            expenditure = _reversed_numeric_row(table, 6, count)
            dev_abs = _reversed_numeric_row(table, 4, count)
            overall_abs = _reversed_numeric_row(table, 3, count)
            for j in range(count):
                name = COB_2013_ORDER[offset + j]
                found[name] = {
                    "budget_total_ksh_mn": budget[j],
                    "expenditure_total_ksh_mn": expenditure[j],
                    "development_absorption_pct": dev_abs[j],
                    "overall_absorption_pct": overall_abs[j],
                    "source_page": page_index + 1,
                    "rate_method": "published_annex",
                }
            offset += count
    if len(found) != 47:
        raise RuntimeError(f"2013/14 Annex 3 decoded {len(found)}/47 counties")
    b, n = found["Baringo"], found["Nairobi"]
    if not (abs(b["budget_total_ksh_mn"] - 3644.9) < 0.2 and abs(b["overall_absorption_pct"] - 77.1) < 0.2 and abs(b["development_absorption_pct"] - 30.7) < 0.2):
        raise RuntimeError(f"2013/14 Baringo anchor failed: {b}")
    if not (abs(n["budget_total_ksh_mn"] - 25225.2) < 0.2 and abs(n["expenditure_total_ksh_mn"] - 17774.9) < 0.2 and abs(n["overall_absorption_pct"] - 70.5) < 0.2 and abs(n["development_absorption_pct"] - 24.7) < 0.2):
        raise RuntimeError(f"2013/14 Nairobi anchor failed: {n}")
    return found


def _parse_2014(content: bytes) -> dict[str, dict]:
    found: dict[str, dict] = {}
    offset = 0
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        # PDF pages 303–304, Annex 1. Page 304 also has a national Total column;
        # limiting to the expected county count excludes it.
        for page_index, count in zip([302, 303], [24, 23]):
            tables = pdf.pages[page_index].extract_tables() or []
            if not tables:
                raise RuntimeError(f"2014/15 Annex 1 page {page_index + 1}: no extractable table")
            table = max(tables, key=lambda t: sum(len(r or []) for r in t))
            budget_ksh = _reversed_numeric_row(table, 10, count)
            expenditure_ksh = _reversed_numeric_row(table, 4, count)
            dev_abs = _reversed_numeric_row(table, 2, count)
            for j in range(count):
                name = COB_2014_ORDER[offset + j]
                budget = budget_ksh[j] / 1_000_000.0
                spend = expenditure_ksh[j] / 1_000_000.0
                found[name] = {
                    "budget_total_ksh_mn": budget,
                    "expenditure_total_ksh_mn": spend,
                    "development_absorption_pct": dev_abs[j],
                    "overall_absorption_pct": spend / budget * 100.0,
                    "source_page": page_index + 1,
                    "rate_method": "annex_ratio",
                }
            offset += count
    if len(found) != 47:
        raise RuntimeError(f"2014/15 Annex 1 decoded {len(found)}/47 counties")
    # Baringo is visible in the first column of Annex 1: Ksh5.012bn budget,
    # Ksh4.161bn expenditure and 59.2% development absorption.
    b = found["Baringo"]
    if not (abs(b["budget_total_ksh_mn"] - 5012.341436) < 0.02 and abs(b["expenditure_total_ksh_mn"] - 4161.116867) < 0.02 and abs(b["development_absorption_pct"] - 59.2) < 0.2):
        raise RuntimeError(f"2014/15 Baringo Annex 1 anchor failed: {b}")
    return found


def _money_to_mn(number: str, unit: str | None) -> float:
    value = float(number.replace(",", ""))
    u = (unit or "").lower().strip()
    if u.startswith("b"):
        return value * 1000.0
    if u.startswith("m"):
        return value
    # Ksh values without a written million/billion unit are normally raw shillings.
    return value / 1_000_000.0 if value > 500_000 else value


def _first_money(text: str, patterns: list[str]):
    for pattern in patterns:
        m = re.search(pattern, text, re.I | re.S)
        if not m:
            continue
        try:
            return _money_to_mn(m.group(1), m.group(2) if (m.lastindex or 0) >= 2 else None)
        except Exception:
            continue
    return None


def _percent_candidates(text: str, patterns: list[str]) -> list[float]:
    out = []
    for pattern in patterns:
        for m in re.finditer(pattern, text, re.I | re.S):
            try:
                value = float(m.group(1))
            except Exception:
                continue
            if 0 <= value <= 200:
                out.append(value)
    return out


def _chapter_pattern(chapter_no: int, subsection: int | None = None):
    if subsection is None:
        return rf"3\s*\.\s*{chapter_no}\b"
    return rf"3\s*\.\s*{chapter_no}\s*\.\s*{subsection}\b"


def _top_level_chapter_pattern(chapter_no: int):
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

    # 3) County heading itself, preferring one with Overview shortly after.
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
        if (substantive(flat)
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

def _economic_classification_values(text: str, county: str, fy: str):
    if fy not in {"2020/21", "2021/22", "2022/23", "2023/24"}:
        return None
    """Return strict county totals from the published economic-classification table.

    The search is confined to the county window *after* the explicit economic-
    classification heading, preventing Total rows from revenue/pending-bill/fund
    tables from being mistaken for expenditure totals.
    """
    section = re.search(r"(?:Expenditure(?:\s+Analysis)?\s+by\s+)?Economic\s+Classification", text, re.I)
    if not section:
        return None
    econ = text[section.start():section.start() + 7000]

    raw = r"([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)"
    pct = r"([0-9]+(?:\.[0-9]+)?)"

    def to_mn(token: str) -> float:
        return _money_to_mn(token, None)

    def parse_row(label: str, row_name: str):
        # Executive + Assembly layout: four currency cells then two published
        # component absorption rates.
        split = None if fy == "2020/21" else re.search(
            rf"{label}\s+{raw}\s+{raw}\s+{raw}\s+{raw}\s+{pct}\s+{pct}\b",
            econ,
            re.I,
        )
        if split:
            b_exec, b_assembly, s_exec, s_assembly = [to_mn(split.group(i)) for i in range(1, 5)]
            p_exec, p_assembly = float(split.group(5)), float(split.group(6))
            if not (0 <= p_exec <= 130 and 0 <= p_assembly <= 130):
                return None
            for budget_part, spend_part, published, component in (
                (b_exec, s_exec, p_exec, "executive"),
                (b_assembly, s_assembly, p_assembly, "assembly"),
            ):
                if budget_part > 0:
                    calc = spend_part / budget_part * 100.0
                    if abs(calc - published) > 1.0:
                        # Flattened-PDF tokenization did not produce a valid row.
                        # Reject this parser candidate; do not weaken downstream validation.
                        return None
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
                return None
            return budget, spend, published, "economic_classification_total"
        return None

    development = parse_row(r"(?:Total\s+)?Development(?:\s+Expen(?:-\s*)?diture)?", "development")
    total = parse_row(r"(?:Grand\s+)?Total(?!\s+(?:Recurrent|Development|Pending))", "overall")
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
    # Budget: prefer an explicitly approved/revised/supplementary county budget.
    budget = _first_money(text, [
        r"(?:the\s+county(?:'s|’s)?\s+)?(?:approved|revised)\s+(?:(?:first|second|third|fourth|fifth|final|[1-9](?:st|nd|rd|th))\s+)?supplementary\s+budget(?:\s+for\s+(?:the\s+)?(?:FY\s*)?\d{4}/\d{2})?\s+(?:was|is|of|amounted\s+to)\s*(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|bil-\s*lion|million|mil-\s*lion)",
        r"(?:approved|revised)(?:\s+annual)?(?:\s+(?:revised|supplementary))?\s+budget(?:\s+for\s+(?:the\s+)?county)?\s+(?:was|is|of|amounted\s+to)?\s*(?:(?:Kshs?|Ksh)\.?\s*)?([0-9][0-9,.]*)\s*(billion|million)",
        r"(?:the\s+county(?:'s|’s)?\s+)?(?:fy\s*\d{4}/\d{2}\s+)?(?:approved\s+)?supplementary\s+budget\s+(?:was|is|of|amounted\s+to)\s*(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)",
        r"(?:approved|revised|supplementary).{0,80}?budget.{0,80}?(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)",
        r"budget(?:ed)?\s+to\s+spend.{0,80}?(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)",
        r"budget\s+of\s+(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)",
    ])

    expenditure = _first_money(text, [
        r"(?:a\s+)?total\s+of\s+(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)\s+was\s+spent\s+on\s+(?:both\s+)?development\s+and\s+recurrent",
        r"(?:the\s+county\s+)?spent\s+(?:a\s+total\s+of\s+)?(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)(?:\s*,|\s+which|\s+on|\s+during|\s+in)",
        r"spent\s+a\s+total\s+of\s+(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)",
        r"total\s+expenditure(?:\s+by\s+the\s+county)?(?:\s+in\s+FY\s*\d{4}/\d{2})?.{0,80}?(?:amounted\s+to|was|of)?\s*(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)",
        r"(?:the\s+county\s+)?spent\s+(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)\s+during\s+(?:the\s+)?(?:FY|financial\s+year)",
        r"expenditure\s+for\s+the\s+period\s+under\s+review.{0,80}?(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)",
    ])

    dev_budget = _first_money(text, [
        r"(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million).{0,90}?allocated\s+to\s+development\s+expenditure",
        r"development\s+(?:expenditure\s+)?budget(?:\s+of|\s+was)?\s*(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)",
        r"allocated\s+(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)\s+(?:for|to)\s+development",
    ])
    dev_spend = _first_money(text, [
        r"development\s+expenditure(?:\s+amounted\s+to|\s+was|\s+of)?\s*(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)",
        r"(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million).{0,70}?spent\s+on\s+development",
        r"spent.{0,40}?(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)\s+on\s+development",
    ])

    if budget is None or expenditure is None:
        if table_value is not None:
            return table_value
        raise RuntimeError(f"{fy} {county}: budget/expenditure not extracted (budget={budget}, expenditure={expenditure})")
    if not (1 <= budget <= 200_000 and 0 <= expenditure <= 220_000):
        raise RuntimeError(f"{fy} {county}: implausible budget/expenditure {budget}/{expenditure}")

    overall_calc = expenditure / budget * 100.0

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
    overall_direct = _percent_candidates(text, [
        r"overall\s+absorption\s+rate(?:\s+of|\s+was|\s+stood\s+at)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+cent|%)",
        r"total\s+expenditure.{0,220}?absorption\s+rate(?:\s+of)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+cent|%)",
        r"spent\s+a\s+total.{0,240}?absorption\s+rate(?:\s+of)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+cent|%)",
        r"aggregate\s+expenditure.{0,180}?absorption\s+rate(?:\s+of)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+cent|%)",
    ])
    plausible_overall = [x for x in overall_direct if abs(x - overall_calc) <= 5.0]
    overall = min(plausible_overall, key=lambda x: abs(x - overall_calc)) if plausible_overall else overall_calc

    dev_direct = _percent_candidates(text, [
        r"Expenditure\s+on\s+development\s+program(?:me)?s?\s+represented\s+an?\s+absorption\s+rate\s+of\s+([0-9]+(?:\.[0-9]+)?)\s*per\s*cent",
        r"development\s+(?:expenditure|budget|activities).{0,260}?absorption\s+rate(?:\s+of|\s+was|\s+at)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+cent|%)",
        r"development\s+expenditure.{0,220}?(?:represented|recorded|translated\s+to|achieved)\s+(?:an\s+)?absorption\s+rate(?:\s+of)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+cent|%)",
        r"development\s+expenditure.{0,180}?(?:was|represented|accounted\s+for)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+cent|%)\s+of\s+(?:the\s+)?(?:approved\s+)?development\s+budget",
        r"development\s+absorption\s+rate.{0,50}?([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+cent|%)",
    ])
    dev_from_table = False
    dev_calc = (dev_spend / dev_budget * 100.0) if (dev_budget and dev_budget > 0 and dev_spend is not None) else None
    if dev_calc is not None:
        plausible_dev = [x for x in dev_direct if abs(x - dev_calc) <= 8.0]
        dev_abs = min(plausible_dev, key=lambda x: abs(x - dev_calc)) if plausible_dev else dev_calc
    elif dev_direct:
        dev_abs = dev_direct[0]
    elif table_value is not None:
        dev_abs = float(table_value["development_absorption_pct"])
        dev_from_table = True
    else:
        raise RuntimeError(f"{fy} {county}: development absorption not extracted or derivable")

    if not (0 <= overall <= 130 and 0 <= dev_abs <= 180):
        raise RuntimeError(f"{fy} {county}: implausible absorption overall={overall}, development={dev_abs}")
    if abs(overall_calc - overall) > 5.0:
        raise RuntimeError(f"{fy} {county}: overall absorption mismatch calc={overall_calc:.2f}, rate={overall:.2f}")

    methods = []
    methods.append("published_overall" if plausible_overall else "derived_overall")
    if dev_from_table:
        methods.append("published_development_economic_table")
    else:
        methods.append("published_development" if (dev_direct and (dev_calc is None or any(abs(x-dev_abs)<1e-9 for x in dev_direct))) else "derived_development")
    return {
        "budget_total_ksh_mn": budget,
        "expenditure_total_ksh_mn": expenditure,
        "development_absorption_pct": dev_abs,
        "overall_absorption_pct": overall,
        "rate_method": "+".join(methods),
    }


def _parse_narrative_year(content: bytes, fy: str, county_names: list[str]) -> dict[str, dict]:
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        texts = [p.extract_text(x_tolerance=2, y_tolerance=3) or "" for p in pdf.pages]

    floor = _find_chapter_floor(texts)
    chapter_offset = 1 if fy in {"2019/20", "2020/21"} else 0
    chapter_order = {name: i + 1 + chapter_offset for i, name in enumerate(COB_2013_ORDER)}
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

TABLE_2_5 = [('Baringo', 4528.48, 3596.55, 8125.03, 4394.23, 1158.45, 5552.68, 97.0, 32.2, 68.3), ('Bomet', 5186.16, 2947.82, 8133.98, 4821.66, 2062.22, 6883.88, 93.0, 70.0, 84.6), ('Bungoma', 8571.21, 4194.11, 12765.31, 7226.41, 2344.53, 9570.95, 84.3, 55.9, 75.0), ('Busia', 5152.32, 3674.16, 8826.48, 4707.59, 1941.07, 6648.66, 91.4, 52.8, 75.3), ('Elgeyo/Marakwet', 3135.27, 2465.81, 5601.08, 3094.3, 1333.3, 4427.6, 98.7, 54.1, 79.0), ('Embu', 4660.95, 2166.29, 6827.24, 4552.03, 1361.23, 5913.26, 97.7, 62.8, 86.6), ('Garissa', 6528.52, 4193.71, 10722.24, 6615.23, 2375.45, 8990.68, 101.3, 56.6, 83.9), ('Homa Bay', 5354.43, 3112.91, 8467.34, 4726.99, 1011.12, 5738.11, 88.3, 32.5, 67.8), ('Isiolo', 3624.21, 1859.88, 5484.1, 3281.22, 997.92, 4279.14, 90.5, 53.7, 78.0), ('Kajiado', 5835.96, 3769.29, 9605.25, 5335.68, 2391.17, 7726.84, 91.4, 63.4, 80.4), ('Kakamega', 7685.24, 6804.18, 14489.42, 7194.63, 4983.67, 12178.3, 93.6, 73.2, 84.0), ('Kericho', 4773.71, 3644.26, 8417.97, 4714.78, 1417.09, 6131.87, 98.8, 38.9, 72.8), ('Kiambu', 10949.23, 5965.12, 16914.35, 9765.02, 4495.23, 14260.25, 89.2, 75.4, 84.3), ('Kilifi', 8711.84, 5770.64, 14482.48, 6074.94, 3566.78, 9641.72, 69.7, 61.8, 66.6), ('Kirinyaga', 4093.31, 1818.15, 5911.46, 4025.62, 1138.54, 5164.16, 98.3, 62.6, 87.4), ('Kisii', 8013.42, 3997.58, 12011.0, 7276.27, 2285.49, 9561.76, 90.8, 57.2, 79.6), ('Kisumu', 7246.43, 4629.11, 11875.53, 5703.04, 2675.71, 8378.75, 78.7, 57.8, 70.6), ('Kitui', 7059.91, 4628.76, 11688.67, 6563.1, 3304.56, 9867.66, 93.0, 71.4, 84.4), ('Kwale', 5398.24, 6119.78, 11518.02, 5084.61, 2609.96, 7694.57, 94.2, 42.6, 66.8), ('Laikipia', 4125.79, 2802.17, 6927.96, 3923.97, 1786.32, 5710.29, 95.1, 63.7, 82.4), ('Lamu', 2562.14, 2284.6, 4846.74, 2208.63, 693.6, 2902.23, 86.2, 30.4, 59.9), ('Machakos', 9569.68, 5395.55, 14965.22, 8554.73, 3097.87, 11652.59, 89.4, 57.4, 77.9), ('Makueni', 6234.36, 4417.36, 10651.72, 5780.73, 2655.81, 8436.55, 92.7, 60.1, 79.2), ('Mandera', 6633.04, 7076.92, 13709.96, 6291.37, 5750.39, 12041.77, 94.8, 81.3, 87.8), ('Marsabit', 4296.84, 4421.96, 8718.8, 3862.71, 3604.99, 7467.7, 89.9, 81.5, 85.7), ('Meru', 7862.71, 4693.39, 12556.1, 7139.04, 2641.43, 9780.47, 90.8, 56.3, 77.9), ('Migori', 5141.56, 3659.55, 8801.12, 4552.55, 1814.5, 6367.05, 88.5, 49.6, 72.3), ('Mombasa', 10112.51, 4343.98, 14456.5, 9422.62, 3106.5, 12529.11, 93.2, 71.5, 86.7), ("Murang'a", 5262.2, 3588.58, 8850.78, 4658.74, 2502.68, 7161.42, 88.5, 69.7, 80.9), ('Nairobi', 25662.42, 7405.82, 33068.25, 23497.73, 5900.44, 29398.17, 91.6, 79.7, 88.9), ('Nakuru', 10467.35, 8011.58, 18478.94, 8659.22, 1477.68, 10136.91, 82.7, 18.4, 54.9), ('Nandi', 5206.59, 3220.26, 8426.86, 4994.32, 1732.67, 6726.99, 95.9, 53.8, 79.8), ('Narok', 7041.48, 3153.37, 10194.86, 6952.16, 3008.04, 9960.21, 98.7, 95.4, 97.7), ('Nyamira', 4828.6, 2130.48, 6959.07, 4481.79, 1120.56, 5602.35, 92.8, 52.6, 80.5), ('Nyandarua', 4502.83, 3166.7, 7669.54, 3893.97, 1581.9, 5475.87, 86.5, 50.0, 71.4), ('Nyeri', 5975.85, 2860.69, 8836.54, 5161.05, 1884.35, 7045.4, 86.4, 65.9, 79.7), ('Samburu', 3856.21, 2004.91, 5861.12, 3438.0, 745.01, 4183.01, 89.2, 37.2, 71.4), ('Siaya', 4712.63, 3730.96, 8443.59, 4526.53, 1175.71, 5702.24, 96.1, 31.5, 67.5), ('Taita Taveta', 3955.76, 2031.69, 5987.45, 3764.96, 1301.83, 5066.79, 95.2, 64.1, 84.6), ('Tana River', 4637.3, 2936.06, 7573.36, 3203.41, 1588.65, 4792.06, 69.1, 54.1, 63.3), ('Tharaka-Nithi', 3542.94, 2178.06, 5721.0, 3206.89, 1395.66, 4602.55, 90.5, 64.1, 80.5), ('Trans Nzoia', 4867.14, 3175.42, 8042.56, 3992.57, 2395.37, 6387.94, 82.0, 75.4, 79.4), ('Turkana', 9600.34, 5751.96, 15352.3, 8673.75, 1675.36, 10349.11, 90.3, 29.1, 67.4), ('Uasin Gishu', 5469.52, 4488.54, 9958.06, 5109.83, 1635.43, 6745.26, 93.4, 36.4, 67.7), ('Vihiga', 4517.44, 2485.13, 7002.57, 4129.69, 1569.38, 5699.07, 91.4, 63.2, 81.4), ('Wajir', 6417.51, 6758.18, 13175.69, 5861.3, 4520.07, 10381.37, 91.3, 66.9, 78.8), ('West Pokot', 4139.23, 2230.28, 6369.51, 3899.5, 1619.91, 5519.41, 94.2, 72.6, 86.7)]

def _parse_2018_consolidated_table(content: bytes, county_names: list[str]) -> dict[str, dict]:
    # Verify this is the expected official report/table before using the audited
    # transcription. The source PDF itself is still hashed in the manifest.
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        texts = [p.extract_text(x_tolerance=2, y_tolerance=3) or "" for p in pdf.pages]
    table_pages = [i for i, raw in enumerate(texts) if "Table 2.5" in _norm(raw) and "County Budget Allocation" in _norm(raw)]
    if not table_pages:
        raise RuntimeError("2018/19: expected official Table 2.5 not found in fetched report")

    rows = TABLE_2_5
    if len(rows) != 47:
        raise RuntimeError(f"2018/19 Table 2.5 transcription expected 47 rows, got {len(rows)}")
    names = [r[0] for r in rows]
    if names != COB_2013_ORDER:
        raise RuntimeError("2018/19 Table 2.5 transcription is not in canonical 47-county order")

    found = {}
    for idx, row in enumerate(rows):
        name, rec_b, dev_b, total_b, rec_s, dev_s, total_s, rec_abs, dev_abs, overall_abs = row
        if abs((rec_b + dev_b) - total_b) > 0.02:
            raise RuntimeError(f"2018/19 {name}: published budget components do not reconcile")
        if abs((rec_s + dev_s) - total_s) > 0.02:
            raise RuntimeError(f"2018/19 {name}: published expenditure components do not reconcile")
        for reported, calc, label in (
            (rec_abs, rec_s / rec_b * 100.0, "recurrent"),
            (dev_abs, dev_s / dev_b * 100.0, "development"),
            (overall_abs, total_s / total_b * 100.0, "overall"),
        ):
            if abs(reported - calc) > 0.15:
                raise RuntimeError(f"2018/19 {name}: {label} absorption arithmetic mismatch {reported}/{calc:.2f}")
        found[name] = {
            "budget_total_ksh_mn": total_b,
            "expenditure_total_ksh_mn": total_s,
            "development_absorption_pct": dev_abs,
            "overall_absorption_pct": overall_abs,
            "source_page": 32 if idx <= 36 else 33,
            "rate_method": "published_table_2_5_transcribed",
        }

    # Published table aggregates; county rows are rounded to 2 decimals, so the
    # sum may differ from the printed total by one cent of a million.
    if abs(sum(r[3] for r in rows) - 483473.12) > 0.02:
        raise RuntimeError("2018/19 Table 2.5 budget aggregate mismatch")
    if abs(sum(r[6] for r in rows) - 376434.74) > 0.02:
        raise RuntimeError("2018/19 Table 2.5 expenditure aggregate mismatch")
    if abs(sum(r[5] for r in rows) - 107435.61) > 0.02:
        raise RuntimeError("2018/19 Table 2.5 development-spend aggregate mismatch")

    missing = [c for c in county_names if c not in found]
    if missing or len(found) != 47:
        raise RuntimeError(f"2018/19 Table 2.5 registry mismatch: missing={missing}")
    return found

def _validate_year(fy: str, values: dict[str, dict], county_names: list[str]) -> None:
    missing = [c for c in county_names if c not in values]
    if missing or len(values) != 47:
        raise RuntimeError(f"{fy}: expected 47 counties, got {len(values)}; missing={missing}")
    for county, v in values.items():
        budget = float(v["budget_total_ksh_mn"])
        spend = float(v["expenditure_total_ksh_mn"])
        overall = float(v["overall_absorption_pct"])
        dev = float(v["development_absorption_pct"])
        if not (1 <= budget <= 200_000 and 0 <= spend <= 220_000 and 0 <= overall <= 130 and 0 <= dev <= 180):
            raise RuntimeError(f"{fy} {county}: range check failed {v}")
        if abs(spend / budget * 100.0 - overall) > 5.0:
            raise RuntimeError(f"{fy} {county}: expenditure/budget mismatch {v}")


def acquire_cob_history(manifest: dict, root: Path, out: Path) -> None:
    geos = json.loads((root / "data/geography/registry/geographies.json").read_text(encoding="utf-8"))
    county_geo = {g["name"]: g["geo_code"] for g in geos if g.get("level") == "county"}
    if len(county_geo) != 47:
        raise RuntimeError(f"geography registry has {len(county_geo)} counties")
    county_names = list(county_geo)
    # Make sure the source aliases cover the canonical registry spellings.
    for county in county_names:
        COUNTY_VARIANTS.setdefault(county, [county])

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/138.0 Safari/537.36",
        "Accept": "*/*",
    })

    all_rows = []
    years_meta = {}
    for fy, landing_page in COB_PAGES.items():
        pdf_url, content = _discover_pdf(session, landing_page, fy)
        if fy == "2013/14":
            values = _parse_2013(content)
        elif fy == "2014/15":
            values = _parse_2014(content)
        elif fy == "2018/19":
            values = _parse_2018_consolidated_table(content, county_names)
        else:
            values = _parse_narrative_year(content, fy, county_names)
        _validate_year(fy, values, county_names)

        methods = {}
        for county in sorted(county_names, key=lambda c: county_geo[c]):
            v = values[county]
            method = v.get("rate_method", "published")
            methods[method] = methods.get(method, 0) + 1
            all_rows.append({
                "fiscal_year": fy,
                "period_start": f"{fy[:4]}-07-01",
                "period_end": f"{int(fy[:4]) + 1}-06-30",
                "geo_code": county_geo[county],
                "name": county,
                "budget_total_ksh_mn": f"{float(v['budget_total_ksh_mn']):.3f}".rstrip("0").rstrip("."),
                "expenditure_total_ksh_mn": f"{float(v['expenditure_total_ksh_mn']):.3f}".rstrip("0").rstrip("."),
                "development_absorption_pct": f"{float(v['development_absorption_pct']):.3f}".rstrip("0").rstrip("."),
                "overall_absorption_pct": f"{float(v['overall_absorption_pct']):.3f}".rstrip("0").rstrip("."),
                "source_page": str(v["source_page"]),
                "rate_method": method,
                "source_url": pdf_url,
            })
        years_meta[fy] = {
            "landing_page": landing_page,
            "pdf_url": pdf_url,
            "pdf_sha256": _sha256(content),
            "rows": 47,
            "rate_methods": methods,
        }
        print("CoB", fy, "PASS", "47 counties", methods, pdf_url)

    if len(all_rows) != 517:
        raise RuntimeError(f"CoB history expected 517 rows, got {len(all_rows)}")
    fields = [
        "fiscal_year", "period_start", "period_end", "geo_code", "name",
        "budget_total_ksh_mn", "expenditure_total_ksh_mn",
        "development_absorption_pct", "overall_absorption_pct",
        "source_page", "rate_method", "source_url",
    ]
    path = out / "cob-county-budget-history.csv"
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(all_rows)

    manifest["cob_history"] = {
        "retrieved_at": datetime.utcnow().isoformat() + "Z",
        "quality": "official_mixed_direct_and_transformed",
        "years": years_meta,
        "rows": len(all_rows),
        "note": "Official Controller of Budget county annual reports. Budget and expenditure are direct county values. Published absorption rates are retained where reliably extractable; otherwise absorption is deterministically derived from official county numerator/denominator values in the same report. No allocation below county.",
    }
    print("wrote", path.relative_to(root), len(all_rows), "rows")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    out = root / "data/sprint3"
    source_path = out / "sources.json"
    doc = json.loads(source_path.read_text(encoding="utf-8")) if source_path.exists() else {"sources": {}}
    acquire_cob_history(doc.setdefault("sources", {}), root, out)
    source_path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
