#!/usr/bin/env python3
import argparse
import http.cookiejar
import json
import math
import re
import time
import unicodedata
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse
from urllib.request import HTTPCookieProcessor, Request, build_opener

BASE = "https://forms.iebc.or.ke"
INDEX_PATH = "/index.php?r=site%2Findex&p=1&ft=2&l=2"
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0"


def normalize_name(value):
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.upper().replace("’", "'").replace("`", "'")
    value = re.sub(r"[^A-Z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


class GridParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.hrefs = []
        self._row = None
        self._cell = None

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == "a" and data.get("href"):
            self.hrefs.append(data["href"])
        if tag == "tr":
            self._row = {"id": data.get("id"), "cells": []}
        elif tag in ("td", "th") and self._row is not None:
            self._cell = ""

    def handle_data(self, data):
        if self._cell is not None:
            self._cell += data

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None and self._row is not None:
            self._row["cells"].append(re.sub(r"\s+", " ", self._cell).strip())
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if self._row["cells"]:
                self.rows.append(self._row)
            self._row = None
            self._cell = None


def fetch_text(opener, url, retries=3):
    last = None
    for attempt in range(retries):
        try:
            request = Request(url, headers={"User-Agent": USER_AGENT})
            with opener.open(request, timeout=60) as response:
                return response.read().decode("utf-8", errors="replace")
        except Exception as exc:  # network failures are retried but never hidden
            last = exc
            if attempt + 1 < retries:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last}")


def with_query(url, **updates):
    parsed = urlparse(url)
    query = parse_qs(parsed.query, keep_blank_values=True)
    for key, value in updates.items():
        query[key] = [str(value)]
    flat = []
    for key, values in query.items():
        for value in values:
            flat.append((key, value))
    return urlunparse(parsed._replace(query=urlencode(flat)))


def discover_page_urls(first_url, first_html):
    parser = GridParser()
    parser.feed(first_html)
    total_match = re.search(r"Showing\s+\d+\s*-\s*\d+\s+of\s+([\d,]+)\s+items?", first_html, re.I)
    total = int(total_match.group(1).replace(",", "")) if total_match else None

    page_urls = {1: first_url}
    for href in parser.hrefs:
        absolute = urljoin(BASE, href.replace("&amp;", "&"))
        parsed = urlparse(absolute)
        qs = parse_qs(parsed.query)
        if "page" not in qs:
            continue
        try:
            page = int(qs["page"][0])
        except (ValueError, TypeError):
            continue
        page_urls[page] = absolute

    if total and len(page_urls) == 1:
        for page in range(2, math.ceil(total / 50) + 1):
            page_urls[page] = with_query(first_url, page=page)
    return total, dict(sorted(page_urls.items()))


def portal_rows_from_html(html):
    parser = GridParser()
    parser.feed(html)
    rows = []
    for row in parser.rows:
        if not row["id"] or not str(row["id"]).isdigit() or not row["cells"]:
            continue
        rows.append({
            "portal_row_id": int(row["id"]),
            "portal_name": row["cells"][0],
            "reported": row["cells"][1] if len(row["cells"]) > 1 else "",
        })
    return rows


def extract_detail_refs(html):
    parser = GridParser()
    parser.feed(html)
    download_ids = []
    view_ids = []
    for href in parser.hrefs:
        decoded = href.replace("&amp;", "&")
        match = re.search(r"r=site%2Fdownload&id=(\d+)", decoded, re.I)
        if match:
            download_ids.append(int(match.group(1)))
        match = re.search(r"r=site%2Fview-form&id=(\d+)", decoded, re.I)
        if match:
            view_ids.append(int(match.group(1)))
    status = "reported" if re.search(r"\bReported\b", html, re.I) else "unknown"
    return sorted(set(download_ids)), sorted(set(view_ids)), status


