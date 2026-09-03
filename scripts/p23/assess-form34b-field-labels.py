#!/usr/bin/env python3
import argparse
import csv
import re
from collections import defaultdict
from difflib import SequenceMatcher

TARGETS = {
    "registered_voters": [
        "REGISTERED VOTERS",
        "NUMBER OF REGISTERED VOTERS",
        "TOTAL REGISTERED VOTERS",
    ],
    "total_valid_votes": [
        "TOTAL VALID VOTES",
        "TOTAL NUMBER OF VALID VOTES",
        "TOTAL VALID VOTES CAST",
    ],
    "rejected_ballots": [
        "REJECTED BALLOTS",
        "REJECTED BALLOT PAPERS",
        "NUMBER OF REJECTED BALLOTS",
    ],
}

FIELD_ANCHORS = {
    "registered_voters": ["REGISTERED", "REGISTER"],
    "total_valid_votes": ["VALID"],
    "rejected_ballots": ["REJECTED", "REJECT"],
}
FIELD_ANCHOR_THRESHOLD = {
    "registered_voters": 0.60,
    "total_valid_votes": 0.70,
    "rejected_ballots": 0.65,
}

MAX_WINDOW_WORDS = 5
MAX_VERTICAL_SEGMENT_WORDS = 3
MAX_VERTICAL_SEGMENT_WIDTH_PX = 700
VERTICAL_GAP_PX = 180
ORDERED_MATCH_LIMIT = 120
ORDERED_HEADER_Y_SPREAD_PX = 240


def clean(value):
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z ]+", " ", value.upper())).strip()


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


def bbox_union(words):
    left = min(w["left"] for w in words)
    top = min(w["top"] for w in words)
    right = max(w["left"] + w["width"] for w in words)
    bottom = max(w["top"] + w["height"] for w in words)
    return (left, top, right, bottom)


def center_x(finding):
    return (finding["bbox"][0] + finding["bbox"][2]) / 2.0


def center_y(finding):
    return (finding["bbox"][1] + finding["bbox"][3]) / 2.0


def bbox_width(finding):
    return max(0, finding["bbox"][2] - finding["bbox"][0])


def horizontal_overlap(a, b):
    overlap = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    denom = max(1, min(a[2] - a[0], b[2] - b[0]))
    return overlap / denom


def token_alignment(candidate, target):
    source = candidate.split()
    wanted = target.split()
    if not source or not wanted:
        return 0.0, 0.0

    scores = []
    for token in wanted:
        best = max(SequenceMatcher(None, token, source_token).ratio() for source_token in source)
        scores.append(best)
    return sum(scores) / len(scores), min(scores)


def anchor_alignment(candidate, field):
    source = candidate.split()
    if not source:
        return 0.0
    return max(
        SequenceMatcher(None, anchor, source_token).ratio()
        for anchor in FIELD_ANCHORS[field]
        for source_token in source
    )


def candidate_score(phrase, target):
    char_similarity = SequenceMatcher(None, phrase, target).ratio()
    token_mean, token_min = token_alignment(phrase, target)
    return char_similarity, token_mean, token_min


def read_words(paths):
    if isinstance(paths, str):
        paths = [paths]
    words = []
    for source_index, path in enumerate(paths):
        with open(path, encoding="utf-8", errors="replace") as handle:
            for row in csv.DictReader(handle, delimiter="\t"):
                text = clean((row.get("text") or "").strip())
                if not text:
                    continue
                # Numeric OCR content is excluded from this diagnostic. Geometry
                # is retained only for alphabetic label tokens.
                for word in text.split():
                    if not word.isalpha():
                        continue
                    words.append(
                        {
                            "text": word,
                            "conf": as_float(row.get("conf")),
                            "page": as_int(row.get("page_num")),
                            "block": as_int(row.get("block_num")),
                            "par": as_int(row.get("par_num")),
                            "line": as_int(row.get("line_num")),
                            "left": as_int(row.get("left")),
                            "top": as_int(row.get("top")),
                            "width": as_int(row.get("width")),
                            "height": as_int(row.get("height")),
                            "source": source_index,
                        }
                    )
    return words


