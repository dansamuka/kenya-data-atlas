#!/usr/bin/env bash
set -euo pipefail
base='https://forms.iebc.or.ke'
cookie='/tmp/iebc-cookies.txt'
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0'

curl -fsSL -A "$ua" -c "$cookie" -b "$cookie" "$base/" -o /tmp/iebc-home.html
printf 'IEBC_HOME_BYTES=%s\n' "$(wc -c </tmp/iebc-home.html)"

# Switch the portal to the 2022 General Elections context. The official portal
# exposes this action from its top navigation as election id=5.
curl -fsSL -A "$ua" -c "$cookie" -b "$cookie" "$base/index.php?id=5&r=common%2Fset-election" -o /tmp/iebc-set-election.html || true
curl -fsSL -A "$ua" -c "$cookie" -b "$cookie" "$base/" -o /tmp/iebc-2022.html
printf 'IEBC_2022_BYTES=%s\n' "$(wc -c </tmp/iebc-2022.html)"

python - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.forms=[]; self.selects=[]; self._form=None
    def handle_starttag(self, tag, attrs):
        d=dict(attrs)
        if tag=='a' and d.get('href'): self.links.append((d.get('href'), d.get('title','')))
        if tag=='form':
            self._form={'action':d.get('action',''),'method':d.get('method','get'),'fields':[]}; self.forms.append(self._form)
        if tag in ('input','select','option') and self._form is not None:
            self._form['fields'].append((tag,d.get('name',''),d.get('value',''),d.get('id','')))
    def handle_endtag(self, tag):
        if tag=='form': self._form=None

text=Path('/tmp/iebc-2022.html').read_text(errors='replace')
p=P(); p.feed(text)
print('HAS_2022_GENERAL_ELECTIONS', '2022 General Elections' in text)
for needle in ['34B','34A','President','Presidential','Download All','Constituency','Registered Voters']:
    print('TOKEN',needle,needle.lower() in text.lower())
print('FORMS',len(p.forms))
for f in p.forms[:20]: print('FORM',f)
interesting=[]
for href,title in p.links:
    h=href.lower()
    if any(x in h for x in ['download','form','position','level','election','index.php']):
        interesting.append(urljoin('https://forms.iebc.or.ke/',href))
for u in sorted(set(interesting))[:120]: print('LINK',u)
PY

# Print only likely endpoint/configuration lines, not the whole HTML.
grep -Eio 'href="[^"]+"|action="[^"]+"|name="[^"]+"|value="[^"]+"|form 34[ab]|president[^<]{0,80}|constituenc[^<]{0,80}' /tmp/iebc-2022.html | head -n 240 || true
