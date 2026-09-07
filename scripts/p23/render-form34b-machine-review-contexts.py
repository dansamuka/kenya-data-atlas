#!/usr/bin/env python3
"""Render official Form 34B contexts for machine candidates that still need review.

This is a deliberately non-promotional review-preparation step. It selects only
`machine_candidate_needs_review` rows from the governed 290-row candidate audit,
re-downloads the exact IEBC source, verifies the PDF digest, reproduces the unique
denominator-matched TOTAL row and field-readability states, then renders full-page and
TOTAL-row images for independent visual review.

A rendered context is not source verification. Missing/unreadable machine fields remain
missing; no verified value, turnout observation, or canonical registry data is created.
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
ALLOWED_FIELD_STATES = {"machine_candidate", "source_unreadable"}


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
    parser = argparse.ArgumentParser(description="Render source-image contexts for P23 Form 34B machine-review rows.")
    parser.add_argument("--audit", required=True)
    parser.add_argument("--output-dir", default="/tmp/p23-form34b-machine-review-contexts")
    parser.add_argument("--manifest", default="/tmp/p23-form34b-machine-review-contexts.json")
    args = parser.parse_args()

    audit = json.loads(Path(args.audit).read_text(encoding="utf-8"))
    if audit.get("schema_version") != "kda.p23.form34b.candidate-audit.v1":
        fail("Unexpected candidate-audit schema")
    if audit.get("expected_rows") != 290 or audit.get("rows_processed") != 290:
        fail("Candidate audit must cover exactly 290 rows")
    if audit.get("source_verified_values") != 0 or audit.get("promotion_authorized") is not False:
        fail("Candidate-audit promotion boundary changed")

    audit_rows = audit.get("rows") or []
    if len(audit_rows) != 290:
        fail("Candidate-audit rows length mismatch")
    rows = [row for row in audit_rows if row.get("verification_state") == "machine_candidate_needs_review"]
    if audit.get("summary", {}).get("machine_candidates_needing_review") != len(rows):
        fail("Machine-review count disagrees with candidate-audit summary")
    if len(rows) > 25:
        fail("Machine-review context batch must remain capped at 25 rows")

    codes = [row.get("constituency_code") for row in rows]
    if any(not isinstance(code, int) or not 1 <= code <= 290 for code in codes):
        fail("Invalid constituency code in machine-review set")
    if codes != sorted(codes) or len(codes) != len(set(codes)):
        fail("Machine-review constituency codes must be unique and deterministic")

    adaptive = load_adaptive()
    base = adaptive.load_base()
    base.discover_final_rows = adaptive.make_adaptive_discover(base)
    sample = base.load_sample_probe()
    denominators = base.load_denominators()
    opener = base.session()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    workroot = Path("/tmp/p23-form34b-machine-review-context-work")
    workroot.mkdir(parents=True, exist_ok=True)
    records = []

    for candidate in rows:
        code = candidate["constituency_code"]
        if candidate.get("source_verified_values") != 0 or candidate.get("promotion_authorized") is not False:
            fail(f"Machine-review row {code} promotion boundary changed")
        if candidate.get("final_rows_found") != 1 or candidate.get("denominator_match") is not True:
            fail(f"Machine-review row {code} no longer has one denominator-matched TOTAL row")
        source_url = candidate.get("source_url") or ""
        expected_sha = candidate.get("source_pdf_sha256") or ""
        if not source_url.startswith("https://forms.iebc.or.ke/"):
            fail(f"Machine-review row {code} is not an official IEBC source")
        if len(expected_sha) != 64 or any(char not in "0123456789abcdef" for char in expected_sha):
            fail(f"Machine-review row {code} has invalid source digest")

        candidate_evidence = candidate.get("field_evidence") or {}
        unreadable_fields = []
        for field in TARGET_FIELDS:
            item = candidate_evidence.get(field) or {}
            state = item.get("verification_state")
            if state not in ALLOWED_FIELD_STATES:
                fail(f"Machine-review row {code} field {field} has unexpected evidence state {state}")
            if item.get("verified_value") is not None or item.get("verification_method") is not None:
                fail(f"Machine-review row {code} field {field} contains source verification")
            value = item.get("machine_transcription")
            if state == "machine_candidate" and not isinstance(value, int):
                fail(f"Machine-review row {code} field {field} lacks integer machine transcription")
            if state == "source_unreadable":
                if value is not None:
                    fail(f"Machine-review row {code} unreadable field {field} leaked a transcription")
                unreadable_fields.append(field)
        if not unreadable_fields:
            fail(f"Machine-review row {code} has no unreadable target field")

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
            fail(f"Machine-review row {code} no longer has exactly one denominator-matched TOTAL row: {len(hits)}")
        hit = hits[0]
        page = int(hit["page_number"])
        if page != int(candidate.get("total_row_page") or 0):
            fail(f"TOTAL-row page changed for constituency {code}")

        selected, reproduced_evidence = base.extract_fields(sample, hit, workdir)
        for field in TARGET_FIELDS:
            expected = candidate_evidence[field]
            reproduced = reproduced_evidence.get(field) or {}
            if reproduced.get("verification_state") != expected.get("verification_state"):
                fail(f"Reproduced readability state changed for constituency {code} field {field}")
            if selected.get(field) != expected.get("machine_transcription"):
                fail(f"Reproduced field selection changed for constituency {code} field {field}")
            if reproduced.get("machine_transcription") != expected.get("machine_transcription"):
                fail(f"Reproduced field evidence changed for constituency {code} field {field}")

        width, height, _ = sample.read_pgm(Path(hit["pgm"]))
        page_path = output_dir / f"con-{code:03d}-page-{page}.png"
        context_path = output_dir / f"con-{code:03d}-total-row-page-{page}.png"
        render_full_page(pdf, page, page_path)
        crop = render_total_row_context(pdf, page, width, height, hit, context_path)

        records.append({
            "constituency_code": code,
            "geo_code": candidate.get("geo_code"),
            "constituency_name": candidate.get("constituency_name"),
            "form_download_id": candidate.get("form_download_id"),
            "source_url": source_url,
            "source_pdf_sha256": actual_sha,
            "page_count": pages,
            "total_row_page": page,
            "detection_profile": hit.get("detection_profile"),
            "page_diagnostics": diagnostics,
            "candidate_evidence": candidate_evidence,
            "unreadable_fields": unreadable_fields,
            "machine_reconciliation": {
                "denominator_match": candidate.get("denominator_match"),
                "arithmetic_ok": candidate.get("arithmetic_ok"),
                "turnout_range_ok": candidate.get("turnout_range_ok"),
            },
            "full_page_context_file": page_path.name,
            "full_page_context_sha256": sha256_file(page_path),
            "total_row_context_file": context_path.name,
            "total_row_context_sha256": sha256_file(context_path),
            "total_row_context_crop_250": crop,
            "render_dpi": DPI,
            "review_requirement": {
                "reviewer_class": "independent_visual_source_image_review",
                "required_fields": list(TARGET_FIELDS),
                "mandatory_visual_transcription_fields": unreadable_fields,
                "total_row_label_must_be_visually_confirmed": True,
                "verified_values_must_come_from_visual_source_read": True,
                "row_reconciliation_must_be_recomputed_after_source_read": True,
            },
            "verification_state": "machine_review_context_only",
            "source_verified_values": 0,
            "promotion_authorized": False,
        })

    document = {
        "schema_version": "kda.p23.form34b.machine-review-contexts.v1",
        "purpose": "Official source-image contexts for Form 34B machine-candidate rows with one denominator-matched TOTAL row but unreadable target fields. Rendering does not constitute source verification.",
        "candidate_audit_schema": audit["schema_version"],
        "review_rows": len(rows),
        "contexts_rendered": len(records),
        "source_verified_values": 0,
        "promotion_authorized": False,
        "rows": records,
    }
    manifest_path = Path(args.manifest)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        "P23_FORM34B_MACHINE_REVIEW_CONTEXTS "
        f"review_rows={len(rows)} contexts={len(records)} dpi={DPI} "
        "source_verified_values=0 promotion_authorized=false"
    )


if __name__ == "__main__":
    main()
