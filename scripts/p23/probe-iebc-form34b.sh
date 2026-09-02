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
from urllib.parse import urljoin
import json,re,unicodedata

class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=None; self.cell=None; self.hrefs=[]; self.scripts=[]; self.forms=[]; self.inputs=[]; self.attrs=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs); self.attrs.append((tag,d))
        if tag=='tr': self.row=[]
        elif tag in ('td','th') and self.row is not None: self.cell=''
        elif tag=='a' and d.get('href'): self.hrefs.append(d['href'])
        elif tag=='script' and d.get('src'): self.scripts.append(d['src'])
        elif tag=='form': self.forms.append(d)
        elif tag in ('input','select','button'): self.inputs.append((tag,d))
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
seen_rows=[]; seen_keys=set(); matched=set(); all_hrefs=[]; scripts=[]; attrs=[]; forms=[]; inputs=[]
for p in sorted(Path('/tmp').glob('iebc-34b-page*.html')):
    text=p.read_text(errors='replace')
    parser=Page(); parser.feed(text)
    all_hrefs.extend(parser.hrefs); scripts.extend(parser.scripts); attrs.extend(parser.attrs); forms.extend(parser.forms); inputs.extend(parser.inputs)
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
print('CANONICAL_COUNT',len(canon),'EXACT_NAME_MATCHES',len(matched))
print('MISSING_CANONICAL',[(canon[n][0],canon[n][1]) for n in sorted(set(canon)-matched)])
print('EXTRA_PORTAL_UNIT','DIASPORA' if any(any(c.strip().upper()=='DIASPORA' for c in r) for r in seen_rows) else 'NOT_FOUND')

interesting=[]
for tag,d in attrs:
    blob=' '.join(f'{k}={v}' for k,v in d.items())
    if any(x in blob.lower() for x in ['modal','ajax','view','form','download','result','data-key','onclick','document','pdf']):
        interesting.append((tag,blob))
print('INTERESTING_ATTRS',len(interesting))
for x in interesting[:250]: print('ATTR',*x)

print('FORMS',len(forms))
for f in forms[:50]: print('FORM',f)
print('CONTROL_NAMES',sorted(set(d.get('name','') for _,d in inputs if d.get('name'))))

resolved_scripts=sorted(set(urljoin('https://forms.iebc.or.ke/',s) for s in scripts))
print('SCRIPT_SRCS',len(resolved_scripts))
for s in resolved_scripts: print('SCRIPT',s)

routes=set()
for p in sorted(Path('/tmp').glob('iebc-34b-page*.html')):
    text=p.read_text(errors='replace')
    for m in re.findall(r'(?:href|action|url)\s*[=:]\s*["\']([^"\']+)["\']',text,flags=re.I):
        if any(k in m.lower() for k in ['result','form','download','view','ajax','site%2f','site/']): routes.add(urljoin('https://forms.iebc.or.ke/',m))
    for m in re.findall(r'index\.php\?[^"\'<> ]+',text,flags=re.I):
        if any(k in m.lower() for k in ['result','form','download','view','ajax']): routes.add(urljoin('https://forms.iebc.or.ke/',m.replace('&amp;','&')))
print('ROUTE_CANDIDATES',len(routes))
for r in sorted(routes)[:250]: print('ROUTE',r)
PY

# Fetch same-origin JavaScript assets referenced by the results grid and inspect
# them for hidden AJAX/view/download endpoints. Keep this bounded and text-only.
python - <<'PY' > /tmp/iebc-script-urls.txt
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
class P(HTMLParser):
    def __init__(self): super().__init__(); self.s=[]
    def handle_starttag(self,t,a):
        d=dict(a)
        if t=='script' and d.get('src'): self.s.append(urljoin('https://forms.iebc.or.ke/',d['src']))
p=P(); p.feed(Path('/tmp/iebc-34b-page1.html').read_text(errors='replace'))
for u in sorted(set(x for x in p.s if x.startswith('https://forms.iebc.or.ke/'))): print(u)
PY

n=0
while IFS= read -r url; do
  n=$((n+1)); out="/tmp/iebc-js-$n.js"
  curl -fsSL --connect-timeout 15 --max-time 30 -A "$ua" -c "$cookie" -b "$cookie" "$url" -o "$out" || continue
  printf 'JS_ASSET %s %s\n' "$url" "$(wc -c <"$out")"
  grep -Eio '.{0,120}(ajax|download|results|forms|modal|view|pdf|document).{0,180}' "$out" | head -n 40 || true
done < /tmp/iebc-script-urls.txt

bundle_url="$base/index.php?r=site%2Fdownload-all&p=1&ft=2&lv=2"
set +e
curl -sSIL --connect-timeout 15 --max-time 30 -A "$ua" -c "$cookie" -b "$cookie" "$bundle_url" | head -n 60
rc=${PIPESTATUS[0]}
set -e
echo "BUNDLE_HEAD_RC=$rc"
