import sys
import fitz
from PIL import Image

# usage: find_total_row.py pdf page dpi out.png
#   page: a specific 1-based page number, or "auto" to scan all pages
#         (from last to first) for the green-shaded TOTAL row.
# Renders the page, scans for the greenish TOTAL row band by pixel color,
# and saves a tight crop of just that row (with a little padding) at high
# effective resolution for independent visual reading.
pdf_path = sys.argv[1]
page_arg = sys.argv[2]
dpi = int(sys.argv[3])
out_path = sys.argv[4]

doc = fitz.open(pdf_path)

def is_green(r, g, b):
    return g > 120 and g > r + 25 and g > b + 25

def is_shaded(r, g, b):
    # Catches both green-shaded and plain gray-shaded TOTAL rows (scan
    # quality varies between constituencies' uploaded PDFs). A shaded cell
    # is uniformly darker than the white page background; thin black text
    # on white only darkens isolated pixel columns, not a wide contiguous
    # band, so a width-coverage threshold still isolates the TOTAL row.
    return is_green(r, g, b) or (max(r, g, b) - min(r, g, b) < 20 and (r + g + b) / 3 < 225)

def scan_page(page_num, matcher):
    page = doc[page_num - 1]
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    w, h = img.size
    px = img.load()
    # Skip the page header band (IEBC logo, green masthead text, QR code)
    # which is also green-toned and would false-positive as a TOTAL row.
    y_start = int(0.15 * h)
    row_counts = []
    for y in range(y_start, h):
        count = 0
        for x in range(0, w, 4):
            r, g, b = px[x, y]
            if matcher(r, g, b):
                count += 1
        row_counts.append(count)
    threshold = (w // 4) * 0.25
    shaded_rows = [y_start + y for y, c in enumerate(row_counts) if c > threshold]
    if not shaded_rows:
        return None
    y0, y1 = min(shaded_rows), max(shaded_rows)
    # require a reasonably wide, contiguous shaded band (a full table row,
    # not a thin masthead rule or small badge/logo)
    if (y1 - y0) < 15:
        return None
    pad = int(0.15 * (y1 - y0 + 1)) + 4
    y0 = max(0, y0 - pad)
    y1 = min(h, y1 + pad)
    return img, y0, y1

if page_arg == "auto":
    # The final page of a Form 34B is always the candidate/agent signature
    # block, whose header row is also green-shaded and would false-positive
    # as a TOTAL row. Try the second-to-last page first (where the TOTAL row
    # normally lives), then work backwards, and only fall back to the very
    # last page if nothing else matched.
    n = doc.page_count
    pages_to_try = list(range(n - 1, 0, -1)) + ([n] if n > 1 else [n])
else:
    pages_to_try = [int(page_arg)]

for pn in pages_to_try:
    result = scan_page(pn, is_green)
    if result:
        img, y0, y1 = result
        crop = img.crop((0, y0, img.size[0], y1))
        crop.save(out_path)
        print(f"SAVED {out_path} page={pn} pages_total={doc.page_count} size={crop.size} row_y_range=({y0},{y1}) matcher=is_green")
        sys.exit(0)

print(f"NO_GREEN_ROW_FOUND pages_tried={pages_to_try} pages_total={doc.page_count}")
sys.exit(2)
