#!/usr/bin/env bash
set -euo pipefail
base='https://forms.iebc.or.ke'
cookie='/tmp/iebc-cookies.txt'
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0'

curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/" -o /tmp/iebc-home.html
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/index.php?id=5&r=common%2Fset-election" -o /tmp/iebc-set-election.html || true

for page in 1 2 3 4 5 6; do
  url="$base/index.php?r=site%2Findex&p=1&ft=2&l=2&page=$page"
  out="/tmp/iebc-34b-page${page}.html"
  curl -fsSL --connect-timeout 20 --max-time 45 -A "$ua" -c "$cookie" -b "$cookie" "$url" -o "$out"
done

python - <<'PY'
from pathlib import Path
from html.parser import HTMLParser
import json,re,unicodedata

class Table(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=None; self.cell=None; self.hrefs=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if tag=='tr': self.row=[]
        elif tag in ('td','th') and self.row is not None: self.cell=''
        elif tag=='a' and d.get('href') and self.row is not None: self.hrefs.append(d['href'])
    def handle_data(self,data):
        if self.cell is not None: self.cell+=data
    def handle_endtag(self,tag):
        if tag in ('td','th') and self.cell is not None:
            self.row.append(re.sub(r'\s+',' ',self.cell).strip()); self.cell=None
        elif tag=='tr' and self.row is not None:
            if self.row: self.rows.append(self.row)
            self.row=None

def norm(s):
    s=unicodedata.normalize('NFKD',str(s)).encode('ascii','ignore').decode().lower()
    s=s.replace('&',' and ')
    return re.sub(r'[^a-z0-9]+',' ',s).strip()

geos=json.loads(Path('data/geography/registry/geographies.json').read_text())
canon={norm(g['name']):(g['geo_code'],g['name']) for g in geos if g.get('level')=='constituency'}
seen_rows=[]; seen_keys=set(); matched=set(); all_hrefs=[]
for p in sorted(Path('/tmp').glob('iebc-34b-page*.html')):
    text=p.read_text(errors='replace')
    parser=Table(); parser.feed(text); all_hrefs.extend(parser.hrefs)
    plain=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',text))
    showing=re.findall(r'Showing\s+[^.]+items\.',plain,flags=re.I)
    print('PAGE',p.name,'TABLE_ROWS',len(parser.rows),'SHOWING',showing[:1])
    for row in parser.rows:
        key=' | '.join(row)
        if key and key not in seen_keys:
            seen_keys.add(key); seen_rows.append(row)
        for cell in row:
            n=norm(cell)
            if n in canon: matched.add(n)

print('UNIQUE_ROWS',len(seen_rows))
for row in seen_rows:
    if len(row)>=2: print('ROW',' | '.join(row))
print('CANONICAL_COUNT',len(canon),'EXACT_NAME_MATCHES',len(matched))
print('MISSING_CANONICAL',[(canon[n][0],canon[n][1]) for n in sorted(set(canon)-matched)])
print('RESULT_FORM_LINKS',len(set(h for h in all_hrefs if 'results' in h.lower() or 'download' in h.lower())))
for h in sorted(set(h for h in all_hrefs if 'results' in h.lower() or 'download' in h.lower()))[:400]: print('FORM_LINK',h)
PY

# Only inspect headers for the bulk endpoint in this fast reconciliation run.
bundle_url="$base/index.php?r=site%2Fdownload-all&p=1&ft=2&lv=2"
set +e
curl -sSIL --connect-timeout 15 --max-time 30 -A "$ua" -c "$cookie" -b "$cookie" "$bundle_url" | head -n 60
rc=${PIPESTATUS[0]}
set -e
echo "BUNDLE_HEAD_RC=$rc"
