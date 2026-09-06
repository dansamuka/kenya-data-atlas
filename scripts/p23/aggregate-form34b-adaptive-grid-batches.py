#!/usr/bin/env python3
"""Aggregate governed Form 34B machine-candidate shards into one audit and review queue.

This script is deliberately non-promotional. It combines already-validated adaptive-grid
batch artifacts, verifies exact 1..290 coverage, and emits a source-verification queue for
strong machine candidates. Machine readings remain candidates only; no verified value,
turnout observation, or canonical registry data is created here.
"""

import argparse
import json
from pathlib import Path

EXPECTED_OFFSETS = tuple(range(0, 276, 25))
EXPECTED_COUNTS = {offset: (15 if offset == 275 else 25) for offset in EXPECTED_OFFSETS}
ALLOWED_STATES = {
    "strong_machine_candidate",
    "machine_candidate_needs_review",
    "unresolved",
}
TARGET_FIELDS = ("registered_voters", "total_valid_votes", "rejected_ballots")


def fail(message):
    raise SystemExit(message)


def require_no_promotion(obj, label):
    if obj.get("source_verified_values") != 0 or obj.get("promotion_authorized") is not False:
        fail(f"Promotion boundary changed for {label}")


def main():
    parser = argparse.ArgumentParser(description="Aggregate P23 Form 34B adaptive-grid candidate shards.")
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--aggregate-output", default="/tmp/p23-form34b-candidate-audit.json")
    parser.add_argument("--queue-output", default="/tmp/p23-form34b-source-verification-queue.json")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    files = sorted(input_dir.rglob("p23-form34b-adaptive-grid-rows-*.json"))
    if len(files) != len(EXPECTED_OFFSETS):
        fail(f"Expected 12 candidate shard files, found {len(files)}")

    by_offset = {}
    for path in files:
        doc = json.loads(path.read_text(encoding="utf-8"))
        if doc.get("schema_version") != "kda.p23.form34b.adaptive-grid-batch.v1":
            fail(f"Unexpected shard schema in {path}")
        require_no_promotion(doc, path.name)
        offset = doc.get("batch_offset")
        if offset not in EXPECTED_COUNTS:
            fail(f"Unexpected batch offset {offset} in {path}")
        if offset in by_offset:
            fail(f"Duplicate batch offset {offset}")
        if doc.get("rows_processed") != EXPECTED_COUNTS[offset]:
            fail(f"Unexpected row count for offset {offset}: {doc.get('rows_processed')}")
        rows = doc.get("rows")
        if not isinstance(rows, list) or len(rows) != EXPECTED_COUNTS[offset]:
            fail(f"Rows array mismatch for offset {offset}")
        by_offset[offset] = doc

    if set(by_offset) != set(EXPECTED_OFFSETS):
        fail("Candidate shard offsets do not cover the governed 290-row manifest")

    rows = []
    for offset in EXPECTED_OFFSETS:
        rows.extend(by_offset[offset]["rows"])

    rows.sort(key=lambda row: int(row.get("constituency_code") or 0))
    codes = [row.get("constituency_code") for row in rows]
    if codes != list(range(1, 291)):
        fail("Aggregated candidate rows are not exact deterministic constituency codes 1..290")

    strong = []
    review = []
    unresolved = []
    for row in rows:
        code = row["constituency_code"]
        require_no_promotion(row, f"constituency {code}")
        state = row.get("verification_state")
        if state not in ALLOWED_STATES:
            fail(f"Unexpected candidate state for constituency {code}: {state}")
        source_url = row.get("source_url") or ""
        if not source_url.startswith("https://forms.iebc.or.ke/"):
            fail(f"Non-official source URL for constituency {code}")
        digest = row.get("source_pdf_sha256") or ""
        if len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
            fail(f"Invalid source PDF digest for constituency {code}")

        if state == "strong_machine_candidate":
            if row.get("final_rows_found") != 1:
                fail(f"Strong candidate lacks unique final row for constituency {code}")
            if row.get("denominator_match") is not True or row.get("arithmetic_ok") is not True or row.get("turnout_range_ok") is not True:
                fail(f"Strong candidate reconciliation failed for constituency {code}")
            evidence = row.get("field_evidence") or {}
            for field in TARGET_FIELDS:
                item = evidence.get(field) or {}
                if item.get("verification_state") != "machine_candidate":
                    fail(f"Strong candidate field {field} is not machine_candidate for constituency {code}")
                if not isinstance(item.get("machine_transcription"), int):
                    fail(f"Strong candidate field {field} lacks integer machine transcription for constituency {code}")
                if item.get("verified_value") is not None or item.get("verification_method") is not None:
                    fail(f"Source verification leaked into field {field} for constituency {code}")
            strong.append(row)
        elif state == "machine_candidate_needs_review":
            review.append(row)
        else:
            unresolved.append(row)

    aggregate = {
        "schema_version": "kda.p23.form34b.candidate-audit.v1",
        "purpose": "Complete 290-row audit of governed Form 34B machine-candidate extraction. Machine readings remain non-promotable pending independent source-image verification.",
        "expected_rows": 290,
        "rows_processed": len(rows),
        "summary": {
            "strong_machine_candidates": len(strong),
            "machine_candidates_needing_review": len(review),
            "unresolved_rows": len(unresolved),
        },
        "source_verified_values": 0,
        "promotion_authorized": False,
        "rows": rows,
    }

    queue_rows = []
    for row in strong:
        queue_rows.append({
            "constituency_code": row["constituency_code"],
            "geo_code": row.get("geo_code"),
            "constituency_name": row.get("constituency_name"),
            "form_download_id": row.get("form_download_id"),
            "source_url": row.get("source_url"),
            "source_pdf_sha256": row.get("source_pdf_sha256"),
            "total_row_page": row.get("total_row_page"),
            "detection_profile": row.get("detection_profile"),
            "candidate_evidence": row.get("field_evidence"),
            "machine_reconciliation": {
                "denominator_match": True,
                "arithmetic_ok": True,
                "turnout_range_ok": True,
            },
            "verification_state": "pending_source_verification",
            "source_verified_values": 0,
            "promotion_authorized": False,
        })

    queue = {
        "schema_version": "kda.p23.form34b.source-verification-queue.v1",
        "purpose": "Source-image verification queue for strong Form 34B machine candidates. Inclusion in this queue does not verify or promote any candidate value.",
        "source_audit_schema": aggregate["schema_version"],
        "queue_rows": len(queue_rows),
        "source_verified_values": 0,
        "promotion_authorized": False,
        "rows": queue_rows,
    }

    aggregate_path = Path(args.aggregate_output)
    queue_path = Path(args.queue_output)
    aggregate_path.parent.mkdir(parents=True, exist_ok=True)
    queue_path.parent.mkdir(parents=True, exist_ok=True)
    aggregate_path.write_text(json.dumps(aggregate, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    queue_path.write_text(json.dumps(queue, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        "P23_FORM34B_CANDIDATE_AUDIT "
        f"rows=290 strong={len(strong)} review={len(review)} unresolved={len(unresolved)} "
        "source_verified_values=0 promotion_authorized=false"
    )
    print(
        "P23_FORM34B_SOURCE_VERIFICATION_QUEUE "
        f"rows={len(queue_rows)} verification_state=pending_source_verification "
        "source_verified_values=0 promotion_authorized=false"
    )


if __name__ == "__main__":
    main()
