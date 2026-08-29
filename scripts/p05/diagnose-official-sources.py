from __future__ import annotations

import io
import re
import requests
import urllib3
from openpyxl import load_workbook
import pymupdf

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

URLS = {
    "housing_ch3": "https://www.knbs.or.ke/wp-content/uploads/2025/04/Chapter-3-Household-Demographic-and-Economic-Characteristics.xlsx",
    "housing_ch5": "https://www.knbs.or.ke/wp-content/uploads/2025/04/Chapter-5-Housing-Characteristics-Amenities-and-Adequacy.xlsx",
    "gcp": "https://www.knbs.or.ke/wp-content/uploads/2025/12/2025-Gross-County-Product.pdf",
    "agri": "https://www.knbs.or.ke/wp-content/uploads/2025/01/National-Agriculture-Production-Report-2024.pdf",
}


def get(url: str) -> bytes:
    r = requests.get(url, timeout=120, verify=False, headers={"User-Agent": "Kenya-Data-Atlas/0.10 source-validation"})
    r.raise_for_status()
    print(f"DOWNLOAD_OK {url} bytes={len(r.content)} content_type={r.headers.get('content-type')}")
    return r.content


def compact_row(row):
    return " | ".join(f"C{i}={v}" for i, v in enumerate(row, 1) if v is not None and str(v).strip() != "")


def target_xlsx(label: str, content: bytes, sheets: list[str]):
    wb = load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    for sheet in sheets:
        ws = wb[sheet]
        print(f"TARGET_SHEET {label} title={ws.title!r} rows={ws.max_row} cols={ws.max_column}")
        for j, row in enumerate(ws.iter_rows(values_only=True), 1):
            line = compact_row(row)
            if line:
                print(f"  R{j}: {line[:3000]}")


def diagnose_gcp(content: bytes):
    doc = pymupdf.open(stream=content, filetype="pdf")
    for pno in range(doc.page_count):
        text = doc[pno].get_text("text")
        if "GCP by Economic Activity at Current Prices, 2024" not in text and "Annexe I:" not in text:
            continue
        finder = doc[pno].find_tables()
        print(f"GCP_TABLE_PAGE page={pno+1} tables={len(finder.tables)}")
        for ti, table in enumerate(finder.tables):
            rows = table.extract()
            print(f"GCP_TABLE idx={ti} rows={len(rows)} cols={max((len(r) for r in rows), default=0)}")
            for ri, row in enumerate(rows[:12]):
                print(f"  T{ti}R{ri}: {row}")


def diagnose_agri(content: bytes):
    doc = pymupdf.open(stream=content, filetype="pdf")
    for pno in range(doc.page_count):
        text = doc[pno].get_text("text")
        if "Area and Production of Maize by County, 2019-2023" not in text:
            continue
        finder = doc[pno].find_tables()
        print(f"AGRI_TABLE_PAGE page={pno+1} tables={len(finder.tables)}")
        for ti, table in enumerate(finder.tables):
            rows = table.extract()
            print(f"AGRI_TABLE idx={ti} rows={len(rows)} cols={max((len(r) for r in rows), default=0)}")
            for ri, row in enumerate(rows[:8]):
                print(f"  A{ti}R{ri}: {row}")


def main():
    target_xlsx("housing_ch3", get(URLS["housing_ch3"]), ["Table 3.18", "Table 3.19"])
    target_xlsx("housing_ch5", get(URLS["housing_ch5"]), ["Table 5.11"])
    diagnose_gcp(get(URLS["gcp"]))
    diagnose_agri(get(URLS["agri"]))
    print("P05_SOURCE_DIAGNOSTIC_OK")


if __name__ == "__main__":
    main()
