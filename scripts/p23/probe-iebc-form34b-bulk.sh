#!/usr/bin/env bash
set -euo pipefail

base='https://forms.iebc.or.ke'
cookie='/tmp/iebc-form34b-bulk-cookies.txt'
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0'

curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/" -o /tmp/iebc-home.html
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/index.php?id=5&r=common%2Fset-election" -o /tmp/iebc-set-election.html

bulk_url="$base/index.php?r=site%2Fdownload-all&p=1&ft=2&lv=2"
curl -fsSL --connect-timeout 20 --max-time 180 -A "$ua" -c "$cookie" -b "$cookie" -D /tmp/iebc-form34b-bulk.headers "$bulk_url" -o /tmp/iebc-form34b-bulk

echo "BULK_URL=$bulk_url"
echo "BULK_BYTES=$(wc -c < /tmp/iebc-form34b-bulk)"
echo '=== RESPONSE HEADERS ==='
sed -n '1,80p' /tmp/iebc-form34b-bulk.headers
file /tmp/iebc-form34b-bulk || true
sha256sum /tmp/iebc-form34b-bulk || true

if command -v unzip >/dev/null 2>&1 && unzip -t /tmp/iebc-form34b-bulk >/dev/null 2>&1; then
  echo 'BULK_ARCHIVE=zip'
  unzip -l /tmp/iebc-form34b-bulk | sed -n '1,40p'
  echo '=== ZIP TAIL ==='
  unzip -l /tmp/iebc-form34b-bulk | tail -n 25
else
  echo 'BULK_ARCHIVE=not_zip'
  head -c 2000 /tmp/iebc-form34b-bulk | strings | head -n 80 || true
fi
