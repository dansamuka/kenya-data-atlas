#!/usr/bin/env bash
set -euo pipefail

base='https://forms.iebc.or.ke'
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0'
cookie='/tmp/iebc-form34b-bulk-cookies.txt'
headers='/tmp/iebc-form34b-bulk-headers.txt'
body='/tmp/iebc-form34b-bulk-body'
url="$base/index.php?r=site%2Fdownload-all&p=1&ft=2&lv=2"

curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/" -o /tmp/iebc-form34b-bulk-home.html
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/index.php?id=5&r=common%2Fset-election" -o /tmp/iebc-form34b-bulk-election.html || true

# The portal marks this endpoint role=modal-remote. Cap the response at 2 MiB:
# this probe is intended to discover the official bulk-download transport, not
# to download a potentially large archive during the governance check.
set +e
curl -fsSL --connect-timeout 20 --max-time 90 --max-filesize 2097152 -A "$ua" -c "$cookie" -b "$cookie" -D "$headers" "$url" -o "$body"
rc=$?
set -e

content_type="$(awk 'BEGIN{IGNORECASE=1} /^content-type:/{gsub(/\r/,""); print $2; exit}' "$headers" 2>/dev/null || true)"
content_disposition="$(awk 'BEGIN{IGNORECASE=1} /^content-disposition:/{sub(/^[^:]+:[[:space:]]*/,""); gsub(/\r/,""); print; exit}' "$headers" 2>/dev/null || true)"
bytes=0
[[ -f "$body" ]] && bytes="$(wc -c < "$body" | tr -d ' ')"
printf 'P23_FORM34B_BULK_ROUTE rc=%s bytes=%s content_type=%s content_disposition=%s\n' "$rc" "$bytes" "$content_type" "$content_disposition"

if [[ "$rc" -ne 0 ]]; then
  # Curl code 63 means the endpoint attempted to exceed the configured cap,
  # which itself is useful evidence that this may be a direct bulk payload.
  if [[ "$rc" -eq 63 ]]; then
    echo 'P23_FORM34B_BULK_ROUTE_STATUS payload_exceeds_probe_cap'
    exit 0
  fi
  echo 'P23_FORM34B_BULK_ROUTE_STATUS request_failed'
  exit "$rc"
fi

python3 - "$body" <<'PY'
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin
import re,sys
p=Path(sys.argv[1]); raw=p.read_bytes()
magic=raw[:16].hex()
print(f'P23_FORM34B_BULK_MAGIC {magic}')
if raw.startswith(b'PK\x03\x04'):
    print('P23_FORM34B_BULK_ROUTE_STATUS direct_zip_payload')
    raise SystemExit(0)
if raw.startswith(b'%PDF-'):
    print('P23_FORM34B_BULK_ROUTE_STATUS direct_pdf_payload')
    raise SystemExit(0)
text=raw.decode('utf-8','replace')
class P(HTMLParser):
    def __init__(self): super().__init__(); self.links=[]; self.forms=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if tag=='a' and d.get('href'): self.links.append(d['href'])
        if tag=='form': self.forms.append(d)
x=P(); x.feed(text)
urls=[]
for h in x.links:
    u=urljoin('https://forms.iebc.or.ke/',h.replace('&amp;','&'))
    if any(k in u.lower() for k in ['download','zip','archive','export']): urls.append(u)
# Do not echo potentially sensitive query payloads in full. Report route shape/count.
routes=sorted(set(re.sub(r'([?&](?:id|token|key|file)=[^&]+)',r'\1<redacted>',u,flags=re.I) for u in urls))
print(f'P23_FORM34B_BULK_HTML links={len(x.links)} candidate_bulk_routes={len(routes)} forms={len(x.forms)}')
for i,u in enumerate(routes[:10],1): print(f'P23_FORM34B_BULK_CANDIDATE_{i} {u}')
plain=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',text)).strip()
flags={k:bool(re.search(k,plain,re.I)) for k in ['download','zip','archive','form 34b','291','290']}
print('P23_FORM34B_BULK_TEXT_FLAGS '+' '.join(f'{k.replace(" ","_")}={str(v).lower()}' for k,v in flags.items()))
print('P23_FORM34B_BULK_ROUTE_STATUS modal_or_html_response')
PY
