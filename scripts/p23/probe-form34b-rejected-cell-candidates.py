#!/usr/bin/env python3
import argparse
import csv
import hashlib
import json
import math
import re
import runpy
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path.cwd()
HELPER_PATH = ROOT / "scripts/p23/assess-form34b-field-labels.py"
OCR_CONTRACT_PATH = ROOT / "data/p23/form34b-ocr-feasibility-contract.json"
THRESHOLDS = (90, 110, 130, 150, 170, 190)
DARK_CUTOFF = 140
HORIZONTAL_DARK_FRACTION = 0.55
VERTICAL_DARK_FRACTION = 0.20
GRID_GAP_MIN_300 = 25
GRID_GAP_MAX_300 = 70
MIN_GRID_LINES = 10
MIN_STRONG_COVERAGE = 0.90
MAX_DIGITS = 3


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


def pixel_index(width, x, y):
    return y * width + x


def groups(values):
    out = []
    for value in values:
        if not out or value > out[-1][-1] + 1:
            out.append([])
        out[-1].append(value)
    return out


def stable_horizontal_run(line_groups):
    if len(line_groups) < 2:
        return []
    centers = [(group[0] + group[-1]) / 2 for group in line_groups]
    best = (0, 0)
    start = 0
    for index in range(1, len(line_groups)):
        gap = centers[index] - centers[index - 1]
        if GRID_GAP_MIN_300 <= gap <= GRID_GAP_MAX_300:
            continue
        if index - start > best[1] - best[0]:
            best = (start, index)
        start = index
    if len(line_groups) - start > best[1] - best[0]:
        best = (start, len(line_groups))
    return line_groups[best[0]:best[1]]


def header_geometry(primary_tsv, label_tsv):
    helper = runpy.run_path(str(HELPER_PATH))
    ordered = helper["locate_ordered_targets"](
        helper["build_segments"](
            helper["read_words"]([str(primary_tsv), str(label_tsv)])
        )
    )
    if not ordered:
        fail("Ordered Form 34B header triplet unavailable")
    findings = ordered["findings"]
    center_x = helper["center_x"]
    rejected_center = float(center_x(findings["rejected_ballots"]))
    valid_center = float(center_x(findings["total_valid_votes"]))
    spacing = rejected_center - valid_center
    if spacing <= 0:
        fail("Invalid Form 34B target-header spacing")

    page_width = page_height = 0
    with open(primary_tsv, encoding="utf-8", errors="replace", newline="") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            try:
                if int(row.get("level") or 0) == 1 and int(row.get("page_num") or 0) == int(ordered["page"]):
                    page_width = int(row.get("width") or 0)
                    page_height = int(row.get("height") or 0)
                    break
            except ValueError:
                pass
    if not page_width or not page_height:
        fail("Primary OCR page geometry unavailable")

    return {
        "page": int(ordered["page"]),
        "rejected_center_250": rejected_center,
        "valid_center_250": valid_center,
        "spacing_250": spacing,
        "header_top_250": float(min(f["bbox"][1] for f in findings.values())),
        "header_bottom_250": float(max(f["bbox"][3] for f in findings.values())),
        "page_width_250": page_width,
        "page_height_250": page_height,
    }


