from __future__ import annotations
import csv, io, json, re
from pathlib import Path
import pymupdf, requests, urllib3
from openpyxl import load_workbook

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'data/p05/source'; OUT.mkdir(parents=True,exist_ok=True)
URLS={
 'housing_ch3':'https://www.knbs.or.ke/wp-content/uploads/2025/04/Chapter-3-Household-Demographic-and-Economic-Characteristics.xlsx',
 'housing_ch5':'https://www.knbs.or.ke/wp-content/uploads/2025/04/Chapter-5-Housing-Characteristics-Amenities-and-Adequacy.xlsx',
 'gcp':'https://www.knbs.or.ke/wp-content/uploads/2025/12/2025-Gross-County-Product.pdf',
 'agri':'https://www.knbs.or.ke/wp-content/uploads/2025/01/National-Agriculture-Production-Report-2024.pdf'}

def norm(v): return re.sub(r'[^A-Z0-9]+','',str(v or '').upper().replace('’',"'").replace('–','-').replace('\n',' '))
def num(v):
 s=str(v or '').strip().replace(',','')
 if s in {'','-','—'}: return None
 if s.startswith('(') and s.endswith(')'): s='-'+s[1:-1]
 return float(s)
def counties():
 with open(ROOT/'data/geography/registry/geographies.csv',encoding='utf-8') as f:
  rows=[(r['geo_code'],r['name']) for r in csv.DictReader(f) if r.get('level')=='county']
 if len(rows)!=47: raise RuntimeError(f'Expected 47 registry counties, got {len(rows)}')
 return rows
COUNTIES=counties(); NAME={norm(n):(g,n) for g,n in COUNTIES}
# Exact source-label aliases only; no fuzzy county matching.
for alias,target in {'NAIROBICITY':'Nairobi'}.items():
 hit=next((x for x in COUNTIES if x[1]==target),None)
 if not hit: raise RuntimeError(f'Alias target missing: {target}')
 NAME[alias]=hit

def get(url):
 # KNBS currently presents an incomplete TLS chain to some Linux runners; URLs are pinned official HTTPS endpoints.
 r=requests.get(url,timeout=120,verify=False,headers={'User-Agent':'Kenya-Data-Atlas/0.10 P05-acquisition'}); r.raise_for_status(); return r.content
def put(out,label,raw):
 key=norm(label)
 if key not in NAME: return False
 geo,name=NAME[key]; value=num(raw)
 if value is None: raise RuntimeError(f'Missing numeric value for {name}')
 if geo in out and out[geo]!=value: raise RuntimeError(f'Conflicting duplicate for {name}: {out[geo]} vs {value}')
 out[geo]=value; return True
def panel(ws,lcol,rcol):
 out={}
 for r in ws.iter_rows(values_only=True):
  if len(r)>=lcol: put(out,r[0],r[lcol-1])
  if len(r)>=rcol: put(out,r[5],r[rcol-1])
 if len(out)!=47: raise RuntimeError(f'{ws.title}: expected 47, got {len(out)} missing={[n for g,n in COUNTIES if g not in out]}')
 return out
def connectivity(a,b):
 wb=load_workbook(io.BytesIO(a),data_only=True,read_only=True)
 internet=panel(wb['Table 3.18'],4,9); computer=panel(wb['Table 3.19'],4,9)
 wb=load_workbook(io.BytesIO(b),data_only=True,read_only=True); elec={}
 for r in wb['Table 5.11'].iter_rows(values_only=True):
  if len(r)>=2: put(elec,r[0],r[1])
 if len(elec)!=47: raise RuntimeError(f'Electricity rows={len(elec)}')
 return {g:{'internet_use_pct':internet[g],'computer_use_pct':computer[g],'main_grid_electricity_pct':elec[g]} for g,_ in COUNTIES}
def gcp(data):
 doc=pymupdf.open(stream=data,filetype='pdf'); out={}
 for page in doc:
  text=page.get_text('text')
  if 'Annexe I: GCP by Economic Activity at Current Prices, 2024' not in text: continue
  for t in page.find_tables().tables:
   for r in t.extract():
    if len(r)<22 or norm(r[1]) not in NAME: continue
    geo,name=NAME[norm(r[1])]; rec={'agriculture_gva_ksh_m':num(r[2]),'manufacturing_gva_ksh_m':num(r[4]),'gcp_ksh_m':num(r[21])}
    if any(v is None for v in rec.values()): raise RuntimeError(f'Incomplete GCP row {name}')
    rec['agriculture_share_pct']=round(rec['agriculture_gva_ksh_m']/rec['gcp_ksh_m']*100,2); rec['manufacturing_share_pct']=round(rec['manufacturing_gva_ksh_m']/rec['gcp_ksh_m']*100,2); out[geo]=rec
 if len(out)!=47: raise RuntimeError(f'GCP rows={len(out)} missing={[n for g,n in COUNTIES if g not in out]}')
 with open(ROOT/'data/sprint1/gcp-2020-2024.csv',encoding='utf-8') as f: old={r['geo_code']:float(r['2024']) for r in csv.DictReader(f)}
 bad=[(g,out[g]['gcp_ksh_m'],old.get(g)) for g,_ in COUNTIES if out[g]['gcp_ksh_m']!=old.get(g)]
 if bad: raise RuntimeError(f'GCP 2024 reconciliation mismatch {bad[:5]}')
 return out
