#!/usr/bin/env python3
"""Diagnostic-only textual recovery lane for unresolved Form 34B source pages.

This lane runs only after the existing exact registered-voter denominator locator.
For rows that still have no unique denominator anchor and are not already source
reviewed, it searches official Form 34B page OCR for *labels only* that identify
likely final aggregation / voter-turnout pages. It deliberately emits no turnout
numerator, denominator transcription, rejected-ballot value, candidate vote value,
or promotable observation. Candidate pages remain review locators only.
"""

import argparse
import hashlib
import importlib.util
import json
import re
import subprocess
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path.cwd()
BASE_SCRIPT = ROOT / "scripts/p23/probe-form34b-grid-smoke.py"
OFFICIAL_PREFIX = "https://forms.iebc.or.ke/"
TARGETS = {
    "voter_turn_out": ("VOTER TURN OUT", 4.0),
    "aggregate_results": ("AGGREGATE RESULTS", 3.0),
    "total_registered_voters": ("TOTAL NUMBER OF REGISTERED VOTERS", 4.0),
    "total_voters_turned_out": ("TOTAL NUMBER OF VOTERS WHO TURNED OUT TO VOTE", 4.0),
    "percentage_voter_turnout": ("PERCENTAGE OF VOTER TURNOUT", 3.0),
}
CANDIDATE_LIMIT = 2


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


def normalise_words(text):
    cleaned = re.sub(r"[^A-Z]+", " ", (text or "").upper())
    return [word for word in cleaned.split() if len(word) >= 2]


def page_words(image, psm):
    proc = subprocess.run(
        ["tesseract", str(image), "stdout", "--psm", str(psm)],
        check=True,
        capture_output=True,
        text=True,
    )
    return normalise_words(proc.stdout)


def phrase_similarity(words, target):
    wanted = normalise_words(target)
    if not words or not wanted:
        return 0.0
    best = 0.0
    lo = max(1, len(wanted) - 1)
    hi = min(len(words), len(wanted) + 2)
    target_text = " ".join(wanted)
    for size in range(lo, hi + 1):
        for start in range(0, len(words) - size + 1):
            candidate = " ".join(words[start:start + size])
            score = SequenceMatcher(None, candidate, target_text).ratio()
            if score > best:
                best = score
    return round(best, 4)


def assess_page(words, page, psm):
    scores = {key: phrase_similarity(words, phrase) for key, (phrase, _) in TARGETS.items()}
    exact_total_token = "TOTAL" in words
    weighted_score = sum(scores[key] * TARGETS[key][1] for key in TARGETS)
    if exact_total_token:
        weighted_score += 0.5
    strong = (
        scores["voter_turn_out"] >= 0.72
        or scores["total_registered_voters"] >= 0.72
        or scores["total_voters_turned_out"] >= 0.72
        or scores["aggregate_results"] >= 0.74
        or (
            exact_total_token
            and max(scores["aggregate_results"], scores["voter_turn_out"]) >= 0.60
        )
    )
    return {
        "page_number": page,
        "psm": psm,
        "exact_total_token": exact_total_token,
        "label_scores": scores,
        "weighted_label_score": round(weighted_score, 4),
        "candidate": bool(strong),
    }


def best_candidates(page_results):
    by_page = {}
    for item in page_results:
        if not item["candidate"]:
            continue
        page = item["page_number"]
        current = by_page.get(page)
        rank = (item["weighted_label_score"], item["exact_total_token"], -item["psm"])
        if current is None:
            by_page[page] = item
            continue
        current_rank = (current["weighted_label_score"], current["exact_total_token"], -current["psm"])
        if rank > current_rank:
            by_page[page] = item
    ordered = sorted(
        by_page.values(),
        key=lambda item: (-item["weighted_label_score"], item["page_number"]),
    )
    return ordered[:CANDIDATE_LIMIT]


