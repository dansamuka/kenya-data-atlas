#!/usr/bin/env bash
set -euo pipefail

base='https://forms.iebc.or.ke'
cookie='/tmp/iebc-form34b-sample-cookies.txt'
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0'

# Establish a portal session and explicitly select the 2022 General Election.
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/" -o /tmp/iebc-home.html
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/index.php?id=5&r=common%2Fset-election" -o /tmp/iebc-set-election.html

# Changamwe is the first constituency row in the 2022 presidential Form 34B grid.
form_id='277629'
download_url="$base/index.php?r=site%2Fdownload&id=$form_id"
view_url="$base/index.php?r=site%2Fview-form&id=$form_id"

curl -fsSL --connect-timeout 20 --max-time 90 -A "$ua" -c "$cookie" -b "$cookie" "$download_url" -o /tmp/iebc-form34b-sample
curl -fsSL --connect-timeout 20 --max-time 90 -A "$ua" -c "$cookie" -b "$cookie" "$view_url" -o /tmp/iebc-form34b-view.html

echo "SAMPLE_DOWNLOAD_URL=$download_url"
echo "SAMPLE_BYTES=$(wc -c < /tmp/iebc-form34b-sample)"
file /tmp/iebc-form34b-sample || true
sha256sum /tmp/iebc-form34b-sample || true

echo '=== VIEW ROUTES ==='
grep -Eo '(href|src)=["'"'][^"'"']+["'"']' /tmp/iebc-form34b-view.html | head -n 80 || true

echo '=== PDF/TEXT INSPECTION ==='
if command -v pdfinfo >/dev/null 2>&1; then
  pdfinfo /tmp/iebc-form34b-sample | head -n 40 || true
fi
if command -v pdftotext >/dev/null 2>&1; then
  pdftotext -layout /tmp/iebc-form34b-sample /tmp/iebc-form34b-sample.txt || true
  if test -s /tmp/iebc-form34b-sample.txt; then
    echo "TEXT_BYTES=$(wc -c < /tmp/iebc-form34b-sample.txt)"
    grep -Ein 'registered|votes cast|valid votes|rejected|turnout|constituency|presidential|candidate|total' /tmp/iebc-form34b-sample.txt | head -n 160 || true
    echo '=== TEXT HEAD ==='
    sed -n '1,140p' /tmp/iebc-form34b-sample.txt
  fi
else
  echo 'PDFTOTEXT_UNAVAILABLE=1'
  strings /tmp/iebc-form34b-sample | grep -Ei 'registered|votes cast|valid votes|rejected|turnout|constituency|presidential|candidate|total' | head -n 160 || true
fi
