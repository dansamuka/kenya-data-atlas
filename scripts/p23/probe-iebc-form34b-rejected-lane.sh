#!/usr/bin/env bash
set -euo pipefail

pdf='/tmp/iebc-form34b-ocr-changamwe.pdf'
primary_tsv='/tmp/iebc-form34b-ocr.tsv'
label_tsv='/tmp/iebc-form34b-labels-page1.tsv'
hires_prefix='/tmp/iebc-form34b-rejected-hires-page1'
hires_png="${hires_prefix}.png"
raw_tsv='/tmp/iebc-form34b-rejected-hires-page1-raw.tsv'
normalized_tsv='/tmp/iebc-form34b-rejected-hires-page1-250.tsv'
crop_prefix='/tmp/iebc-form34b-rejected-crop-page1'
crop_pgm="${crop_prefix}.pgm"
crop_raw_tsv='/tmp/iebc-form34b-rejected-crop-page1-raw.tsv'
crop_normalized_tsv='/tmp/iebc-form34b-rejected-crop-page1-250.tsv'
crop_sparse_raw_tsv='/tmp/iebc-form34b-rejected-crop-sparse-page1-raw.tsv'
crop_sparse_normalized_tsv='/tmp/iebc-form34b-rejected-crop-sparse-page1-250.tsv'
context_prefix='/tmp/iebc-form34b-rejected-context-page1'
context_png="${context_prefix}.png"

[[ -f "$pdf" ]] || { echo "Missing governed Changamwe sample PDF: $pdf" >&2; exit 1; }
[[ -f "$primary_tsv" ]] || { echo "Missing governed primary OCR TSV: $primary_tsv" >&2; exit 1; }
[[ -f "$label_tsv" ]] || { echo "Missing governed label OCR TSV: $label_tsv" >&2; exit 1; }

# Baseline recovery: re-render physical page 1 at higher density without changing
# any source-verification or promotion rule.
pdftoppm -f 1 -singlefile -png -r 400 "$pdf" "$hires_prefix" >/dev/null 2>&1
[[ -f "$hires_png" ]] || { echo "Failed to render high-density page 1 image" >&2; exit 1; }

tesseract "$hires_png" stdout --psm 6 -c tessedit_char_whitelist='0123456789,.' tsv 2>/dev/null > "$raw_tsv"

python3 - "$raw_tsv" "$normalized_tsv" <<'PY'
import csv,re,sys
src,dst=sys.argv[1],sys.argv[2]
scale=250/400
count=0
confs=[]
with open(src,encoding='utf-8',errors='replace',newline='') as source:
    reader=csv.DictReader(source,delimiter='\t'); fields=reader.fieldnames
    if not fields or 'page_num' not in fields or 'text' not in fields:
        raise SystemExit('Unexpected high-density OCR TSV schema')
    rows=[]
    for row in reader:
        row['page_num']='1'
        for key in ('left','top','width','height'):
            try: row[key]=str(int(round(float(row.get(key) or 0)*scale)))
            except ValueError: row[key]='0'
        raw=(row.get('text') or '').strip()
        if raw and re.search(r'\d',raw):
            count += 1
            try: conf=float(row.get('conf','-1'))
            except ValueError: conf=-1
            if conf>=0: confs.append(conf)
        rows.append(row)
with open(dst,'w',encoding='utf-8',newline='') as target:
    writer=csv.DictWriter(target,fieldnames=fields,delimiter='\t',lineterminator='\n'); writer.writeheader(); writer.writerows(rows)
mean_conf=sum(confs)/len(confs) if confs else -1
print(f'P23_FORM34B_REJECTED_HIRES_RECOVERY page=1 render_dpi=400 normalized_dpi=250 psm=6 numeric_tokens={count} mean_conf={mean_conf:.2f} values_emitted=0')
PY

# Derive the rejected-ballot body crop from the ordered header geometry already
# located by governed OCR sources. The crop is anchored to the rejected header
# center and adjacent-header spacing; it cannot relocate to another numeric lane.
eval "$(python3 - "$primary_tsv" "$label_tsv" <<'PY'
import csv,os,runpy,sys
primary,label=sys.argv[1],sys.argv[2]
here=os.path.dirname(os.path.abspath('scripts/p23/assess-form34b-field-labels.py'))
helper=runpy.run_path(os.path.join(here,'assess-form34b-field-labels.py'))
ordered=helper['locate_ordered_targets'](helper['build_segments'](helper['read_words']([primary,label])))
if not ordered: raise SystemExit('Ordered Form 34B header triplet unavailable for targeted crop')
findings=ordered['findings']
center=helper['center_x'](findings['rejected_ballots'])
valid_center=helper['center_x'](findings['total_valid_votes'])
spacing=center-valid_center
header_top=min(f['bbox'][1] for f in findings.values())
header_bottom=max(f['bbox'][3] for f in findings.values())
page_height=page_width=0
with open(primary,encoding='utf-8',errors='replace',newline='') as handle:
    for row in csv.DictReader(handle,delimiter='\t'):
        try:
            if int(row.get('level') or 0)==1 and int(row.get('page_num') or 0)==ordered['page']:
                page_width=int(row.get('width') or 0); page_height=int(row.get('height') or 0); break
        except ValueError: pass
