import fs from 'node:fs';
const j=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P20 durable wall validation: ${msg}`);};
const source=j('data/p20/source/kphc-2019-durable-wall-county.json');
const geographies=j('data/geography/registry/geographies.json');
const indicators=j('data/indicators/registry/indicators.json');
const series=j('data/indicators/registry/series.json');
const observations=j('data/indicators/registry/observations.json');
const datasets=j('data/catalogue/registry/datasets.json');
const ledger=j('data/completeness/slot-ledger.json');
const counties=geographies.filter(g=>g.level==='county').sort((a,b)=>a.geo_code.localeCompare(b.geo_code));
const srcByGeo=new Map(source.counties.map(r=>[r.geo_code,r]));
const indicator=indicators.find(i=>i.indicator_code==='IND-HOUSING-MATERIAL');
const dataset=datasets.find(d=>d.dataset_code==='DS-KNBS-KPHC-DURABLE-WALL-2019-P20');
const obsById=new Map(observations.map(o=>[o.observation_id,o]));
const byGeo=new Map();for(const s of series.filter(s=>s.indicator_id===indicator?.indicator_id&&String(s.series_code).startsWith('KDA-P20-DURABLE-WALL-'))){const o=obsById.get(s.latest_observation_id);if(o)byGeo.set(o.geography_id,{s,o});}
try{
 assert(counties.length===47&&srcByGeo.size===47,'source and canonical counties must reconcile 47/47');
 assert(source.national_value===51.3,'published national durable-wall anchor must remain 51.3%');
 assert(source.durability_definition.includes('Concrete/Concrete blocks/Precast wall')&&source.durability_definition.includes('Prefabricated panels'),'official durable-category definition changed unexpectedly');
 assert(indicator?.active===true&&indicator.lifecycle_status==='active','indicator must be active');
 assert(indicator.name==='Households with durable wall material','indicator semantics must remain durable wall material');
 assert(indicator.requires_sampling_uncertainty===false,'census indicator must not require survey uncertainty metadata');
 assert(indicator.ranking_allowed===false,'derived housing ranking must remain withheld');
 assert(dataset?.publication_status==='published','durable-wall dataset must be published');
 for(const county of counties){const src=srcByGeo.get(county.geo_code);const pair=byGeo.get(county.geography_id);assert(src&&pair,`${county.geo_code}: source/observation missing`);assert(Number(pair.o.value)===Number(src.durable_wall_pct),`${county.geo_code}: durable subtotal mismatch`);assert(pair.o.badge==='B'&&pair.o.geographic_method==='aggregated',`${county.geo_code}: same-geography category aggregation must retain Badge B`);assert(pair.s.geographic_method==='aggregated',`${county.geo_code}: series method must use canonical aggregated vocabulary`);assert(String(pair.o.source_table).includes('Table 2.13'),`${county.geo_code}: Table 2.13 provenance missing`);assert(pair.s.dataset_id===dataset.dataset_id,`${county.geo_code}: canonical dataset mismatch`);const row=ledger.rows.find(r=>r.level==='county'&&r.geo_code===county.geo_code&&r.indicator_code==='IND-HOUSING-MATERIAL');assert(row?.resolved===true,`${county.geo_code}: completeness slot must resolve`);assert(Number(row?.value)===Number(src.durable_wall_pct),`${county.geo_code}: ledger value mismatch`);}
 assert(series.filter(s=>String(s.series_code).startsWith('KDA-P20-DURABLE-WALL-')).length===47,'durable-wall namespace must contain exactly 47 county series');
 console.log('P20_DURABLE_WALL_47X1_OK promoted=47 badge=B');
 console.log('P20_DURABLE_WALL_AGGREGATION_OK national_anchor=51.3 no_inheritance=true');
}catch(error){console.error(error.message||error);process.exit(1);}