def build_segments(words):
    grouped = defaultdict(list)
    for word in words:
        grouped[
            (
                word["source"],
                word["page"],
                word["block"],
                word["par"],
                word["line"],
            )
        ].append(word)

    segments = []
    for key, line_words in grouped.items():
        line_words.sort(key=lambda item: item["left"])
        for size in range(1, min(MAX_WINDOW_WORDS, len(line_words)) + 1):
            for start in range(0, len(line_words) - size + 1):
                chunk = line_words[start : start + size]
                phrase = " ".join(item["text"] for item in chunk)
                confs = [item["conf"] for item in chunk if item["conf"] >= 0]
                mean_conf = sum(confs) / len(confs) if confs else -1.0
                segments.append(
                    {
                        "phrase": phrase,
                        "mean_conf": mean_conf,
                        "source": key[0],
                        "page": key[1],
                        "bbox": bbox_union(chunk),
                        "mode": "line",
                    }
                )

    # Form 34B column headers can wrap onto two OCR lines. Join nearby segments
    # only within the same OCR source and page when their horizontal footprints
    # materially overlap.
    by_source_page = defaultdict(list)
    for segment in segments:
        by_source_page[(segment["source"], segment["page"])].append(segment)

    vertical = []
    for page_segments in by_source_page.values():
        ordered = sorted(page_segments, key=lambda item: (item["bbox"][1], item["bbox"][0]))
        for i, upper in enumerate(ordered):
            for lower in ordered[i + 1 :]:
                gap = lower["bbox"][1] - upper["bbox"][3]
                if gap < -20:
                    continue
                if gap > VERTICAL_GAP_PX:
                    if lower["bbox"][1] > upper["bbox"][3] + VERTICAL_GAP_PX:
                        break
                    continue
                if horizontal_overlap(upper["bbox"], lower["bbox"]) < 0.45:
                    continue
                upper_words = len(upper["phrase"].split())
                lower_words = len(lower["phrase"].split())
                if upper_words > MAX_VERTICAL_SEGMENT_WORDS or lower_words > MAX_VERTICAL_SEGMENT_WORDS:
                    continue
                if (upper["bbox"][2] - upper["bbox"][0]) > MAX_VERTICAL_SEGMENT_WIDTH_PX:
                    continue
                if (lower["bbox"][2] - lower["bbox"][0]) > MAX_VERTICAL_SEGMENT_WIDTH_PX:
                    continue
                phrase = f'{upper["phrase"]} {lower["phrase"]}'
                if len(phrase.split()) > MAX_WINDOW_WORDS:
                    continue
                confs = [upper["mean_conf"], lower["mean_conf"]]
                confs = [value for value in confs if value >= 0]
                vertical.append(
                    {
                        "phrase": phrase,
                        "mean_conf": sum(confs) / len(confs) if confs else -1.0,
                        "source": upper["source"],
                        "page": upper["page"],
                        "bbox": (
                            min(upper["bbox"][0], lower["bbox"][0]),
                            min(upper["bbox"][1], lower["bbox"][1]),
                            max(upper["bbox"][2], lower["bbox"][2]),
                            max(upper["bbox"][3], lower["bbox"][3]),
                        ),
                        "mode": "vertical",
                    }
                )

    return segments + vertical


def score_match(candidate, target, field):
    char_similarity, token_mean, token_min = candidate_score(candidate["phrase"], target)
    candidate_words = len(candidate["phrase"].split())
    target_words = len(target.split())
    extra_words = abs(candidate_words - target_words)
    width = candidate["bbox"][2] - candidate["bbox"][0]
    semantic_score = max(char_similarity, token_mean - 0.08 * extra_words)
    return {
        "char_similarity": char_similarity,
        "token_mean": token_mean,
        "token_min": token_min,
        "anchor_score": anchor_alignment(candidate["phrase"], field),
        "semantic_score": semantic_score,
        "extra_words": extra_words,
        "mean_conf": candidate["mean_conf"],
        "source": candidate["source"],
        "page": candidate["page"],
        "mode": candidate["mode"],
        "bbox": candidate["bbox"],
        "target_variant": target,
        "rank": (
            semantic_score,
            -extra_words,
            token_min,
            -width,
            candidate["mean_conf"],
        ),
    }


def finding_is_located(field, finding):
    textual_match = finding["char_similarity"] >= 0.62
    spatial_token_match = finding["token_mean"] >= 0.72 and finding["token_min"] >= 0.55
    anchor_match = finding["anchor_score"] >= FIELD_ANCHOR_THRESHOLD[field]
    return (
        (textual_match or spatial_token_match)
        and anchor_match
        and finding["mean_conf"] >= 30
    )


def rank_target_matches(candidates, field, limit=None):
    matches = []
    seen = set()
    for candidate in candidates:
        for target in TARGETS[field]:
            match = score_match(candidate, target, field)
            key = (
                match["source"],
                match["page"],
                match["bbox"],
                match["target_variant"],
            )
            if key in seen:
                continue
            seen.add(key)
            matches.append(match)
    matches.sort(key=lambda item: item["rank"], reverse=True)
    return matches[:limit] if limit else matches


