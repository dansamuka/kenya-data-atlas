#!/usr/bin/env python3
import argparse, http.cookiejar, json, re, time, unicodedata
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import HTTPCookieProcessor, Request, build_opener

BASE='https://forms.iebc.or.ke'
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0'
PAGE_URL=lambda page: f'{BASE}/index.php?r=site%2Findex&p=1&ft=2&l=2&page={page}'
ALIASES={
  'CHUKA IGAMBANG OMBE':'KEN-C013-CON061',
  'SUBA NORTH':'KEN-C043-CON251',
  'SUBA SOUTH':'KEN-C043-CON252',
}
EXCLUDED={'DIASPORA':'Official presidential diaspora collation row; outside the canonical 290 territorial constituencies.'}

def norm(v):
  v=unicodedata.normalize('NFKD',v or '')
  v=''.join(ch for ch in v if not unicodedata.combining(ch)).upper().replace('’',"'").replace('`',"'")
  return re.sub(r'\s+',' ',re.sub(r'[^A-Z0-9]+',' ',v)).strip()

class P(HTMLParser):
  def __init__(self): super().__init__(); self.rows=[]; self.hrefs=[]; self.row=None; self.cell=None
  def handle_starttag(self,tag,attrs):
    d=dict(attrs)
    if tag=='a' and d.get('href'): self.hrefs.append(d['href'])
    if tag=='tr': self.row={'id':d.get('id'),'cells':[]}
    elif tag in ('td','th') and self.row is not None: self.cell=''
  def handle_data(self,data):
    if self.cell is not None: self.cell+=data
  def handle_endtag(self,tag):
    if tag in ('td','th') and self.cell is not None and self.row is not None:
      self.row['cells'].append(re.sub(r'\s+',' ',self.cell).strip()); self.cell=None
    elif tag=='tr' and self.row is not None:
      if self.row['cells']: self.rows.append(self.row)
      self.row=None; self.cell=None

def fetch(opener,url,retries=3):
  last=None
  for i in range(retries):
    try:
      with opener.open(Request(url,headers={'User-Agent':UA}),timeout=60) as r: return r.read().decode('utf-8','replace')
    except Exception as e:
      last=e
      if i+1<retries: time.sleep(1.5*(i+1))
  raise RuntimeError(f'fetch failed {url}: {last}')

def page_rows(html):
  p=P(); p.feed(html); out=[]
  for r in p.rows:
    if r['id'] and str(r['id']).isdigit() and r['cells']:
      out.append({'portal_row_id':int(r['id']),'portal_name':r['cells'][0],'reported':r['cells'][1] if len(r['cells'])>1 else ''})
  return out

def refs(html):
  p=P(); p.feed(html); ds=[]; vs=[]
  for h in p.hrefs:
    h=h.replace('&amp;','&')
    m=re.search(r'r=site%2Fdownload&id=(\d+)',h,re.I)
    if m: ds.append(int(m.group(1)))
    m=re.search(r'r=site%2Fview-form&id=(\d+)',h,re.I)
    if m: vs.append(int(m.group(1)))
  return sorted(set(ds)),sorted(set(vs)),'reported' if re.search(r'\bReported\b',html,re.I) else 'unknown'

