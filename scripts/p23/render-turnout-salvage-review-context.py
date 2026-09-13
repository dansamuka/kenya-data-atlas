#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib
import re
import struct
import subprocess

RENDER_DPI = 250
FORBIDDEN_RESULT_KEYS = {
    "registered_voters", "total_valid_votes", "rejected_ballots", "turnout_pct",
    "candidate_vote_sum", "verified_value", "source_verified", "promotion_eligible",
    "promotion_state", "explicit_materialization_authorized", "ballots_cast"
}


def load_json(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def sha256_file(path):
    h = hashlib.sha256()
    with pathlib.Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def png_dimensions(path):
    with pathlib.Path(path).open("rb") as handle:
        header = handle.read(24)
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise SystemExit(f"not a valid PNG: {path}")
    return struct.unpack(">II", header[16:24])


def scan_forbidden(value, where="manifest"):
    if isinstance(value, dict):
        for key, nested in value.items():
            if key in FORBIDDEN_RESULT_KEYS:
                raise SystemExit(f"forbidden result/promotion key emitted at {where}.{key}")
            scan_forbidden(nested, where + "." + key)
    elif isinstance(value, list):
        for i, nested in enumerate(value):
            scan_forbidden(nested, f"{where}[{i}]")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fresh-manifest", required=True)
    parser.add_argument("--pdf-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--render-dir", required=True)
    args = parser.parse_args()

    fresh = load_json(args.fresh_manifest)
    if fresh.get("schema_version") != "kda.p23.turnout-salvage-fresh-download.v1":
        raise SystemExit("unexpected fresh-download manifest schema")
    if fresh.get("tranche") != "salvage-a":
        raise SystemExit("review-context preparation currently governs salvage-a only")
    governance = fresh.get("governance", {})
    required = {
        "no_inheritance": True,
        "no_promotion": True,
        "result_values_forbidden": True,
        "fresh_hashes_only": True,
        "review_context_not_created": True,
        "required_render_dpi_for_future_review": RENDER_DPI,
    }
    for key, expected in required.items():
        if governance.get(key) != expected:
            raise SystemExit(f"fresh-download governance drift at {key}")

    pdf_dir = pathlib.Path(args.pdf_dir)
    render_dir = pathlib.Path(args.render_dir)
    render_dir.mkdir(parents=True, exist_ok=True)

    rows = fresh.get("rows", [])
    if len(rows) != 8:
        raise SystemExit(f"expected 8 salvage-a rows, saw {len(rows)}")

    rendered_rows = []
    for row in rows:
        if row.get("state") != "fresh_official_source_downloaded_unreviewed":
            raise SystemExit(f"cannot render non-downloaded row {row.get('geo_code')}: {row.get('state')}")
        geo_code = row.get("geo_code", "")
        if not re.fullmatch(r"KEN-C\d{3}-CON\d{3}", geo_code):
            raise SystemExit(f"invalid geo_code {geo_code}")
        expected_sha = row.get("source_pdf_sha256")
        if not isinstance(expected_sha, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_sha):
            raise SystemExit(f"missing fresh source hash for {geo_code}")
        pdf_path = pdf_dir / f"{geo_code}-form34b.pdf"
        if not pdf_path.exists():
            raise SystemExit(f"fresh PDF missing for {geo_code}")
        actual_sha = sha256_file(pdf_path)
        if actual_sha != expected_sha:
            raise SystemExit(f"fresh PDF hash mismatch for {geo_code}")

        prefix = render_dir / f"{geo_code}-page"
        subprocess.run(
            ["pdftoppm", "-r", str(RENDER_DPI), "-png", str(pdf_path), str(prefix)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        page_files = sorted(
            render_dir.glob(f"{geo_code}-page-*.png"),
            key=lambda p: int(re.search(r"-(\d+)\.png$", p.name).group(1)),
        )
        if not page_files:
            raise SystemExit(f"no rendered pages for {geo_code}")

        page_records = []
        for page_number, page_path in enumerate(page_files, start=1):
            width, height = png_dimensions(page_path)
            page_records.append({
                "page_number": page_number,
                "page_image_sha256": sha256_file(page_path),
                "width_px": width,
                "height_px": height,
                "image_file": page_path.name,
            })

        rendered_rows.append({
            "geo_code": geo_code,
            "name": row.get("name"),
            "constituency_code": row.get("constituency_code"),
            "source_pdf_sha256": expected_sha,
            "render_dpi": RENDER_DPI,
            "page_count": len(page_records),
            "pages": page_records,
            "state": "fresh_official_source_rendered_250dpi_unreviewed",
            "promotion_authorized_by_this_record": False,
        })

    manifest = {
        "schema_version": "kda.p23.turnout-salvage-review-context.v1",
        "as_of": fresh.get("as_of"),
        "purpose": "Prepare deterministic full-page 250-DPI review images from freshly downloaded official IEBC Form 34B PDFs. No OCR, result-field reading, source verification or promotion occurs in this step.",
        "tranche": "salvage-a",
        "fresh_download_manifest": pathlib.Path(args.fresh_manifest).name,
        "governance": {
            "no_inheritance": True,
            "no_promotion": True,
            "result_values_forbidden": True,
            "ocr_forbidden": True,
            "visual_transcription_not_performed": True,
            "source_verification_not_granted": True,
            "review_pending": True,
            "render_dpi": RENDER_DPI,
        },
        "rows": rendered_rows,
    }
    scan_forbidden(manifest)
    pathlib.Path(args.output).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    total_pages = sum(row["page_count"] for row in rendered_rows)
    print(f"P23_SALVAGE_REVIEW_CONTEXT_A rows={len(rendered_rows)} pages={total_pages} dpi={RENDER_DPI} reviewed=0 no_promotion=true")


if __name__ == "__main__":
    main()
