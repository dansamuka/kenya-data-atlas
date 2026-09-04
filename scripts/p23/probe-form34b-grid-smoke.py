#!/usr/bin/env python3
import argparse
import hashlib
import importlib.util
import json
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


def fail(message):
    raise SystemExit(message)


def load_sample_probe():
    spec = importlib.util.spec_from_file_location("p23_total_row_sample", SAMPLE_PROBE)
    if spec is None or spec.loader is None:
        fail(f"Unable to import governed sample probe: {SAMPLE_PROBE}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
    with opener.open(Request(url, headers={"User-Agent": USER_AGENT}), timeout=120) as response:
        raw = response.read()
    if not raw.startswith(b"%PDF-"):
        fail(f"Official Form 34B download did not return PDF for {url}")
    path.write_bytes(raw)


def render_page(pdf, page, prefix):
    subprocess.run(
        ["pdftoppm", "-f", str(page), "-l", str(page), "-singlefile", "-gray", "-r", str(DPI), str(pdf), str(prefix)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    path = Path(f"{prefix}.pgm")
    if not path.exists():
        fail(f"Failed to render page {page} of {pdf}")
    return path


def candidate_for_cell(sample, width, data, x0, x1, y0, y1, workdir, tag):
    images = sample.cell_threshold_images(width, data, x0, x1, y0, y1, workdir, tag)
    candidates = []
    for threshold, image in images.items():
        candidate = sample.tesseract_candidate(image)
        if candidate is not None:
            value, confidence = candidate
            candidates.append((threshold, value, confidence))
    value, confidence, decision = sample.decide(candidates)
    return value, {
        "machine_transcription": value,
        "machine_confidence": round(confidence, 2) if confidence is not None else None,
        "decision": decision,
        "threshold_candidate_count": len(candidates),
        "verified_value": None,
        "verification_method": None,
    }


def discover_final_rows(sample, pdf, page_count, denominator, workdir):
    hits = []
    diagnostics = []
    for page in range(1, page_count + 1):
        pgm = render_page(pdf, page, workdir / f"page-{page}")
        width, height, data = sample.read_pgm(pgm)
        try:
            grid = sample.detect_table_grid(width, height, data)
        except SystemExit as error:
            diagnostics.append({"page_number": page, "grid_detected": False, "reason": str(error)[:180]})
            continue
        rules = grid["vertical_rules"]
        registered, evidence = candidate_for_cell(
            sample, width, data, rules[2], rules[3], grid["total_top"], grid["total_bottom"], workdir,
            f"locator-p{page}-registered"
        )
        denominator_match = registered == denominator
        diagnostics.append({
            "page_number": page,
            "grid_detected": True,
            "major_vertical_rules": len(rules),
            "registered_denominator_match": denominator_match,
        })
        if denominator_match:
            hits.append({
                "page_number": page,
                "pgm": str(pgm),
                "width": width,
                "rules": rules,
                "row_top": grid["total_top"],
                "row_bottom": grid["total_bottom"],
                "registered_locator_evidence": evidence,
            })
    return hits, diagnostics


def extract_fields(sample, hit, workdir):
    width, _, data = sample.read_pgm(Path(hit["pgm"]))
    rules = hit["rules"]
    fields = {
        "registered_voters": (rules[2], rules[3]),
        "total_valid_votes": (rules[-3], rules[-2]),
        "rejected_ballots": (rules[-2], rules[-1]),
    }
    selected = {}
    evidence = {}
    for field, (x0, x1) in fields.items():
        value, item = candidate_for_cell(
            sample, width, data, x0, x1, hit["row_top"], hit["row_bottom"], workdir, f"final-{field}"
        )
        selected[field] = value
        evidence[field] = {
            "page_number": hit["page_number"],
            "verification_state": "machine_candidate" if value is not None else "source_unreadable",
            **item,
        }
    return selected, evidence


def main():
    parser = argparse.ArgumentParser(description="Governed 10-form Form 34B source-grid smoke test; diagnostic only.")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", default="/tmp/p23-form34b-grid-smoke.json")
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()
    if not 1 <= args.limit <= 25:
        fail("Smoke limit must be between 1 and 25")

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    rows = manifest.get("rows") or []
    if len(rows) != 290 or manifest.get("promotion_state") != "source_reference_manifest_complete":
        fail("Governed 290-row source-reference manifest is not complete")

    sample = load_sample_probe()
    denominators = load_denominators()
    opener = session()
    workroot = Path("/tmp/p23-form34b-grid-smoke-work")
    workroot.mkdir(parents=True, exist_ok=True)
    results = []

    for source in rows[:args.limit]:
        code = int(source.get("constituency_code") or 0)
        urls = source.get("download_urls") or []
        if code not in denominators or len(urls) != 1:
            fail(f"Smoke source row invalid for constituency code {code}")
        workdir = workroot / f"con-{code:03d}"
        workdir.mkdir(parents=True, exist_ok=True)
        pdf = workdir / f"form34b-{code:03d}.pdf"
        download_pdf(opener, urls[0], pdf)
        pages = pdf_pages(pdf)
        hits, diagnostics = discover_final_rows(sample, pdf, pages, denominators[code], workdir)
        record = {
            "constituency_code": code,
            "geo_code": source.get("geo_code"),
            "constituency_name": source.get("constituency_name"),
            "form_download_id": (source.get("form_download_ids") or [None])[0],
            "source_url": urls[0],
            "source_pdf_sha256": sha256_file(pdf),
            "page_count": pages,
            "page_diagnostics": diagnostics,
            "final_rows_found": len(hits),
            "verification_state": "unresolved",
            "source_verified_values": 0,
            "promotion_authorized": False,
        }
        if len(hits) == 1:
            selected, evidence = extract_fields(sample, hits[0], workdir)
            registered = selected.get("registered_voters")
            valid = selected.get("total_valid_votes")
            rejected = selected.get("rejected_ballots")
            denominator_match = registered == denominators[code]
            arithmetic_ok = all(v is not None for v in (registered, valid, rejected)) and 0 <= valid + rejected <= registered
            turnout_range_ok = arithmetic_ok and 0 <= 100.0 * (valid + rejected) / registered <= 100
            strong = denominator_match and arithmetic_ok and turnout_range_ok
            record.update({
                "verification_state": "strong_machine_candidate" if strong else "machine_candidate_needs_review",
                "total_row_page": hits[0]["page_number"],
                "field_evidence": evidence,
                "denominator_match": denominator_match,
                "arithmetic_ok": arithmetic_ok,
                "turnout_range_ok": turnout_range_ok,
            })
        else:
            record["unresolved_reason"] = "no_denominator_matched_final_row" if not hits else "ambiguous_denominator_matched_rows"
        results.append(record)

    document = {
        "schema_version": "kda.p23.form34b.grid-smoke.v1",
        "purpose": "Reuse the already-governed source-grid detector across a capped multi-form diagnostic batch. Machine transcriptions remain non-promotable until independent source-image verification.",
        "rows_processed": len(results),
        "strong_machine_candidates": sum(r["verification_state"] == "strong_machine_candidate" for r in results),
        "source_verified_values": 0,
        "promotion_authorized": False,
        "rows": results,
    }
    Path(args.output).write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"P23_FORM34B_GRID_SMOKE rows={len(results)} strong_machine_candidates={document['strong_machine_candidates']} source_verified_values=0 promotion_authorized=false values_logged=0")


if __name__ == "__main__":
    main()