if not page_height or not page_width: raise SystemExit('Primary OCR page geometry unavailable for targeted crop')
half=max(40.0,min(80.0,spacing*0.45))
x=max(0,int(round(center-half))); y=max(0,int(round(header_bottom+8)))
w=max(1,int(round(half*2))); h=max(1,int(round(page_height*0.90-y)))
context_x=max(0,int(round(valid_center-spacing*0.8)))
context_y=max(0,int(round(header_top-80)))
context_right=min(page_width,int(round(center+spacing*3.6)))
context_bottom=min(page_height,int(round(page_height*0.90)))
print(f'CROP_X_250={x}'); print(f'CROP_Y_250={y}'); print(f'CROP_W_250={w}'); print(f'CROP_H_250={h}')
print(f'CONTEXT_X_250={context_x}'); print(f'CONTEXT_Y_250={context_y}'); print(f'CONTEXT_W_250={max(1,context_right-context_x)}'); print(f'CONTEXT_H_250={max(1,context_bottom-context_y)}')
print(f'REJECTED_CENTER_250={center:.1f}'); print(f'ADJACENT_SPACING_250={spacing:.1f}')
PY
)"

scale_num=12; scale_den=5
crop_x_600=$(( CROP_X_250 * scale_num / scale_den )); crop_y_600=$(( CROP_Y_250 * scale_num / scale_den ))
crop_w_600=$(( CROP_W_250 * scale_num / scale_den )); crop_h_600=$(( CROP_H_250 * scale_num / scale_den ))

pdftoppm -f 1 -singlefile -gray -r 600 -x "$crop_x_600" -y "$crop_y_600" -W "$crop_w_600" -H "$crop_h_600" "$pdf" "$crop_prefix" >/dev/null 2>&1
[[ -f "$crop_pgm" ]] || { echo "Failed to render header-anchored rejected-ballot crop" >&2; exit 1; }

normalize_crop_tsv() {
  local src="$1" dst="$2" mode="$3" threshold="$4"
  python3 - "$src" "$dst" "$crop_x_600" "$crop_y_600" "$mode" "$threshold" <<'PY'
import csv,re,sys
src,dst=sys.argv[1],sys.argv[2]; offset_x,offset_y=map(float,sys.argv[3:5]); mode,threshold=sys.argv[5:7]
scale=250/600; count=0; confs=[]
with open(src,encoding='utf-8',errors='replace',newline='') as source:
    reader=csv.DictReader(source,delimiter='\t'); fields=reader.fieldnames
    if not fields or 'page_num' not in fields or 'text' not in fields: raise SystemExit('Unexpected cropped OCR TSV schema')
    rows=[]
    for row in reader:
        row['page_num']='1'
        for key,offset in (('left',offset_x),('top',offset_y)):
            try: row[key]=str(int(round((float(row.get(key) or 0)+offset)*scale)))
            except ValueError: row[key]='0'
        for key in ('width','height'):
            try: row[key]=str(int(round(float(row.get(key) or 0)*scale)))
            except ValueError: row[key]='0'
        raw=(row.get('text') or '').strip()
        if raw and re.search(r'\d',raw):
            count += 1
            try: conf=float(row.get('conf','-1'))
            except ValueError: conf=-1
            if conf>=0: confs.append(conf)
        rows.append(row)
with open(dst,'w',encoding='utf-8',newline='') as target:
    writer=csv.DictWriter(target,fieldnames=fields,delimiter='\t',lineterminator='\n'); writer.writeheader(); writer.writerows(rows)
mean_conf=sum(confs)/len(confs) if confs else -1
print(f'P23_FORM34B_REJECTED_CROP_RECOVERY page=1 render_dpi=600 normalized_dpi=250 psm={mode} threshold={threshold} numeric_tokens={count} mean_conf={mean_conf:.2f} values_emitted=0 relocation_authorized=false')
PY
}

# Test both dense-block and sparse-text segmentation on the exact same governed
# lane crop. This changes OCR segmentation only, never physical lane geometry.
tesseract "$crop_pgm" stdout --psm 6 -c thresholding_method=2 -c tessedit_char_whitelist='0123456789,.' tsv 2>/dev/null > "$crop_raw_tsv"
normalize_crop_tsv "$crop_raw_tsv" "$crop_normalized_tsv" '6' 'sauvola'

tesseract "$crop_pgm" stdout --psm 11 -c tessedit_char_whitelist='0123456789,.' tsv 2>/dev/null > "$crop_sparse_raw_tsv"
normalize_crop_tsv "$crop_sparse_raw_tsv" "$crop_sparse_normalized_tsv" '11' 'otsu'

# Emit a temporary source-image context crop as a CI artifact for manual geometry
# verification. It includes the governed headers and neighboring body columns but
# is never committed to the repository or treated as a numeric observation.
context_x_300=$(( CONTEXT_X_250 * 6 / 5 )); context_y_300=$(( CONTEXT_Y_250 * 6 / 5 ))
context_w_300=$(( CONTEXT_W_250 * 6 / 5 )); context_h_300=$(( CONTEXT_H_250 * 6 / 5 ))
pdftoppm -f 1 -singlefile -png -r 300 -x "$context_x_300" -y "$context_y_300" -W "$context_w_300" -H "$context_h_300" "$pdf" "$context_prefix" >/dev/null 2>&1
[[ -f "$context_png" ]] || { echo "Failed to render rejected-ballot context image" >&2; exit 1; }
echo "P23_FORM34B_REJECTED_CONTEXT_ARTIFACT page=1 dpi=300 values_promoted=0 path=$context_png"
