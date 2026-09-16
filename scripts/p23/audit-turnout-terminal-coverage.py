#!/usr/bin/env python3
"""Audit governed terminal-review coverage for the canonical P23 109-row queue.

Counts only current-governance terminal evidence:
- shared salvage review outcome registry;
- fresh source-review files;
- Cycle 1 terminal-classification batches.

Legacy *-source-verification.json locator history, fresh review contexts, and visual-only
pending-denominator batches are deliberately excluded.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
P23 = ROOT / "data" / "p23"
TERMINAL = {
    "verified",
    "denominator_mismatch",
    "arithmetic_mismatch",
    "source_unreadable",
    "partial_unresolved",
    "official_pdf_missing_results_pages",
}


def load(path: Path):
    return json.loads(path.read_text())


def canonical_queue():
    salvage = []
    for letter in "abcdefghijk":
        path = P23 / f"turnout-salvage-tranche-{letter}.json"
        d = load(path)
        rows = d["tranche"]["rows"]
        salvage.extend({"geo_code": r["geo_code"], "name": r["name"], "queue": "salvage"} for r in rows)
    triage = load(P23 / "turnout-followup-triage.json")
    untouched = [
        {"geo_code": r["geo_code"], "name": r["name"], "queue": "untouched"}
        for r in triage["genuinely_untouched"]["constituencies"]
    ]
    rows = salvage + untouched
    codes = [r["geo_code"] for r in rows]
    assert len(salvage) == 85, len(salvage)
    assert len(untouched) == 24, len(untouched)
    assert len(rows) == 109, len(rows)
    assert len(set(codes)) == 109, "canonical queue contains duplicate geo codes"
    return rows


def add(out, code, state, source):
    if not code or state not in TERMINAL:
        return
    out.setdefault(code, []).append({"state": state, "source": source})


def terminal_evidence():
    out = {}
    registry = P23 / "turnout-salvage-review-outcomes.json"
    if registry.exists():
        d = load(registry)
        for r in d.get("outcomes", []):
            # Registry intentionally stores result-value-free outcome reasons.
            state = r.get("reason")
            add(out, r.get("geo_code"), state, registry.name)

    for path in sorted(P23.glob("form34b-*-fresh-source-review.json")):
        d = load(path)
        add(out, d.get("geo_code"), d.get("verification_state"), path.name)

    for path in sorted(P23.glob("p23-cycle1-terminal-classification-*.json")):
        d = load(path)
        for r in d.get("rows", []):
            add(out, r.get("geo_code"), r.get("verification_state"), path.name)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output")
    args = ap.parse_args()

    queue = canonical_queue()
    evidence = terminal_evidence()
    canonical = {r["geo_code"]: r for r in queue}
    extraneous = sorted(set(evidence) - set(canonical))
    assert not extraneous, f"terminal evidence outside canonical 109-row queue: {extraneous}"

    conflicts = {}
    for code, records in evidence.items():
        states = sorted({r["state"] for r in records})
        if len(states) > 1:
            conflicts[code] = records
    assert not conflicts, f"conflicting terminal states: {conflicts}"

    covered = set(evidence) & set(canonical)
    remaining = [r for r in queue if r["geo_code"] not in covered]
    payload = {
        "schema_version": "kda.p23.turnout-terminal-coverage-audit.v1",
        "canonical_queue_count": 109,
        "terminal_covered_count": len(covered),
        "remaining_count": len(remaining),
        "terminal_by_state": {},
        "remaining": remaining,
        "governance": {
            "legacy_noncanonical_source_verification_excluded": True,
            "fresh_review_contexts_excluded": True,
            "pending_denominator_visual_reviews_excluded": True,
            "promotion_authorized": False,
            "canonical_turnout_written": False,
        },
    }
    for code in sorted(covered):
        state = evidence[code][0]["state"]
        payload["terminal_by_state"][state] = payload["terminal_by_state"].get(state, 0) + 1

    text = json.dumps(payload, indent=2)
    if args.output:
        Path(args.output).write_text(text + "\n")
    print(text)
    print(f"P23_TERMINAL_COVERAGE covered={len(covered)} remaining={len(remaining)} canonical=109 no_promotion=true")


if __name__ == "__main__":
    main()
