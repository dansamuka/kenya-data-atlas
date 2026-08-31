import fs from 'node:fs';
const j=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P20 pending bills validation: ${msg}`);};
const source=j('data/p20/source/pending-bills-fy2024-25.json');
const geographies=j('data/geography/registry/geographies.json');
const indicators=j('data/indicators/registry/indicators.json');
const series=j('data/indicators/registry/series.json');
const observations=j('data/indicators/registry/observations.json');
const datasets=j('data/catalogue/registry/datasets.json');
const ledger=j('data/completeness/slot-ledger.json');
const counties=geographies.filter(g=>g.level==='county').sort((a,b)=>a.geo_code.localeCompare(b.geo_code));
const srcByGeo=new Map(source.counties.map(r=>[r.geo_code,r]));
const indicator=indicators.find(i=>i.indicator_code==='IND-COUNTY-PENDING-BILLS');
const dataset=datasets.find(d=>d.dataset_code==='DS-TREASURY-COUNTY-PENDING-BILLS-2024-25-P20');
const obsById=new Map(observations.map(o=>[o.observation_id,o]));
const byGeo=new Map();for(const s of series.filter(s=>s.indicator_id===indicator?.indicator_id&&String(s.series_code).startsWith('KDA-P20-PENDING-BILLS-'))){const o=obsById.get(s.latest_observation_id);if(o)byGeo.set(o.geography_id,{s,o});}
try{
  assert(counties.length===47&&srcByGeo.size===47,'source/canonical counties must reconcile 47/47');
  const reported=source.counties.filter(r=>r.reported===true),missing=source.counties.filter(r=>r.reported===false);
  assert(reported.length===46&&missing.length===1&&missing[0].geo_code==='KEN-C033','expected 46 numeric counties and Narok official non-submission');
  assert(Math.round(reported.reduce((a,r)=>a+Number(r.value),0)*10)/10===176904.5,'displayed county-row sum must remain 176,904.5');
  assert(source.published_national_total_kes_million===176904.2,'published national total must remain 176,904.2');
  assert(srcByGeo.get('KEN-C004').value===2380.5,'Tana River final verified value must remain 2,380.5');
  assert(indicator?.active===true&&indicator.lifecycle_status==='active','indicator must be active');
  assert(indicator.ranking_allowed===false,'pending-bills ranking must remain withheld');
  assert(dataset?.publication_status==='published','pending-bills dataset must be published');
  for(const c of counties){const src=srcByGeo.get(c.geo_code),pair=byGeo.get(c.geography_id),row=ledger.rows.find(r=>r.level==='county'&&r.geo_code===c.geo_code&&r.indicator_code==='IND-COUNTY-PENDING-BILLS');if(src.reported===true){assert(pair,`${c.geo_code}: reported observation missing`);assert(Number(pair.o.value)===Number(src.value),`${c.geo_code}: value mismatch`);assert(pair.o.badge==='A'&&pair.o.geographic_method==='direct',`${c.geo_code}: reported pending bill must remain official direct evidence`);assert(pair.s.dataset_id===dataset.dataset_id,`${c.geo_code}: dataset mismatch`);assert(row?.resolved===true&&row.status==='published_direct',`${c.geo_code}: completeness row must resolve as published_direct`);assert(Number(row.value)===Number(src.value),`${c.geo_code}: ledger value mismatch`);}else{assert(!pair,'Narok must not receive a synthetic pending-bills observation');assert(row?.resolved===true&&row.status==='official_unavailable','Narok must resolve as governed official_unavailable');assert(row.value===''||row.value===null||row.value===undefined,'Narok official non-submission must not carry a numeric value');assert(String(row.reason).includes('did not submit')||String(row.reason).includes('Did not submit'),'Narok evidence-state reason must explain non-submission');}}
  assert(byGeo.size===46,`pending-bills namespace must contain exactly 46 numeric observations, got ${byGeo.size}`);
  console.log('P20_PENDING_BILLS_46_NUMERIC_OK national=176904.2 displayed_sum=176904.5');
  console.log('P20_PENDING_BILLS_NAROK_UNAVAILABLE_OK zero_fabricated=false');
}catch(error){console.error(error.message||error);process.exit(1);}
