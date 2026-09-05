#!/usr/bin/env python3
"""Failure-directed, diagnostic-only P23 Form 34B grid smoke wrapper.

The governed Changamwe detector thresholds and structural checks remain unchanged.
This wrapper vectorizes only the row/column dark-pixel counts used by that detector,
then retries known scan/layout failures under a small declared profile set. No page
is accepted unless the machine-read registered-voter cell exactly matches the
existing governed constituency denominator. Result values remain machine candidates
and non-promotable.
"""

import importlib.util
import re
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path.cwd()
BASE_SCRIPT = ROOT / "scripts/p23/probe-form34b-grid-smoke.py"

PROFILES = {
    "governed_default": {},
    "short_table": {
        "MIN_HORIZONTAL_LINES": 12,
        "ROW_GAP_MIN": 12,
        "ROW_GAP_MAX": 65,
    },
    "mid_contrast": {
        "DARK_CUTOFF": 160,
        "HORIZONTAL_DARK_FRACTION": 0.40,
        "VERTICAL_DARK_FRACTION": 0.40,
        "MAJOR_RULE_MIN_STRENGTH": 0.50,
        "MIN_HORIZONTAL_LINES": 10,
        "ROW_GAP_MIN": 10,
        "ROW_GAP_MAX": 70,
    },
    "vertical_strict": {
        "DARK_CUTOFF": 170,
        "HORIZONTAL_DARK_FRACTION": 0.35,
        "VERTICAL_DARK_FRACTION": 0.52,
        "MAJOR_RULE_MIN_STRENGTH": 0.62,
        "MIN_HORIZONTAL_LINES": 10,
        "ROW_GAP_MIN": 10,
        "ROW_GAP_MAX": 70,
    },
    "vertical_loose": {
        "DARK_CUTOFF": 170,
        "HORIZONTAL_DARK_FRACTION": 0.35,
        "VERTICAL_DARK_FRACTION": 0.22,
        "MAJOR_RULE_MIN_STRENGTH": 0.30,
        "MIN_HORIZONTAL_LINES": 10,
        "ROW_GAP_MIN": 10,
        "ROW_GAP_MAX": 70,
    },
    "light_scan": {
        "DARK_CUTOFF": 185,
        "HORIZONTAL_DARK_FRACTION": 0.30,
        "VERTICAL_DARK_FRACTION": 0.30,
        "MAJOR_RULE_MIN_STRENGTH": 0.40,
        "MIN_HORIZONTAL_LINES": 8,
        "ROW_GAP_MIN": 8,
        "ROW_GAP_MAX": 75,
    },
}

PROFILE_ATTEMPTS = Counter()
PROFILE_GRIDS = Counter()
PROFILE_DENOMINATOR_HITS = Counter()


def fail(message):
    raise SystemExit(message)


