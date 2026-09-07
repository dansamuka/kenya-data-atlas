#!/usr/bin/env python3
"""Aggregate governed Form 34B denominator-anchor shards into a visual source-review queue.

This stage is deliberately non-promoting. A unique exact hit for the already-governed
registered-voter denominator is only a locator for independent visual source review;
it is not evidence that the crop is the final TOTAL row and it extracts no turnout
numerator value.
"""

import argparse
import json
import re
from pathlib import Path

ROOT = Path.cwd()
EXPECTED_OFFSETS = list(range(0, 276, 25))
EXPECTED_LIMITS = {offset: (15 if offset == 275 else 25) for offset in EXPECTED_OFFSETS}
SHA256 = re.compile(r"^[0-9a-f]{64}$")
OFFICIAL_PREFIX = "https://forms.iebc.or.ke/"
ALLOWED_STATES = {
    "unique_exact_denominator_anchor",
    "ambiguous_exact_denominator_anchors",
    "no_exact_denominator_anchor",
}


def fail(message):
    raise SystemExit(message)


def source_reviewed_codes():
    reviewed = set()
    for path in sorted((ROOT / "data/p23").glob("form34b-*-source-verification.json")):
        evidence = json.loads(path.read_text(encoding="utf-8"))
        if evidence.get("verification_state") not in {"verified", "arithmetic_mismatch"}:
            continue
        fields = evidence.get("field_evidence") or {}
        if not all((fields.get(name) or {}).get("verification_state") == "source_verified" for name in (
            "registered_voters", "total_valid_votes", "rejected_ballots"
        )):
            fail(f"Committed source-review evidence is incomplete: {path}")
        code = int((evidence.get("sample") or {}).get("constituency_code") or 0)
        if not 1 <= code <= 290:
            fail(f"Committed source-review evidence has invalid constituency code: {path}")
        reviewed.add(code)
    return reviewed


