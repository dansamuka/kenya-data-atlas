#!/usr/bin/env bash
set -euo pipefail

base='https://forms.iebc.or.ke'
cookie='/tmp/iebc-form34b-pages-cookies.txt'
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0'

curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/" -o /tmp/iebc-home.html
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/index.php?id=5&r=common%2Fset-election" -o /tmp/iebc-set-election.html

for page in 1 2 6; do
  url="$base/index.php?r=site%2Findex&p=1&ft=2&l=2&page=$page"
  out="/tmp/iebc-34b-page-$page.html"
  curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$url" -o "$out"
  PAGE="$page" FILE="$out" python - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
import os,re

class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=None; self.cell=None; self.trids=[]; self.hrefs=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if tag=='tr':
            self.row=[]
            if d.get('id','').isdigit(): self.trids.append(int(d['id']))
        elif tag in ('td','th') and self.row is not None: self.cell=''
        if tag=='a' and d.get('href'): self.hrefs.append(d['href'])
    def handle_data(self,data):
        if self.cell is not None: self.cell+=data
    def handle_endtag(self,tag):
        if tag in ('td','th') and self.cell is not None:
            self.row.append(re.sub(r'\s+',' ',self.cell).strip()); self.cell=None
        elif tag=='tr' and self.row is not None:
            if self.row:self.rows.append(self.row)
            self.row=None

text=Path(os.environ['FILE']).read_text(errors='replace'); p=P(); p.feed(text)
plain=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',text))
show=re.search(r'Showing\s+[^.]+items\.',plain,re.I)
rows=[r for r in p.rows if len(r)>=2 and re.search(r'\d+\s+of\s+\d+',r[-1])]
print('PAGE',os.environ['PAGE'])
print('SHOWING',show.group(0) if show else 'missing')
print('ROW_COUNT',len(rows))
print('ROW_IDS',p.trids[:3],p.trids[-3:] if p.trids else [])
print('FIRST',rows[0] if rows else None)
print('LAST',rows[-1] if rows else None)
for h in sorted(set(p.hrefs)):
    if 'page=' in h.lower() or '%5bpage%5d' in h.lower(): print('PAGER',h)
PY
done
