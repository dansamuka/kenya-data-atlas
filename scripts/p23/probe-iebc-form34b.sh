#!/usr/bin/env bash
set -euo pipefail
base='https://forms.iebc.or.ke'
cookie='/tmp/iebc-cookies.txt'
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0'

curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/" -o /tmp/iebc-home.html
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/index.php?id=5&r=common%2Fset-election" -o /tmp/iebc-set-election.html || true

index_url="$base/index.php?r=site%2Findex&p=1&ft=2&l=2"
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$index_url" -o /tmp/iebc-34b-page1.html

python - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
import json,re

text=Path('/tmp/iebc-34b-page1.html').read_text(errors='replace')
plain=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',text))
print('FORM34B_PAGE1', re.findall(r'Reported forms[^<]{0,100}',plain,flags=re.I)[:1], re.findall(r'Showing[^<]{0,100}',plain,flags=re.I)[:1])

class Links(HTMLParser):
    def __init__(self): super().__init__(); self.links=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if tag=='a' and d.get('href'): self.links.append((d.get('href'),d.get('title','')))
p=Links(); p.feed(text)
for href,title in p.links:
    if 'page=' in href.lower() or 'download' in href.lower() or 'results' in href.lower():
        print('INDEX_LINK',urljoin('https://forms.iebc.or.ke/',href),title)
PY

# Fetch every pagination page exposed by the 291-row presidential Form 34B list.
# Yii's GridView uses page=1..6 here; requesting an extra page is harmless and
# lets the parser report the true distinct item set without assuming the count.
for page in 1 2 3 4 5 6 7; do
  url="$base/index.php?r=site%2Findex&p=1&ft=2&l=2&page=$page"
  out="/tmp/iebc-34b-page${page}.html"
  if ! curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$url" -o "$out"; then
    echo "PAGE_${page}_UNAVAILABLE"
    rm -f "$out"
  fi
done

python - <<'PY'
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin
import json,re,unicodedata

class Table(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=None; self.cell=None; self.links=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if tag=='tr': self.row=[]
        elif tag in ('td','th') and self.row is not None: self.cell=''
        elif tag=='a' and d.get('href') and self.row is not None: self.links.append((len(self.rows),d['href']))
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

allrows=[]
for p in sorted(Path('/tmp').glob('iebc-34b-page*.html')):
    t=Table(); t.feed(p.read_text(errors='replace'))
    print('PAGE_ROWS',p.name,len(t.rows))
    for row in t.rows:
        # Keep substantive data rows only; the portal rows contain county and constituency labels.
        if len(row)>=2 and not any('Polling Center' in x for x in row): allrows.append(row)

# Print unique row texts compactly so the extra portal item can be identified.
uniq=[]; seen=set()
for row in allrows:
    key=' | '.join(row)
    if key not in seen:
        seen.add(key); uniq.append(row)
print('UNIQUE_TABLE_ROWS',len(uniq))
for row in uniq[:360]: print('ROW',' | '.join(row))

# Compare any portal cell matching a canonical constituency name against the registry.
geos=json.loads(Path('data/geography/registry/geographies.json').read_text())
canon={norm(g['name']):g['geo_code'] for g in geos if g.get('level')=='constituency'}
matched=set(); portal_candidates=set()
for row in uniq:
    for cell in row:
        n=norm(cell)
        if n in canon:
            matched.add(n); portal_candidates.add(n)
print('CANONICAL_CONSTITUENCIES',len(canon),'MATCHED_EXACT_PORTAL_CELLS',len(matched))
missing=sorted(set(canon)-matched)
print('MISSING_CANONICAL_NAMES',[(canon[n],n) for n in missing])
PY

# Inspect the official bulk bundle without committing it. The endpoint is the one
# exposed by the Form 34B grid for President / constituency level.
bundle_url="$base/index.php?r=site%2Fdownload-all&p=1&ft=2&lv=2"
set +e
curl -fSL --connect-timeout 20 --max-time 240 --max-filesize 300000000 -A "$ua" -c "$cookie" -b "$cookie" -D /tmp/iebc-bundle.headers "$bundle_url" -o /tmp/iebc-form34b-bundle
rc=$?
set -e
echo "BUNDLE_CURL_RC=$rc"
cat /tmp/iebc-bundle.headers || true
if test -s /tmp/iebc-form34b-bundle; then
  echo "BUNDLE_BYTES=$(stat -c%s /tmp/iebc-form34b-bundle)"
  file /tmp/iebc-form34b-bundle || true
  if unzip -t /tmp/iebc-form34b-bundle >/dev/null 2>&1; then
    echo 'BUNDLE_FORMAT=zip'
    unzip -l /tmp/iebc-form34b-bundle | head -n 80 || true
    echo "BUNDLE_FILE_COUNT=$(unzip -Z1 /tmp/iebc-form34b-bundle | wc -l)"
  fi
fi
