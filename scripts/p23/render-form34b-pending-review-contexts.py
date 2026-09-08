#!/usr/bin/env python3
"""Render wider governed Form 34B contexts for rows still awaiting source review.

This stage consumes only the already-validated denominator-anchor recovery queue. It
re-downloads the exact official IEBC Form 34B PDF, requires the queued source digest
to match, and renders both the complete anchor page and a generous full-width window
around the denominator anchor. It performs no OCR transcription and authorizes no
source verification or canonical promotion.
"""

import argparse
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path

ROOT = Path.cwd()
BASE_SCRIPT = ROOT / "scripts/p23/probe-form34b-grid-smoke.py"
DPI = 250
VERTICAL_PADDING = 320
OFFICIAL_PREFIX = "https://forms.iebc.or.ke/"


def fail(message):
    raise SystemExit(message)


def load_base():
    spec = importlib.util.spec_from_file_location("p23_grid_smoke_base", BASE_SCRIPT)
    if spec is None or spec.loader is None:
        fail(f"Unable to import governed grid smoke helper: {BASE_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def render_png(pdf, page, output_path, crop=None):
    prefix = output_path.with_suffix("")
    command = [
        "pdftoppm",
        "-f", str(page),
        "-l", str(page),
        "-singlefile",
        "-png",
        "-r", str(DPI),
    ]
    if crop is not None:
        command.extend([
            "-x", str(crop["x0"]),
            "-y", str(crop["y0"]),
            "-W", str(max(1, crop["x1"] - crop["x0"])),
            "-H", str(max(1, crop["y1"] - crop["y0"])),
        ])
    command.extend([str(pdf), str(prefix)])
    subprocess.run(
        command,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    rendered = Path(f"{prefix}.png")
    if rendered != output_path and rendered.exists():
        rendered.replace(output_path)
    if not output_path.exists():
        fail(f"Failed to render Form 34B review context for page {page}")


def main():
    parser = argparse.ArgumentParser(description="Render wider contexts for pending governed Form 34B source-review rows.")
    parser.add_argument("--queue", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--context-dir", required=True)
    args = parser.parse_args()

    queue_path = Path(args.queue)
    queue = json.loads(queue_path.read_text(encoding="utf-8"))
    if queue.get("schema_version") != "kda.p23.form34b.source-row-recovery-queue.v1":
        fail("Unexpected source-row recovery queue schema")
    if queue.get("source_verified_values") != 0 or queue.get("promotion_authorized") is not False:
        fail("Recovery queue already crossed the source-verification or promotion boundary")
    queue_rows = queue.get("queue") or []
    if int(queue.get("rows", -1)) != len(queue_rows):
        fail("Recovery queue row count mismatch")

    base = load_base()
    opener = base.session()
    workroot = Path("/tmp/p23-form34b-pending-review-context-work")
    context_dir = Path(args.context_dir)
    workroot.mkdir(parents=True, exist_ok=True)
    context_dir.mkdir(parents=True, exist_ok=True)

    rendered_rows = []
    seen_codes = set()
    for row in queue_rows:
        code = int(row.get("constituency_code") or 0)
        if not 1 <= code <= 290 or code in seen_codes:
            fail(f"Invalid or duplicate pending constituency code {code}")
        seen_codes.add(code)
        source_url = str(row.get("source_url") or "")
        expected_pdf_sha = str(row.get("source_pdf_sha256") or "")
        anchor = row.get("denominator_anchor") or {}
        page = int(anchor.get("page_number") or 0)
        bbox = anchor.get("bbox_250") or {}
        if not source_url.startswith(OFFICIAL_PREFIX):
            fail(f"Constituency {code}: source is not an official IEBC Form 34B URL")
        if len(expected_pdf_sha) != 64:
            fail(f"Constituency {code}: queued source PDF digest is invalid")
        if page < 1 or not all(isinstance(bbox.get(key), int) for key in ("x0", "y0", "x1", "y1")):
            fail(f"Constituency {code}: queued denominator anchor geometry is invalid")

        workdir = workroot / f"con-{code:03d}"
        workdir.mkdir(parents=True, exist_ok=True)
        pdf = workdir / f"form34b-{code:03d}.pdf"
        base.download_pdf(opener, source_url, pdf)
        actual_pdf_sha = sha256_file(pdf)
        if actual_pdf_sha != expected_pdf_sha:
            fail(f"Constituency {code}: official PDF digest changed from the governed recovery queue")
        pages = base.pdf_pages(pdf)
        if page > pages or int(row.get("page_count") or pages) != pages:
            fail(f"Constituency {code}: queued page count or anchor page changed")

        pgm = base.render_page(pdf, page, workdir / f"page-{page}")
        width, height, _ = base.load_sample_probe().read_pgm(pgm)
        if bbox["x0"] < 0 or bbox["y0"] < 0 or bbox["x1"] > width or bbox["y1"] > height:
            fail(f"Constituency {code}: denominator anchor falls outside the rendered page")

        wide_crop = {
            "x0": 0,
            "y0": max(0, bbox["y0"] - VERTICAL_PADDING),
            "x1": width,
            "y1": min(height, bbox["y1"] + VERTICAL_PADDING),
        }
        wide_path = context_dir / f"con-{code:03d}-pending-review-wide.png"
        page_path = context_dir / f"con-{code:03d}-pending-review-page.png"
        render_png(pdf, page, wide_path, wide_crop)
        render_png(pdf, page, page_path)

        rendered_rows.append({
            "constituency_code": code,
            "geo_code": row.get("geo_code"),
            "constituency_name": row.get("constituency_name"),
            "source_url": source_url,
            "source_pdf_sha256": actual_pdf_sha,
            "page_count": pages,
            "canonical_registered_voters": row.get("canonical_registered_voters"),
            "denominator_anchor": anchor,
            "prior_review_context_file": row.get("review_context_file"),
            "prior_review_context_sha256": row.get("review_context_sha256"),
            "wide_review_context_file": wide_path.name,
            "wide_review_context_crop_250": wide_crop,
            "wide_review_context_sha256": sha256_file(wide_path),
            "full_page_review_context_file": page_path.name,
            "full_page_review_context_sha256": sha256_file(page_path),
            "review_requirement": row.get("review_requirement"),
            "verification_state": "pending_independent_visual_source_image_review",
            "source_verified_values": 0,
            "promotion_authorized": False,
        })

    document = {
        "schema_version": "kda.p23.form34b.pending-source-review-contexts.v1",
        "purpose": "Wider and full-page source-review preparation for the exact current recovery queue. Rendering only: no OCR transcription, source verification, arithmetic completion or canonical promotion.",
        "queue_sha256": sha256_file(queue_path),
        "rows_rendered": len(rendered_rows),
        "render_dpi": DPI,
        "vertical_padding_pixels": VERTICAL_PADDING,
        "source_verified_values": 0,
        "promotion_authorized": False,
        "turnout_values_extracted": 0,
        "rows": rendered_rows,
    }
    Path(args.output).write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        "P23_FORM34B_PENDING_REVIEW_CONTEXTS "
        f"rows={len(rendered_rows)} source_verified_values=0 promotion_authorized=false turnout_values_extracted=0"
    )


if __name__ == "__main__":
    main()
