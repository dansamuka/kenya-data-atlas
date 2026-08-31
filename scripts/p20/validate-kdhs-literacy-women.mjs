import fs from 'node:fs';
const j=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P20 literacy validation: ${msg}`);};
const source=j('data/p20/source/kdhs-2022-literacy-women-county.json');
const geographies=j('data/geography/registry/geographies.json');
const indicators=j('data/indicators/registry/indicators.json');
const series=j('data/indicators/registry/series.json');
const observations=j('data/indicators/registry/observations.json');
const ledger=j('data/completeness/slot-ledger.json');
const counties=geographies.filter(g=>g.level==='county').sort((a,b)=>a.geo_code.localeCompare(b.geo_code));
const srcByGeo=new Map(source.counties.map(r=>[r.geo_code,r]));
const indicator=indicators.find(i=>i.indicator_code==='IND-LITERACY-RATE');
const obsById=new Map(observations.map(o=>[o.observation_id,o]));
const byGeo=new Map();for(const s of series.filter(s=>s.indicator_id===indicator?.indicator_id&&String(s.series_code).startsWith('KDA-P20-KDHS-LITERACY-WOMEN-'))){const o=obsById.get(s.latest_observation_id);if(o)byGeo.set(o.geography_id,{s,o});}
try{
 assert(counties.length===47&&srcByGeo.size===47,'source and canonical counties must reconcile 47/47');
 assert(source.reported_total_pct===90.9&&source.reported_total_weighted_n===32156,'corrected national Table 3.3.1C anchor must remain 90.9%, n=32,156');
 assert(source.counties.reduce((a,r)=>a+Number(r.sample_size),0)===32156,'county weighted denominators must reconcile to 32,156');
 assert(indicator?.active===true&&indicator.lifecycle_status==='active','indicator must be active');
 assert(indicator.name==='Women age 15–49 literacy rate','indicator semantics must remain women age 15–49 literacy');
 assert(indicator.requires_sampling_uncertainty===true,'survey precision metadata gate must remain enabled');
 assert(indicator.ranking_allowed===false,'literacy point-estimate ranking must remain withheld');
 for(const county of counties){const src=srcByGeo.get(county.geo_code);const pair=byGeo.get(county.geography_id);assert(src&&pair,`${county.geo_code}: source/observation missing`);assert(Number(pair.o.value)===Number(src.literacy_pct),`${county.geo_code}: point estimate mismatch`);assert(Number(pair.o.sample_size)===Number(src.sample_size),`${county.geo_code}: denominator mismatch`);assert(pair.o.badge==='A'&&pair.o.geographic_method==='direct',`${county.geo_code}: must remain official direct evidence`);assert(String(pair.o.source_table).includes('Table 3.3.1C'),`${county.geo_code}: table provenance missing`);assert(pair.o.source_page==='86',`${county.geo_code}: page provenance must remain 86`);const row=ledger.rows.find(r=>r.level==='county'&&r.geo_code===county.geo_code&&r.indicator_code==='IND-LITERACY-RATE');assert(row?.resolved===true,`${county.geo_code}: completeness slot must resolve`);}
 console.log('P20_KDHS_LITERACY_WOMEN_47X1_OK promoted=47');
 console.log('P20_KDHS_LITERACY_PRECISION_OK national=90.9 n=32156 no_combined_sex_inference=true');
}catch(error){console.error(error.message||error);process.exit(1);}
