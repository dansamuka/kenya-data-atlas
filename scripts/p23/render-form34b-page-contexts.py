#!/usr/bin/env python3
import argparse
import hashlib
import json
import struct
import subprocess
from pathlib import Path

ROOT = Path.cwd()
OCR_CONTRACT = ROOT / "data/p23/form34b-ocr-feasibility-contract.json"
DEFAULT_PDF = Path("/tmp/iebc-form34b-ocr-changamwe.pdf")
DEFAULT_DIR = Path("/tmp/p23-form34b-page-contexts")
DEFAULT_MANIFEST = Path("/tmp/p23-form34b-page-contexts.json")
DPI = 250


def fail(message):
    raise SystemExit(message)


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def png_dimensions(path):
    with open(path, "rb") as handle:
        signature = handle.read(24)
    if len(signature) < 24 or signature[:8] != b"\x89PNG\r\n\x1a\n":
        fail(f"Invalid PNG context image: {path}")
    return struct.unpack(">II", signature[16:24])


def pdf_pages(path):
    proc = subprocess.run(
        ["pdfinfo", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    for line in proc.stdout.splitlines():
        if line.startswith("Pages:"):
            return int(line.split(":", 1)[1].strip())
    fail("Unable to determine Form 34B page count")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", default=str(DEFAULT_PDF))
    parser.add_argument("--output-dir", default=str(DEFAULT_DIR))
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    args = parser.parse_args()

    pdf = Path(args.pdf)
    output_dir = Path(args.output_dir)
    manifest_path = Path(args.manifest)
    if not pdf.exists():
        fail(f"Missing governed Form 34B sample PDF: {pdf}")
    if not OCR_CONTRACT.exists():
        fail(f"Missing OCR contract: {OCR_CONTRACT}")

    with open(OCR_CONTRACT, encoding="utf-8") as handle:
        contract = json.load(handle)
    sample = contract.get("sample") or {}
    expected_pages = int(sample.get("expected_pages") or 0)
    if expected_pages <= 0:
        fail("OCR contract does not govern a positive sample page count")

    actual_pages = pdf_pages(pdf)
    if actual_pages != expected_pages:
        fail(f"Governed sample page count changed: actual={actual_pages} expected={expected_pages}")

    output_dir.mkdir(parents=True, exist_ok=True)
    prefix = output_dir / "form34b-page"
    subprocess.run(
        ["pdftoppm", "-png", "-r", str(DPI), str(pdf), str(prefix)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    images = sorted(output_dir.glob("form34b-page-*.png"))
    if len(images) != expected_pages:
        fail(f"Rendered page count mismatch: rendered={len(images)} expected={expected_pages}")

    page_records = []
    for index, image in enumerate(images, start=1):
        width, height = png_dimensions(image)
        page_records.append({
            "page_number": index,
            "file_name": image.name,
            "sha256": sha256_file(image),
            "bytes": image.stat().st_size,
            "width_px": width,
            "height_px": height,
            "render_dpi": DPI,
            "verification_state": "source_context_only",
        })

    document = {
        "schema_version": "kda.p23.form34b.page-contexts.v1",
        "purpose": "Source-image context for all pages of the governed Form 34B sample so table continuation and final-total geometry can be established before any constituency aggregation is attempted.",
        "form_id": sample.get("form_id"),
        "constituency_code": sample.get("constituency_code"),
        "constituency_name": sample.get("constituency_name"),
        "geo_code": sample.get("geo_code"),
        "source_url": sample.get("download_url"),
        "source_pdf_sha256": sha256_file(pdf),
        "expected_pages": expected_pages,
        "rendered_pages": len(page_records),
        "pages": page_records,
        "values_emitted": 0,
        "source_verified_values": 0,
        "promotion_authorized": False,
        "aggregation_authorized": False,
        "note": "These page images are diagnostic source context only. Page-level OCR or cell candidates must not be treated as constituency totals until the complete multi-page table and any final totals are independently established from the official source images.",
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(document, handle, indent=2)
        handle.write("\n")

    print(
        "P23_FORM34B_PAGE_CONTEXTS "
        f"pages={len(page_records)} expected={expected_pages} dpi={DPI} "
        "values_logged=0 source_verified=0 aggregation_authorized=false promotion_authorized=false"
    )


if __name__ == "__main__":
    main()