def read_shards(input_dir):
    shards = []
    for path in sorted(Path(input_dir).rglob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        if doc.get("schema_version") != "kda.p23.form34b.denominator-anchor-smoke.v1":
            continue
        shards.append((path, doc))
    if len(shards) != 12:
        fail(f"Expected exactly 12 governed denominator-anchor shards, found {len(shards)}")
    return shards


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--audit-output", required=True)
    parser.add_argument("--queue-output", required=True)
    args = parser.parse_args()

    reviewed = source_reviewed_codes()
    shards = read_shards(args.input_dir)
    rows = []
    seen_offsets = set()
    seen_codes = set()

    for path, doc in shards:
        offset = int(doc.get("batch_offset", -1))
        if offset not in EXPECTED_LIMITS or offset in seen_offsets:
            fail(f"Unexpected or duplicate shard offset {offset}: {path}")
        seen_offsets.add(offset)
        expected = EXPECTED_LIMITS[offset]
        shard_rows = doc.get("rows") or []
        if int(doc.get("rows_processed", -1)) != expected or len(shard_rows) != expected:
            fail(f"Shard offset {offset} row count changed: expected {expected}, got {len(shard_rows)}")
        if doc.get("source_verified_values") != 0 or doc.get("promotion_authorized") is not False:
            fail(f"Shard offset {offset} leaked source verification or promotion")

        expected_codes = list(range(offset + 1, offset + expected + 1))
        actual_codes = [int(row.get("constituency_code") or 0) for row in shard_rows]
        if actual_codes != expected_codes:
            fail(f"Shard offset {offset} constituency ordering changed")

        for row in shard_rows:
            code = int(row.get("constituency_code") or 0)
            if code in seen_codes:
                fail(f"Duplicate constituency code {code}")
            seen_codes.add(code)
            if not str(row.get("source_url") or "").startswith(OFFICIAL_PREFIX):
                fail(f"Constituency {code}: non-official source URL")
            if not SHA256.fullmatch(str(row.get("source_pdf_sha256") or "")):
                fail(f"Constituency {code}: invalid source PDF digest")
            denominator = row.get("canonical_registered_voters")
            if not isinstance(denominator, int) or denominator <= 0:
                fail(f"Constituency {code}: canonical denominator missing")
            state = row.get("anchor_state")
            if state not in ALLOWED_STATES:
                fail(f"Constituency {code}: unsupported anchor state {state}")
            if row.get("source_verified_values") != 0 or row.get("promotion_authorized") is not False:
                fail(f"Constituency {code}: locator row leaked source verification or promotion")

            count = int(row.get("exact_denominator_anchor_count", -1))
            if state == "unique_exact_denominator_anchor":
                if count != 1:
                    fail(f"Constituency {code}: unique state must contain exactly one hit")
                if not SHA256.fullmatch(str(row.get("review_context_sha256") or "")):
                    fail(f"Constituency {code}: unique anchor context digest missing")
                anchor = row.get("denominator_anchor") or {}
                if int(anchor.get("page_number") or 0) < 1:
                    fail(f"Constituency {code}: anchor page missing")
                if not row.get("review_context_file"):
                    fail(f"Constituency {code}: anchor context file missing")
            elif state == "ambiguous_exact_denominator_anchors":
                if count < 2:
                    fail(f"Constituency {code}: ambiguous state requires at least two hits")
            elif count != 0:
                fail(f"Constituency {code}: no-anchor state must contain zero hits")

            audit_row = dict(row)
            audit_row["already_source_reviewed"] = code in reviewed
            rows.append(audit_row)

    if seen_offsets != set(EXPECTED_OFFSETS):
        fail("Denominator-anchor shard offset set is incomplete")
    if sorted(seen_codes) != list(range(1, 291)):
        fail("Denominator-anchor recovery does not cover exact constituency codes 1-290")
    rows.sort(key=lambda row: int(row["constituency_code"]))

    queue = []
    for row in rows:
        if row.get("anchor_state") != "unique_exact_denominator_anchor" or row.get("already_source_reviewed"):
            continue
        queue.append({
            "constituency_code": row["constituency_code"],
            "geo_code": row.get("geo_code"),
            "constituency_name": row.get("constituency_name"),
            "form_download_id": row.get("form_download_id"),
            "source_url": row.get("source_url"),
            "source_pdf_sha256": row.get("source_pdf_sha256"),
            "page_count": row.get("page_count"),
            "canonical_registered_voters": row.get("canonical_registered_voters"),
            "denominator_anchor": row.get("denominator_anchor"),
            "review_context_file": row.get("review_context_file"),
            "review_context_crop_250": row.get("review_context_crop_250"),
            "review_context_sha256": row.get("review_context_sha256"),
            "review_requirement": {
                "reviewer_class": "independent_visual_source_image_review",
                "denominator_anchor_is_locator_only": True,
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
        })

    counts = {state: sum(row.get("anchor_state") == state for row in rows) for state in ALLOWED_STATES}
    reviewed_unique = sum(
        row.get("anchor_state") == "unique_exact_denominator_anchor" and row.get("already_source_reviewed")
        for row in rows
    )
    audit = {
        "schema_version": "kda.p23.form34b.source-row-recovery-audit.v1",
        "purpose": "Complete 290-row governed exact-denominator source-row recovery audit. Unique anchors are review locators only and never source verification or promotion.",
        "rows_processed": 290,
        "summary": {
            "unique_exact_denominator_anchors": counts["unique_exact_denominator_anchor"],
            "ambiguous_exact_denominator_anchors": counts["ambiguous_exact_denominator_anchors"],
            "no_exact_denominator_anchor": counts["no_exact_denominator_anchor"],
            "unique_already_source_reviewed": reviewed_unique,
            "pending_visual_source_review": len(queue),
            "committed_source_reviewed_rows": len(reviewed),
        },
        "committed_source_reviewed_codes": sorted(reviewed),
        "source_verified_values": 0,
        "promotion_authorized": False,
        "rows": rows,
    }
    review_queue = {
        "schema_version": "kda.p23.form34b.source-row-recovery-queue.v1",
        "purpose": "Unique exact-denominator contexts awaiting independent visual confirmation of the final TOTAL row and direct transcription. No value in this queue is source verified.",
        "rows": len(queue),
        "source_verified_values": 0,
        "promotion_authorized": False,
        "queue": queue,
    }

    Path(args.audit_output).write_text(json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    Path(args.queue_output).write_text(json.dumps(review_queue, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        "P23_FORM34B_SOURCE_ROW_RECOVERY "
        f"rows=290 unique={counts['unique_exact_denominator_anchor']} "
        f"ambiguous={counts['ambiguous_exact_denominator_anchors']} "
        f"no_anchor={counts['no_exact_denominator_anchor']} "
        f"reviewed_unique={reviewed_unique} pending_visual_review={len(queue)} "
        "source_verified_values=0 promotion_authorized=false turnout_values_extracted=0"
    )


if __name__ == "__main__":
    main()