def locate_targets(candidates):
    findings = {}
    for field in TARGETS:
        matches = rank_target_matches(candidates, field, limit=1)
        findings[field] = matches[0] if matches else {
            "char_similarity": 0.0,
            "token_mean": 0.0,
            "token_min": 0.0,
            "anchor_score": 0.0,
            "semantic_score": 0.0,
            "extra_words": 0,
            "mean_conf": -1.0,
            "source": -1,
            "page": 0,
            "mode": "none",
            "bbox": (0, 0, 0, 0),
            "target_variant": "",
            "rank": (0.0, 0, 0.0, 0, -1.0),
        }
    return findings


def locate_ordered_targets(candidates):
    # Geometry must be selected jointly. Independent semantic maxima can choose
    # repeated words from the wrong table area. Only candidates satisfying the
    # field-specific anchor and existing OCR acceptance thresholds participate.
    ranked = {
        field: [
            match
            for match in rank_target_matches(candidates, field, limit=ORDERED_MATCH_LIMIT)
            if finding_is_located(field, match)
        ]
        for field in TARGETS
    }

    best = None
    for valid in ranked["total_valid_votes"]:
        valid_x = center_x(valid)
        valid_y = center_y(valid)
        for rejected in ranked["rejected_ballots"]:
            if rejected["page"] != valid["page"]:
                continue
            rejected_x = center_x(rejected)
            rejected_y = center_y(rejected)
            adjacent_gap = rejected_x - valid_x
            if adjacent_gap <= 25 or adjacent_gap > 600:
                continue
            if abs(rejected_y - valid_y) > ORDERED_HEADER_Y_SPREAD_PX:
                continue
            for registered in ranked["registered_voters"]:
                if registered["page"] != valid["page"]:
                    continue
                registered_x = center_x(registered)
                registered_y = center_y(registered)
                if registered_x >= valid_x - 25:
                    continue
                y_spread = max(registered_y, valid_y, rejected_y) - min(
                    registered_y, valid_y, rejected_y
                )
                if y_spread > ORDERED_HEADER_Y_SPREAD_PX:
                    continue

                trio = {
                    "registered_voters": registered,
                    "total_valid_votes": valid,
                    "rejected_ballots": rejected,
                }
                semantic_scores = [item["semantic_score"] for item in trio.values()]
                anchor_scores = [item["anchor_score"] for item in trio.values()]
                compactness = sum(bbox_width(item) for item in trio.values())
                score = (
                    sum(semantic_scores) + 0.5 * min(semantic_scores),
                    min(anchor_scores),
                    -y_spread,
                    -compactness,
                    -adjacent_gap,
                )
                if best is None or score > best["score"]:
                    best = {
                        "score": score,
                        "findings": trio,
                        "page": valid["page"],
                        "y_spread": y_spread,
                        "adjacent_gap": adjacent_gap,
                    }

    return best


def evaluate_locations(findings):
    return {
        field: finding_is_located(field, finding)
        for field, finding in findings.items()
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tsv", nargs="+")
    args = parser.parse_args()

    words = read_words(args.tsv)
    candidates = build_segments(words)
    findings = locate_targets(candidates)
    located = evaluate_locations(findings)
    ordered = locate_ordered_targets(candidates)
    count = sum(located.values())
    feasible = count == 3

    print(
        "P23_FORM34B_FIELD_LABEL_ASSESSMENT "
        + " ".join(
            (
                f"{field}=located:{str(located[field]).lower()},"
                f"char_similarity:{findings[field]['char_similarity']:.3f},"
                f"token_similarity:{findings[field]['token_mean']:.3f},"
                f"token_min:{findings[field]['token_min']:.3f},"
                f"anchor:{findings[field]['anchor_score']:.3f},"
                f"mean_conf:{findings[field]['mean_conf']:.2f},"
                f"source:{findings[field]['source']},page:{findings[field]['page']},"
                f"mode:{findings[field]['mode']},x_center:{center_x(findings[field]):.1f},"
                f"bbox_width:{bbox_width(findings[field])}"
            )
            for field in TARGETS
        )
    )
    print(
        f"P23_FORM34B_FIELD_LOCATOR_FEASIBLE located={count}/3 "
        f"feasible={str(feasible).lower()} values_emitted=0"
    )

    if ordered:
        ordered_findings = ordered["findings"]
        print(
            "P23_FORM34B_ORDERED_HEADER_TRIPLET "
            f"found=true page={ordered['page']} y_spread={ordered['y_spread']:.1f} "
            f"adjacent_gap={ordered['adjacent_gap']:.1f} "
            + " ".join(
                f"{field}_x={center_x(ordered_findings[field]):.1f}"
                for field in TARGETS
            )
            + " values_emitted=0"
        )
    else:
        print("P23_FORM34B_ORDERED_HEADER_TRIPLET found=false values_emitted=0")


if __name__ == "__main__":
    main()
