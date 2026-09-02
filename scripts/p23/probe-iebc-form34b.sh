#!/usr/bin/env bash
set -euo pipefail
base='https://forms.iebc.or.ke'
cookie='/tmp/iebc-cookies.txt'
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0'

curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/" -o /tmp/iebc-home.html
printf 'IEBC_HOME_BYTES=%s\n' "$(wc -c </tmp/iebc-home.html)"

# Switch the portal to the 2022 General Elections context. The official portal
# exposes this action from its top navigation as election id=5.
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/index.php?id=5&r=common%2Fset-election" -o /tmp/iebc-set-election.html || true
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/" -o /tmp/iebc-2022.html
printf 'IEBC_2022_BYTES=%s\n' "$(wc -c </tmp/iebc-2022.html)"

python - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.selects={}; self.current_select=None; self.current_option=None
    def handle_starttag(self, tag, attrs):
        d=dict(attrs)
        if tag=='a' and d.get('href'): self.links.append(d.get('href'))
        if tag=='select':
            self.current_select=d.get('name',''); self.selects.setdefault(self.current_select,[])
        elif tag=='option' and self.current_select is not None:
            self.current_option={'value':d.get('value',''),'text':''}
    def handle_data(self,data):
        if self.current_option is not None: self.current_option['text']+=data
    def handle_endtag(self, tag):
        if tag=='option' and self.current_option is not None:
            self.selects[self.current_select].append((self.current_option['value'],self.current_option['text'].strip()))
            self.current_option=None
        elif tag=='select': self.current_select=None

text=Path('/tmp/iebc-2022.html').read_text(errors='replace')
p=P(); p.feed(text)
print('HAS_2022_GENERAL_ELECTIONS', '2022 General Elections' in text)
for name,opts in p.selects.items(): print('SELECT',name,opts)
for u in sorted(set(urljoin('https://forms.iebc.or.ke/',h) for h in p.links if 'index.php' in h or 'download' in h))[:100]: print('LINK',u)
PY

# Probe the presidential position against each exposed form type at constituency
# level. We only inspect HTML labels/counts here; no bulk files are downloaded.
for ft in 1 2 3; do
  url="$base/index.php?r=site%2Findex&p=1&ft=$ft&l=2"
  out="/tmp/iebc-p1-ft${ft}-l2.html"
  curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$url" -o "$out"
  echo "=== PRESIDENT_FT_${ft}_CONSTITUENCY ==="
  printf 'BYTES=%s\n' "$(wc -c <"$out")"
  python - "$out" <<'PY'
from pathlib import Path
from html.parser import HTMLParser
import re,sys
text=Path(sys.argv[1]).read_text(errors='replace')
plain=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',text))
for pat in [r'Reported forms[^<]{0,80}',r'Showing[^<]{0,80}',r'\bForm\s*34[A-Z]?\b',r'\b34[A-Z]\b',r'Constituency',r'County',r'Polling Center']:
    hits=re.findall(pat,plain,flags=re.I)
    if hits: print('MATCH',pat,hits[:8])
for line in re.findall(r'href="([^"]+)"',text,flags=re.I):
    if 'download' in line.lower() or 'results' in line.lower(): print('ENDPOINT',line)
PY
done
