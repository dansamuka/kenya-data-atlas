#!/usr/bin/env python3
import argparse
import csv
import hashlib
import json
import math
import re
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path.cwd()
OCR_CONTRACT = ROOT / "data/p23/form34b-ocr-feasibility-contract.json"
LAYOUT_CONTRACT = ROOT / "data/p23/form34b-sample-page-layout-contract.json"
DEFAULT_PDF = Path("/tmp/iebc-form34b-ocr-changamwe.pdf")
DEFAULT_OUTPUT = Path("/tmp/p23-form34b-total-row-candidates.json")
DEFAULT_CONTEXT = Path("/tmp/iebc-form34b-total-row-page2.png")
DPI = 250
DARK_CUTOFF = 140
HORIZONTAL_DARK_FRACTION = 0.50
VERTICAL_DARK_FRACTION = 0.45
MAJOR_RULE_MIN_STRENGTH = 0.55
ROW_GAP_MIN = 20
ROW_GAP_MAX = 50
MIN_HORIZONTAL_LINES = 50
EXPECTED_MAJOR_VERTICAL_RULES = 10
THRESHOLDS = (70, 90, 110, 130, 150)
UPSCALE = 3


def fail(message):
    raise SystemExit(message)


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_pgm(path):
    with open(path, "rb") as handle:
        if handle.readline().strip() != b"P5":
            fail("Expected P5 PGM")
        line = handle.readline()
        while line.startswith(b"#"):
            line = handle.readline()
        width, height = map(int, line.split())
        if int(handle.readline().strip()) != 255:
            fail("Unsupported PGM max value")
        data = bytearray(handle.read(width * height))
    if len(data) != width * height:
        fail("PGM raster size mismatch")
    return width, height, data


def write_pgm(path, width, height, data):
    if len(data) != width * height:
        fail("PGM output raster size mismatch")
    with open(path, "wb") as handle:
        handle.write(f"P5\n{width} {height}\n255\n".encode("ascii"))
        handle.write(data)


def groups(values):
    out = []
    for value in values:
        if not out or value > out[-1][-1] + 1:
            out.append([])
        out[-1].append(value)
    return out


def pixel_index(width, x, y):
    return y * width + x


def dark_row_fraction(data, width, y, x0, x1):
    return sum(data[pixel_index(width, x, y)] < DARK_CUTOFF for x in range(x0, x1)) / max(1, x1 - x0)


def dark_col_fraction(data, width, x, y0, y1):
    return sum(data[pixel_index(width, x, y)] < DARK_CUTOFF for y in range(y0, y1)) / max(1, y1 - y0)


def stable_horizontal_run(line_groups):
    if len(line_groups) < 2:
        return []
    centers = [(group[0] + group[-1]) / 2 for group in line_groups]
    best = (0, 0)
    start = 0
    for index in range(1, len(line_groups)):
        gap = centers[index] - centers[index - 1]
        if ROW_GAP_MIN <= gap <= ROW_GAP_MAX:
            continue
        if index - start > best[1] - best[0]:
            best = (start, index)
        start = index
    if len(line_groups) - start > best[1] - best[0]:
        best = (start, len(line_groups))
    return line_groups[best[0]:best[1]]


