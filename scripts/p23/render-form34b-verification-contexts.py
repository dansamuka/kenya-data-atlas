#!/usr/bin/env python3
"""Render official Form 34B source-image review contexts for pending strong candidates.

This is a review-preparation step only. It re-downloads each queued official IEBC Form 34B,
checks the governed source digest, reproduces the unique denominator-matched final TOTAL row,
and verifies that the machine candidates exactly match the queue before rendering review images.
No field is source-verified and no promotion is authorised by this script.
"""

import argparse
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path

ROOT = Path.cwd()
ADAPTIVE_SCRIPT = ROOT / "scripts/p23/probe-form34b-adaptive-grid-smoke.py"
DPI = 250
TARGET_FIELDS = ("registered_voters", "total_valid_votes", "rejected_ballots")


def fail(message):
    raise SystemExit(message)


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_adaptive():
    spec = importlib.util.spec_from_file_location("p23_adaptive_grid_smoke", ADAPTIVE_SCRIPT)
    if spec is None or spec.loader is None:
        fail(f"Unable to import governed adaptive grid helper: {ADAPTIVE_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def render_full_page(pdf, page, output_path):
    prefix = output_path.with_suffix("")
    subprocess.run(
        [
            "pdftoppm", "-f", str(page), "-l", str(page), "-singlefile",
            "-png", "-r", str(DPI), str(pdf), str(prefix),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    rendered = Path(f"{prefix}.png")
    if rendered != output_path and rendered.exists():
        rendered.replace(output_path)
    if not output_path.exists():
        fail(f"Failed to render full review page {page}")


def render_total_row_context(pdf, page, width, height, hit, output_path):
    rules = hit["rules"]
    x0 = max(0, int(rules[0]) - 20)
    x1 = min(width, int(rules[-1]) + 20)
    y0 = max(0, int(hit["row_top"]) - 90)
    y1 = min(height, int(hit["row_bottom"]) + 90)
    if x1 <= x0 or y1 <= y0:
        fail(f"Invalid TOTAL-row review crop for page {page}")
    prefix = output_path.with_suffix("")
    subprocess.run(
        [
            "pdftoppm", "-f", str(page), "-l", str(page), "-singlefile",
            "-png", "-r", str(DPI),
            "-x", str(x0), "-y", str(y0), "-W", str(x1 - x0), "-H", str(y1 - y0),
            str(pdf), str(prefix),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    rendered = Path(f"{prefix}.png")
    if rendered != output_path and rendered.exists():
        rendered.replace(output_path)
    if not output_path.exists():
        fail(f"Failed to render TOTAL-row review context for page {page}")
    return {"x0": x0, "y0": y0, "x1": x1, "y1": y1}


def main():
    parser = argparse.ArgumentParser(description="Render source-image contexts for the P23 Form 34B verification queue.")
    parser.add_argument("--queue", required=True)
    parser.add_argument("--output-dir", default="/tmp/p23-form34b-verification-contexts")
    parser.add_argument("--manifest", default="/tmp/p23-form34b-verification-contexts.json")
    args = parser.parse_args()

    queue = json.loads(Path(args.queue).read_text(encoding="utf-8"))
    if queue.get("schema_version") != "kda.p23.form34b.source-verification-queue.v1":
        fail("Unexpected source-verification queue schema")
    if queue.get("source_verified_values") != 0 or queue.get("promotion_authorized") is not False:
        fail("Source-verification queue promotion boundary changed")
    rows = queue.get("rows") or []
    if queue.get("queue_rows") != len(rows):
        fail("Source-verification queue row count mismatch")
    if len(rows) > 25:
        fail("Verification-context batch must remain capped at 25 queued rows")

    codes = [row.get("constituency_code") for row in rows]
    if any(not isinstance(code, int) or not 1 <= code <= 290 for code in codes):
        fail("Invalid constituency code in source-verification queue")
    if codes != sorted(codes) or len(codes) != len(set(codes)):
        fail("Source-verification queue codes must be unique and deterministic")

    adaptive = load_adaptive()
    base = adaptive.load_base()
    base.discover_final_rows = adaptive.make_adaptive_discover(base)
    sample = base.load_sample_probe()
    denominators = base.load_denominators()
    opener = base.session()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    workroot = Path("/tmp/p23-form34b-verification-context-work")
    workroot.mkdir(parents=True, exist_ok=True)
    records = []

    for queued in rows:
        code = queued["constituency_code"]
        if queued.get("verification_state") != "pending_source_verification":
            fail(f"Queue row {code} is not pending_source_verification")
        if queued.get("source_verified_values") != 0 or queued.get("promotion_authorized") is not False:
            fail(f"Queue row {code} promotion boundary changed")
        source_url = queued.get("source_url") or ""
        expected_sha = queued.get("source_pdf_sha256") or ""
        if not source_url.startswith("https://forms.iebc.or.ke/"):
            fail(f"Queue row {code} is not an official IEBC source")
        if len(expected_sha) != 64:
            fail(f"Queue row {code} has invalid source digest")

        workdir = workroot / f"con-{code:03d}"
        workdir.mkdir(parents=True, exist_ok=True)
        pdf = workdir / f"form34b-{code:03d}.pdf"
        base.download_pdf(opener, source_url, pdf)
        actual_sha = sha256_file(pdf)
        if actual_sha != expected_sha:
            fail(f"Official source digest changed for constituency {code}")

        pages = base.pdf_pages(pdf)
        hits, diagnostics = base.discover_final_rows(sample, pdf, pages, denominators[code], workdir)
        if len(hits) != 1:
            fail(f"Verification queue row {code} no longer has exactly one denominator-matched TOTAL row: {len(hits)}")
        hit = hits[0]
        page = int(hit["page_number"])
        if page != int(queued.get("total_row_page") or 0):
            fail(f"TOTAL-row page changed for constituency {code}")

        selected, reproduced_evidence = base.extract_fields(sample, hit, workdir)
        queued_evidence = queued.get("candidate_evidence") or {}
        for field in TARGET_FIELDS:
            queued_item = queued_evidence.get(field) or {}
            if queued_item.get("verification_state") != "machine_candidate":
                fail(f"Queue row {code} field {field} is not machine_candidate")
            if queued_item.get("verified_value") is not None or queued_item.get("verification_method") is not None:
                fail(f"Queue row {code} field {field} already contains source verification")
            expected_value = queued_item.get("machine_transcription")
            if not isinstance(expected_value, int):
                fail(f"Queue row {code} field {field} lacks integer machine candidate")
            if selected.get(field) != expected_value:
                fail(f"Reproduced machine candidate changed for constituency {code} field {field}")
            reproduced = reproduced_evidence.get(field) or {}
            if reproduced.get("machine_transcription") != expected_value:
                fail(f"Reproduced evidence changed for constituency {code} field {field}")

        width, height, _ = sample.read_pgm(Path(hit["pgm"]))
        page_path = output_dir / f"con-{code:03d}-page-{page}.png"
        context_path = output_dir / f"con-{code:03d}-total-row-page-{page}.png"
        render_full_page(pdf, page, page_path)
        crop = render_total_row_context(pdf, page, width, height, hit, context_path)

        records.append({
            "constituency_code": code,
            "geo_code": queued.get("geo_code"),
            "constituency_name": queued.get("constituency_name"),
            "form_download_id": queued.get("form_download_id"),
            "source_url": source_url,
            "source_pdf_sha256": actual_sha,
            "page_count": pages,
            "total_row_page": page,
            "detection_profile": hit.get("detection_profile"),
            "page_diagnostics": diagnostics,
            "candidate_evidence": queued_evidence,
            "machine_reconciliation": queued.get("machine_reconciliation"),
            "full_page_context_file": page_path.name,
            "full_page_context_sha256": sha256_file(page_path),
            "total_row_context_file": context_path.name,
            "total_row_context_sha256": sha256_file(context_path),
            "total_row_context_crop_250": crop,
            "render_dpi": DPI,
            "review_requirement": {
                "reviewer_class": "independent_visual_source_image_review",
                "required_fields": list(TARGET_FIELDS),
                "total_row_label_must_be_visually_confirmed": True,
                "verified_values_must_come_from_visual_source_read": True,
            },
            "verification_state": "source_context_only",
            "source_verified_values": 0,
            "promotion_authorized": False,
        })

    document = {
        "schema_version": "kda.p23.form34b.verification-contexts.v1",
        "purpose": "Official source-image review contexts for pending strong Form 34B machine candidates. Rendering and candidate reproduction do not constitute source verification.",
        "queue_schema": queue["schema_version"],
        "queue_rows": len(rows),
        "contexts_rendered": len(records),
        "source_verified_values": 0,
        "promotion_authorized": False,
        "rows": records,
    }
    manifest_path = Path(args.manifest)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        "P23_FORM34B_VERIFICATION_CONTEXTS "
        f"queue_rows={len(rows)} contexts={len(records)} dpi={DPI} "
        "source_verified_values=0 promotion_authorized=false"
    )


if __name__ == "__main__":
    main()
