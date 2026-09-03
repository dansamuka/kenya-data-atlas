#!/usr/bin/env bash
set -euo pipefail

base='https://forms.iebc.or.ke'
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0'
cookie='/tmp/iebc-form34b-ocr-cookies.txt'
pdf='/tmp/iebc-form34b-ocr-changamwe.pdf'
prefix='/tmp/iebc-form34b-ocr-page'
list='/tmp/iebc-form34b-ocr-images.txt'
raw_tsv='/tmp/iebc-form34b-ocr-raw.tsv'
tsv='/tmp/iebc-form34b-ocr.tsv'
label_raw_tsv='/tmp/iebc-form34b-labels-page1-raw.tsv'
label_tsv='/tmp/iebc-form34b-labels-page1.tsv'
numeric_raw_tsv='/tmp/iebc-form34b-numeric-page1-raw.tsv'
numeric_block_raw_tsv='/tmp/iebc-form34b-numeric-page1-psm6-raw.tsv'

node scripts/p23/validate-form34b-ocr-feasibility.mjs
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/" -o /tmp/iebc-form34b-ocr-home.html
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/index.php?id=5&r=common%2Fset-election" -o /tmp/iebc-form34b-ocr-election.html || true
curl -fsSL --connect-timeout 20 --max-time 120 -A "$ua" -c "$cookie" -b "$cookie" "$base/index.php?r=site%2Fdownload&id=277629" -o "$pdf"

pages="$(pdfinfo "$pdf" | awk -F: '/^Pages:/{gsub(/[[:space:]]/,"",$2);print $2;exit}')"
[[ "$pages" == '3' ]] || { echo "Unexpected sample page count: $pages" >&2; exit 1; }
pdftoppm -png -r 250 "$pdf" "$prefix" >/dev/null 2>&1
find /tmp -maxdepth 1 -type f -name 'iebc-form34b-ocr-page-*.png' | sort > "$list"
count="$(wc -l < "$list" | tr -d ' ')"
[[ "$count" == '3' ]] || { echo "Expected 3 rendered sample pages, got $count" >&2; exit 1; }

# Tesseract accepts an image-list text file, allowing one OCR invocation across
# all three governed sample pages. Its TSV page_num can reset for each image, so
# preserve the one-invocation cost but rewrite page_num from the three level-1
# image roots before any spatial diagnostic uses the coordinates.
tesseract "$list" stdout --psm 3 tsv 2>/dev/null > "$raw_tsv"
python3 - "$raw_tsv" "$tsv" "$count" <<'PY'
import csv,sys
src,dst,expected=sys.argv[1],sys.argv[2],int(sys.argv[3])
with open(src,encoding='utf-8',errors='replace',newline='') as source:
    reader=csv.DictReader(source,delimiter='\t')
    fields=reader.fieldnames
    if not fields or 'page_num' not in fields or 'level' not in fields:
        raise SystemExit('Unexpected Tesseract TSV schema')
    rows=[]
    physical_page=0
    for row in reader:
        try: level=int(row.get('level') or 0)
        except ValueError: level=0
        if level==1:
            physical_page += 1
        if physical_page < 1:
            raise SystemExit('TSV content appeared before the first page root')
        row['page_num']=str(physical_page)
        rows.append(row)
if physical_page != expected:
    raise SystemExit(f'Expected {expected} OCR page roots, got {physical_page}')
with open(dst,'w',encoding='utf-8',newline='') as target:
    writer=csv.DictWriter(target,fieldnames=fields,delimiter='\t',lineterminator='\n')
    writer.writeheader(); writer.writerows(rows)
print(f'P23_FORM34B_OCR_PAGE_INDEX normalized_pages={physical_page} expected_pages={expected}')
PY

# The primary layout OCR misses the Registered Voters anchor on this scan. Run
# one additional sparse-text pass against physical page 1 only. This artifact is
# label evidence only: any row containing a digit is blanked before downstream
# matching, so this recovery pass cannot supply or promote numeric vote values.
page1="$(head -n 1 "$list")"
[[ -f "$page1" ]] || { echo "Missing rendered page 1 image" >&2; exit 1; }
tesseract "$page1" stdout --psm 11 tsv 2>/dev/null > "$label_raw_tsv"
python3 - "$label_raw_tsv" "$label_tsv" <<'PY'
import csv,re,sys
src,dst=sys.argv[1],sys.argv[2]
alpha_tokens=0
numeric_rows_retained=0
with open(src,encoding='utf-8',errors='replace',newline='') as source:
    reader=csv.DictReader(source,delimiter='\t')
    fields=reader.fieldnames
    if not fields or 'page_num' not in fields or 'text' not in fields:
        raise SystemExit('Unexpected label-recovery TSV schema')
    rows=[]
    for row in reader:
        row['page_num']='1'
        raw=(row.get('text') or '').strip()
        if re.search(r'\d',raw):
            row['text']=''
        elif re.search(r'[A-Za-z]',raw):
            alpha_tokens += 1
        rows.append(row)
