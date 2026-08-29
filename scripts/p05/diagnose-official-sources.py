from __future__ import annotations

import io
import re
import requests
from openpyxl import load_workbook
import fitz

URLS = {
    "housing_ch3": "https://www.knbs.or.ke/wp-content/uploads/2025/04/Chapter-3-Household-Demographic-and-Economic-Characteristics.xlsx",
    "housing_ch5": "https://www.knbs.or.ke/wp-content/uploads/2025/04/Chapter-5-Housing-Characteristics-Amenities-and-Adequacy.xlsx",
    "gcp": "https://www.knbs.or.ke/wp-content/uploads/2025/12/2025-Gross-County-Product.pdf",
    "agri": "https://www.knbs.or.ke/wp-content/uploads/2025/01/National-Agriculture-Production-Report-2024.pdf",
}


def get(url: str) -> bytes:
    r = requests.get(url, timeout=120, headers={"User-Agent": "Kenya-Data-Atlas/0.10 source-validation"})
    r.raise_for_status()
    print(f"DOWNLOAD_OK {url} bytes={len(r.content)} content_type={r.headers.get('content-type')}")
    return r.content


def show_xlsx(label: str, content: bytes, needles: list[str]):
    wb = load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    print(f"XLSX {label} sheets={wb.sheetnames}")
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        for idx, row in enumerate(rows):
            joined = " | ".join("" if v is None else str(v) for v in row)
            if any(n.lower() in joined.lower() for n in needles):
                print(f"MATCH {label} sheet={ws.title!r} row={idx+1} :: {joined[:1200]}")
                for j in range(max(0, idx-3), min(len(rows), idx+12)):
                    line = " | ".join("" if v is None else str(v) for v in rows[j])
                    print(f"  R{j+1}: {line[:1600]}")


def show_pdf(label: str, content: bytes, needles: list[str]):
    doc = fitz.open(stream=content, filetype="pdf")
    print(f"PDF {label} pages={doc.page_count}")
    for pno in range(doc.page_count):
        text = doc[pno].get_text("text")
        compact = re.sub(r"\s+", " ", text)
        if any(n.lower() in compact.lower() for n in needles):
            print(f"MATCH {label} page={pno+1}")
            print(text[:9000])


def main():
    show_xlsx("housing_ch3", get(URLS["housing_ch3"]), ["Table 3.18", "Used Internet", "Internet", "Table 3.19", "Used a Computer"])
    show_xlsx("housing_ch5", get(URLS["housing_ch5"]), ["Table 5.11", "Connected to Electricity", "main grid", "electricity"])
    show_pdf("gcp", get(URLS["gcp"]), ["GCP by Economic Activity at Current Prices, 2024", "Annex I"])
    show_pdf("agri", get(URLS["agri"]), ["Area and Production of Maize by County", "Annex 1"])
    print("P05_SOURCE_DIAGNOSTIC_OK")


if __name__ == "__main__":
    main()
