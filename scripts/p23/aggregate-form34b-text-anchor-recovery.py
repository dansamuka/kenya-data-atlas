#!/usr/bin/env python3
"""Aggregate the governed Form 34B textual-label recovery shards.

The aggregate audit covers all 290 territorial constituencies. The review queue
contains only still-unreviewed rows that lacked a unique exact-denominator anchor
and for which the label-only OCR lane found a likely final aggregation / voter
turnout page. It remains a review locator: no turnout value is carried or promoted.
"""

import argparse
import json
from pathlib import Path

EXPECTED_OFFSETS = list(range(0, 276, 25))
EXPECTED_LIMITS = {offset: (15 if offset == 275 else 25) for offset in EXPECTED_OFFSETS}


def fail(message):
    raise SystemExit(message)


def read_shards(input_dir):
    shards = []
    for path in sorted(Path(input_dir).rglob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        if doc.get("schema_version") == "kda.p23.form34b.text-anchor-recovery.v1":
            shards.append((path, doc))
    if len(shards) != 12:
        fail(f"Expected exactly 12 governed text-anchor recovery shards, found {len(shards)}")
    return shards


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--audit-output", required=True)
    parser.add_argument("--queue-output", required=True)
    args = parser.parse_args()

    shards = read_shards(args.input_dir)
    rows = []
    seen_offsets = set()
    seen_codes = set()
    for path, doc in shards:
        offset = int(doc.get("batch_offset", -1))
        if offset not in EXPECTED_LIMITS or offset in seen_offsets:
            fail(f"Unexpected or duplicate text-anchor shard offset {offset}: {path}")
        seen_offsets.add(offset)
        expected = EXPECTED_LIMITS[offset]
        shard_rows = doc.get("rows") or []
        if int(doc.get("rows_processed", -1)) != expected or len(shard_rows) != expected:
            fail(f"Text-anchor shard offset {offset} row count changed: expected {expected}, got {len(shard_rows)}")
        if doc.get("source_verified_values") != 0 or doc.get("promotion_authorized") is not False or doc.get("turnout_values_extracted") != 0:
            fail(f"Text-anchor shard offset {offset} leaked verification, promotion, or turnout values")
        expected_codes = list(range(offset + 1, offset + expected + 1))
        actual_codes = [int(row.get("constituency_code") or 0) for row in shard_rows]
        if actual_codes != expected_codes:
            fail(f"Text-anchor shard offset {offset} constituency ordering changed")
        for row in shard_rows:
            code = int(row.get("constituency_code") or 0)
            if code in seen_codes:
                fail(f"Duplicate constituency code {code}")
            seen_codes.add(code)
            rows.append(row)

    if seen_offsets != set(EXPECTED_OFFSETS):
        fail("Text-anchor recovery shard offset set is incomplete")
    if sorted(seen_codes) != list(range(1, 291)):
        fail("Text-anchor recovery does not cover exact constituency codes 1-290")
    rows.sort(key=lambda row: int(row["constituency_code"]))

    queue = []
    for row in rows:
        if row.get("text_recovery_state") != "label_anchor_candidate":
            continue
        candidates = row.get("review_page_candidates") or []
        if not candidates:
            fail(f"Candidate row {row['constituency_code']} has no review-page candidate")
        best = candidates[0]
        queue.append({
            "constituency_code": row["constituency_code"],
            "geo_code": row.get("geo_code"),
            "constituency_name": row.get("constituency_name"),
            "form_download_id": row.get("form_download_id"),
            "source_url": row.get("source_url"),
            "source_pdf_sha256": row.get("source_pdf_sha256"),
            "page_count": row.get("page_count"),
            "denominator_anchor_state": row.get("denominator_anchor_state"),
            "best_review_page": best,
            "alternate_review_pages": candidates[1:],
            "review_requirement": {
                "reviewer_class": "independent_visual_source_image_review",
                "text_anchor_is_locator_only": True,
                "total_row_label_must_be_visually_confirmed": True,
                "required_visual_transcriptions": [
                    "registered_voters",
                    "four_candidate_vote_totals",
                    "total_valid_votes",
                    "rejected_ballots",
                ],
                "registered_voters_must_equal_governed_denominator": True,
                "candidate_sum_must_reconcile_total_valid_votes": True,
                "row_arithmetic_must_be_recomputed_after_visual_read": True,
                "verified_values_must_come_from_visual_source_read": True,
            },
            "verification_state": "pending_independent_visual_source_image_review",
            "source_verified_values": 0,
            "promotion_authorized": False,
            "turnout_values_extracted": 0,
        })

    targeted = sum(row.get("text_recovery_state") in {"label_anchor_candidate", "no_label_anchor_candidate"} for row in rows)
    no_candidate = sum(row.get("text_recovery_state") == "no_label_anchor_candidate" for row in rows)
    skipped_reviewed = sum(row.get("text_recovery_state") == "skipped_source_reviewed" for row in rows)
    skipped_unique = sum(row.get("text_recovery_state") == "skipped_unique_denominator_anchor" for row in rows)
    audit = {
        "schema_version": "kda.p23.form34b.text-anchor-recovery-audit.v1",
        "purpose": "Complete governed audit of the second Form 34B source-row recovery lane. Fixed textual labels identify likely final source pages only; no turnout value is transcribed, verified, or promoted.",
        "rows_processed": 290,
        "summary": {
            "targeted_after_denominator_lane": targeted,
            "label_anchor_candidates": len(queue),
            "no_label_anchor_candidate": no_candidate,
            "skipped_source_reviewed": skipped_reviewed,
            "skipped_unique_denominator_anchor": skipped_unique,
        },
        "source_verified_values": 0,
        "promotion_authorized": False,
        "turnout_values_extracted": 0,
        "rows": rows,
    }
    review_queue = {
        "schema_version": "kda.p23.form34b.text-anchor-review-queue.v1",
        "purpose": "Likely final Form 34B pages recovered from fixed textual labels after the exact-denominator lane failed or was ambiguous. Candidate pages are review locators only and carry no turnout value.",
        "rows": len(queue),
        "source_verified_values": 0,
        "promotion_authorized": False,
        "turnout_values_extracted": 0,
        "queue": queue,
    }

    Path(args.audit_output).write_text(json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    Path(args.queue_output).write_text(json.dumps(review_queue, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        "P23_FORM34B_TEXT_ANCHOR_AGGREGATE "
        f"rows=290 targeted={targeted} candidates={len(queue)} no_candidate={no_candidate} "
        f"skipped_reviewed={skipped_reviewed} skipped_unique={skipped_unique} "
        "source_verified_values=0 promotion_authorized=false turnout_values_extracted=0"
    )


if __name__ == "__main__":
    main()