def load_base():
    spec = importlib.util.spec_from_file_location("p23_grid_smoke_base", BASE_SCRIPT)
    if spec is None or spec.loader is None:
        fail(f"Unable to import governed grid smoke: {BASE_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def vectorized_detect_table_grid(sample, width, height, data):
    """Equivalent to the governed detector, with only pixel-count loops vectorized."""
    raster = np.frombuffer(data, dtype=np.uint8).reshape((height, width))

    row_x0 = max(0, int(round(width * 0.05)))
    row_x1 = min(width, int(round(width * 0.93)))
    y0 = max(0, int(round(height * 0.15)))
    y1 = min(height, int(round(height * 0.85)))
    if row_x1 <= row_x0 or y1 <= y0:
        fail("Form 34B page table search window is empty")

    row_fractions = np.mean(raster[y0:y1, row_x0:row_x1] < sample.DARK_CUTOFF, axis=1)
    candidate_rows = (np.flatnonzero(row_fractions >= sample.HORIZONTAL_DARK_FRACTION) + y0).tolist()
    horizontal = sample.stable_horizontal_run(sample.groups(candidate_rows))
    if len(horizontal) < sample.MIN_HORIZONTAL_LINES:
        fail(f"Form 34B page-2 table run unresolved: horizontal_lines={len(horizontal)}")

    body_y0 = horizontal[0][0]
    body_y1 = horizontal[-1][-1] + 1
    x0 = max(0, int(round(width * 0.04)))
    x1 = min(width, int(round(width * 0.93)))
    if x1 <= x0 or body_y1 <= body_y0:
        fail("Form 34B page table body window is empty")

    col_fractions = np.mean(raster[body_y0:body_y1, x0:x1] < sample.DARK_CUTOFF, axis=0)
    candidate_cols = (np.flatnonzero(col_fractions >= sample.VERTICAL_DARK_FRACTION) + x0).tolist()
    vertical_groups = sample.groups(candidate_cols)
    scored = []
    for group in vertical_groups:
        fractions = col_fractions[np.asarray(group, dtype=np.int64) - x0]
        strength = float(np.max(fractions)) if len(fractions) else 0.0
        center = sum(group) / len(group)
        if len(group) >= 3 and strength >= sample.MAJOR_RULE_MIN_STRENGTH:
            scored.append((center, group, strength))

    if len(scored) != sample.EXPECTED_MAJOR_VERTICAL_RULES:
        fail(
            "Governed page-2 table vertical-rule structure changed: "
            f"major_rules={len(scored)} expected={sample.EXPECTED_MAJOR_VERTICAL_RULES}"
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


def recommended_profiles(reason):
    if "horizontal_lines=" in reason:
        return ["short_table", "mid_contrast", "light_scan"]
    match = re.search(r"major_rules=(\d+)", reason)
    if match:
        count = int(match.group(1))
        if count > 10:
            return ["vertical_strict", "mid_contrast", "light_scan"]
        if count < 10:
            return ["vertical_loose", "mid_contrast", "light_scan"]
    return ["mid_contrast", "light_scan"]


def make_adaptive_discover(base):
    def adaptive_discover_final_rows(sample, pdf, page_count, denominator, workdir):
        governed_keys = (
            "DARK_CUTOFF",
            "HORIZONTAL_DARK_FRACTION",
            "VERTICAL_DARK_FRACTION",
            "MAJOR_RULE_MIN_STRENGTH",
            "MIN_HORIZONTAL_LINES",
            "ROW_GAP_MIN",
            "ROW_GAP_MAX",
        )
        originals = {key: getattr(sample, key) for key in governed_keys}
        hits = []
        diagnostics = []

        try:
            for page in range(1, page_count + 1):
                pgm = base.render_page(pdf, page, workdir / f"page-{page}")
                width, height, data = sample.read_pgm(pgm)
                queue = ["governed_default"]
                tried = set()
                attempts = []
                matched = None

                while queue:
                    profile = queue.pop(0)
                    if profile in tried:
                        continue
                    tried.add(profile)
                    PROFILE_ATTEMPTS[profile] += 1
                    for key, value in originals.items():
                        setattr(sample, key, value)
                    for key, value in PROFILES[profile].items():
                        setattr(sample, key, value)

                    try:
                        grid = vectorized_detect_table_grid(sample, width, height, data)
                    except SystemExit as error:
                        reason = str(error)[:180]
                        attempts.append({"profile": profile, "grid_detected": False, "reason": reason})
                        for candidate in recommended_profiles(reason):
                            if candidate not in tried and candidate not in queue:
                                queue.append(candidate)
                        continue

                    PROFILE_GRIDS[profile] += 1
                    rules = grid["vertical_rules"]
                    registered, evidence = base.candidate_for_cell(
                        sample,
                        width,
                        data,
                        rules[2],
                        rules[3],
                        grid["total_top"],
                        grid["total_bottom"],
                        workdir,
                        f"locator-p{page}-{profile}-registered",
                    )
                    denominator_match = registered == denominator
                    attempts.append({
                        "profile": profile,
                        "grid_detected": True,
                        "major_vertical_rules": len(rules),
                        "registered_denominator_match": denominator_match,
                    })
                    if denominator_match:
                        PROFILE_DENOMINATOR_HITS[profile] += 1
                        matched = (profile, grid, evidence)
                        break

                    for candidate in ("mid_contrast", "light_scan"):
                        if candidate not in tried and candidate not in queue:
                            queue.append(candidate)

                diagnostics.append({
                    "page_number": page,
                    "grid_detected": any(item.get("grid_detected") for item in attempts),
                    "registered_denominator_match": matched is not None,
                    "matched_profile": matched[0] if matched else None,
                    "profile_attempts": attempts,
                })

                if matched is None:
                    continue
                profile, grid, evidence = matched
                hits.append({
                    "page_number": page,
                    "pgm": str(pgm),
                    "width": width,
                    "rules": grid["vertical_rules"],
                    "row_top": grid["total_top"],
                    "row_bottom": grid["total_bottom"],
                    "registered_locator_evidence": evidence,
                    "detection_profile": profile,
                })
        finally:
            for key, value in originals.items():
                setattr(sample, key, value)

        return hits, diagnostics

    return adaptive_discover_final_rows


def main():
    base = load_base()
    base.discover_final_rows = make_adaptive_discover(base)
    base.main()
    print(
        "P23_FORM34B_ADAPTIVE_GRID_DIAGNOSTIC "
        f"profile_attempts={dict(PROFILE_ATTEMPTS)} "
        f"grid_profiles={dict(PROFILE_GRIDS)} "
        f"denominator_hits={dict(PROFILE_DENOMINATOR_HITS)} "
        "source_verified_values=0 promotion_authorized=false"
    )


if __name__ == "__main__":
    main()
