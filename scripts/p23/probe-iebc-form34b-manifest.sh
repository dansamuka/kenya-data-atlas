#!/usr/bin/env bash
set -euo pipefail

base='https://forms.iebc.or.ke'
cookie='/tmp/iebc-form34b-manifest-cookies.txt'
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0'
outdir='/tmp/iebc-form34b-manifest-pages'
manifest='/tmp/p23-form34b-manifest.json'
mkdir -p "$outdir"

curl -fsSL --retry 2 --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/" -o /tmp/iebc-home.html
curl -fsSL --retry 2 --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/index.php?id=5&r=common%2Fset-election" -o /tmp/iebc-set-election.html

export base cookie ua outdir
fetch_one() {
  local id="$1"
  curl -fsSL --retry 2 --retry-all-errors --retry-delay 1 --connect-timeout 20 --max-time 60 \
    -A "$ua" -b "$cookie" \
    "$base/index.php?r=site%2Findex&id=$id&ft=2&p=1&es=" \
    -o "$outdir/$id.html"
}
export -f fetch_one
seq 51 341 | xargs -P 6 -n 1 bash -c 'fetch_one "$0"'

python - <<'PY'
from pathlib import Path
from html.parser import HTMLParser
import json,re

pages=Path('/tmp/iebc-form34b-manifest-pages')
geos=json.loads(Path('data/geography/registry/geographies.json').read_text())
cons=[g for g in geos if g.get('level')=='constituency']
assert len(cons)==290, f'canonical constituency registry != 290 ({len(cons)})'

def norm(v):
    v=str(v or '').upper().replace('&',' AND ')
    v=re.sub(r"[’'`./,_()\-]+",' ',v)
    return re.sub(r'\s+',' ',v).strip()

# Explicit spelling aliases are source-to-canonical labels only; they never alter values.
alias={
    'KIBRA':'KIBRA',
}
by_name={norm(g.get('name')):g for g in cons}

class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=None; self.cell=None; self.hrefs=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if tag=='tr': self.row=[]
        elif tag in ('td','th') and self.row is not None: self.cell=''
        if tag=='a' and d.get('href'): self.hrefs.append(d['href'])
    def handle_data(self,data):
        if self.cell is not None:self.cell+=data
    def handle_endtag(self,tag):
        if tag in ('td','th') and self.cell is not None:
            self.row.append(re.sub(r'\s+',' ',self.cell).strip()); self.cell=None
        elif tag=='tr' and self.row is not None:
            if self.row:self.rows.append(self.row)
            self.row=None

records=[]
for portal_id in range(51,342):
    path=pages/f'{portal_id}.html'
    assert path.exists() and path.stat().st_size>1000, f'missing portal page {portal_id}'
    p=P(); p.feed(path.read_text(errors='replace'))
    data_rows=[r for r in p.rows if len(r)>=3 and 'PRES' in r[0].upper() and 'PRESIDENT' in r[1].upper()]
    assert len(data_rows)==1, f'portal page {portal_id}: expected one presidential row, found {len(data_rows)}'
    name=re.sub(r'\s*-\s*President\s*$','',data_rows[0][1],flags=re.I).strip()
    form_ids=[]
    for h in p.hrefs:
        m=re.search(r'(?:site%2Fdownload|site/download)[^#]*[?&]id=(\d+)',h,re.I)
        if m: form_ids.append(int(m.group(1)))
    form_ids=sorted(set(form_ids))
    assert len(form_ids)==1, f'{name} portal {portal_id}: expected one direct download id, found {form_ids}'
    key=norm(alias.get(norm(name),name))
    geo=by_name.get(key)
    records.append({
        'portal_row_id':portal_id,
        'source_name':name,
        'form_id':form_ids[0],
        'download_url':f'https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id={form_ids[0]}',
        'view_url':f'https://forms.iebc.or.ke/index.php?r=site%2Fview-form&id={form_ids[0]}',
        'canonical_geography_id':geo.get('geography_id') if geo else None,
        'canonical_geo_code':geo.get('geo_code') if geo else None,
        'canonical_constituency_code':geo.get('constituency_code') if geo else None,
        'canonical_name':geo.get('name') if geo else None,
        'scope':'kenya_constituency' if geo else 'non_constituency_reporting_unit'
    })

assert len(records)==291
matched=[r for r in records if r['canonical_geography_id']]
unmatched=[r for r in records if not r['canonical_geography_id']]
assert len(matched)==290, f'expected 290 canonical matches, found {len(matched)}; unmatched={[r["source_name"] for r in unmatched]}'
assert len({r['canonical_geography_id'] for r in matched})==290, 'duplicate canonical constituency mapping'
assert len({r['form_id'] for r in records})==291, 'duplicate Form 34B download id'
assert len(unmatched)==1 and norm(unmatched[0]['source_name'])=='DIASPORA', f'unexpected non-constituency units: {[r["source_name"] for r in unmatched]}'

payload={
    'schema_version':'1.0.0',
    'election':'2022 General Election',
    'elective_position':'President',
    'form_type':'34B',
    'portal':'https://forms.iebc.or.ke/',
    'source_grid_url':'https://forms.iebc.or.ke/index.php?r=site%2Findex&p=1&ft=2&l=2',
    'reported_forms':291,
    'canonical_constituencies':290,
    'excluded_non_constituency_units':['DIASPORA'],
    'records':records
}
Path('/tmp/p23-form34b-manifest.json').write_text(json.dumps(payload,indent=2)+'\n')
print('MANIFEST_RECORDS',len(records))
print('CANONICAL_MATCHES',len(matched))
print('NON_CONSTITUENCY',[(r['source_name'],r['portal_row_id'],r['form_id']) for r in unmatched])
for r in records[:3]+records[-3:]:
    print('MANIFEST_ROW',r['portal_row_id'],r['source_name'],r['form_id'],r['canonical_constituency_code'],r['scope'])
PY

sha256sum "$manifest"
