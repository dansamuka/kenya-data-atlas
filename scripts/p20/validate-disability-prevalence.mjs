import fs from 'node:fs';
const j=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P20 disability validation: ${msg}`);};
const source=j('data/p20/source/disability-prevalence-2019.json');
const geographies=j('data/geography/registry/geographies.json');
const indicators=j('data/indicators/registry/indicators.json');
const series=j('data/indicators/registry/series.json');
const observations=j('data/indicators/registry/observations.json');
const datasets=j('data/catalogue/registry/datasets.json');
const ledger=j('data/completeness/slot-ledger.json');
const counties=geographies.filter(g=>g.level==='county').sort((a,b)=>a.geo_code.localeCompare(b.geo_code));
const srcByGeo=new Map((source.counties||[]).map(r=>[r.geo_code,r]));
const indicator=indicators.find(r=>r.indicator_code==='IND-DISABILITY-PREVALENCE');
const obsById=new Map(observations.map(o=>[o.observation_id,o]));
const datasetById=new Map(datasets.map(d=>[d.dataset_id,d]));
const byGeo=new Map();
for(const s of series.filter(s=>s.indicator_id===indicator?.indicator_id)){const o=obsById.get(s.latest_observation_id);if(o)byGeo.set(o.geography_id,{s,o});}
try{
 assert(counties.length===47&&srcByGeo.size===47,'source and canonical geography must reconcile 47/47');
 assert(Number(source.national_value)===2.2,'national published prevalence must reconcile to 2.2%');
 assert(indicator?.active===true&&indicator.lifecycle_status==='active','indicator must be active');
 assert(indicator.ranking_allowed===false,'disability prevalence ranking must remain withheld');
 assert(indicator.requires_sampling_uncertainty===false,'census prevalence must not be mislabeled as a sample-survey estimate');
 let n=0;
 for(const county of counties){
   const src=srcByGeo.get(county.geo_code);const pair=byGeo.get(county.geography_id);
   assert(src&&pair,`${county.geo_code}: source/observation missing`);
   assert(Number(pair.o.value)===Number(src.value),`${county.geo_code}: value diverges from Table 2.13`);
   assert(pair.o.badge==='A'&&pair.o.geographic_method==='direct',`${county.geo_code}: must remain official direct evidence`);
   assert(String(pair.o.source_table).includes('Table 2.13'),`${county.geo_code}: source-table provenance missing`);
   assert(String(pair.s.series_code).startsWith('KDA-P20-DISABILITY-PREVALENCE-'),`${county.geo_code}: P20 namespace mismatch`);
   assert(datasetById.get(pair.s.dataset_id)?.dataset_code==='DS-KNBS-KPHC-DISABILITY-2019-P20',`${county.geo_code}: dataset mismatch`);
   const row=ledger.rows.find(r=>r.level==='county'&&r.geo_code===county.geo_code&&r.indicator_code==='IND-DISABILITY-PREVALENCE');
   assert(row?.resolved===true,`${county.geo_code}: completeness slot must resolve`); n++;
 }
 assert(n===47,`expected 47 observations, got ${n}`);
 console.log('P20_DISABILITY_47X1_RECONCILIATION_OK promoted=47');
 console.log('P20_DISABILITY_CENSUS_DEFINITION_OK table=2.13 total_column_only');
 console.log('P20_DISABILITY_ALL_OK');
}catch(error){console.error(error.message||error);process.exit(1);}