def render_page(pdf, prefix):
    subprocess.run(
        ["pdftoppm", "-f", "1", "-singlefile", "-gray", "-r", "300", str(pdf), str(prefix)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    path = Path(f"{prefix}.pgm")
    if not path.exists():
        fail("Failed to render Form 34B page 1")
    return path


def dark_row_fraction(data, width, y, x0, x1):
    return sum(data[pixel_index(width, x, y)] < DARK_CUTOFF for x in range(x0, x1)) / max(1, x1 - x0)


def dark_col_fraction(data, width, x, y0, y1):
    return sum(data[pixel_index(width, x, y)] < DARK_CUTOFF for y in range(y0, y1)) / max(1, y1 - y0)


def grid_group_strength(data, width, group, y0, y1):
    return max(dark_col_fraction(data, width, x, y0, y1) for x in group)


def choose_vertical_rule(options, center, spacing, side):
    plausible = []
    for center_x, group, strength in options:
        distance = abs(center_x - center)
        if 0.35 * spacing <= distance <= 0.85 * spacing:
            plausible.append((center_x, group, strength))
    pool = plausible or options
    if not pool:
        fail(f"Rejected-ballot {side} vertical rule unresolved")
    # Right-aligned digits form a repeated dark column and can look like a rule.
    # Select the strongest continuous grid-line group inside the header-anchored
    # search window, rather than the group nearest the header centre.
    return max(pool, key=lambda item: (item[2], len(item[1])))


def detect_grid(width, height, data, geometry):
    scale = 300 / 250
    center = geometry["rejected_center_250"] * scale
    spacing = geometry["spacing_250"] * scale
    header_bottom = int(round(geometry["header_bottom_250"] * scale))
    y_start = max(0, header_bottom + int(round(20 * scale)))
    y_stop = min(height, int(round(geometry["page_height_250"] * 0.90 * scale)))
    probe_x0 = max(0, int(round(center - spacing * 0.60)))
    probe_x1 = min(width, int(round(center + spacing * 0.70)))

    candidate_rows = [
        y for y in range(y_start, y_stop)
        if dark_row_fraction(data, width, y, probe_x0, probe_x1) >= HORIZONTAL_DARK_FRACTION
    ]
    horizontal = stable_horizontal_run(groups(candidate_rows))
    if len(horizontal) < MIN_GRID_LINES:
        fail(f"Rejected-ballot table grid unresolved: horizontal_lines={len(horizontal)}")
    body_y0 = horizontal[0][0]
    body_y1 = horizontal[-1][-1] + 1

    search_x0 = max(0, int(round(center - spacing * 1.20)))
    search_x1 = min(width, int(round(center + spacing * 1.20)))
    candidate_cols = [
        x for x in range(search_x0, search_x1)
        if dark_col_fraction(data, width, x, body_y0, body_y1) >= VERTICAL_DARK_FRACTION
    ]
    vertical = groups(candidate_cols)
    scored = [
        (sum(group) / len(group), group, grid_group_strength(data, width, group, body_y0, body_y1))
        for group in vertical
    ]
    left_options = [item for item in scored if item[0] < center]
    right_options = [item for item in scored if item[0] > center]
    left_center, _, left_strength = choose_vertical_rule(left_options, center, spacing, "left")
    right_center, _, right_strength = choose_vertical_rule(right_options, center, spacing, "right")
    cell_width = right_center - left_center
    if not 0.75 * spacing <= cell_width <= 1.35 * spacing:
        fail(f"Rejected-ballot detected cell width is implausible: width={cell_width:.1f} spacing={spacing:.1f}")

    return {
        "horizontal_groups": horizontal,
        "left_grid_x": int(round(left_center)),
        "right_grid_x": int(round(right_center)),
        "left_rule_strength": left_strength,
        "right_rule_strength": right_strength,
        "body_y0": body_y0,
        "body_y1": body_y1,
    }


def threshold_images(width, data, grid, workdir):
    left = grid["left_grid_x"]
    right = grid["right_grid_x"]
    cell_width = right - left
    digit_x0 = int(round(left + cell_width * 0.60))
    digit_x1 = max(digit_x0 + 1, right - 2)
    y0 = grid["horizontal_groups"][0][0]
    y1 = grid["horizontal_groups"][-1][-1] + 1
    crop_width = digit_x1 - digit_x0
    crop_height = y1 - y0

    raw = bytearray(crop_width * crop_height)
    for crop_y in range(crop_height):
        source_y = y0 + crop_y
        start = pixel_index(width, digit_x0, source_y)
        raw[crop_y * crop_width:(crop_y + 1) * crop_width] = data[start:start + crop_width]

    # Remove only source-image horizontal table rules. No glyph correction,
    # synthesis, value inference or relocation is permitted here.
    for group in grid["horizontal_groups"]:
        for source_y in range(max(y0, group[0] - 1), min(y1, group[-1] + 2)):
            crop_y = source_y - y0
            raw[crop_y * crop_width:(crop_y + 1) * crop_width] = b"\xff" * crop_width

    paths = {}
    for threshold in THRESHOLDS:
        binary = bytearray(0 if value < threshold else 255 for value in raw)
        path = workdir / f"rejected-cells-threshold-{threshold}.pgm"
        write_pgm(path, crop_width, crop_height, binary)
        paths[threshold] = path
    return {
        "paths": paths,
        "digit_x0": digit_x0,
        "digit_x1": digit_x1,
        "crop_y0": y0,
        "crop_y1": y1,
    }


def tesseract_rows(path):
    proc = subprocess.run(
        ["tesseract", str(path), "stdout", "--psm", "6", "-c", "tessedit_char_whitelist=0123456789", "tsv"],
        check=True, capture_output=True, text=True,
    )
    return list(csv.DictReader(proc.stdout.splitlines(), delimiter="\t"))


def row_intervals(grid, crop_y0):
    intervals = []
    lines = grid["horizontal_groups"]
    for index in range(len(lines) - 1):
        top = lines[index][-1] + 2 - crop_y0
        bottom = lines[index + 1][0] - 1 - crop_y0
        if bottom > top:
            intervals.append((top, bottom))
    return intervals


def assign_candidates(tsv_rows, intervals):
    by_row = defaultdict(list)
    for row in tsv_rows:
        raw = (row.get("text") or "").strip()
        if not re.fullmatch(rf"\d{{1,{MAX_DIGITS}}}", raw):
            continue
        try:
            confidence = float(row.get("conf", "-1"))
            top = int(row.get("top") or 0)
            height = int(row.get("height") or 0)
            left = int(row.get("left") or 0)
        except ValueError:
            continue
        if confidence < 0:
            continue
        center_y = top + height / 2
        for row_index, (cell_top, cell_bottom) in enumerate(intervals):
            if cell_top <= center_y <= cell_bottom:
                by_row[row_index].append((left, raw, confidence))
                break

    resolved = {}
    for row_index, tokens in by_row.items():
        tokens = sorted(tokens, key=lambda token: token[0])
        text = "".join(token[1] for token in tokens)
        if not re.fullmatch(rf"\d{{1,{MAX_DIGITS}}}", text):
            continue
        confidence = sum(token[2] for token in tokens) / len(tokens)
        resolved[row_index] = (text, confidence)
    return resolved


def decide(candidates):
    if not candidates:
        return None, None, "no_candidate"
    counts = Counter(value for _, value, _ in candidates)
    value, count = counts.most_common(1)[0]
    if count >= 2:
        confidences = [confidence for _, candidate, confidence in candidates if candidate == value]
        return int(value), sum(confidences) / len(confidences), "threshold_consensus"

    ranked = sorted(candidates, key=lambda item: item[2], reverse=True)
    best = ranked[0]
    if best[2] >= 80 and all(item[2] < 50 for item in ranked[1:]):
        return int(best[1]), best[2], "high_confidence_dominance"
    return None, None, "weak_or_conflicting"


def render_context(pdf, geometry, grid, output_path):
    scale = 300 / 250
    spacing = geometry["spacing_250"] * scale
    x = max(0, int(round(grid["left_grid_x"] - spacing * 0.70)))
    right = int(round(grid["right_grid_x"] + spacing * 1.10))
    y = max(0, int(round(geometry["header_top_250"] * scale - 80)))
    bottom = grid["body_y1"]
    prefix = output_path.with_suffix("")
    subprocess.run(
        [
            "pdftoppm", "-f", "1", "-singlefile", "-png", "-r", "300",
            "-x", str(x), "-y", str(y), "-W", str(max(1, right - x)),
            "-H", str(max(1, bottom - y)), str(pdf), str(prefix),
        ],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    rendered = Path(f"{prefix}.png")
    if rendered != output_path and rendered.exists():
        rendered.replace(output_path)
    if not output_path.exists():
        fail("Failed to render rejected-ballot context artifact")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", default="/tmp/iebc-form34b-ocr-changamwe.pdf")
    parser.add_argument("--primary-tsv", default="/tmp/iebc-form34b-ocr.tsv")
    parser.add_argument("--label-tsv", default="/tmp/iebc-form34b-labels-page1.tsv")
    parser.add_argument("--output", default="/tmp/p23-form34b-rejected-cell-candidates.json")
    parser.add_argument("--context", default="/tmp/iebc-form34b-rejected-context-page1.png")
    args = parser.parse_args()

    pdf = Path(args.pdf)
    primary = Path(args.primary_tsv)
    label = Path(args.label_tsv)
    output = Path(args.output)
    context = Path(args.context)
    for required in (pdf, primary, label, OCR_CONTRACT_PATH, HELPER_PATH):
        if not required.exists():
            fail(f"Missing required input: {required}")

    with open(OCR_CONTRACT_PATH, encoding="utf-8") as handle:
        ocr_contract = json.load(handle)
    sample = ocr_contract.get("sample") or ocr_contract.get("sample_form") or {}

    geometry = header_geometry(primary, label)
    if geometry["page"] != 1:
        fail(f"Governed sample target headers moved off page 1: page={geometry['page']}")

    workdir = Path("/tmp/p23-rejected-cell-probe")
    workdir.mkdir(parents=True, exist_ok=True)
    page_pgm = render_page(pdf, workdir / "form34b-page1")
    width, height, data = read_pgm(page_pgm)
    grid = detect_grid(width, height, data, geometry)
    images = threshold_images(width, data, grid, workdir)
    intervals = row_intervals(grid, images["crop_y0"])
    if not intervals:
        fail("No rejected-ballot table row intervals detected")

    per_threshold = {
        threshold: assign_candidates(tesseract_rows(path), intervals)
        for threshold, path in images["paths"].items()
    }

    rows = []
    strong_count = 0
    for row_index in range(len(intervals)):
        candidates = []
        for threshold in THRESHOLDS:
            if row_index in per_threshold[threshold]:
                value, confidence = per_threshold[threshold][row_index]
                candidates.append((threshold, value, confidence))
        selected, confidence, decision = decide(candidates)
        strong = selected is not None
        strong_count += int(strong)
        rows.append({
            "row_index": row_index,
            "machine_transcription": selected,
            "machine_confidence": round(confidence, 2) if confidence is not None else None,
            "candidate_state": "strong_machine_candidate" if strong else ("weak_machine_candidate" if candidates else "unreadable"),
            "decision": decision,
            "threshold_candidates": [
                {"threshold": threshold, "value": int(value), "confidence": round(candidate_confidence, 2)}
                for threshold, value, candidate_confidence in candidates
            ],
        })

    unresolved = [row["row_index"] for row in rows if row["machine_transcription"] is None]
    coverage = strong_count / len(rows)
    aggregate = None if unresolved else sum(int(row["machine_transcription"]) for row in rows)

    render_context(pdf, geometry, grid, context)
    output.parent.mkdir(parents=True, exist_ok=True)
    document = {
        "schema_version": "kda.p23.form34b.rejected-cell-candidates.v1",
        "purpose": "Machine-candidate transcription of the governed sample Form 34B rejected-ballot polling-station cells. No candidate is source_verified and nothing in this artifact is eligible for promotion.",
        "form_id": sample.get("form_id") or ocr_contract.get("sample_form_id"),
        "constituency": sample.get("constituency") or sample.get("constituency_name") or ocr_contract.get("sample_constituency"),
        "source_pdf_sha256": sha256_file(pdf),
        "page_image_sha256": sha256_file(page_pgm),
        "context_image_sha256": sha256_file(context),
        "page_number": 1,
        "render_dpi": 300,
        "thresholds": list(THRESHOLDS),
        "grid": {
            "horizontal_lines": len(grid["horizontal_groups"]),
            "detected_rows": len(intervals),
            "left_grid_x_300": grid["left_grid_x"],
            "right_grid_x_300": grid["right_grid_x"],
            "left_rule_strength": round(grid["left_rule_strength"], 4),
            "right_rule_strength": round(grid["right_rule_strength"], 4),
            "digit_crop_x0_300": images["digit_x0"],
            "digit_crop_x1_300": images["digit_x1"],
        },
        "summary": {
            "rows": len(rows),
            "strong_machine_candidates": strong_count,
            "weak_or_unreadable_rows": len(rows) - strong_count,
            "candidate_coverage_pct": round(100 * coverage, 2),
            "minimum_sample_coverage_pct": round(100 * MIN_STRONG_COVERAGE, 2),
            "aggregate_rejected_ballots_machine_candidate": aggregate,
            "promotion_authorized": False,
            "source_verified_values": 0,
        },
        "rows": rows,
        "unresolved_rows": unresolved,
        "verification_state": "machine_candidate",
        "promotion_authorized": False,
        "note": "Cell candidates are derived only from the header-anchored Rejected Ballots column and source-image table rules. They remain machine candidates under data/p23/form34b-extraction-contract.json and require independent source-image verification before any constituency observation can be promoted.",
    }
    with open(output, "w", encoding="utf-8") as handle:
        json.dump(document, handle, indent=2)
        handle.write("\n")

    print(
        "P23_FORM34B_REJECTED_CELL_CANDIDATES "
        f"rows={len(rows)} strong={strong_count} unresolved={len(unresolved)} "
        f"coverage_pct={100 * coverage:.2f} minimum_pct={100 * MIN_STRONG_COVERAGE:.2f} "
        f"aggregate_candidate={'set' if aggregate is not None else 'null'} "
        "source_verified=0 promotion_authorized=false values_logged=0"
    )
    required = math.ceil(len(rows) * MIN_STRONG_COVERAGE)
    if strong_count < required:
        fail(f"Rejected-ballot machine-candidate coverage below governed sample gate: strong={strong_count} required={required}")


if __name__ == "__main__":
    main()
