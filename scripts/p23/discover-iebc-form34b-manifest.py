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

# IEBC 2022 uses current electoral names for three constituencies whose KDA
# canonical codes are already correct but whose stored display names reflect
# earlier naming. These are explicit name aliases only; no boundary or value
# crosswalk is performed.
PORTAL_NAME_ALIASES = {
    "CHUKA IGAMBANG OMBE": "KEN-C013-CON061",
    "SUBA NORTH": "KEN-C043-CON251",
    "SUBA SOUTH": "KEN-C043-CON252",
}

# Presidential Form 34B includes a diaspora collation row in addition to the
# 290 territorial constituencies. It is official evidence, but it is not a
# canonical KDA constituency geography and therefore must never be force-mapped.
NON_CANONICAL_PORTAL_NAMES = {
    "DIASPORA": "Official presidential diaspora collation row; outside the canonical 290 territorial constituencies.",
}


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
        except Exception as exc:
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
    plain = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", first_html))
    total_match = re.search(r"Showing\s+\d+\s*-\s*\d+\s+of\s+([\d,]+)\s+items?", plain, re.I)
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

    if total:
        for page in range(2, math.ceil(total / 50) + 1):
            page_urls.setdefault(page, with_query(first_url, page=page))
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
    canonical_by_code = {g["geo_code"]: g for g in constituencies}
    for geo in constituencies:
        key = normalize_name(geo.get("name"))
        if key in canonical_by_name:
            raise RuntimeError(f"Canonical constituency name normalization collision: {geo.get('name')}")
        canonical_by_name[key] = geo

    for alias_name, geo_code in PORTAL_NAME_ALIASES.items():
        if geo_code not in canonical_by_code:
            raise RuntimeError(f"Alias {alias_name} targets missing canonical geo_code {geo_code}")

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
    excluded_portal = []
    unmatched_portal = []
    matched_codes = set()

    for row in portal_rows:
        portal_key = normalize_name(row["portal_name"])
        if portal_key in NON_CANONICAL_PORTAL_NAMES:
            excluded_portal.append({
                **row,
                "exclusion_reason": NON_CANONICAL_PORTAL_NAMES[portal_key],
            })
            continue

        geo = canonical_by_name.get(portal_key)
        match_method = "exact_normalized_name"
        alias_geo_code = None
        if not geo:
            alias_geo_code = PORTAL_NAME_ALIASES.get(portal_key)
            geo = canonical_by_code.get(alias_geo_code) if alias_geo_code else None
            match_method = "governed_source_name_alias" if geo else "unmatched"

        if not geo:
            unmatched_portal.append(row)
            continue
        if geo["geo_code"] in matched_codes:
            raise RuntimeError(f"Multiple IEBC portal rows mapped to {geo['geo_code']}")

        matched_codes.add(geo["geo_code"])
        detail_url = f"{BASE}/index.php?r=site%2Findex&id={row['portal_row_id']}&ft=2&p=1&es="
        detail_html = fetch_text(opener, detail_url)
        download_ids, view_ids, status = extract_detail_refs(detail_html)
        matched.append({
            "geo_code": geo["geo_code"],
            "geography_id": geo["geography_id"],
            "constituency_code": geo.get("constituency_code"),
            "constituency_name": geo["name"],
            "portal_name": row["portal_name"],
            "portal_row_id": row["portal_row_id"],
            "portal_reported": row["reported"],
            "match_method": match_method,
            "alias_geo_code": alias_geo_code or "",
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
    matched.sort(key=lambda row: int(row["constituency_code"] or 0))

    with_download = sum(1 for row in matched if len(row["form_download_ids"]) == 1)
    with_view = sum(1 for row in matched if len(row["form_view_ids"]) == 1)
    all_reported = all(row["form_status"] == "reported" and row["portal_reported"] == "1 of 1 (100%)" for row in matched)
    complete = (
        portal_total == 291
        and len(portal_rows) == 291
        and len(matched) == 290
        and not unmatched_portal
        and not missing
        and len(excluded_portal) == 1
        and normalize_name(excluded_portal[0]["portal_name"]) == "DIASPORA"
        and with_download == 290
        and with_view == 290
        and all_reported
    )

    output = {
        "schema_version": "kda.p23.iebc-form34b-source-manifest.v1",
        "as_of": "2026-09-03",
        "source": "Independent Electoral and Boundaries Commission (IEBC) 2022 General Election Form 34B portal",
        "source_url": first_url,
        "portal_reported_items": portal_total,
        "portal_rows_discovered": len(portal_rows),
        "canonical_constituencies": len(constituencies),
        "canonical_matches": len(matched),
        "governed_alias_matches": sum(1 for row in matched if row["match_method"] == "governed_source_name_alias"),
        "excluded_noncanonical_portal_rows": excluded_portal,
        "unmatched_portal_rows": unmatched_portal,
        "missing_canonical_constituencies": missing,
        "canonical_rows_with_single_download_ref": with_download,
        "canonical_rows_with_single_view_ref": with_view,
        "rows": matched,
        "promotion_state": "source_reference_manifest_complete" if complete else "source_reference_discovery_incomplete",
        "promotion_note": "This manifest proves official source references only. It contains no turnout values and cannot resolve IND-TURNOUT-HISTORY until Form 34B integers are independently extracted and reconciled under the turnout readiness contract.",
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        "P23_FORM34B_MANIFEST_DISCOVERY "
        f"portal_total={portal_total} discovered={len(portal_rows)} canonical_matches={len(matched)} "
        f"aliases={output['governed_alias_matches']} excluded={len(excluded_portal)} unmatched_portal={len(unmatched_portal)} "
        f"missing_canonical={len(missing)} with_download_ref={with_download} with_view_ref={with_view} complete={complete}"
    )
    if excluded_portal:
        print("P23_FORM34B_EXCLUDED_PORTAL " + json.dumps(excluded_portal, ensure_ascii=False))
    if unmatched_portal:
        print("P23_FORM34B_UNMATCHED_PORTAL " + json.dumps(unmatched_portal, ensure_ascii=False))
    if missing:
        print("P23_FORM34B_MISSING_CANONICAL " + json.dumps(missing, ensure_ascii=False))
    print(f"P23_FORM34B_MANIFEST_PATH {output_path}")

    if not complete:
        raise RuntimeError("Form 34B source-reference manifest did not satisfy the governed 290-constituency acceptance gate")


if __name__ == "__main__":
    main()