def render_page_two(pdf, prefix):
    subprocess.run(
        ["pdftoppm", "-f", "2", "-l", "2", "-singlefile", "-gray", "-r", str(DPI), str(pdf), str(prefix)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    path = Path(f"{prefix}.pgm")
    if not path.exists():
        fail("Failed to render governed Form 34B page 2")
    return path


def detect_table_grid(width, height, data):
    row_x0 = max(0, int(round(width * 0.05)))
    row_x1 = min(width, int(round(width * 0.93)))
    y0 = max(0, int(round(height * 0.15)))
    y1 = min(height, int(round(height * 0.85)))
    candidate_rows = [
        y for y in range(y0, y1)
        if dark_row_fraction(data, width, y, row_x0, row_x1) >= HORIZONTAL_DARK_FRACTION
    ]
    horizontal = stable_horizontal_run(groups(candidate_rows))
    if len(horizontal) < MIN_HORIZONTAL_LINES:
        fail(f"Form 34B page-2 table run unresolved: horizontal_lines={len(horizontal)}")

    body_y0 = horizontal[0][0]
    body_y1 = horizontal[-1][-1] + 1
    x0 = max(0, int(round(width * 0.04)))
    x1 = min(width, int(round(width * 0.93)))
    candidate_cols = [
        x for x in range(x0, x1)
        if dark_col_fraction(data, width, x, body_y0, body_y1) >= VERTICAL_DARK_FRACTION
    ]
    vertical_groups = groups(candidate_cols)
    scored = []
    for group in vertical_groups:
        strength = max(dark_col_fraction(data, width, x, body_y0, body_y1) for x in group)
        center = sum(group) / len(group)
        if len(group) >= 3 and strength >= MAJOR_RULE_MIN_STRENGTH:
            scored.append((center, group, strength))
    if len(scored) != EXPECTED_MAJOR_VERTICAL_RULES:
        fail(
            "Governed page-2 table vertical-rule structure changed: "
            f"major_rules={len(scored)} expected={EXPECTED_MAJOR_VERTICAL_RULES}"
        )
    rules = [int(round(item[0])) for item in scored]

    registered_width = rules[3] - rules[2]
    valid_width = rules[-2] - rules[-3]
    rejected_width = rules[-1] - rules[-2]
    for label, value in (
        ("registered_voters", registered_width),
        ("total_valid_votes", valid_width),
        ("rejected_ballots", rejected_width),
    ):
        if not 100 <= value <= 260:
            fail(f"Implausible {label} cell width: {value}")

    total_top = horizontal[-2][-1] + 1
    total_bottom = horizontal[-1][0] - 1
    if total_bottom - total_top < 15 or total_bottom - total_top > 60:
        fail(f"Final TOTAL-row height is implausible: {total_bottom - total_top}")

    return {
        "horizontal_groups": horizontal,
        "vertical_rules": rules,
        "total_top": total_top,
        "total_bottom": total_bottom,
        "body_y0": body_y0,
        "body_y1": body_y1,
    }


def upscale_nearest(data, width, height, factor):
    out_width = width * factor
    out = bytearray(out_width * height * factor)
    for y in range(height):
        expanded = bytearray()
        row = data[y * width:(y + 1) * width]
        for value in row:
            expanded.extend([value] * factor)
        for copy in range(factor):
            start = (y * factor + copy) * out_width
            out[start:start + out_width] = expanded
    return out_width, height * factor, out


def cell_threshold_images(width, data, x0, x1, y0, y1, workdir, field):
    x0 += 3
    x1 -= 3
    y0 += 1
    y1 -= 1
    if x1 <= x0 or y1 <= y0:
        fail(f"Empty TOTAL-row crop for {field}")
    crop_width = x1 - x0
    crop_height = y1 - y0
    raw = bytearray(crop_width * crop_height)
    for crop_y in range(crop_height):
        source_y = y0 + crop_y
        start = pixel_index(width, x0, source_y)
        raw[crop_y * crop_width:(crop_y + 1) * crop_width] = data[start:start + crop_width]

    paths = {}
    for threshold in THRESHOLDS:
        binary = bytearray(0 if value < threshold else 255 for value in raw)
        up_width, up_height, up_data = upscale_nearest(binary, crop_width, crop_height, UPSCALE)
        path = workdir / f"total-row-{field}-{threshold}.pgm"
        write_pgm(path, up_width, up_height, up_data)
        paths[threshold] = path
    return paths


def tesseract_candidate(path):
    proc = subprocess.run(
        [
            "tesseract", str(path), "stdout", "--psm", "7",
            "-c", "tessedit_char_whitelist=0123456789,", "tsv",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    tokens = []
    for row in csv.DictReader(proc.stdout.splitlines(), delimiter="\t"):
        raw = (row.get("text") or "").strip()
        if not raw:
            continue
        try:
            confidence = float(row.get("conf") or -1)
        except ValueError:
            continue
        if confidence < 0:
            continue
        tokens.append((raw, confidence))
    if not tokens:
        return None
    text = "".join(token[0] for token in tokens)
    if not re.fullmatch(r"[0-9,]+", text):
        return None
    digits = text.replace(",", "")
    if not digits.isdigit() or not 1 <= len(digits) <= 6:
        return None
    confidence = sum(token[1] for token in tokens) / len(tokens)
    return int(digits), confidence


def decide(candidates):
    if not candidates:
        return None, None, "no_candidate"
    counts = Counter(value for _, value, _ in candidates)
    value, count = counts.most_common(1)[0]
    if count < 2:
        return None, None, "no_threshold_consensus"
    confidences = [confidence for _, candidate, confidence in candidates if candidate == value]
    return value, sum(confidences) / len(confidences), "threshold_consensus"


def render_total_context(pdf, grid, output_path):
    rules = grid["vertical_rules"]
    x = max(0, rules[0] - 15)
    y = max(0, grid["horizontal_groups"][-3][0] - 20)
    right = rules[-1] + 15
    bottom = grid["horizontal_groups"][-1][-1] + 20
    prefix = output_path.with_suffix("")
    subprocess.run(
        [
            "pdftoppm", "-f", "2", "-l", "2", "-singlefile", "-png", "-r", str(DPI),
            "-x", str(x), "-y", str(y), "-W", str(right - x), "-H", str(bottom - y),
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
        fail("Failed to render TOTAL-row context")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", default=str(DEFAULT_PDF))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--context", default=str(DEFAULT_CONTEXT))
    args = parser.parse_args()

    pdf = Path(args.pdf)
    output = Path(args.output)
    context = Path(args.context)
    for required in (pdf, OCR_CONTRACT, LAYOUT_CONTRACT):
        if not required.exists():
            fail(f"Missing required input: {required}")

    with open(OCR_CONTRACT, encoding="utf-8") as handle:
        ocr_contract = json.load(handle)
    with open(LAYOUT_CONTRACT, encoding="utf-8") as handle:
        layout_contract = json.load(handle)
    sample = ocr_contract.get("sample") or {}
    route = layout_contract.get("extraction_route") or {}
    if int(route.get("target_page_for_sample") or 0) != 2 or route.get("preferred") != "direct_final_total_row":
        fail("Sample page-layout contract no longer authorises page-2 direct TOTAL-row candidate extraction")

    workdir = Path("/tmp/p23-form34b-total-row-probe")
    workdir.mkdir(parents=True, exist_ok=True)
    page_pgm = render_page_two(pdf, workdir / "form34b-page2")
    width, height, data = read_pgm(page_pgm)
    grid = detect_table_grid(width, height, data)
    rules = grid["vertical_rules"]
    fields = {
        "registered_voters": (rules[2], rules[3]),
        "total_valid_votes": (rules[-3], rules[-2]),
        "rejected_ballots": (rules[-2], rules[-1]),
    }

    evidence = {}
    selected_values = {}
    strong_count = 0
    for field, (x0, x1) in fields.items():
        images = cell_threshold_images(
            width, data, x0, x1, grid["total_top"], grid["total_bottom"], workdir, field
        )
        candidates = []
        for threshold, path in images.items():
            candidate = tesseract_candidate(path)
            if candidate is not None:
                value, confidence = candidate
                candidates.append((threshold, value, confidence))
        selected, confidence, decision = decide(candidates)
        strong = selected is not None
        strong_count += int(strong)
        selected_values[field] = selected
        evidence[field] = {
            "page_number": 2,
            "cell_x0_250": x0,
            "cell_x1_250": x1,
            "row_y0_250": grid["total_top"],
            "row_y1_250": grid["total_bottom"],
            "machine_transcription": selected,
            "machine_confidence": round(confidence, 2) if confidence is not None else None,
            "verification_state": "machine_candidate" if strong else "source_unreadable",
            "decision": decision,
            "threshold_candidates": [
                {"threshold": threshold, "value": value, "confidence": round(candidate_confidence, 2)}
                for threshold, value, candidate_confidence in candidates
            ],
            "verified_value": None,
            "verification_method": None,
        }

    canonical_registered = int(sample.get("canonical_registered_voters") or 0)
    registered = selected_values.get("registered_voters")
    valid_votes = selected_values.get("total_valid_votes")
    rejected = selected_values.get("rejected_ballots")
    denominator_match = registered is not None and registered == canonical_registered
    arithmetic_ok = (
        registered is not None and valid_votes is not None and rejected is not None
        and 0 <= valid_votes + rejected <= registered
    )
    turnout = None
    turnout_range_ok = False
    if arithmetic_ok:
        turnout = 100.0 * (valid_votes + rejected) / registered
        turnout_range_ok = 0 <= turnout <= 100

    render_total_context(pdf, grid, context)
    document = {
        "schema_version": "kda.p23.form34b.total-row-candidates.v1",
        "purpose": "Machine-candidate extraction from the final TOTAL row on page 2 of the governed Changamwe Form 34B. Candidates remain ineligible for promotion until each target field is independently source-image verified.",
        "form_id": sample.get("form_id"),
        "constituency_code": sample.get("constituency_code"),
        "constituency_name": sample.get("constituency_name"),
        "geo_code": sample.get("geo_code"),
        "source_url": sample.get("download_url"),
        "source_pdf_sha256": sha256_file(pdf),
        "page_image_sha256": sha256_file(page_pgm),
        "context_image_sha256": sha256_file(context),
        "page_number": 2,
        "render_dpi": DPI,
        "thresholds": list(THRESHOLDS),
        "table_geometry": {
            "horizontal_lines": len(grid["horizontal_groups"]),
            "major_vertical_rules": len(rules),
            "vertical_rule_centers_250": rules,
            "total_row_y0_250": grid["total_top"],
            "total_row_y1_250": grid["total_bottom"],
        },
        "field_evidence": evidence,
        "reconciliation": {
            "canonical_registered_voters": canonical_registered,
            "registered_voter_candidate_matches_canonical": denominator_match,
            "candidate_arithmetic_valid": arithmetic_ok,
            "turnout_machine_candidate_pct": round(turnout, 6) if turnout is not None else None,
            "turnout_range_valid": turnout_range_ok,
        },
        "summary": {
            "target_fields": len(fields),
            "strong_machine_candidates": strong_count,
            "all_target_fields_strong": strong_count == len(fields),
            "source_verified_values": 0,
            "promotion_authorized": False,
        },
        "verification_state": "machine_candidate",
        "source_verified_values": 0,
        "promotion_authorized": False,
        "note": "Multi-threshold OCR consensus and denominator/arithmetic reconciliation are candidate-quality gates only. They do not constitute independent source-image verification under data/p23/form34b-extraction-contract.json.",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with open(output, "w", encoding="utf-8") as handle:
        json.dump(document, handle, indent=2)
        handle.write("\n")

    print(
        "P23_FORM34B_TOTAL_ROW_CANDIDATES "
        f"fields={len(fields)} strong={strong_count} "
        f"denominator_match={str(denominator_match).lower()} "
        f"arithmetic_ok={str(arithmetic_ok).lower()} turnout_range_ok={str(turnout_range_ok).lower()} "
        "source_verified=0 promotion_authorized=false values_logged=0"
    )
    if strong_count != len(fields):
        fail(f"TOTAL-row candidate gate failed: strong_fields={strong_count} expected={len(fields)}")
    if not denominator_match:
        fail("TOTAL-row registered-voter candidate does not reconcile to governed denominator")
    if not arithmetic_ok or not turnout_range_ok:
        fail("TOTAL-row candidate arithmetic/range gate failed")


if __name__ == "__main__":
    main()
