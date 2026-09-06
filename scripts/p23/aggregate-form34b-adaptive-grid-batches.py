#!/usr/bin/env python3
"""Aggregate governed Form 34B machine-candidate shards into one audit and review queue.

This script is deliberately non-promotional. It combines already-validated adaptive-grid
batch artifacts, verifies exact 1..290 coverage, and emits a source-verification queue for
strong machine candidates that are not already covered by committed independent source
review evidence. Machine readings remain candidates only; no verified value, turnout
observation, or canonical registry data is created here.
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
VERIFICATION_GLOB = "form34b-*-source-verification.json"
SOURCE_REVIEWED_STATES = {"verified", "arithmetic_mismatch"}


def fail(message):
    raise SystemExit(message)


def require_no_promotion(obj, label):
    if obj.get("source_verified_values") != 0 or obj.get("promotion_authorized") is not False:
        fail(f"Promotion boundary changed for {label}")


def load_committed_verified_rows():
    """Load rows whose target fields already received independent source-image review.

    A row-level arithmetic mismatch is deliberately included here: its three source fields
    are already source_verified, so repeating source verification cannot resolve the conflict.
    Inclusion in this map never makes the row promotion eligible.
    """
    verified = {}
    for path in sorted(Path("data/p23").glob(VERIFICATION_GLOB)):
        evidence = json.loads(path.read_text(encoding="utf-8"))
        state = evidence.get("verification_state")
        if state not in SOURCE_REVIEWED_STATES:
            continue
        if evidence.get("schema_version") != "kda.p23.form34b-source-verification.v1":
            fail(f"Unexpected committed source-verification schema in {path}")
        if state == "arithmetic_mismatch":
            if evidence.get("promotion_eligible") is not False:
                fail(f"Arithmetic-mismatch verification {path.name} must remain promotion-ineligible")
            reconciliation = evidence.get("row_reconciliation") or {}
            if reconciliation.get("arithmetic_conflict") is not True or reconciliation.get("promotion_blocked") is not True:
                fail(f"Arithmetic-mismatch verification {path.name} must explicitly preserve its promotion block")
        elif not isinstance(evidence.get("promotion_eligible"), bool):
            fail(f"Verified source-review row {path.name} must declare promotion eligibility explicitly")

        sample = evidence.get("sample") or {}
        code = sample.get("constituency_code")
        if not isinstance(code, int) or not 1 <= code <= 290:
            fail(f"Invalid committed verified constituency code in {path}: {code}")
        if code in verified:
            fail(f"Duplicate committed verified constituency code {code}")
        source_url = sample.get("source_url") or ""
        digest = sample.get("source_pdf_sha256") or ""
        if not source_url.startswith("https://forms.iebc.or.ke/"):
            fail(f"Non-official committed source URL for constituency {code}")
        if len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
            fail(f"Invalid committed source PDF digest for constituency {code}")
        field_evidence = evidence.get("field_evidence") or {}
        for field in TARGET_FIELDS:
            item = field_evidence.get(field) or {}
            if item.get("verification_state") != "source_verified":
                fail(f"Committed verification {path.name} field {field} is not source_verified")
            if not isinstance(item.get("verified_value"), int):
                fail(f"Committed verification {path.name} field {field} lacks integer verified_value")
        verified[code] = {
            "path": str(path),
            "source_url": source_url,
            "source_pdf_sha256": digest,
            "field_evidence": field_evidence,
            "verification_state": state,
            "promotion_eligible": evidence.get("promotion_eligible"),
        }
    return verified


def main():
    parser = argparse.ArgumentParser(description="Aggregate P23 Form 34B adaptive-grid candidate shards.")
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--aggregate-output", default="/tmp/p23-form34b-candidate-audit.json")
    parser.add_argument("--queue-output", default="/tmp/p23-form34b-source-verification-queue.json")
    args = parser.parse_args()

    committed_verified = load_committed_verified_rows()
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
        shard_rows = doc.get("rows")
        if not isinstance(shard_rows, list) or len(shard_rows) != EXPECTED_COUNTS[offset]:
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
    already_verified_strong = []
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

            committed = committed_verified.get(code)
            if committed is not None:
                if source_url != committed["source_url"] or digest != committed["source_pdf_sha256"]:
                    fail(f"Strong candidate source disagrees with committed verification for constituency {code}")
                for field in TARGET_FIELDS:
                    machine_value = evidence[field]["machine_transcription"]
                    verified_value = committed["field_evidence"][field]["verified_value"]
                    if machine_value != verified_value:
                        fail(f"Strong candidate {field} disagrees with committed verified value for constituency {code}")
                already_verified_strong.append(code)
        elif state == "machine_candidate_needs_review":
            review.append(row)
        else:
            unresolved.append(row)

    pending_strong = [row for row in strong if row["constituency_code"] not in committed_verified]
    committed_codes = sorted(committed_verified)
    aggregate = {
        "schema_version": "kda.p23.form34b.candidate-audit.v1",
        "purpose": "Complete 290-row audit of governed Form 34B machine-candidate extraction. Machine readings remain non-promotable pending independent source-image verification; already source-reviewed arithmetic conflicts remain blocked and are not redundantly re-queued.",
        "expected_rows": 290,
        "rows_processed": len(rows),
        "summary": {
            "strong_machine_candidates": len(strong),
            "strong_already_source_verified": len(already_verified_strong),
            "strong_pending_source_verification": len(pending_strong),
            "machine_candidates_needing_review": len(review),
            "unresolved_rows": len(unresolved),
            "committed_source_verified_rows": len(committed_verified),
        },
        "committed_source_verified_codes": committed_codes,
        "strong_already_source_verified_codes": already_verified_strong,
        "source_verified_values": 0,
        "promotion_authorized": False,
        "rows": rows,
    }

    queue_rows = []
    for row in pending_strong:
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
        "purpose": "Source-image verification queue for strong Form 34B machine candidates not already covered by committed independent source review. Inclusion in this queue does not verify or promote any candidate value.",
        "source_audit_schema": aggregate["schema_version"],
        "excluded_already_source_verified_codes": already_verified_strong,
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
        f"rows=290 strong={len(strong)} strong_verified={len(already_verified_strong)} "
        f"strong_pending={len(pending_strong)} review={len(review)} unresolved={len(unresolved)} "
        f"committed_verified={len(committed_verified)} source_verified_values=0 promotion_authorized=false"
    )
    print(
        "P23_FORM34B_SOURCE_VERIFICATION_QUEUE "
        f"rows={len(queue_rows)} excluded_verified={len(already_verified_strong)} "
        "verification_state=pending_source_verification source_verified_values=0 promotion_authorized=false"
    )


if __name__ == "__main__":
    main()
