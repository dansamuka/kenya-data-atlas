import sys
import fitz

pdf_path, page_num, dpi, out_path = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
doc = fitz.open(pdf_path)
print(f"PAGES={doc.page_count}")
page = doc[page_num - 1]
zoom = dpi / 72.0
mat = fitz.Matrix(zoom, zoom)
pix = page.get_pixmap(matrix=mat)
pix.save(out_path)
print(f"SAVED {out_path} size={pix.width}x{pix.height}")
text = page.get_text("text")
nonspace = len(''.join(text.split()))
print(f"TEXT_LAYER_NONSPACE_CHARS={nonspace}")
