#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib
from PIL import Image

MVITA_GEO_CODE = "KEN-C001-CON006"
MVITA_FORM_ID = 277634
REVIEW_PAGE = 3
RENDER_DPI = 250
# Exact pixel rectangle on the 250-DPI page-3 raster. It retains the final
# ordinary polling-station rows, KINGORANI PRISON, and the green TOTAL row.
# This is source-location metadata only; no values are extracted by this script.
CROP_BOX = (180, 1550, 2740, 1800)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--download-manifest", required=True)
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--page-png", required=True)
    parser.add_argument("--crop-png", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--workflow-run-id", type=int, required=True)
    parser.add_argument("--workflow-head-sha", required=True)
    args = parser.parse_args()

    download_manifest = json.loads(pathlib.Path(args.download_manifest).read_text(encoding="utf-8"))
    row = next((r for r in download_manifest.get("rows", []) if r.get("geo_code") == MVITA_GEO_CODE), None)
    if not row:
        raise SystemExit("fresh-download manifest does not contain Mvita")
    if row.get("state") != "fresh_official_source_downloaded_unreviewed":
        raise SystemExit("Mvita was not freshly downloaded as an official PDF")
    if row.get("form_id") != MVITA_FORM_ID:
        raise SystemExit("Mvita form id drifted from governed source-index locator")

    pdf_path = pathlib.Path(args.pdf)
    page_path = pathlib.Path(args.page_png)
    crop_path = pathlib.Path(args.crop_png)
    if sha256_file(pdf_path) != row.get("source_pdf_sha256"):
        raise SystemExit("fresh Mvita PDF bytes do not match fresh-download manifest hash")

    page = Image.open(page_path)
    if page.width < CROP_BOX[2] or page.height < CROP_BOX[3]:
        raise SystemExit(f"250-DPI page raster unexpectedly small: {page.width}x{page.height}")
    crop = page.crop(CROP_BOX)
    crop.save(crop_path, format="PNG")

    manifest = {
        "schema_version": "kda.p23.form34b.machine-review-contexts.v1",
        "as_of": "2026-09-13",
        "purpose": "Record a reproducible fresh 250-DPI visual-review context for Mvita Form 34B without extracting, verifying, or promoting any result value.",
        "geo_code": MVITA_GEO_CODE,
        "constituency_code": 6,
        "constituency_name": "Mvita",
        "form_id": MVITA_FORM_ID,
        "source_url": row.get("source_url"),
        "source_pdf_sha256": row.get("source_pdf_sha256"),
        "fresh_download_state": row.get("state"),
        "page_number": REVIEW_PAGE,
        "render_dpi": RENDER_DPI,
        "full_page_image_sha256": sha256_file(page_path),
        "review_context_sha256": sha256_file(crop_path),
        "crop_box_250dpi_pixels": list(CROP_BOX),
        "workflow_run_id": args.workflow_run_id,
        "workflow_head_sha": args.workflow_head_sha,
        "governance": {
            "fresh_official_download_required": True,
            "fresh_hashes_only": True,
            "no_inheritance": True,
            "no_result_value_extraction": True,
            "no_ocr_result_promotion": True,
            "promotion_authorized": False,
            "review_context_is_evidence_locator_only_until_independent_visual_review": True
        }
    }
    pathlib.Path(args.output).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(
        "P23_MVITA_FRESH_REVIEW_CONTEXT_OK "
        f"page={REVIEW_PAGE} dpi={RENDER_DPI} "
        f"source_pdf_sha256={manifest['source_pdf_sha256']} "
        f"review_context_sha256={manifest['review_context_sha256']} no_promotion=true"
    )


if __name__ == "__main__":
    main()
