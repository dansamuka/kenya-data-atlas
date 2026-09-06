#!/usr/bin/env python3
"""Capped multi-form adaptive Form 34B machine-candidate diagnostic.

This extends the already-governed adaptive grid smoke across an explicit manifest
slice without changing any extraction thresholds, source-verification rules, or
promotion policy. Candidate values are retained only for diagnostic review; no
field is source-verified and no turnout observation is promoted by this script.
"""

import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path.cwd()
ADAPTIVE_SCRIPT = ROOT / "scripts/p23/probe-form34b-adaptive-grid-smoke.py"


def fail(message):
    raise SystemExit(message)


def load_adaptive():
    spec = importlib.util.spec_from_file_location("p23_adaptive_grid_smoke", ADAPTIVE_SCRIPT)
    if spec is None or spec.loader is None:
        fail(f"Unable to import governed adaptive grid helper: {ADAPTIVE_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(
        description="Run the governed adaptive Form 34B machine-candidate diagnostic over one capped manifest slice."
    )
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", default="/tmp/p23-form34b-adaptive-grid-batch.json")
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int, default=25)
    args = parser.parse_args()

    if not 1 <= args.limit <= 25:
        fail("Adaptive candidate batch limit must remain between 1 and 25")
    if args.offset < 0 or args.offset >= 290 or args.offset + args.limit > 290:
        fail("Adaptive candidate batch offset/limit must remain within the governed 290-row manifest")

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    rows = manifest.get("rows") or []
    if len(rows) != 290 or manifest.get("promotion_state") != "source_reference_manifest_complete":
        fail("Governed 290-row source-reference manifest is not complete")

    adaptive = load_adaptive()
    base = adaptive.load_base()
    base.discover_final_rows = adaptive.make_adaptive_discover(base)
    sample = base.load_sample_probe()
    denominators = base.load_denominators()
    opener = base.session()

    workroot = Path(f"/tmp/p23-form34b-adaptive-grid-batch-{args.offset:03d}")
    workroot.mkdir(parents=True, exist_ok=True)
    results = []

    for source in rows[args.offset:args.offset + args.limit]:
        code = int(source.get("constituency_code") or 0)
        urls = source.get("download_urls") or []
        if code not in denominators or len(urls) != 1:
            fail(f"Adaptive candidate source row invalid for constituency code {code}")

        workdir = workroot / f"con-{code:03d}"
        workdir.mkdir(parents=True, exist_ok=True)
        pdf = workdir / f"form34b-{code:03d}.pdf"
        base.download_pdf(opener, urls[0], pdf)
        pages = base.pdf_pages(pdf)
        hits, diagnostics = base.discover_final_rows(sample, pdf, pages, denominators[code], workdir)

        record = {
            "constituency_code": code,
            "geo_code": source.get("geo_code"),
            "constituency_name": source.get("constituency_name"),
            "form_download_id": (source.get("form_download_ids") or [None])[0],
            "source_url": urls[0],
            "source_pdf_sha256": base.sha256_file(pdf),
            "page_count": pages,
            "page_diagnostics": diagnostics,
            "final_rows_found": len(hits),
            "verification_state": "unresolved",
            "source_verified_values": 0,
            "promotion_authorized": False,
        }

        if len(hits) == 1:
            selected, evidence = base.extract_fields(sample, hits[0], workdir)
            registered = selected.get("registered_voters")
            valid = selected.get("total_valid_votes")
            rejected = selected.get("rejected_ballots")
            denominator_match = registered == denominators[code]
            arithmetic_ok = (
                all(value is not None for value in (registered, valid, rejected))
                and 0 <= valid + rejected <= registered
            )
            turnout_range_ok = (
                arithmetic_ok and 0 <= 100.0 * (valid + rejected) / registered <= 100
            )
            strong = denominator_match and arithmetic_ok and turnout_range_ok
            record.update({
                "verification_state": "strong_machine_candidate" if strong else "machine_candidate_needs_review",
                "total_row_page": hits[0]["page_number"],
                "detection_profile": hits[0].get("detection_profile"),
                "field_evidence": evidence,
                "denominator_match": denominator_match,
                "arithmetic_ok": arithmetic_ok,
                "turnout_range_ok": turnout_range_ok,
            })
        else:
            record["unresolved_reason"] = (
                "no_denominator_matched_final_row" if not hits else "ambiguous_denominator_matched_rows"
            )

        results.append(record)

    strong_count = sum(row["verification_state"] == "strong_machine_candidate" for row in results)
    unresolved_count = sum(row["verification_state"] == "unresolved" for row in results)
    review_count = sum(row["verification_state"] == "machine_candidate_needs_review" for row in results)
    document = {
        "schema_version": "kda.p23.form34b.adaptive-grid-batch.v1",
        "purpose": "Capped adaptive machine-candidate extraction across an explicit official Form 34B manifest slice. Candidate readings remain non-promotable pending independent source-image verification.",
        "batch_offset": args.offset,
        "rows_processed": len(results),
        "strong_machine_candidates": strong_count,
        "machine_candidates_needing_review": review_count,
        "unresolved_rows": unresolved_count,
        "source_verified_values": 0,
        "promotion_authorized": False,
        "rows": results,
    }
    Path(args.output).write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        "P23_FORM34B_ADAPTIVE_GRID_BATCH "
        f"offset={args.offset} rows={len(results)} strong={strong_count} review={review_count} "
        f"unresolved={unresolved_count} source_verified_values=0 promotion_authorized=false"
    )
    print(
        "P23_FORM34B_ADAPTIVE_GRID_BATCH_PROFILES "
        f"attempts={dict(adaptive.PROFILE_ATTEMPTS)} grids={dict(adaptive.PROFILE_GRIDS)} "
        f"denominator_hits={dict(adaptive.PROFILE_DENOMINATOR_HITS)} "
        "source_verified_values=0 promotion_authorized=false"
    )


if __name__ == "__main__":
    main()
