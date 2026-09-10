import sys
import fitz

# usage: crop_page.py pdf page dpi x0frac y0frac x1frac y1frac out.png
pdf_path = sys.argv[1]
page_num = int(sys.argv[2])
dpi = int(sys.argv[3])
x0f, y0f, x1f, y1f = (float(v) for v in sys.argv[4:8])
out_path = sys.argv[8]

doc = fitz.open(pdf_path)
page = doc[page_num - 1]
rect = page.rect
clip = fitz.Rect(
    rect.x0 + x0f * rect.width,
    rect.y0 + y0f * rect.height,
    rect.x0 + x1f * rect.width,
    rect.y0 + y1f * rect.height,
)
zoom = dpi / 72.0
mat = fitz.Matrix(zoom, zoom)
pix = page.get_pixmap(matrix=mat, clip=clip)
pix.save(out_path)
print(f"SAVED {out_path} size={pix.width}x{pix.height} clip={clip}")
