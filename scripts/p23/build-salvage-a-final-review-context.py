#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib
from PIL import Image

RENDER_DPI = 250
SPECS = [
    {"geo_code":"KEN-C005-CON022","name":"Lamu West","form_id":277650,"page":2,"slug":"lamu-west"},
    {"geo_code":"KEN-C006-CON023","name":"Taveta","form_id":277651,"page":2,"slug":"taveta"},
    {"geo_code":"KEN-C006-CON024","name":"Wundanyi","form_id":277652,"page":1,"slug":"wundanyi"},
]


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--download-manifest", required=True)
    p.add_argument("--pdf-dir", required=True)
    p.add_argument("--image-dir", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--workflow-run-id", type=int, required=True)
    p.add_argument("--workflow-head-sha", required=True)
    args = p.parse_args()

    download = json.loads(pathlib.Path(args.download_manifest).read_text(encoding="utf-8"))
    rows = {r.get("geo_code"): r for r in download.get("rows", [])}
    out_rows = []
    for spec in SPECS:
        row = rows.get(spec["geo_code"])
        if not row:
            raise SystemExit(f"fresh-download manifest missing {spec['geo_code']}")
        if row.get("state") != "fresh_official_source_downloaded_unreviewed":
            raise SystemExit(f"{spec['geo_code']} was not freshly downloaded")
        if row.get("form_id") != spec["form_id"]:
            raise SystemExit(f"{spec['geo_code']} form id drifted")

        pdf = pathlib.Path(args.pdf_dir) / f"{spec['geo_code']}-form34b.pdf"
        image = pathlib.Path(args.image_dir) / f"{spec['slug']}-page{spec['page']}-250dpi.png"
        pdf_hash = sha256_file(pdf)
        if pdf_hash != row.get("source_pdf_sha256"):
            raise SystemExit(f"{spec['geo_code']} fresh PDF hash mismatch")
        im = Image.open(image)
        out_rows.append({
            "geo_code": spec["geo_code"],
            "name": spec["name"],
            "form_id": spec["form_id"],
            "source_url": row.get("source_url"),
            "fresh_download_state": row.get("state"),
            "source_pdf_sha256": pdf_hash,
            "page_number": spec["page"],
            "render_dpi": RENDER_DPI,
            "full_page_image_sha256": sha256_file(image),
            "width_px": im.width,
            "height_px": im.height,
            "workflow_run_id": args.workflow_run_id,
            "workflow_head_sha": args.workflow_head_sha,
        })

    manifest = {
        "schema_version": "kda.p23.form34b.salvage-a-final-review-contexts.v1",
        "as_of": "2026-09-13",
        "purpose": "Prepare fresh exactly-250-DPI full-page review contexts for the final three salvage-A rows without extracting or promoting any result value.",
        "governance": {
            "fresh_official_download_required": True,
            "fresh_hashes_only": True,
            "no_inheritance": True,
            "no_result_value_extraction": True,
            "no_ocr_result_promotion": True,
            "promotion_authorized": False,
            "contexts_are_evidence_locators_only_until_independent_visual_review": True,
        },
        "rows": out_rows,
    }
    pathlib.Path(args.output).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("P23_SALVAGE_A_FINAL_REVIEW_CONTEXT_OK rows=3 dpi=250 no_values=true no_promotion=true")


if __name__ == "__main__":
    main()