def main():
    parser = argparse.ArgumentParser(description="Locate textual Form 34B final-page anchors without extracting any turnout values.")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--denominator-audit", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--offset", type=int, required=True)
    parser.add_argument("--limit", type=int, required=True)
    args = parser.parse_args()

    if not 1 <= args.limit <= 25:
        fail("Text-anchor recovery limit must be between 1 and 25")
    if args.offset < 0 or args.offset >= 290 or args.offset + args.limit > 290:
        fail("Text-anchor recovery offset/limit must remain within the governed 290-row manifest")

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    rows = manifest.get("rows") or []
    if len(rows) != 290 or manifest.get("promotion_state") != "source_reference_manifest_complete":
        fail("Governed 290-row source-reference manifest is not complete")

    denominator_doc = json.loads(Path(args.denominator_audit).read_text(encoding="utf-8"))
    if denominator_doc.get("schema_version") != "kda.p23.form34b.denominator-anchor-smoke.v1":
        fail("Text-anchor recovery requires one governed denominator-anchor shard")
    if int(denominator_doc.get("batch_offset", -1)) != args.offset:
        fail("Denominator-anchor shard offset does not match text-recovery offset")
    denominator_rows = denominator_doc.get("rows") or []
    if len(denominator_rows) != args.limit:
        fail("Denominator-anchor shard row count does not match text-recovery limit")

    selected_manifest = rows[args.offset:args.offset + args.limit]
    expected_codes = [int(row.get("constituency_code") or 0) for row in selected_manifest]
    denominator_codes = [int(row.get("constituency_code") or 0) for row in denominator_rows]
    if denominator_codes != expected_codes:
        fail("Denominator-anchor shard constituency ordering changed")

    base = load_base()
    opener = base.session()
    reviewed = source_reviewed_codes()
    workroot = Path("/tmp/p23-form34b-text-anchor-recovery-work")
    workroot.mkdir(parents=True, exist_ok=True)
    output_rows = []
    scanned = 0

    for source, prior in zip(selected_manifest, denominator_rows):
        code = int(source.get("constituency_code") or 0)
        urls = source.get("download_urls") or []
        if len(urls) != 1 or not str(urls[0]).startswith(OFFICIAL_PREFIX):
            fail(f"Text-anchor source row invalid for constituency code {code}")
        prior_state = prior.get("anchor_state")
        if prior_state not in {
            "unique_exact_denominator_anchor",
            "ambiguous_exact_denominator_anchors",
            "no_exact_denominator_anchor",
        }:
            fail(f"Constituency {code}: unsupported denominator-anchor state {prior_state}")

        record = {
            "constituency_code": code,
            "geo_code": source.get("geo_code"),
            "constituency_name": source.get("constituency_name"),
            "form_download_id": (source.get("form_download_ids") or [None])[0],
            "source_url": urls[0],
            "source_pdf_sha256": prior.get("source_pdf_sha256"),
            "page_count": int(prior.get("page_count") or 0),
            "denominator_anchor_state": prior_state,
            "already_source_reviewed": code in reviewed,
            "text_recovery_state": None,
            "review_page_candidates": [],
            "source_verified_values": 0,
            "promotion_authorized": False,
            "turnout_values_extracted": 0,
        }

        if code in reviewed:
            record["text_recovery_state"] = "skipped_source_reviewed"
            output_rows.append(record)
            continue
        if prior_state == "unique_exact_denominator_anchor":
            record["text_recovery_state"] = "skipped_unique_denominator_anchor"
            output_rows.append(record)
            continue

        scanned += 1
        workdir = workroot / f"con-{code:03d}"
        workdir.mkdir(parents=True, exist_ok=True)
        pdf = workdir / f"form34b-{code:03d}.pdf"
        base.download_pdf(opener, urls[0], pdf)
        digest = sha256_file(pdf)
        if digest != prior.get("source_pdf_sha256"):
            fail(f"Constituency {code}: official PDF digest changed between governed recovery lanes")
        pages = base.pdf_pages(pdf)
        if pages != int(prior.get("page_count") or 0):
            fail(f"Constituency {code}: official PDF page count changed between governed recovery lanes")

        page_results = []
        rasters = []
        for page in range(1, pages + 1):
            pgm = base.render_page(pdf, page, workdir / f"page-{page}")
            rasters.append((page, pgm))
            words = page_words(pgm, 11)
            page_results.append(assess_page(words, page, 11))

        candidates = best_candidates(page_results)
        if not candidates:
            for page, pgm in rasters:
                words = page_words(pgm, 6)
                page_results.append(assess_page(words, page, 6))
            candidates = best_candidates(page_results)

        record["review_page_candidates"] = candidates
        record["text_recovery_state"] = "label_anchor_candidate" if candidates else "no_label_anchor_candidate"
        output_rows.append(record)

    document = {
        "schema_version": "kda.p23.form34b.text-anchor-recovery.v1",
        "purpose": "Second governed source-row locator for forms not recovered by the exact registered-voter denominator lane. It finds likely final Form 34B pages using OCR of fixed textual labels only; it emits no turnout value and authorizes no promotion.",
        "batch_offset": args.offset,
        "rows_processed": len(output_rows),
        "rows_scanned": scanned,
        "label_anchor_candidates": sum(row["text_recovery_state"] == "label_anchor_candidate" for row in output_rows),
        "source_verified_values": 0,
        "promotion_authorized": False,
        "turnout_values_extracted": 0,
        "rows": output_rows,
    }
    Path(args.output).write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        "P23_FORM34B_TEXT_ANCHOR_RECOVERY "
        f"offset={args.offset} rows={len(output_rows)} scanned={scanned} "
        f"candidates={document['label_anchor_candidates']} "
        "source_verified_values=0 promotion_authorized=false turnout_values_extracted=0"
    )


if __name__ == "__main__":
    main()
