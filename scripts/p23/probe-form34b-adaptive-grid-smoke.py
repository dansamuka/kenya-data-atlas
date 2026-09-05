#!/usr/bin/env python3
"""Failure-directed, diagnostic-only P23 Form 34B grid smoke wrapper.

The governed Changamwe detector remains unchanged. A page is retried only when the
base detector reports a known scan/layout failure, and no page is accepted unless
the machine-read registered-voter cell exactly matches the governed constituency
denominator. Result values remain machine candidates and non-promotable.
"""

import importlib.util
import re
from collections import Counter
from pathlib import Path

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
                        grid = sample.detect_table_grid(width, height, data)
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

                    # A structurally plausible but wrong row may still be a scan-threshold
                    # artefact. Allow only the two broad contrast fallbacks; denominator
                    # reconciliation remains the acceptance condition.
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
