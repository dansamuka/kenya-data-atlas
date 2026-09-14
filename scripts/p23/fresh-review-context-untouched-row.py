#!/usr/bin/env python3
import argparse, hashlib, http.cookiejar, json, pathlib, re, struct, subprocess, urllib.request


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def png_size(path):
    data = pathlib.Path(path).read_bytes()[:24]
    if data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
        raise SystemExit(f'not a PNG: {path}')
    return struct.unpack('>II', data[16:24])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--geo-code', required=True)
    ap.add_argument('--name', required=True)
    ap.add_argument('--source-index', default='data/p23/form34b-source-index-contract.json')
    ap.add_argument('--output-dir', required=True)
    args = ap.parse_args()

    m = re.fullmatch(r'KEN-C\d{3}-CON(\d{3})', args.geo_code)
    if not m:
        raise SystemExit('invalid geo code')
    constituency_code = int(m.group(1))
    source_index = json.loads(pathlib.Path(args.source_index).read_text())
    relation = source_index['source_index_relation']
    if relation.get('form_id_offset') != 277628:
        raise SystemExit('source-index locator contract drifted')
    if source_index.get('authority', {}).get('portal_url') != 'https://forms.iebc.or.ke':
        raise SystemExit('unexpected source authority')

    form_id = constituency_code + relation['form_id_offset']
    source_url = relation['download_url_template'].replace('{form_id}', str(form_id))
    out = pathlib.Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    pdf = out / f'{args.geo_code}-form34b.pdf'

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    headers = {'User-Agent': 'Mozilla/5.0 KenyaDataAtlas/1.0'}
    for url in ['https://forms.iebc.or.ke/', 'https://forms.iebc.or.ke/index.php?id=5&r=common%2Fset-election']:
        try:
            opener.open(urllib.request.Request(url, headers=headers), timeout=60).read()
        except Exception:
            pass
    payload = opener.open(urllib.request.Request(source_url, headers=headers), timeout=120).read()
    if not payload.startswith(b'%PDF-'):
        raise SystemExit('fresh official download is not PDF')
    pdf.write_bytes(payload)

    prefix = out / f'{args.geo_code}-page'
    subprocess.run(['pdftoppm', '-png', '-r', '250', str(pdf), str(prefix)], check=True)
    pages = []
    for p in sorted(out.glob(f'{args.geo_code}-page-*.png')):
        w, h = png_size(p)
        pages.append({'file': p.name, 'sha256': sha256(p), 'width_px': w, 'height_px': h, 'render_dpi': 250})
    if not pages:
        raise SystemExit('no review pages rendered')

    manifest = {
        'schema_version': 'kda.p23.untouched-fresh-review-context.v1',
        'geo_code': args.geo_code,
        'name': args.name,
        'constituency_code': constituency_code,
        'locator_basis': 'governed_source_index_formula',
        'form_id': form_id,
        'source_url': source_url,
        'source_pdf_sha256': sha256(pdf),
        'fresh_download': True,
        'pages': pages,
        'governance': {
            'no_inheritance': True,
            'no_promotion': True,
            'result_values_forbidden': True,
            'source_review_performed': False,
            'canonical_turnout_value_written': False,
            'required_render_dpi': 250
        }
    }
    pathlib.Path(out / 'review-context.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f"P23_UNTOUCHED_CONTEXT geo={args.geo_code} pages={len(pages)} dpi=250 no_promotion=true")

if __name__ == '__main__':
    main()
