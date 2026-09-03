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

MAX_WINDOW_WORDS = 5
MAX_VERTICAL_SEGMENT_WORDS = 3
MAX_VERTICAL_SEGMENT_WIDTH_PX = 700
VERTICAL_GAP_PX = 180


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


def candidate_score(phrase, target):
    char_similarity = SequenceMatcher(None, phrase, target).ratio()
    token_mean, token_min = token_alignment(phrase, target)
    return char_similarity, token_mean, token_min


def read_words(path):
    words = []
    with open(path, encoding="utf-8", errors="replace") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            text = clean((row.get("text") or "").strip())
            if not text:
                continue
            # Numeric OCR content is excluded from this diagnostic. Geometry is
            # retained only for alphabetic label tokens.
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
                    }
                )
    return words


def build_segments(words):
    grouped = defaultdict(list)
    for word in words:
        grouped[(word["page"], word["block"], word["par"], word["line"])].append(word)

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
                        "page": key[0],
                        "bbox": bbox_union(chunk),
                        "mode": "line",
                    }
                )

    # Form 34B column headers can wrap onto two OCR lines. Join nearby segments
    # only when their horizontal footprints materially overlap, preventing
    # unrelated neighbouring columns from being merged.
    by_page = defaultdict(list)
    for segment in segments:
        by_page[segment["page"]].append(segment)

    vertical = []
    for page_segments in by_page.values():
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


def locate_targets(candidates):
    findings = {}
    for field, variants in TARGETS.items():
        best = None
        for candidate in candidates:
            for target in variants:
                char_similarity, token_mean, token_min = candidate_score(candidate["phrase"], target)
                candidate_words = len(candidate["phrase"].split())
                target_words = len(target.split())
                extra_words = abs(candidate_words - target_words)
                bbox_width = candidate["bbox"][2] - candidate["bbox"][0]
                # Token similarity alone can over-reward a wide phrase that happens
                # to contain the target words from neighbouring columns. Penalise
                # extra words and prefer the most compact spatial match.
                semantic_score = max(char_similarity, token_mean - 0.08 * extra_words)
                rank = (
                    semantic_score,
                    -extra_words,
                    token_min,
                    -bbox_width,
                    candidate["mean_conf"],
                )
                if best is None or rank > best["rank"]:
                    best = {
                        "rank": rank,
                        "char_similarity": char_similarity,
                        "token_mean": token_mean,
                        "token_min": token_min,
                        "mean_conf": candidate["mean_conf"],
                        "page": candidate["page"],
                        "mode": candidate["mode"],
                        "bbox": candidate["bbox"],
                        "target_variant": target,
                    }
        findings[field] = best or {
            "char_similarity": 0.0,
            "token_mean": 0.0,
            "token_min": 0.0,
            "mean_conf": -1.0,
            "page": 0,
            "mode": "none",
            "bbox": (0, 0, 0, 0),
            "target_variant": "",
        }
    return findings


def evaluate_locations(findings):
    # The original character-similarity threshold is preserved. The spatial
    # fallback is stricter: every target token must have a plausible match and
    # the average token similarity must be strong. No numeric OCR value is read
    # or emitted by this diagnostic.
    located = {}
    for field, finding in findings.items():
        textual_match = finding["char_similarity"] >= 0.62
        spatial_token_match = finding["token_mean"] >= 0.72 and finding["token_min"] >= 0.55
        located[field] = (textual_match or spatial_token_match) and finding["mean_conf"] >= 30
    return located


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tsv")
    args = parser.parse_args()

    words = read_words(args.tsv)
    candidates = build_segments(words)
    findings = locate_targets(candidates)
    located = evaluate_locations(findings)
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
                f"mean_conf:{findings[field]['mean_conf']:.2f},"
                f"page:{findings[field]['page']},mode:{findings[field]['mode']},"
                f"x_center:{(findings[field]['bbox'][0] + findings[field]['bbox'][2]) / 2:.1f},"
                f"bbox_width:{findings[field]['bbox'][2] - findings[field]['bbox'][0]}"
            )
            for field in TARGETS
        )
    )
    print(
        f"P23_FORM34B_FIELD_LOCATOR_FEASIBLE located={count}/3 "
        f"feasible={str(feasible).lower()} values_emitted=0"
    )


if __name__ == "__main__":
    main()
