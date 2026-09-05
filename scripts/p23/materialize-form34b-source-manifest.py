#!/usr/bin/env python3
"""Materialize the verified IEBC Form 34B source-reference manifest from P23 contracts.

This is intentionally a locator-only artifact. The live IEBC discovery workflow remains
responsible for detecting portal drift. This materializer exists so OCR/layout diagnostics
do not re-crawl 290 unchanged detail pages before every run.
"""

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://forms.iebc.or.ke"


def load(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def main():
    parser = argparse.ArgumentParser(description="Materialize the governed P23 Form 34B locator manifest without extracting result values.")
    parser.add_argument("--output", default="/tmp/iebc-2022-form34b-source-manifest.json")
    args = parser.parse_args()

    geographies = load("data/geography/registry/geographies.json")
    readiness = load("data/p23/constituency-turnout-readiness-contract.json")
    source_index = load("data/p23/form34b-source-index-contract.json")

    constituencies = sorted(
        (g for g in geographies if g.get("level") == "constituency"),
        key=lambda g: int(g.get("constituency_code") or 0),
    )
    if len(constituencies) != 290:
        raise RuntimeError(f"Expected 290 canonical constituencies, found {len(constituencies)}")

    relation = source_index.get("source_index_relation") or {}
    verified = source_index.get("verified_source_manifest") or {}
    if relation.get("verified_rows") != 290 or verified.get("canonical_matches") != 290:
        raise RuntimeError("P23 verified source-index contract is not 290/290 complete")

    aliases = readiness.get("source_name_reconciliation", {}).get("aliases") or []
    alias_by_geo = {item["geo_code"]: item["portal_name"] for item in aliases}
    if len(alias_by_geo) != 3:
        raise RuntimeError(f"Expected 3 governed source-name aliases, found {len(alias_by_geo)}")

    portal_offset = int(relation["portal_row_id_offset"])
    form_offset = int(relation["form_id_offset"])
    rows = []
    for geo in constituencies:
        code = int(geo["constituency_code"])
        portal_row_id = code + portal_offset
        form_id = code + form_offset
        portal_name = alias_by_geo.get(geo["geo_code"], str(geo["name"]).upper())
        alias = geo["geo_code"] in alias_by_geo
        rows.append({
            "geo_code": geo["geo_code"],
            "geography_id": geo["geography_id"],
            "constituency_code": code,
            "constituency_name": geo["name"],
            "portal_name": portal_name,
            "portal_row_id": portal_row_id,
            "portal_reported": "1 of 1 (100%)",
            "match_method": "governed_source_name_alias" if alias else "exact_normalized_name",
            "alias_geo_code": geo["geo_code"] if alias else "",
            "detail_url": relation["detail_url_template"].format(portal_row_id=portal_row_id),
            "form_status": "reported",
            "form_download_ids": [form_id],
            "form_view_ids": [form_id],
            "download_urls": [relation["download_url_template"].format(form_id=form_id)],
            "view_urls": [relation["view_url_template"].format(form_id=form_id)],
        })

    diaspora = source_index.get("noncanonical_portal_row") or {}
    excluded = [{
        "portal_row_id": int(diaspora["portal_row_id"]),
        "portal_name": diaspora["portal_name"],
        "reported": diaspora.get("reported", "1 of 1 (100%)"),
        "exclusion_reason": readiness.get("source_name_reconciliation", {}).get("excluded_portal_rows", [{}])[0].get(
            "reason",
            "Official presidential diaspora collation row outside the canonical 290 territorial constituencies.",
        ),
    }]

    output = {
        "schema_version": "kda.p23.iebc-form34b-source-manifest.v1",
        "as_of": source_index.get("as_of"),
        "source": "Independent Electoral and Boundaries Commission (IEBC) 2022 General Election Form 34B portal",
        "source_url": source_index.get("authority", {}).get("index_url"),
        "portal_reported_items": int(verified["portal_reported_items"]),
        "portal_rows_discovered": int(verified["portal_rows_discovered"]),
        "canonical_constituencies": 290,
        "canonical_matches": 290,
        "governed_alias_matches": len(alias_by_geo),
        "excluded_noncanonical_portal_rows": excluded,
        "unmatched_portal_rows": [],
        "missing_canonical_constituencies": [],
        "canonical_rows_with_single_download_ref": 290,
        "canonical_rows_with_single_view_ref": 290,
        "rows": rows,
        "promotion_state": "source_reference_manifest_complete",
        "promotion_note": "This manifest materializes already-verified official source references only. It contains no turnout values and cannot resolve IND-TURNOUT-HISTORY until Form 34B integers are independently extracted and reconciled under the turnout readiness contract.",
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        "P23_FORM34B_MANIFEST_MATERIALIZED "
        f"canonical={len(rows)} aliases={len(alias_by_geo)} excluded={len(excluded)} "
        "source_verified_values=0 promotion_authorized=false"
    )


if __name__ == "__main__":
    main()
