#!/usr/bin/env bash
set -euo pipefail

base='https://forms.iebc.or.ke'
cookie='/tmp/iebc-form34b-download-cookies.txt'
headers='/tmp/iebc-form34b-download-headers.txt'
sample='/tmp/iebc-form34b-changamwe-sample'
text='/tmp/iebc-form34b-changamwe-sample.txt'
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0'

# Known stable sample discovered from the official IEBC portal: Changamwe
# constituency Form 34B, portal form/download id 277629.
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/" -o /tmp/iebc-form34b-download-home.html
curl -fsSL --connect-timeout 20 --max-time 60 -A "$ua" -c "$cookie" -b "$cookie" "$base/index.php?id=5&r=common%2Fset-election" -o /tmp/iebc-form34b-download-election.html || true
curl -fsSL --connect-timeout 20 --max-time 120 -A "$ua" -c "$cookie" -b "$cookie" -D "$headers" "$base/index.php?r=site%2Fdownload&id=277629" -o "$sample"

bytes="$(wc -c < "$sample" | tr -d ' ')"
mime="$(file --brief --mime-type "$sample" 2>/dev/null || true)"
description="$(file --brief "$sample" 2>/dev/null || true)"
sha="$(sha256sum "$sample" | awk '{print $1}')"
content_type="$(awk 'BEGIN{IGNORECASE=1} /^content-type:/{gsub(/\r/,""); print $2; exit}' "$headers" || true)"
content_disposition="$(awk 'BEGIN{IGNORECASE=1} /^content-disposition:/{sub(/^[^:]+:[[:space:]]*/,""); gsub(/\r/,""); print; exit}' "$headers" || true)"

printf 'P23_FORM34B_DOWNLOAD_SAMPLE id=277629 bytes=%s mime=%s sha256=%s\n' "$bytes" "$mime" "$sha"
printf 'P23_FORM34B_DOWNLOAD_DESCRIPTION %s\n' "$description"
printf 'P23_FORM34B_DOWNLOAD_HTTP content_type=%s content_disposition=%s\n' "$content_type" "$content_disposition"
printf 'P23_FORM34B_DOWNLOAD_MAGIC '
xxd -p -l 24 "$sample" | tr -d '\n'
printf '\n'

if [[ "$mime" == 'application/pdf' ]] || head -c 5 "$sample" | grep -q '%PDF-'; then
  pages='unknown'
  if command -v pdfinfo >/dev/null 2>&1; then
    pages="$(pdfinfo "$sample" 2>/dev/null | awk -F: '/^Pages:/{gsub(/[[:space:]]/,"",$2); print $2; exit}')"
  fi
  printf 'P23_FORM34B_DOWNLOAD_PDF pages=%s\n' "${pages:-unknown}"
  if command -v pdftotext >/dev/null 2>&1; then
    if pdftotext -layout "$sample" "$text" 2>/dev/null; then
      chars="$(wc -c < "$text" | tr -d ' ')"
      nonspace="$(tr -d '[:space:]' < "$text" | wc -c | tr -d ' ')"
      printf 'P23_FORM34B_TEXT_LAYER chars=%s nonspace_chars=%s\n' "$chars" "$nonspace"
      if [[ "$nonspace" -gt 100 ]]; then
        printf 'P23_FORM34B_TEXT_LAYER_STATUS extractable_text_present\n'
      else
        printf 'P23_FORM34B_TEXT_LAYER_STATUS no_meaningful_text_layer\n'
      fi
    else
      printf 'P23_FORM34B_TEXT_LAYER_STATUS pdftotext_failed\n'
    fi
  else
    printf 'P23_FORM34B_TEXT_LAYER_STATUS pdftotext_unavailable\n'
  fi
else
  printf 'P23_FORM34B_TEXT_LAYER_STATUS not_pdf\n'
fi

# This probe intentionally performs no OCR and does not promote any values.
