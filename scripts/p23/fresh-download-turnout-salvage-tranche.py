#!/usr/bin/env python3
import argparse
import hashlib
import http.cookiejar
import json
import pathlib
import re
import urllib.error
import urllib.request

FORBIDDEN_RESULT_KEYS = {
    "registered_voters", "total_valid_votes", "rejected_ballots", "turnout_pct",
    "candidate_vote_sum", "verified_value", "source_verified", "promotion_eligible",
    "promotion_state", "explicit_materialization_authorized"
}


def load_json(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tranche", default="data/p23/turnout-salvage-tranche-a.json")
    parser.add_argument("--source-index", default="data/p23/form34b-source-index-contract.json")
    parser.add_argument("--output", default="/tmp/p23-turnout-salvage-a-fresh-download.json")
    parser.add_argument("--download-dir", default="/tmp/p23-turnout-salvage-a-pdfs")
    args = parser.parse_args()

    tranche = load_json(args.tranche)
    source_index = load_json(args.source_index)
    rows = tranche.get("tranche", {}).get("rows", [])
    if tranche.get("tranche", {}).get("id") != "salvage-a" or len(rows) != 8:
        raise SystemExit("expected governed salvage-a with exactly 8 rows")

    relation = source_index.get("source_index_relation", {})
    offset = relation.get("form_id_offset")
    template = relation.get("download_url_template")
    portal = source_index.get("authority", {}).get("portal_url")
    if offset != 277628 or not template or portal != "https://forms.iebc.or.ke":
        raise SystemExit("governed source-index locator contract drifted")

    out_dir = pathlib.Path(args.download_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0"}

    def get(url, timeout=120):
        req = urllib.request.Request(url, headers=headers)
        return opener.open(req, timeout=timeout)

    session_bootstrap = []
    for url in [portal + "/", portal + "/index.php?id=5&r=common%2Fset-election"]:
        try:
            with get(url, timeout=60) as response:
                response.read()
                session_bootstrap.append({"url": url, "status": response.status})
        except Exception as exc:
            session_bootstrap.append({"url": url, "status": None, "error": type(exc).__name__})

    results = []
    for row in rows:
        match = re.search(r"-CON(\d{3})$", row.get("geo_code", ""))
        if not match:
            raise SystemExit(f"invalid constituency geo_code: {row.get('geo_code')}")
        constituency_code = int(match.group(1))
        form_id = constituency_code + offset
        source_url = template.replace("{form_id}", str(form_id))
        record = {
            "geo_code": row["geo_code"],
            "name": row["name"],
            "constituency_code": constituency_code,
            "locator_basis": "governed_source_index_formula",
            "form_id": form_id,
            "source_url": source_url,
            "fresh_download_attempted": True,
            "promotion_authorized_by_this_record": False,
        }
        try:
            with get(source_url, timeout=120) as response:
                payload = response.read()
                content_type = response.headers.get("Content-Type", "")
                record["http_status"] = response.status
                record["content_type"] = content_type
                record["bytes"] = len(payload)
                if payload.startswith(b"%PDF-"):
                    digest = hashlib.sha256(payload).hexdigest()
                    file_path = out_dir / f"{row['geo_code']}-form34b.pdf"
                    file_path.write_bytes(payload)
                    record["state"] = "fresh_official_source_downloaded_unreviewed"
                    record["source_pdf_sha256"] = digest
                    record["pdf_magic_confirmed"] = True
                    record["download_file"] = str(file_path)
                else:
                    record["state"] = "fresh_official_source_transport_nonpdf"
                    record["pdf_magic_confirmed"] = False
        except urllib.error.HTTPError as exc:
            record.update({"state": "fresh_official_source_http_error", "http_status": exc.code, "error_class": "HTTPError"})
        except Exception as exc:
            record.update({"state": "fresh_official_source_transport_error", "http_status": None, "error_class": type(exc).__name__})
        results.append(record)

    manifest = {
        "schema_version": "kda.p23.turnout-salvage-fresh-download.v1",
        "as_of": "2026-09-13",
        "purpose": "Attempt fresh official IEBC downloads for salvage-a using only the governed source-index locator relation. This artifact contains no turnout values and grants no verification or promotion authority.",
        "tranche": "salvage-a",
        "source_index_contract": args.source_index,
        "session_bootstrap": session_bootstrap,
        "governance": {
            "no_inheritance": True,
            "no_promotion": True,
            "result_values_forbidden": True,
            "fresh_hashes_only": True,
            "review_context_not_created": True,
            "required_render_dpi_for_future_review": 250,
        },
        "rows": results,
    }

    def scan(value, where="manifest"):
        if isinstance(value, dict):
            for key, nested in value.items():
                if key in FORBIDDEN_RESULT_KEYS:
                    raise SystemExit(f"forbidden result/promotion key emitted at {where}.{key}")
                scan(nested, where + "." + key)
        elif isinstance(value, list):
            for i, nested in enumerate(value):
                scan(nested, f"{where}[{i}]")
    scan(manifest)

    pathlib.Path(args.output).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    downloaded = sum(1 for row in results if row.get("state") == "fresh_official_source_downloaded_unreviewed")
    print(f"P23_SALVAGE_FRESH_DOWNLOAD_A rows={len(results)} downloaded_pdf={downloaded} no_promotion=true")


if __name__ == "__main__":
    main()
