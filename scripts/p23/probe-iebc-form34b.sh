#!/usr/bin/env bash
set -euo pipefail
base='https://forms.iebc.or.ke'
cookie='/tmp/iebc-cookies.txt'
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0'

curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/" -o /tmp/iebc-home.html
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/index.php?id=5&r=common%2Fset-election" -o /tmp/iebc-set-election.html || true

# Presidential Form 34B constituency grid. The first row (Changamwe) has
# stable portal id 51 and drills down through site/index rather than an <a>.
index_url="$base/index.php?r=site%2Findex&p=1&ft=2&l=2"
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$index_url" -o /tmp/iebc-34b-index.html
sample_url="$base/index.php?r=site%2Findex&id=51&ft=2&p=1&es="
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$sample_url" -o /tmp/iebc-34b-changamwe.html

python - <<'PY'
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin
import re

class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=None; self.cell=None; self.attrs=[]; self.hrefs=[]; self.srcs=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs); self.attrs.append((tag,d))
        if tag=='tr': self.row=[]
        elif tag in ('td','th') and self.row is not None: self.cell=''
        if tag=='a' and d.get('href'): self.hrefs.append(d['href'])
        if d.get('src'): self.srcs.append(d['src'])
    def handle_data(self,data):
        if self.cell is not None: self.cell += data
    def handle_endtag(self,tag):
        if tag in ('td','th') and self.cell is not None:
            self.row.append(re.sub(r'\s+',' ',self.cell).strip()); self.cell=None
        elif tag=='tr' and self.row is not None:
            if self.row: self.rows.append(self.row)
            self.row=None

for path in ['/tmp/iebc-34b-index.html','/tmp/iebc-34b-changamwe.html']:
    text=Path(path).read_text(errors='replace'); p=P(); p.feed(text)
    plain=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',text))
    print('===',Path(path).name,'===')
    print('BYTES',len(text))
    for pat in [r'Showing\s+[^.]+items\.',r'Reported forms[^<]{0,120}',r'34[A-Z]',r'Polling Station',r'Polling Center',r'Constituency',r'CHANGAMWE']:
        hits=re.findall(pat,plain,flags=re.I)
        if hits: print('MATCH',pat,hits[:8])
    print('TABLE_ROWS',len(p.rows))
    for row in p.rows[:80]: print('ROW',' | '.join(row))
    interesting=[]
    for tag,d in p.attrs:
        blob=' '.join(f'{k}={v}' for k,v in d.items())
        if any(k in blob.lower() for k in ['download','modal','pdf','image','document','view','form','onclick','site%2findex&id','result']):
            interesting.append((tag,blob))
    print('INTERESTING_ATTRS',len(interesting))
    for tag,blob in interesting[:160]: print('ATTR',tag,blob)
    links=sorted(set(urljoin('https://forms.iebc.or.ke/',h.replace('&amp;','&')) for h in p.hrefs))
    media=sorted(set(urljoin('https://forms.iebc.or.ke/',s) for s in p.srcs))
    for u in links:
        if any(k in u.lower() for k in ['download','form','result','view','pdf','image','site/index','site%2findex']): print('LINK',u)
    for u in media:
        if any(k in u.lower() for k in ['pdf','image','upload','form','result','document']): print('MEDIA',u)
    # Surface route-like strings that are embedded in onclick/JS rather than href.
    routes=set()
    for m in re.findall(r'/(?:index\.php\?[^"\'<>\s]+|uploads?/[A-Za-z0-9_./%?&=-]+)',text,flags=re.I):
        m=m.replace('&amp;','&')
        if any(k in m.lower() for k in ['download','form','result','view','pdf','image','site%2f','site/']): routes.add(urljoin('https://forms.iebc.or.ke/',m))
    print('EMBEDDED_ROUTES',len(routes))
    for u in sorted(routes)[:160]: print('ROUTE',u)
PY

# Follow one additional row if the constituency page exposes polling-centre IDs.
python - <<'PY' > /tmp/iebc-next-url.txt
from pathlib import Path
import re
text=Path('/tmp/iebc-34b-changamwe.html').read_text(errors='replace')
m=re.search(r'<tr[^>]+id=["\'](\d+)["\'][^>]+onclick=["\'][^"\']*location\.href\s*=\s*["\']([^"\']*)',text,re.I|re.S)
if m:
    print('https://forms.iebc.or.ke/index.php?r=site%2Findex&id='+m.group(1)+'&ft=2&p=1&es=')
PY
if test -s /tmp/iebc-next-url.txt; then
  next_url="$(head -n1 /tmp/iebc-next-url.txt)"
  echo "NEXT_URL=$next_url"
  curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$next_url" -o /tmp/iebc-next.html
  python - <<'PY'
from pathlib import Path
import re
text=Path('/tmp/iebc-next.html').read_text(errors='replace')
plain=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',text))
print('NEXT_BYTES',len(text))
for pat in [r'Showing\s+[^.]+items\.',r'Reported forms[^<]{0,120}',r'34[A-Z]',r'Polling Station',r'Polling Center',r'Constituency',r'CHANGAMWE']:
    h=re.findall(pat,plain,re.I)
    if h: print('NEXT_MATCH',pat,h[:8])
for m in re.findall(r'(?:href|src)=["\']([^"\']+)["\']',text,re.I):
    if any(k in m.lower() for k in ['download','pdf','image','upload','form','result','document']): print('NEXT_RESOURCE',m)
PY
fi