def maize(data):
 doc=pymupdf.open(stream=data,filetype='pdf'); out={}
 for page in doc:
  if 'Area and Production of Maize by County' not in page.get_text('text'): continue
  for t in page.find_tables().tables:
   names=list(t.header.names or []); rows=t.extract(); area=next((r for r in rows if len(r)>1 and str(r[0]).strip()=='2023' and 'Area' in str(r[1])),None)
   if area is None: continue
   i=rows.index(area); prod=rows[i-1] if i>0 and 'Production' in str(rows[i-1][1]) else None
   if prod is None: continue
   for c in range(2,min(len(names),len(area),len(prod))):
    key=norm(names[c])
    if key not in NAME: continue
    geo,_=NAME[key]; a,p=num(area[c]),num(prod[c])
    if a is not None and p is not None: out[geo]={'maize_area_ha':a,'maize_production_tonnes':p,'maize_yield_t_per_ha':round(p/a,3) if a else None}
 if len(out)!=47:
  print('AGRI_HEADER_DIAGNOSTIC')
  for page in doc:
   if 'Area and Production of Maize by County' in page.get_text('text'):
    for t in page.find_tables().tables: print(t.header.names)
  raise RuntimeError(f'Maize rows={len(out)} missing={[n for g,n in COUNTIES if g not in out]}')
 area=round(sum(x['maize_area_ha'] for x in out.values())); prod=round(sum(x['maize_production_tonnes'] for x in out.values()))
 if (area,prod)!=(2430013,4285206): raise RuntimeError(f'Maize reconciliation failed area={area} prod={prod}')
 return out
def education():
 with open(ROOT/'data/place-facts/source/county-key-facts.csv',encoding='utf-8') as f:
  out={r['geo_code']:{'public_primary_schools':int(r['public_primary_schools']),'primary_classroom_teachers':int(r['primary_classroom_teachers']),'public_secondary_schools':int(r['public_secondary_schools']),'secondary_teachers':int(r['secondary_teachers'])} for r in csv.DictReader(f)}
 exp={'public_primary_schools':23274,'primary_classroom_teachers':183929,'public_secondary_schools':9246,'secondary_teachers':108569}; totals={k:sum(x[k] for x in out.values()) for k in exp}
 if len(out)!=47 or totals!=exp: raise RuntimeError(f'Education reconciliation failed rows={len(out)} totals={totals}')
 return out
def write(name,rows):
 fields=list(next(iter(rows.values())).keys())
 with open(OUT/name,'w',newline='',encoding='utf-8') as f:
  w=csv.DictWriter(f,fieldnames=['county_number','geo_code','name']+fields); w.writeheader()
  for i,(g,n) in enumerate(COUNTIES,1): w.writerow({'county_number':f'{i:03d}','geo_code':g,'name':n,**rows[g]})
def main():
 con=connectivity(get(URLS['housing_ch3']),get(URLS['housing_ch5'])); eco=gcp(get(URLS['gcp'])); ag=maize(get(URLS['agri'])); edu=education()
 write('education-tsc-2023.csv',edu); write('economic-structure-gcp-2024.csv',eco); write('maize-2023.csv',ag); write('connectivity-housing-survey-2023-24.csv',con)
 manifest={'sources':URLS,'county_count':47,'reconciliations':{'education':{'public_primary_schools':23274,'primary_classroom_teachers':183929,'public_secondary_schools':9246,'secondary_teachers':108569},'maize_2023':{'area_ha':2430013,'production_tonnes':4285206},'gcp_2024':'reconciled exactly to data/sprint1/gcp-2020-2024.csv','connectivity':'47 county rows per metric'}}
 (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
 print('P05_ACQUISITION_47_COUNTIES_OK'); print('P05_EDUCATION_RECONCILIATION_OK'); print('P05_GCP_RECONCILIATION_OK'); print('P05_MAIZE_RECONCILIATION_OK area=2430013 production_tonnes=4285206'); print('P05_CONNECTIVITY_RECONCILIATION_OK')
if __name__=='__main__': main()
