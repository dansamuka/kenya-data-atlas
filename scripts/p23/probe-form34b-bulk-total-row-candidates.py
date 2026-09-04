#!/usr/bin/env python3
import argparse
import hashlib
import importlib.util
import json
import re
import subprocess
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.request import HTTPCookieProcessor, Request, build_opener

ROOT = Path.cwd()
SAMPLE_PROBE = ROOT / "scripts/p23/probe-form34b-total-row-candidates.py"
SERIES_PATH = ROOT / "data/indicators/registry/series.json"
OBSERVATIONS_PATH = ROOT / "data/indicators/registry/observations.json"
BASE = "https://forms.iebc.or.ke"
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0"
DPI = 250
DARK_CUTOFF = 140
ROW_DARK_FRACTION = 0.45
COL_DARK_FRACTION = 0.42
MIN_RULE_STRENGTH = 0.50
MIN_RUN_GROUPS = 4
MIN_ROW_GAP = 15
MAX_ROW_GAP = 65
EXPECTED_RULES = 10


def fail(message):
    raise SystemExit(message)


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_sample_probe():
    if not SAMPLE_PROBE.exists():
        fail(f"Missing sample TOTAL-row probe: {SAMPLE_PROBE}")
    spec = importlib.util.spec_from_file_location("p23_total_row_sample", SAMPLE_PROBE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def pdf_pages(path):
    proc = subprocess.run(["pdfinfo", str(path)], check=True, capture_output=True, text=True)
    for line in proc.stdout.splitlines():
        if line.startswith("Pages:"):
            return int(line.split(":", 1)[1].strip())
    fail(f"Unable to determine page count for {path}")


def load_denominators():
    series = json.loads(SERIES_PATH.read_text(encoding="utf-8"))
    observations = json.loads(OBSERVATIONS_PATH.read_text(encoding="utf-8"))
    by_series = {}
    for row in observations:
        by_series.setdefault(row.get("series_id"), []).append(row)
    out = {}
    for code in range(1, 291):
        scode = f"KDA-VOTERS-CON-{code:03d}-2022"
        matches = [row for row in series if row.get("series_code") == scode]
        if len(matches) != 1:
            fail(f"Canonical registered-voter series unresolved for constituency {code}: {len(matches)}")
        own = by_series.get(matches[0].get("series_id"), [])
        if len(own) != 1 or not isinstance(own[0].get("value"), (int, float)):
            fail(f"Canonical registered-voter observation unresolved for constituency {code}")
        value = int(own[0]["value"])
        if value <= 0:
            fail(f"Canonical registered-voter denominator invalid for constituency {code}")
        out[code] = value
    return out


def session():
    jar = CookieJar()
    opener = build_opener(HTTPCookieProcessor(jar))
    for url in (BASE + "/", BASE + "/index.php?id=5&r=common%2Fset-election"):
        try:
            with opener.open(Request(url, headers={"User-Agent": USER_AGENT}), timeout=60) as response:
                response.read()
        except Exception:
            if "set-election" not in url:
                raise
    return opener


def download_pdf(opener, url, path):
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with opener.open(request, timeout=120) as response:
        raw = response.read()
    if not raw.startswith(b"%PDF-"):
        fail(f"Official Form 34B download did not return PDF for {url}")
    path.write_bytes(raw)


def render_page(pdf, page, prefix):
    subprocess.run(
        [
            "pdftoppm", "-f", str(page), "-l", str(page), "-singlefile", "-gray",
            "-r", str(DPI), str(pdf), str(prefix),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    pgm = Path(f"{prefix}.pgm")
    if not pgm.exists():
        fail(f"Failed to render page {page} of {pdf}")
    return pgm


def row_runs(sample, width, height, data):
    x0 = max(0, int(round(width * 0.05)))
    x1 = min(width, int(round(width * 0.93)))
    y0 = max(0, int(round(height * 0.10)))
    y1 = min(height, int(round(height * 0.90)))
    candidates = [
        y for y in range(y0, y1)
        if sample.dark_row_fraction(data, width, y, x0, x1) >= ROW_DARK_FRACTION
    ]
    line_groups = sample.groups(candidates)
    if len(line_groups) < MIN_RUN_GROUPS:
        return []
    centers = [(g[0] + g[-1]) / 2 for g in line_groups]
    runs = []
    start = 0
    for i in range(1, len(line_groups)):
        gap = centers[i] - centers[i - 1]
        if MIN_ROW_GAP <= gap <= MAX_ROW_GAP:
            continue
        if i - start >= MIN_RUN_GROUPS:
            runs.append(line_groups[start:i])
        start = i
    if len(line_groups) - start >= MIN_RUN_GROUPS:
        runs.append(line_groups[start:])
    return runs


def vertical_rules(sample, width, data, run):
    y0 = run[0][0]
    y1 = run[-1][-1] + 1
    x0 = max(0, int(round(width * 0.04)))
    x1 = min(width, int(round(width * 0.93)))
    candidates = [
        x for x in range(x0, x1)
        if sample.dark_col_fraction(data, width, x, y0, y1) >= COL_DARK_FRACTION
    ]
    scored = []
    for group in sample.groups(candidates):
        strength = max(sample.dark_col_fraction(data, width, x, y0, y1) for x in group)
        if len(group) >= 2 and strength >= MIN_RULE_STRENGTH:
            scored.append((sum(group) / len(group), strength, group))
    if len(scored) != EXPECTED_RULES:
        return None
    rules = [int(round(item[0])) for item in scored]
    if rules != sorted(rules):
        return None
    widths = [rules[i + 1] - rules[i] for i in range(len(rules) - 1)]
    if any(value < 70 for value in widths):
        return None
    return rules


def crop_pgm(sample, width, data, x0, x1, y0, y1, path, threshold=150, upscale=2):
    x0 = max(0, x0)
    y0 = max(0, y0)
    x1 = min(width, x1)
    if x1 <= x0 or y1 <= y0:
        return False
    h = y1 - y0
    w = x1 - x0
    raw = bytearray(w * h)
    for yy in range(h):
        start = sample.pixel_index(width, x0, y0 + yy)
        raw[yy * w:(yy + 1) * w] = data[start:start + w]
    binary = bytearray(0 if value < threshold else 255 for value in raw)
    up_w, up_h, up_data = sample.upscale_nearest(binary, w, h, upscale)
    sample.write_pgm(path, up_w, up_h, up_data)
    return True


def label_text(path):
    proc = subprocess.run(
        [
            "tesseract", str(path), "stdout", "--psm", "7",
            "-c", "tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return re.sub(r"[^A-Z]", "", proc.stdout.upper())


def discover_total_rows(sample, pdf, page_count, workdir):
    found = []
    page_diagnostics = []
    for page in range(1, page_count + 1):
        pgm = render_page(pdf, page, workdir / f"page-{page}")
        width, height, data = sample.read_pgm(pgm)
        runs = row_runs(sample, width, height, data)
        page_hits = 0
        for run_index, run in enumerate(runs):
            rules = vertical_rules(sample, width, data, run)
            if not rules:
                continue
            # TOTAL is expected near the bottom of the result-table run. Scan the
            # final four row intervals to avoid treating page continuations as totals.
            first = max(0, len(run) - 5)
            for i in range(first, len(run) - 1):
                top = run[i][-1] + 1
                bottom = run[i + 1][0] - 1
                if not 12 <= bottom - top <= 70:
                    continue
                label = workdir / f"label-p{page}-r{run_index}-{i}.pgm"
                if not crop_pgm(sample, width, data, rules[0] + 2, rules[2] - 2, top + 1, bottom - 1, label):
                    continue
                text = label_text(label)
                if "TOTAL" not in text:
                    continue
                found.append({
                    "page_number": page,
                    "run_index": run_index,
                    "row_index": i,
                    "rules": rules,
                    "row_top": top,
                    "row_bottom": bottom,
                    "width": width,
                    "height": height,
                    "pgm": str(pgm),
                })
                page_hits += 1
        page_diagnostics.append({
            "page_number": page,
            "table_runs": len(runs),
            "total_label_hits": page_hits,
        })
    return found, page_diagnostics


def render_context(pdf, hit, output_path):
    rules = hit["rules"]
    x = max(0, rules[0] - 15)
    y = max(0, hit["row_top"] - 25)
    right = rules[-1] + 15
    bottom = hit["row_bottom"] + 25
    prefix = output_path.with_suffix("")
    subprocess.run(
        [
            "pdftoppm", "-f", str(hit["page_number"]), "-l", str(hit["page_number"]),
            "-singlefile", "-png", "-r", str(DPI), "-x", str(x), "-y", str(y),
            "-W", str(right - x), "-H", str(bottom - y), str(pdf), str(prefix),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    rendered = Path(f"{prefix}.png")
    if rendered != output_path and rendered.exists():
        rendered.replace(output_path)


def extract_fields(sample, hit, workdir):
    width, _, data = sample.read_pgm(Path(hit["pgm"]))
    rules = hit["rules"]
    fields = {
        "registered_voters": (rules[2], rules[3]),
        "total_valid_votes": (rules[-3], rules[-2]),
        "rejected_ballots": (rules[-2], rules[-1]),
    }
    evidence = {}
    selected = {}
    for field, (x0, x1) in fields.items():
        images = sample.cell_threshold_images(
            width, data, x0, x1, hit["row_top"], hit["row_bottom"], workdir, field
        )
        candidates = []
        for threshold, path in images.items():
            candidate = sample.tesseract_candidate(path)
            if candidate is not None:
                value, confidence = candidate
                candidates.append((threshold, value, confidence))
        value, confidence, decision = sample.decide(candidates)
        selected[field] = value
        evidence[field] = {
            "page_number": hit["page_number"],
            "machine_transcription": value,
            "machine_confidence": round(confidence, 2) if confidence is not None else None,
            "verification_state": "machine_candidate" if value is not None else "source_unreadable",
            "decision": decision,
            "threshold_candidates": [
                {"threshold": threshold, "value": candidate_value, "confidence": round(candidate_confidence, 2)}
                for threshold, candidate_value, candidate_confidence in candidates
            ],
            "verified_value": None,
            "verification_method": None,
        }
    return selected, evidence


def main():
    parser = argparse.ArgumentParser(description="Build non-promotable Form 34B final-TOTAL machine candidates for a small governed multi-form smoke batch.")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", default="/tmp/p23-form34b-bulk-total-row-candidates.json")
    parser.add_argument("--context-dir", default="/tmp/p23-form34b-bulk-total-row-contexts")
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()

    if not 1 <= args.limit <= 25:
        fail("Smoke limit must be between 1 and 25")
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    rows = manifest.get("rows") or []
    if len(rows) != 290 or manifest.get("promotion_state") != "source_reference_manifest_complete":
        fail("Governed 290-row source-reference manifest is not complete")

    denominators = load_denominators()
    sample = load_sample_probe()
    opener = session()
    context_dir = Path(args.context_dir)
    context_dir.mkdir(parents=True, exist_ok=True)
    root_work = Path("/tmp/p23-form34b-bulk-total-row-work")
    root_work.mkdir(parents=True, exist_ok=True)

    results = []
    for source in rows[:args.limit]:
        code = int(source.get("constituency_code") or 0)
        download_urls = source.get("download_urls") or []
        if code not in denominators or len(download_urls) != 1:
            fail(f"Smoke source row invalid for constituency code {code}")
        workdir = root_work / f"con-{code:03d}"
        workdir.mkdir(parents=True, exist_ok=True)
        pdf = workdir / f"form34b-{code:03d}.pdf"
        download_pdf(opener, download_urls[0], pdf)
        pages = pdf_pages(pdf)
        hits, page_diagnostics = discover_total_rows(sample, pdf, pages, workdir)
        record = {
            "constituency_code": code,
            "geo_code": source.get("geo_code"),
            "constituency_name": source.get("constituency_name"),
            "form_download_id": (source.get("form_download_ids") or [None])[0],
            "source_url": download_urls[0],
            "source_pdf_sha256": sha256_file(pdf),
            "page_count": pages,
            "page_diagnostics": page_diagnostics,
            "total_row_candidates_found": len(hits),
            "verification_state": "unresolved",
            "source_verified_values": 0,
            "promotion_authorized": False,
        }
        if len(hits) == 1:
            hit = hits[0]
            selected, evidence = extract_fields(sample, hit, workdir)
            registered = selected.get("registered_voters")
            valid = selected.get("total_valid_votes")
            rejected = selected.get("rejected_ballots")
            denominator_match = registered is not None and registered == denominators[code]
            arithmetic_ok = (
                registered is not None and valid is not None and rejected is not None
                and 0 <= valid + rejected <= registered
            )
            turnout_range_ok = arithmetic_ok and 0 <= (100.0 * (valid + rejected) / registered) <= 100
            strong = all(value is not None for value in selected.values()) and denominator_match and arithmetic_ok and turnout_range_ok
            context = context_dir / f"form34b-total-row-con-{code:03d}.png"
            render_context(pdf, hit, context)
            record.update({
                "verification_state": "strong_machine_candidate" if strong else "machine_candidate_needs_review",
                "total_row_page": hit["page_number"],
                "grid_rule_count": len(hit["rules"]),
                "field_evidence": evidence,
                "denominator_match": denominator_match,
                "arithmetic_ok": arithmetic_ok,
                "turnout_range_ok": turnout_range_ok,
                "context_file": context.name,
            })
        else:
            record["unresolved_reason"] = "no_unique_total_row" if not hits else "ambiguous_total_rows"
        results.append(record)

    strong_count = sum(1 for row in results if row["verification_state"] == "strong_machine_candidate")
    unique_total_count = sum(1 for row in results if row.get("total_row_candidates_found") == 1)
    output = {
        "schema_version": "kda.p23.form34b.bulk-total-row-candidates.v1",
        "purpose": "Multi-form smoke batch for deterministic final-TOTAL-row discovery and OCR candidate extraction. This artifact is diagnostic only and cannot promote turnout values.",
        "source_manifest_schema": manifest.get("schema_version"),
        "requested_rows": args.limit,
        "rows_processed": len(results),
        "unique_total_rows": unique_total_count,
        "strong_machine_candidates": strong_count,
        "source_verified_values": 0,
        "promotion_authorized": False,
        "rows": results,
    }
    Path(args.output).write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        "P23_FORM34B_BULK_TOTAL_ROW_SMOKE "
        f"rows={len(results)} unique_total_rows={unique_total_count} strong_machine_candidates={strong_count} "
        "source_verified_values=0 promotion_authorized=false values_logged=0"
    )


if __name__ == "__main__":
    main()
