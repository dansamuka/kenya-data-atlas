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
locate_targets = HELER = HELPER["locate_targets"]
evaluate_locations = HELPER["evaluate_locations"]

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
                    # The numeric transcription is deliberately not retained.
                    "digit_count": len(digits),
                }
            )
    return tokens, page_dims


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tsv")
    args = parser.parse_args()

    words = read_words(args.tsv)
    findings = locate_targets(build_segments(words))
    located = evaluate_locations(findings)
    numeric_tokens, page_dims = read_numeric_tokens(args.tsv)

    centers = {}
    stats = {}
    for field in TARGETS:
        finding = findings[field]
        left, top, right, bottom = finding["bbox"]
        center = (left + right) / 2 if right > left else 0.0
        centers[field] = center
        width = max(1.0, right - left)
        margin = max(35.0, width * 0.30)
        page = finding["page"]
        page_height = page_dims.get(page, (0, 0))[1]

        candidates = []
        for token in numeric_tokens:
            if token["page"] != page:
                continue
            token_center = token["left"] + token["width"] / 2
            token_mid_y = token["top"] + token["height"] / 2
            if token_center < left - margin or token_center > right + margin:
                continue
            if token_mid_y <= bottom:
                continue
            # Avoid signature/footer regions while keeping the table body.
            if page_height and token_mid_y >= page_height * 0.86:
                continue
            candidates.append(token)

        confs = [token["conf"] for token in candidates if token["conf"] >= 0]
        y_bands = {round((token["top"] + token["height"] / 2) / 12) for token in candidates}
        stats[field] = {
            "page": page,
            "numeric_tokens": len(candidates),
            "row_bands": len(y_bands),
            "mean_conf": sum(confs) / len(confs) if confs else -1.0,
        }

    order_ok = (
        all(located.values())
        and centers["registered_voters"] < centers["total_valid_votes"] < centers["rejected_ballots"]
    )
    density_ok = all(
        stats[field]["numeric_tokens"] >= 3
        and stats[field]["row_bands"] >= 3
        and stats[field]["mean_conf"] >= 35
        for field in TARGETS
    )
    feasible = all(located.values()) and order_ok and density_ok

    print(
        "P23_FORM34B_COLUMN_LAYOUT "
        + " ".join(
            (
                f"{field}=page:{stats[field]['page']},"
                f"tokens:{stats[field]['numeric_tokens']},"
                f"row_bands:{stats[field]['row_bands']},"
                f"mean_conf:{stats[field]['mean_conf']:.2f}"
            )
            for field in TARGETS
        )
    )
    print(
        f"P23_FORM34B_COLUMN_LAYOUT_FEASIBLE labels={sum(located.values())}/3 "
        f"order_ok={str(order_ok).lower()} density_ok={str(density_ok).lower()} "
        f"feasible={str(feasible).lower()} values_emitted=0"
    )


if __name__ == "__main__":
    main()