with open(dst,'w',encoding='utf-8',newline='') as target:
    writer=csv.DictWriter(target,fieldnames=fields,delimiter='\t',lineterminator='\n')
    writer.writeheader(); writer.writerows(rows)
print(f'P23_FORM34B_LABEL_RECOVERY page=1 psm=11 alpha_tokens={alpha_tokens} numeric_rows_retained={numeric_rows_retained}')
PY

# Use the same page image for digits-only OCR passes. These are strictly
# machine-readability diagnostics: TSVs stay in /tmp, raw transcriptions are
# never printed or committed, and downstream code consumes only geometry/count/
# confidence until a separate machine-candidate extraction gate is authorised.
tesseract "$page1" stdout --psm 11 -c tessedit_char_whitelist='0123456789,.' tsv 2>/dev/null > "$numeric_raw_tsv"
tesseract "$page1" stdout --psm 6 -c tessedit_char_whitelist='0123456789,.' tsv 2>/dev/null > "$numeric_block_raw_tsv"
python3 - "$numeric_raw_tsv" "$numeric_block_raw_tsv" <<'PY'
import csv,re,sys
for path,psm in ((sys.argv[1],11),(sys.argv[2],6)):
    count=0
    confs=[]
    with open(path,encoding='utf-8',errors='replace') as handle:
        for row in csv.DictReader(handle,delimiter='\t'):
            raw=(row.get('text') or '').strip()
            if not raw or not re.search(r'\d',raw):
                continue
            count += 1
            try: conf=float(row.get('conf','-1'))
            except ValueError: conf=-1
            if conf>=0: confs.append(conf)
    mean_conf=sum(confs)/len(confs) if confs else -1
    print(f'P23_FORM34B_NUMERIC_RECOVERY page=1 psm={psm} numeric_tokens={count} mean_conf={mean_conf:.2f} values_emitted=0')
PY

python3 - "$tsv" <<'PY'
import csv,re,sys
path=sys.argv[1]
rows=[]
with open(path,encoding='utf-8',errors='replace') as f:
    for r in csv.DictReader(f,delimiter='\t'):
        text=(r.get('text') or '').strip()
        if not text: continue
        try: conf=float(r.get('conf','-1'))
        except ValueError: conf=-1
        rows.append((text,conf))
text=' '.join(t for t,_ in rows)
letters=sum(ch.isalpha() for ch in text)
digits=sum(ch.isdigit() for ch in text)
meaningful=[c for _,c in rows if c>=0]
mean_conf=sum(meaningful)/len(meaningful) if meaningful else -1
norm=re.sub(r'[^A-Z0-9]+',' ',text.upper())
concepts={
  'registered': bool(re.search(r'REGISTER(?:ED)?\s+VOT',norm)),
  'valid_votes': bool(re.search(r'VALID\s+VOT',norm)),
  'rejected': bool(re.search(r'REJECT(?:ED)?',norm)),
  'president': 'PRESIDENT' in norm,
}
# Feasibility is deliberately broad: enough machine-readable content plus at
# least two target concepts. Numeric values are not parsed or promoted here.
concept_count=sum(concepts.values())
feasible=(letters>=300 and digits>=40 and mean_conf>=35 and concept_count>=2)
print(f'P23_FORM34B_OCR_SAMPLE tokens={len(rows)} letters={letters} digits={digits} mean_conf={mean_conf:.2f} concepts={concept_count}/4 feasible={str(feasible).lower()}')
print('P23_FORM34B_OCR_CONCEPTS '+' '.join(f'{k}={str(v).lower()}' for k,v in concepts.items()))
if not feasible:
    raise SystemExit('Sample OCR did not meet the governed feasibility threshold')
PY

# No OCR transcript or OCR-derived value is written into the repository.
