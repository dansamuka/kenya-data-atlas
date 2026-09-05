#!/usr/bin/env python3
"""Adaptive, diagnostic-only wrapper for the governed P23 Form 34B grid smoke.

This file deliberately does not change the governed Changamwe sample extractor.
It retries the existing grid detector with a small, declared set of scan/layout
profiles, then accepts a page locator only when the machine-read registered-voter
cell exactly matches the already-governed constituency denominator. All result
values remain machine candidates and non-promotable under the existing contract.
"""

import importlib.util
from collections import Counter
from pathlib import Path

ROOT = Path.cwd()
BASE_SCRIPT = ROOT / "scripts/p23/probe-form34b-grid-smoke.py"

# Ordered from least to most relaxed. Every profile still uses the existing
# detector's structural checks (including exactly 10 major vertical rules and
# governed target-cell width bounds). The denominator match remains the locator
# anchor outside this function.
PROFILES = [
    ("governed_default", {}),
    ("short_table", {
        "MIN_HORIZONTAL_LINES": 12,
        "ROW_GAP_MIN": 12,
        "ROW_GAP_MAX": 65,
    }),
    ("mid_contrast", {
        "DARK_CUTOFF": 160,
        "HORIZONTAL_DARK_FRACTION": 0.40,
        "VERTICAL_DARK_FRACTION": 0.40,
        "MAJOR_RULE_MIN_STRENGTH": 0.50,
        "MIN_HORIZONTAL_LINES": 12,
        "ROW_GAP_MIN": 12,
        "ROW_GAP_MAX": 65,
    }),
    ("vertical_strict", {
        "DARK_CUTOFF": 170,
        "HORIZONTAL_DARK_FRACTION": 0.35,
        "VERTICAL_DARK_FRACTION": 0.52,
        "MAJOR_RULE_MIN_STRENGTH": 0.62,
        "MIN_HORIZONTAL_LINES": 10,
        "ROW_GAP_MIN": 10,
        "ROW_GAP_MAX": 70,
    }),
    ("vertical_loose", {
        "DARK_CUTOFF": 170,
        "HORIZONTAL_DARK_FRACTION": 0.35,
        "VERTICAL_DARK_FRACTION": 0.22,
        "MAJOR_RULE_MIN_STRENGTH": 0.30,
        "MIN_HORIZONTAL_LINES": 10,
        "ROW_GAP_MIN": 10,
        "ROW_GAP_MAX": 70,
    }),
    ("light_scan", {
        "DARK_CUTOFF": 180,
        "HORIZONTAL_DARK_FRACTION": 0.32,
        "VERTICAL_DARK_FRACTION": 0.32,
        "MAJOR_RULE_MIN_STRENGTH": 0.42,
        "MIN_HORIZONTAL_LINES": 10,
        "ROW_GAP_MIN": 10,
        "ROW_GAP_MAX": 70,
    }),
    ("very_light_scan", {
        "DARK_CUTOFF": 200,
        "HORIZONTAL_DARK_FRACTION": 0.25,
        "VERTICAL_DARK_FRACTION": 0.25,
        "MAJOR_RULE_MIN_STRENGTH": 0.35,
        "MIN_HORIZONTAL_LINES": 8,
        "ROW_GAP_MIN": 8,
        "ROW_GAP_MAX": 75,
    }),
]

PROFILE_GRID_COUNTS = Counter()
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


def detect_profile_grids(sample, width, height, data):
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
    grids = []
    failures = []
    seen = set()
    try:
        for name, overrides in PROFILES:
            for key, value in originals.items():
                setattr(sample, key, value)
            for key, value in overrides.items():
                setattr(sample, key, value)
            try:
                grid = sample.detect_table_grid(width, height, data)
            except SystemExit as error:
                failures.append({"profile": name, "reason": str(error)[:180]})
                continue
            key = (
                tuple(grid.get("vertical_rules") or []),
                int(grid.get("total_top") or 0),
                int(grid.get("total_bottom") or 0),
            )
            if key in seen:
                continue
            seen.add(key)
            PROFILE_GRID_COUNTS[name] += 1
            grids.append((name, grid))
    finally:
        for key, value in originals.items():
            setattr(sample, key, value)
    return grids, failures


def make_adaptive_discover(base):
    def adaptive_discover_final_rows(sample, pdf, page_count, denominator, workdir):
        hits = []
        diagnostics = []
        for page in range(1, page_count + 1):
            pgm = base.render_page(pdf, page, workdir / f"page-{page}")
            width, height, data = sample.read_pgm(pgm)
            grids, failures = detect_profile_grids(sample, width, height, data)
            attempts = []
            matched = None
            for profile, grid in grids:
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
                    "major_vertical_rules": len(rules),
                    "registered_denominator_match": denominator_match,
                })
                if denominator_match:
                    PROFILE_DENOMINATOR_HITS[profile] += 1
                    matched = (profile, grid, evidence)
                    break

            diagnostics.append({
                "page_number": page,
                "grid_detected": bool(grids),
                "grid_profiles": [name for name, _ in grids],
                "registered_denominator_match": matched is not None,
                "matched_profile": matched[0] if matched else None,
                "profile_attempts": attempts,
                "failure_samples": failures[:3],
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
        return hits, diagnostics

    return adaptive_discover_final_rows


def main():
    base = load_base()
    base.discover_final_rows = make_adaptive_discover(base)
    base.main()
    print(
        "P23_FORM34B_ADAPTIVE_GRID_DIAGNOSTIC "
        f"grid_profiles={dict(PROFILE_GRID_COUNTS)} "
        f"denominator_hits={dict(PROFILE_DENOMINATOR_HITS)} "
        "source_verified_values=0 promotion_authorized=false"
    )


if __name__ == "__main__":
    main()
