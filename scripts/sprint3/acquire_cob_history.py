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
    "2021/22": "https://cob.go.ke/wp-content/uploads/2022/09/Counties-Sep-2022-web.pdf",
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
    landing = _get(session, page_url, 90)
    soup = BeautifulSoup(landing.text, "lxml")
    candidates: list[str] = []
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
    if fy in COB_DIRECT_FALLBACK:
        candidates.append(COB_DIRECT_FALLBACK[fy])
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


def _find_section(texts: list[str], variants: list[str]) -> int:
    best = None
    for page_i, raw in enumerate(texts):
        if page_i < 10:
            continue
        lines = [_norm(x) for x in raw.splitlines() if _norm(x)]
        for line_i, line in enumerate(lines):
            for variant in variants:
                v = re.escape(_norm(variant))
                exact = re.fullmatch(rf"(?:\d+(?:\.\d+)*\s+)?{v}\s+County(?:\s+Government)?", line, re.I)
                start = re.match(rf"^(?:\d+(?:\.\d+)*\s+)?{v}\s+County(?:\s+Government)?\b", line, re.I)
                if exact:
                    score = 120 - min(line_i, 20)
                elif start and len(line) <= len(variant) + 70:
                    score = 100 - min(line_i, 20)
                else:
                    continue
                # Prefer the later page when a table of contents happens to look similar.
                candidate = (score, page_i, -line_i)
                if best is None or candidate > best:
                    best = candidate
    if best is not None:
        return best[1]

    # Conservative fallback: county name near the start of a page together with the
    # budget-implementation opening language. This should be rare and is logged.
    for page_i, raw in enumerate(texts):
        if page_i < 10:
            continue
        head = _norm(raw[:1800])
        low = head.lower()
        if "budget" not in low:
            continue
        for variant in variants:
            if re.search(rf"\b{re.escape(_norm(variant))}\s+County\b", head, re.I):
                print("CoB heading fallback", variant, "page", page_i + 1)
                return page_i
    raise RuntimeError(f"county section heading not found for {variants}")


def _extract_narrative(window: str, county: str, fy: str) -> dict:
    text = _norm(window)
    # Budget: prefer an explicitly approved/revised/supplementary county budget.
    budget = _first_money(text, [
        r"(?:approved|revised)(?:\s+annual)?(?:\s+(?:revised|supplementary))?\s+budget(?:\s+for\s+(?:the\s+)?county)?\s+(?:was|is|of|amounted\s+to)?\s*(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)",
        r"(?:approved|revised|supplementary).{0,80}?budget.{0,80}?(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)",
        r"budget(?:ed)?\s+to\s+spend.{0,80}?(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)",
        r"budget\s+of\s+(?:Kshs?|Ksh)\.?\s*([0-9][0-9,.]*)\s*(billion|million)",
    ])

    expenditure = _first_money(text, [
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
        raise RuntimeError(f"{fy} {county}: budget/expenditure not extracted (budget={budget}, expenditure={expenditure})")
    if not (1 <= budget <= 200_000 and 0 <= expenditure <= 220_000):
        raise RuntimeError(f"{fy} {county}: implausible budget/expenditure {budget}/{expenditure}")

    overall_calc = expenditure / budget * 100.0
    overall_direct = _percent_candidates(text, [
        r"overall\s+absorption\s+rate(?:\s+of|\s+was|\s+stood\s+at)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+cent|%)",
        r"total\s+expenditure.{0,220}?absorption\s+rate(?:\s+of)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+cent|%)",
        r"spent\s+a\s+total.{0,240}?absorption\s+rate(?:\s+of)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+cent|%)",
        r"aggregate\s+expenditure.{0,180}?absorption\s+rate(?:\s+of)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+cent|%)",
    ])
    plausible_overall = [x for x in overall_direct if abs(x - overall_calc) <= 5.0]
    overall = min(plausible_overall, key=lambda x: abs(x - overall_calc)) if plausible_overall else overall_calc

    dev_direct = _percent_candidates(text, [
        r"development\s+(?:expenditure|budget|activities).{0,260}?absorption\s+rate(?:\s+of|\s+was|\s+at)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+cent|%)",
        r"development\s+expenditure.{0,220}?(?:represented|recorded|translated\s+to|achieved)\s+(?:an\s+)?absorption\s+rate(?:\s+of)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+cent|%)",
        r"development\s+expenditure.{0,180}?(?:was|represented|accounted\s+for)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+cent|%)\s+of\s+(?:the\s+)?(?:approved\s+)?development\s+budget",
        r"development\s+absorption\s+rate.{0,50}?([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+cent|%)",
    ])
    dev_calc = (dev_spend / dev_budget * 100.0) if (dev_budget and dev_budget > 0 and dev_spend is not None) else None
    if dev_calc is not None:
        plausible_dev = [x for x in dev_direct if abs(x - dev_calc) <= 8.0]
        dev_abs = min(plausible_dev, key=lambda x: abs(x - dev_calc)) if plausible_dev else dev_calc
    elif dev_direct:
        dev_abs = dev_direct[0]
    else:
        raise RuntimeError(f"{fy} {county}: development absorption not extracted or derivable")

    if not (0 <= overall <= 130 and 0 <= dev_abs <= 180):
        raise RuntimeError(f"{fy} {county}: implausible absorption overall={overall}, development={dev_abs}")
    if abs(overall_calc - overall) > 5.0:
        raise RuntimeError(f"{fy} {county}: overall absorption mismatch calc={overall_calc:.2f}, rate={overall:.2f}")

    methods = []
    methods.append("published_overall" if plausible_overall else "derived_overall")
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
    found = {}
    section_pages = {}
    for county in county_names:
        variants = COUNTY_VARIANTS.get(county, [county])
        page_i = _find_section(texts, variants)
        section_pages[county] = page_i
        # Budget/expenditure/absorption are normally in the opening 2–4 pages. Six
        # pages gives margin without drifting far into the following county section.
        window = "\n".join(texts[page_i:min(page_i + 6, len(texts))])
        value = _extract_narrative(window, county, fy)
        value["source_page"] = page_i + 1
        found[county] = value

    # A heading collision generally produces duplicate section pages. A few pages may
    # legitimately contain the end of one county and the start of another, so only
    # exact duplicate start pages are suspicious enough to fail.
    reverse = {}
    for county, p in section_pages.items():
        reverse.setdefault(p, []).append(county)
    collisions = {p + 1: names for p, names in reverse.items() if len(names) > 1}
    if collisions:
        raise RuntimeError(f"{fy}: duplicate county section page(s): {collisions}")
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
