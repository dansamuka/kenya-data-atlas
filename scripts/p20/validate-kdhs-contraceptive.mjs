import fs from 'node:fs';
const j=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P20 contraceptive validation: ${msg}`);};
const source=j('data/p20/source/kdhs-2022-contraceptive-county.json');
const geographies=j('data/geography/registry/geographies.json');
const indicators=j('data/indicators/registry/indicators.json');
const series=j('data/indicators/registry/series.json');
const observations=j('data/indicators/registry/observations.json');
const ledger=j('data/completeness/slot-ledger.json');
const counties=geographies.filter(g=>g.level==='county').sort((a,b)=>a.geo_code.localeCompare(b.geo_code));
const srcByGeo=new Map(source.counties.map(r=>[r.geo_code,r]));
const indicator=indicators.find(i=>i.indicator_code==='IND-CONTRACEPTIVE-USE');
const obsById=new Map(observations.map(o=>[o.observation_id,o]));
const byGeo=new Map();for(const s of series.filter(s=>s.indicator_id===indicator?.indicator_id)){const o=obsById.get(s.latest_observation_id);if(o)byGeo.set(o.geography_id,{s,o});}
try{
 assert(counties.length===47&&srcByGeo.size===47,'source and canonical counties must reconcile 47/47');
 assert(source.reported_total_pct===56.9&&source.reported_total_weighted_n===17822,'national Table 8C anchor must remain 56.9%, n=17,822');
 assert(indicator?.active===true&&indicator.lifecycle_status==='active','indicator must be active');
 assert(indicator.requires_sampling_uncertainty===true,'survey precision metadata gate must remain enabled');
 assert(indicator.ranking_allowed===false,'survey ranking must remain withheld');
 for(const county of counties){const src=srcByGeo.get(county.geo_code);const pair=byGeo.get(county.geography_id);assert(src&&pair,`${county.geo_code}: source/observation missing`);assert(Number(pair.o.value)===Number(src.modern_contraceptive_pct),`${county.geo_code}: point estimate mismatch`);assert(Number(pair.o.sample_size)===Number(src.sample_size),`${county.geo_code}: denominator mismatch`);assert(pair.o.badge==='A'&&pair.o.geographic_method==='direct',`${county.geo_code}: must remain official direct evidence`);assert(String(pair.o.source_table).includes('Table 8C'),`${county.geo_code}: table provenance missing`);assert(String(pair.s.series_code).startsWith('KDA-P20-KDHS-CONTRACEPTIVE-'),`${county.geo_code}: series namespace mismatch`);const row=ledger.rows.find(r=>r.level==='county'&&r.geo_code===county.geo_code&&r.indicator_code==='IND-CONTRACEPTIVE-USE');assert(row?.resolved===true,`${county.geo_code}: completeness slot must resolve`);}
 const displayedN=source.counties.reduce((a,r)=>a+Number(r.sample_size),0);assert(displayedN===17838,`displayed county denominators changed: ${displayedN}`);assert(displayedN!==source.reported_total_weighted_n,'rounded county denominators should not be forced to sum to the national weighted total');
 console.log('P20_KDHS_CONTRACEPTIVE_47X1_OK promoted=47');console.log(`P20_KDHS_CONTRACEPTIVE_PRECISION_OK national_n=${source.reported_total_weighted_n} displayed_county_sum=${displayedN}`);
}catch(error){console.error(error.message||error);process.exit(1);}