def main():
    parser = argparse.ArgumentParser(description="Discover the official IEBC 2022 Form 34B constituency source manifest without extracting vote values.")
    parser.add_argument("--output", default="/tmp/iebc-2022-form34b-source-manifest.json")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[2]
    geographies = json.loads((root / "data/geography/registry/geographies.json").read_text(encoding="utf-8"))
    constituencies = [g for g in geographies if g.get("level") == "constituency"]
    if len(constituencies) != 290:
        raise RuntimeError(f"Expected 290 canonical constituencies, found {len(constituencies)}")

    canonical_by_name = {}
    for geo in constituencies:
        key = normalize_name(geo.get("name"))
        if key in canonical_by_name:
            raise RuntimeError(f"Canonical constituency name normalization collision: {geo.get('name')}")
        canonical_by_name[key] = geo

    cookie_jar = http.cookiejar.CookieJar()
    opener = build_opener(HTTPCookieProcessor(cookie_jar))
    fetch_text(opener, BASE + "/")
    fetch_text(opener, BASE + "/index.php?id=5&r=common%2Fset-election")

    first_url = BASE + INDEX_PATH
    first_html = fetch_text(opener, first_url)
    portal_total, page_urls = discover_page_urls(first_url, first_html)

    portal_rows = []
    seen_ids = set()
    for page, url in page_urls.items():
        html = first_html if page == 1 else fetch_text(opener, url)
        page_rows = portal_rows_from_html(html)
        print(f"P23_FORM34B_PAGE page={page} rows={len(page_rows)} url={url}")
        for row in page_rows:
            if row["portal_row_id"] in seen_ids:
                continue
            seen_ids.add(row["portal_row_id"])
            portal_rows.append(row)

    portal_rows.sort(key=lambda row: row["portal_row_id"])
    matched = []
    unmatched_portal = []
    matched_codes = set()
    for row in portal_rows:
        geo = canonical_by_name.get(normalize_name(row["portal_name"]))
        if not geo:
            unmatched_portal.append(row)
            continue
        matched_codes.add(geo["geo_code"])
        detail_url = f"{BASE}/index.php?r=site%2Findex&id={row['portal_row_id']}&ft=2&p=1&es="
        detail_html = fetch_text(opener, detail_url)
        download_ids, view_ids, status = extract_detail_refs(detail_html)
        matched.append({
            "geo_code": geo["geo_code"],
            "geography_id": geo["geography_id"],
            "constituency_name": geo["name"],
            "portal_name": row["portal_name"],
            "portal_row_id": row["portal_row_id"],
            "portal_reported": row["reported"],
            "detail_url": detail_url,
            "form_status": status,
            "form_download_ids": download_ids,
            "form_view_ids": view_ids,
            "download_urls": [f"{BASE}/index.php?r=site%2Fdownload&id={item}" for item in download_ids],
            "view_urls": [f"{BASE}/index.php?r=site%2Fview-form&id={item}" for item in view_ids],
        })

    missing = [
        {"geo_code": geo["geo_code"], "constituency_name": geo["name"]}
        for geo in constituencies
        if geo["geo_code"] not in matched_codes
    ]
    matched.sort(key=lambda row: row["geo_code"])

    output = {
        "schema_version": "kda.p23.iebc-form34b-source-manifest.v1",
        "as_of": "2026-09-03",
        "source": "Independent Electoral and Boundaries Commission (IEBC) 2022 General Election Form 34B portal",
        "source_url": first_url,
        "portal_reported_items": portal_total,
        "portal_rows_discovered": len(portal_rows),
        "canonical_constituencies": len(constituencies),
        "canonical_matches": len(matched),
        "unmatched_portal_rows": unmatched_portal,
        "missing_canonical_constituencies": missing,
        "rows": matched,
        "promotion_state": "source_reference_discovery_only",
        "promotion_note": "This manifest proves source references only. It contains no turnout values and cannot resolve IND-TURNOUT-HISTORY until Form 34B integers are independently extracted and reconciled under the turnout readiness contract.",
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    with_download = sum(1 for row in matched if row["form_download_ids"])
    print(
        "P23_FORM34B_MANIFEST_DISCOVERY "
        f"portal_total={portal_total} discovered={len(portal_rows)} canonical_matches={len(matched)} "
        f"unmatched_portal={len(unmatched_portal)} missing_canonical={len(missing)} with_download_ref={with_download}"
    )
    if unmatched_portal:
        print("P23_FORM34B_UNMATCHED_PORTAL " + json.dumps(unmatched_portal, ensure_ascii=False))
    if missing:
        print("P23_FORM34B_MISSING_CANONICAL " + json.dumps(missing, ensure_ascii=False))
    print(f"P23_FORM34B_MANIFEST_PATH {output_path}")


if __name__ == "__main__":
    main()
