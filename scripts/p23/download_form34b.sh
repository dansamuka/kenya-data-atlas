#!/usr/bin/env bash
set -euo pipefail
# usage: download_form34b.sh <constituency_code> <out_pdf_path>
code="$1"
out="$2"
form_id=$((code + 277628))
base='https://forms.iebc.or.ke'
cookie="$(mktemp)"
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0'

curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/" -o /dev/null
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/index.php?r=common/set-election&id=5" -o /dev/null || true
curl -fsSL --connect-timeout 20 --max-time 120 -A "$ua" -c "$cookie" -b "$cookie" "$base/index.php?r=site%2Fdownload&id=${form_id}" -o "$out"

bytes="$(wc -c < "$out" | tr -d ' ')"
sha="$(sha256sum "$out" | awk '{print $1}')"
mime="$(file --brief --mime-type "$out" 2>/dev/null || true)"
printf 'FORM_ID=%s BYTES=%s SHA256=%s MIME=%s\n' "$form_id" "$bytes" "$sha" "$mime"
rm -f "$cookie"
