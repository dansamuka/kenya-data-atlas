#!/usr/bin/env python3
"""Diagnostic-only Form 34B denominator-anchor locator.

This is deliberately narrower than turnout extraction. It searches rendered official
Form 34B pages for an OCR reading that exactly equals the already-governed 2022
constituency registered-voter denominator. A unique exact hit may produce a source
review crop, but no valid-vote, rejected-ballot or turnout value is extracted or
promoted here.
"""

import argparse
import csv
import hashlib
import importlib.util
import json
import re
import subprocess
from pathlib import Path

ROOT = Path.cwd()
BASE_SCRIPT = ROOT / "scripts/p23/probe-form34b-grid-smoke.py"
DPI = 250
MAX_JOIN_TOKENS = 3
MAX_TOKEN_GAP = 100


def fail(message):
    raise SystemExit(message)


def load_base():
    spec = importlib.util.spec_from_file_location("p23_grid_smoke_base", BASE_SCRIPT)
    if spec is None or spec.loader is None:
        fail(f"Unable to import governed grid smoke helper: {BASE_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def normalized_digits(text):
    digits = re.sub(r"\D+", "", text or "")
    return digits if 1 <= len(digits) <= 6 else ""


def tesseract_rows(image, psm):
    proc = subprocess.run(
        [
            "tesseract", str(image), "stdout", "--psm", str(psm),
            "-c", "tessedit_char_whitelist=0123456789,", "tsv",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    rows = []
    for row in csv.DictReader(proc.stdout.splitlines(), delimiter="\t"):
        text = (row.get("text") or "").strip()
        digits = normalized_digits(text)
        if not digits:
            continue
        try:
            confidence = float(row.get("conf") or -1)
            left = int(row.get("left") or 0)
            top = int(row.get("top") or 0)
            width = int(row.get("width") or 0)
            height = int(row.get("height") or 0)
        except ValueError:
            continue
        if confidence < 0 or width <= 0 or height <= 0:
            continue
        rows.append({
            "digits": digits,
            "confidence": confidence,
            "left": left,
            "top": top,
            "right": left + width,
            "bottom": top + height,
            "block": row.get("block_num") or "0",
            "par": row.get("par_num") or "0",
            "line": row.get("line_num") or "0",
        })
    return rows


def union_bbox(items):
    return {
        "x0": min(item["left"] for item in items),
        "y0": min(item["top"] for item in items),
        "x1": max(item["right"] for item in items),
        "y1": max(item["bottom"] for item in items),
    }


def exact_denominator_hits(rows, denominator, page, psm):
    wanted = str(int(denominator))
    by_line = {}
    for item in rows:
        key = (item["block"], item["par"], item["line"])
        by_line.setdefault(key, []).append(item)

    hits = []
    for line_rows in by_line.values():
        ordered = sorted(line_rows, key=lambda item: item["left"])
        for start in range(len(ordered)):
            for size in range(1, min(MAX_JOIN_TOKENS, len(ordered) - start) + 1):
                chunk = ordered[start:start + size]
                if size > 1:
                    gaps = [chunk[i + 1]["left"] - chunk[i]["right"] for i in range(len(chunk) - 1)]
                    if any(gap < -15 or gap > MAX_TOKEN_GAP for gap in gaps):
                        continue
                digits = "".join(item["digits"] for item in chunk)
                if digits != wanted:
                    continue
                bbox = union_bbox(chunk)
                hits.append({
                    "page_number": page,
                    "psm": psm,
                    "bbox_250": bbox,
                    "mean_confidence": round(sum(item["confidence"] for item in chunk) / len(chunk), 2),
                    "token_count": len(chunk),
                })
    return hits


def hit_center(hit):
    bbox = hit["bbox_250"]
    return ((bbox["x0"] + bbox["x1"]) / 2, (bbox["y0"] + bbox["y1"]) / 2)


def dedupe_hits(hits):
    kept = []
    for hit in sorted(hits, key=lambda item: item["mean_confidence"], reverse=True):
        hx, hy = hit_center(hit)
        duplicate = None
        for existing in kept:
            if existing["page_number"] != hit["page_number"]:
                continue
            ex, ey = hit_center(existing)
            if abs(ex - hx) <= 35 and abs(ey - hy) <= 25:
                duplicate = existing
                break
        if duplicate is None:
            hit["psm_methods"] = [hit.pop("psm")]
            kept.append(hit)
        else:
            method = hit.get("psm")
            if method not in duplicate["psm_methods"]:
                duplicate["psm_methods"].append(method)
    return kept


def render_context(pdf, page, width, height, hit, output_path):
    bbox = hit["bbox_250"]
    x0 = max(0, int(round(width * 0.05)))
    x1 = min(width, int(round(width * 0.93)))
    y0 = max(0, bbox["y0"] - 100)
    y1 = min(height, bbox["y1"] + 100)
    prefix = output_path.with_suffix("")
    subprocess.run(
        [
            "pdftoppm", "-f", str(page), "-l", str(page), "-singlefile", "-png", "-r", str(DPI),
            "-x", str(x0), "-y", str(y0), "-W", str(max(1, x1 - x0)), "-H", str(max(1, y1 - y0)),
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
        fail(f"Failed to render denominator-anchor context for page {page}")
    return {
        "x0": x0,
        "y0": y0,
        "x1": x1,
        "y1": y1,
    }


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description="Locate exact registered-voter denominator anchors in a capped Form 34B diagnostic batch.")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", default="/tmp/p23-form34b-denominator-anchor-smoke.json")
    parser.add_argument("--context-dir", default="/tmp/p23-form34b-denominator-contexts")
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int, default=25)
    args = parser.parse_args()
    if not 1 <= args.limit <= 25:
        fail("Anchor smoke limit must be between 1 and 25")
    if args.offset < 0 or args.offset >= 290 or args.offset + args.limit > 290:
        fail("Anchor smoke offset/limit must remain within the governed 290-row manifest")

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    rows = manifest.get("rows") or []
    if len(rows) != 290 or manifest.get("promotion_state") != "source_reference_manifest_complete":
        fail("Governed 290-row source-reference manifest is not complete")

    base = load_base()
    denominators = base.load_denominators()
    opener = base.session()
    workroot = Path("/tmp/p23-form34b-denominator-anchor-work")
    context_dir = Path(args.context_dir)
    workroot.mkdir(parents=True, exist_ok=True)
    context_dir.mkdir(parents=True, exist_ok=True)
    results = []

    for source in rows[args.offset:args.offset + args.limit]:
        code = int(source.get("constituency_code") or 0)
        urls = source.get("download_urls") or []
        if code not in denominators or len(urls) != 1:
            fail(f"Anchor source row invalid for constituency code {code}")
        workdir = workroot / f"con-{code:03d}"
        workdir.mkdir(parents=True, exist_ok=True)
        pdf = workdir / f"form34b-{code:03d}.pdf"
        base.download_pdf(opener, urls[0], pdf)
        pages = base.pdf_pages(pdf)
        page_rasters = []
        all_hits = []
        psm_attempts = []

        for page in range(1, pages + 1):
            pgm = base.render_page(pdf, page, workdir / f"page-{page}")
            width, height, _ = base.load_sample_probe().read_pgm(pgm)
            page_rasters.append((page, pgm, width, height))
            rows_11 = tesseract_rows(pgm, 11)
            hits_11 = exact_denominator_hits(rows_11, denominators[code], page, 11)
            psm_attempts.append({"page_number": page, "psm": 11, "numeric_tokens": len(rows_11), "exact_hits": len(hits_11)})
            all_hits.extend(hits_11)

        if not all_hits:
            for page, pgm, _, _ in page_rasters:
                rows_6 = tesseract_rows(pgm, 6)
                hits_6 = exact_denominator_hits(rows_6, denominators[code], page, 6)
                psm_attempts.append({"page_number": page, "psm": 6, "numeric_tokens": len(rows_6), "exact_hits": len(hits_6)})
                all_hits.extend(hits_6)

        hits = dedupe_hits(all_hits)
        record = {
            "constituency_code": code,
            "geo_code": source.get("geo_code"),
            "constituency_name": source.get("constituency_name"),
            "form_download_id": (source.get("form_download_ids") or [None])[0],
            "source_url": urls[0],
            "source_pdf_sha256": sha256_file(pdf),
            "page_count": pages,
            "canonical_registered_voters": denominators[code],
            "psm_attempts": psm_attempts,
            "exact_denominator_anchor_count": len(hits),
            "anchor_state": "unique_exact_denominator_anchor" if len(hits) == 1 else ("ambiguous_exact_denominator_anchors" if hits else "no_exact_denominator_anchor"),
            "source_verified_values": 0,
            "promotion_authorized": False,
        }
        if len(hits) == 1:
            hit = hits[0]
            raster = next(item for item in page_rasters if item[0] == hit["page_number"])
            context_path = context_dir / f"con-{code:03d}-denominator-anchor.png"
            crop = render_context(pdf, hit["page_number"], raster[2], raster[3], hit, context_path)
            record["denominator_anchor"] = hit
            record["review_context_file"] = context_path.name
            record["review_context_crop_250"] = crop
            record["review_context_sha256"] = sha256_file(context_path)
        elif hits:
            record["denominator_anchor_candidates"] = hits
        results.append(record)

    document = {
        "schema_version": "kda.p23.form34b.denominator-anchor-smoke.v1",
        "purpose": "Locate exact canonical registered-voter denominator readings in official Form 34B scans without requiring full table-grid recovery. This is a review-locator diagnostic only and extracts no turnout numerator values.",
        "batch_offset": args.offset,
        "rows_processed": len(results),
        "unique_exact_denominator_anchors": sum(row["anchor_state"] == "unique_exact_denominator_anchor" for row in results),
        "ambiguous_exact_denominator_anchors": sum(row["anchor_state"] == "ambiguous_exact_denominator_anchors" for row in results),
        "source_verified_values": 0,
        "promotion_authorized": False,
        "rows": results,
    }
    Path(args.output).write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        "P23_FORM34B_DENOMINATOR_ANCHOR_SMOKE "
        f"offset={args.offset} rows={len(results)} unique={document['unique_exact_denominator_anchors']} "
        f"ambiguous={document['ambiguous_exact_denominator_anchors']} "
        "source_verified_values=0 promotion_authorized=false turnout_values_extracted=0"
    )


if __name__ == "__main__":
    main()