def main():
  ap=argparse.ArgumentParser(); ap.add_argument('--output',default='/tmp/iebc-2022-form34b-source-manifest.json'); args=ap.parse_args()
  root=Path(__file__).resolve().parents[2]
  geos=json.loads((root/'data/geography/registry/geographies.json').read_text(encoding='utf-8'))
  cons=[g for g in geos if g.get('level')=='constituency']
  if len(cons)!=290: raise RuntimeError(f'expected 290 canonical constituencies, got {len(cons)}')
  by_name={norm(g['name']):g for g in cons}; by_code={g['geo_code']:g for g in cons}
  if len(by_name)!=290: raise RuntimeError('canonical normalized constituency-name collision')
  jar=http.cookiejar.CookieJar(); op=build_opener(HTTPCookieProcessor(jar))
  fetch(op,BASE+'/'); fetch(op,BASE+'/index.php?id=5&r=common%2Fset-election')

  all_rows=[]; seen=set(); page_counts=[]
  # IEBC reports 291 items with 50 rows/page => six pages. Crawl the bounded
  # page set directly rather than depending on frontend pagination markup.
  for page in range(1,7):
    url=PAGE_URL(page); html=fetch(op,url); rows=page_rows(html); new=[]
    for row in rows:
      if row['portal_row_id'] not in seen:
        seen.add(row['portal_row_id']); all_rows.append(row); new.append(row)
    page_counts.append({'page':page,'rows':len(rows),'new_rows':len(new),'url':url})
    print(f'P23_FORM34B_PAGE page={page} rows={len(rows)} new={len(new)} first_id={rows[0]["portal_row_id"] if rows else ""} last_id={rows[-1]["portal_row_id"] if rows else ""}')
  all_rows.sort(key=lambda x:x['portal_row_id'])

  matched=[]; excluded=[]; unmatched=[]; matched_codes=set()
  for row in all_rows:
    key=norm(row['portal_name'])
    if key in EXCLUDED:
      excluded.append({**row,'exclusion_reason':EXCLUDED[key]}); continue
    geo=by_name.get(key); method='exact_normalized_name'; alias=''
    if not geo and key in ALIASES:
      alias=ALIASES[key]; geo=by_code.get(alias); method='governed_source_name_alias'
    if not geo: unmatched.append(row); continue
    if geo['geo_code'] in matched_codes: raise RuntimeError(f'duplicate portal mapping for {geo["geo_code"]}')
    matched_codes.add(geo['geo_code'])
    detail=f'{BASE}/index.php?r=site%2Findex&id={row["portal_row_id"]}&ft=2&p=1&es='
    html=fetch(op,detail); ds,vs,status=refs(html)
    matched.append({
      'geo_code':geo['geo_code'],'geography_id':geo['geography_id'],'constituency_code':geo.get('constituency_code'),
      'constituency_name':geo['name'],'portal_name':row['portal_name'],'portal_row_id':row['portal_row_id'],
      'portal_reported':row['reported'],'match_method':method,'alias_geo_code':alias,'detail_url':detail,'form_status':status,
      'form_download_ids':ds,'form_view_ids':vs,
      'download_urls':[f'{BASE}/index.php?r=site%2Fdownload&id={x}' for x in ds],
      'view_urls':[f'{BASE}/index.php?r=site%2Fview-form&id={x}' for x in vs],
    })
  missing=[{'geo_code':g['geo_code'],'constituency_name':g['name']} for g in cons if g['geo_code'] not in matched_codes]
  matched.sort(key=lambda x:int(x['constituency_code'] or 0))
  wd=sum(len(x['form_download_ids'])==1 for x in matched); wv=sum(len(x['form_view_ids'])==1 for x in matched)
  reported=all(x['form_status']=='reported' and x['portal_reported']=='1 of 1 (100%)' for x in matched)
  complete=(len(all_rows)==291 and len(matched)==290 and len(excluded)==1 and norm(excluded[0]['portal_name'])=='DIASPORA' and not unmatched and not missing and wd==290 and wv==290 and reported)
  out={
    'schema_version':'kda.p23.iebc-form34b-source-manifest.v2','as_of':'2026-09-03','source':'Independent Electoral and Boundaries Commission (IEBC) 2022 General Election Form 34B portal',
    'page_counts':page_counts,'portal_rows_discovered':len(all_rows),'canonical_constituencies':290,'canonical_matches':len(matched),
    'governed_alias_matches':sum(x['match_method']=='governed_source_name_alias' for x in matched),
    'excluded_noncanonical_portal_rows':excluded,'unmatched_portal_rows':unmatched,'missing_canonical_constituencies':missing,
    'canonical_rows_with_single_download_ref':wd,'canonical_rows_with_single_view_ref':wv,'rows':matched,
    'promotion_state':'source_reference_manifest_complete' if complete else 'source_reference_discovery_incomplete',
    'promotion_note':'Source references only; no turnout values are created or promoted by this manifest.'
  }
  path=Path(args.output); path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
  print(f'P23_FORM34B_MANIFEST_V2 discovered={len(all_rows)} matches={len(matched)} aliases={out["governed_alias_matches"]} excluded={len(excluded)} unmatched={len(unmatched)} missing={len(missing)} downloads={wd} views={wv} complete={complete}')
  if excluded: print('P23_FORM34B_EXCLUDED '+json.dumps(excluded,ensure_ascii=False))
  if unmatched: print('P23_FORM34B_UNMATCHED '+json.dumps(unmatched,ensure_ascii=False))
  if missing: print('P23_FORM34B_MISSING '+json.dumps(missing,ensure_ascii=False))
  if not complete: raise RuntimeError('Form 34B source-reference manifest did not satisfy the governed 291→290 acceptance gate')

if __name__=='__main__': main()
