#!/usr/bin/env bash
set -euo pipefail

base='https://forms.iebc.or.ke'
cookie='/tmp/iebc-form34b-pages-cookies.txt'
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0'

curl -fsSL --retry 4 --retry-all-errors --retry-delay 2 --connect-timeout 15 --max-time 45 -A "$ua" -c "$cookie" -b "$cookie" "$base/" -o /tmp/iebc-home.html
curl -fsSL --retry 4 --retry-all-errors --retry-delay 2 --connect-timeout 15 --max-time 45 -A "$ua" -c "$cookie" -b "$cookie" "$base/index.php?id=5&r=common%2Fset-election" -o /tmp/iebc-set-election.html

for page in 1 2 3 4 5 6; do
  url="$base/index.php?r=site%2Findex&p=1&ft=2&l=2&page=$page"
  out="/tmp/iebc-34b-page-$page.html"
  curl -fsSL --retry 4 --retry-all-errors --retry-delay 2 --connect-timeout 15 --max-time 45 -A "$ua" -c "$cookie" -b "$cookie" "$url" -o "$out"
done

python - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
import json,re

class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=None; self.cell=None; self.row_id=None
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if tag=='tr':
            self.row=[]; self.row_id=int(d['id']) if d.get('id','').isdigit() else None
        elif tag in ('td','th') and self.row is not None: self.cell=''
    def handle_data(self,data):
        if self.cell is not None:self.cell+=data
    def handle_endtag(self,tag):
        if tag in ('td','th') and self.cell is not None:
            self.row.append(re.sub(r'\s+',' ',self.cell).strip()); self.cell=None
        elif tag=='tr' and self.row is not None:
            if self.row:self.rows.append((self.row_id,self.row))
            self.row=None; self.row_id=None

def norm(v):
    v=str(v or '').upper().replace('&',' AND ')
    v=re.sub(r"[’'`./,_()\-]+",' ',v)
    return re.sub(r'\s+',' ',v).strip()

alias={
    "CHUKA IGAMBANG OMBE":"CHUKA IGAMBANG OM",
    "SUBA NORTH":"MBITA",
    "SUBA SOUTH":"SUBA",
}
geos=json.loads(Path('data/geography/registry/geographies.json').read_text())
cons=[g for g in geos if g.get('level')=='constituency']
assert len(cons)==290, f'canonical constituency registry != 290 ({len(cons)})'
by_name={norm(g.get('name')):g for g in cons}
records=[]
for page in range(1,7):
    path=Path(f'/tmp/iebc-34b-page-{page}.html')
    text=path.read_text(errors='replace'); p=P(); p.feed(text)
    plain=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',text))
    show=re.search(r'Showing\s+[^.]+items\.',plain,re.I)
    data=[(rid,row) for rid,row in p.rows if rid is not None and len(row)>=2 and re.search(r'\d+\s+of\s+\d+',row[-1])]
    expected=50 if page<6 else 41
    assert len(data)==expected, f'page {page}: expected {expected} data rows, got {len(data)}'
    print('PAGE',page,'SHOWING',show.group(0) if show else 'missing','ROWS',len(data),'FIRST',data[0],'LAST',data[-1])
    for rid,row in data:
        source_name=row[0].strip()
        source_key=norm(source_name)
        canonical_key=alias.get(source_key,source_key)
        geo=by_name.get(canonical_key)
        records.append({
            'portal_row_id':rid,
            'source_name':source_name,
            'reported':row[-1],
            'label_crosswalk':canonical_key if canonical_key!=source_key else None,
            'canonical_constituency_code':geo.get('constituency_code') if geo else None,
            'canonical_geography_id':geo.get('geography_id') if geo else None,
            'canonical_name':geo.get('name') if geo else None,
        })

assert len(records)==291, f'expected 291 grid rows, got {len(records)}'
assert [r['portal_row_id'] for r in records]==list(range(51,342)), 'portal row IDs are not contiguous 51..341'
kenya=records[:290]; diaspora=records[290]
assert diaspora['portal_row_id']==341 and norm(diaspora['source_name'])=='DIASPORA', f'row 341 is not Diaspora: {diaspora}'
assert all(r['canonical_constituency_code'] is not None for r in kenya), f'unmapped Kenya rows: {[r for r in kenya if r["canonical_constituency_code"] is None]}'
assert len({r['canonical_constituency_code'] for r in kenya})==290, 'duplicate canonical constituency mapping in IEBC grid'
for expected_code,r in enumerate(kenya,start=1):
    assert r['canonical_constituency_code']==expected_code, f'portal row {r["portal_row_id"]} {r["source_name"]}: expected canonical code {expected_code}, got {r["canonical_constituency_code"]}'
    assert r['portal_row_id']==expected_code+50, f'portal row/code invariant failed for {r}'
    assert r['reported']=='1 of 1 (100%)', f'{r["source_name"]} not reported 1 of 1'
cross=[r for r in kenya if r['label_crosswalk']]
assert len(cross)==3, f'expected 3 explicit name crosswalks, got {len(cross)}'

payload={
  'schema_version':'1.0.0',
  'source':'IEBC 2022 General Election result forms portal',
  'grid_url':'https://forms.iebc.or.ke/index.php?r=site%2Findex&p=1&ft=2&l=2',
  'form_type':'34B',
  'elective_position':'President',
  'reported_forms':291,
  'kenya_constituencies':290,
  'portal_row_to_constituency_code_rule':'portal_row_id = constituency_code + 50 for rows 51..340',
  'explicit_label_crosswalks':3,
  'excluded_reporting_units':['DIASPORA'],
  'records':records,
}
Path('/tmp/p23-form34b-grid.json').write_text(json.dumps(payload,indent=2)+'\n')
print('P23_FORM34B_GRID_OK rows=291 constituencies=290 diaspora=1 crosswalks=3 rule=portal_row_id_minus_50')
print('P23_FORM34B_GRID_CROSSWALKS',[(r['source_name'],r['canonical_name'],r['canonical_constituency_code']) for r in cross])
PY

sha256sum /tmp/p23-form34b-grid.json
