#!/usr/bin/env bash
set -euo pipefail

pdf='/tmp/iebc-form34b-ocr-changamwe.pdf'
hires_prefix='/tmp/iebc-form34b-rejected-hires-page1'
hires_png="${hires_prefix}.png"
raw_tsv='/tmp/iebc-form34b-rejected-hires-page1-raw.tsv'
normalized_tsv='/tmp/iebc-form34b-rejected-hires-page1-250.tsv'

[[ -f "$pdf" ]] || { echo "Missing governed Changamwe sample PDF: $pdf" >&2; exit 1; }

# The baseline geometry diagnostics operate on the 250 dpi page image. Re-render
# only physical page 1 at higher density to test whether the narrow rejected-
# ballot cells become machine-readable without changing any source-verification
# or promotion rule.
pdftoppm -f 1 -singlefile -png -r 400 "$pdf" "$hires_prefix" >/dev/null 2>&1
[[ -f "$hires_png" ]] || { echo "Failed to render high-density page 1 image" >&2; exit 1; }

# PSM 6 is intentionally tested as a dense-table recovery mode. Raw numeric
# transcriptions remain ephemeral in /tmp and are never printed, committed or
# promoted. Downstream layout assessment consumes only token geometry/count and
# confidence until the existing source-image verification contract is satisfied.
tesseract "$hires_png" stdout --psm 6 -c tessedit_char_whitelist='0123456789,.' tsv 2>/dev/null > "$raw_tsv"

python3 - "$raw_tsv" "$normalized_tsv" <<'PY'
import csv,re,sys
src,dst=sys.argv[1],sys.argv[2]
scale=250/400
count=0
confs=[]
with open(src,encoding='utf-8',errors='replace',newline='') as source:
    reader=csv.DictReader(source,delimiter='\t')
    fields=reader.fieldnames
    if not fields or 'page_num' not in fields or 'text' not in fields:
        raise SystemExit('Unexpected high-density OCR TSV schema')
    rows=[]
    for row in reader:
        row['page_num']='1'
        for key in ('left','top','width','height'):
            try:
                row[key]=str(int(round(float(row.get(key) or 0)*scale)))
            except ValueError:
                row[key]='0'
        raw=(row.get('text') or '').strip()
        if raw and re.search(r'\d',raw):
            count += 1
            try: conf=float(row.get('conf','-1'))
            except ValueError: conf=-1
            if conf>=0: confs.append(conf)
        rows.append(row)
with open(dst,'w',encoding='utf-8',newline='') as target:
    writer=csv.DictWriter(target,fieldnames=fields,delimiter='\t',lineterminator='\n')
    writer.writeheader(); writer.writerows(rows)
mean_conf=sum(confs)/len(confs) if confs else -1
print(f'P23_FORM34B_REJECTED_HIRES_RECOVERY page=1 render_dpi=400 normalized_dpi=250 psm=6 numeric_tokens={count} mean_conf={mean_conf:.2f} values_emitted=0')
PY
