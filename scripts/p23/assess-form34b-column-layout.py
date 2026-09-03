#!/usr/bin/env python3
import argparse
import csv
import os
import re
import runpy

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = runpy.run_path(os.path.join(HERE, "assess-form34b-field-labels.py"))

TARGETS = HELPER["TARGETS"]
read_words = HELPER["read_words"]
build_segments = HELPER["build_segments"]
locate_ordered_targets = HELPER["locate_ordered_targets"]
center_x = HELPER["center_x"]

NUMERIC_TOKEN = re.compile(r"^[0-9][0-9,.\s]*$")


def as_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def as_float(value, default=-1.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def read_numeric_tokens(path):
    tokens = []
    page_dims = {}
    with open(path, encoding="utf-8", errors="replace") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            page = as_int(row.get("page_num"))
            level = as_int(row.get("level"))
            width = as_int(row.get("width"))
            height = as_int(row.get("height"))
            if level == 1 and page:
                page_dims[page] = (width, height)

            raw = (row.get("text") or "").strip()
            if not raw or not NUMERIC_TOKEN.fullmatch(raw):
                continue
            digits = re.sub(r"\D", "", raw)
            if not digits:
                continue
            tokens.append(
                {
                    "page": page,
                    "left": as_int(row.get("left")),
                    "top": as_int(row.get("top")),
                    "width": width,
                    "height": height,
                    "conf": as_float(row.get("conf")),
                    # Numeric transcription is deliberately discarded here.
                    "digit_count": len(digits),
                }
            )
    return tokens, page_dims


def empty_stats(page=0):
    return {
        field: {
            "page": page,
            "numeric_tokens": 0,
            "row_bands": 0,
            "mean_conf": -1.0,
            "x_center": 0.0,
            "half_width": 0.0,
        }
        for field in TARGETS
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tsv")
    args = parser.parse_args()

    words = read_words(args.tsv)
    ordered = locate_ordered_targets(build_segments(words))
    numeric_tokens, page_dims = read_numeric_tokens(args.tsv)

    if not ordered:
        stats = empty_stats()
        print(
            "P23_FORM34B_COLUMN_LAYOUT "
            + " ".join(
                f"{field}=page:0,tokens:0,row_bands:0,mean_conf:-1.00,x_center:0.0,half_width:0.0"
                for field in TARGETS
            )
        )
        print(
            "P23_FORM34B_COLUMN_LAYOUT_FEASIBLE ordered_triplet=false "
            "density_ok=false feasible=false values_emitted=0"
        )
        return

    findings = ordered["findings"]
    page = ordered["page"]
    page_height = page_dims.get(page, (0, 0))[1]
    valid_center = center_x(findings["total_valid_votes"])
    rejected_center = center_x(findings["rejected_ballots"])
    adjacent_spacing = rejected_center - valid_center

    # Total Valid Votes and Rejected Ballots are adjacent columns on Form 34B.
    # Use their observed header spacing as the scan-specific column-width scale.
    # Registered Voters is separated from Total Valid Votes by candidate columns,
    # so it gets the same calibrated half-width around its own ordered header
    # center rather than a midpoint across unrelated columns.
    calibrated_half_width = max(35.0, min(180.0, adjacent_spacing * 0.45))
    header_bottom = max(finding["bbox"][3] for finding in findings.values())
    footer_limit = page_height * 0.90 if page_height else float("inf")

    stats = {}
    for field in TARGETS:
        x_center = center_x(findings[field])
        candidates = []
        for token in numeric_tokens:
            if token["page"] != page:
                continue
            token_center = token["left"] + token["width"] / 2.0
            token_mid_y = token["top"] + token["height"] / 2.0
            if abs(token_center - x_center) > calibrated_half_width:
                continue
            if token_mid_y <= header_bottom:
                continue
            if token_mid_y >= footer_limit:
                continue
            candidates.append(token)

        confs = [token["conf"] for token in candidates if token["conf"] >= 0]
        y_bands = {round((token["top"] + token["height"] / 2.0) / 12) for token in candidates}
        stats[field] = {
            "page": page,
            "numeric_tokens": len(candidates),
            "row_bands": len(y_bands),
            "mean_conf": sum(confs) / len(confs) if confs else -1.0,
            "x_center": x_center,
            "half_width": calibrated_half_width,
        }

    density_ok = all(
        stats[field]["numeric_tokens"] >= 3
        and stats[field]["row_bands"] >= 3
        and stats[field]["mean_conf"] >= 35
        for field in TARGETS
    )
    feasible = density_ok

    print(
        "P23_FORM34B_COLUMN_LAYOUT "
        + " ".join(
            (
                f"{field}=page:{stats[field]['page']},"
                f"tokens:{stats[field]['numeric_tokens']},"
                f"row_bands:{stats[field]['row_bands']},"
                f"mean_conf:{stats[field]['mean_conf']:.2f},"
                f"x_center:{stats[field]['x_center']:.1f},"
                f"half_width:{stats[field]['half_width']:.1f}"
            )
            for field in TARGETS
        )
    )
    print(
        f"P23_FORM34B_COLUMN_LAYOUT_FEASIBLE ordered_triplet=true "
        f"adjacent_spacing={adjacent_spacing:.1f} density_ok={str(density_ok).lower()} "
        f"feasible={str(feasible).lower()} values_emitted=0"
    )


if __name__ == "__main__":
    main()
