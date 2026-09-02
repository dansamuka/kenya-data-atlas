import fs from 'node:fs';
const j=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P20 facility density validation: ${msg}`);};
const source=j('data/p20/source/health-facility-density-2023.json');
const geographies=j('data/geography/registry/geographies.json');
const indicators=j('data/indicators/registry/indicators.json');
const series=j('data/indicators/registry/series.json');
const observations=j('data/indicators/registry/observations.json');
const datasets=j('data/catalogue/registry/datasets.json');
const ledger=j('data/completeness/slot-ledger.json');
const counties=geographies.filter(g=>g.level==='county').sort((a,b)=>a.geo_code.localeCompare(b.geo_code));
const srcByGeo=new Map(source.counties.map(r=>[r.geo_code,r]));
const indicator=indicators.find(i=>i.indicator_code==='IND-HEALTH-FACILITY-DENSITY');
const dataset=datasets.find(d=>d.dataset_code==='DS-KDA-MOH-KNBS-FACILITY-DENSITY-2023-P20');
const obsById=new Map(observations.map(o=>[o.observation_id,o]));
const byGeo=new Map();for(const s of series.filter(s=>s.indicator_id===indicator?.indicator_id&&String(s.series_code).startsWith('KDA-P20-HEALTH-FACILITY-DENSITY-'))){const o=obsById.get(s.latest_observation_id);if(o)byGeo.set(o.geography_id,{s,o});}
try{
  assert(counties.length===47&&srcByGeo.size===47,'source/canonical county coverage must reconcile 47/47');
  assert(source.counties.reduce((a,r)=>a+Number(r.facilities_assessed),0)===14883,'facility count total must remain 14,883');
  assert(source.counties.reduce((a,r)=>a+Number(r.projected_population_2023),0)===51525585,'projected population total must remain 51,525,585');
  assert(source.national_derived_density===2.9,'national density anchor must remain 2.9 per 10,000');
  assert(indicator?.active===true&&indicator.lifecycle_status==='active','indicator must be active');
  assert(indicator.ranking_allowed===false,'density ranking must remain withheld');
  assert(indicator.requires_sampling_uncertainty===false,'derived administrative/census rate must not require survey uncertainty');
  assert(dataset?.publication_status==='published','derived facility-density dataset must be published');
  for(const c of counties){const src=srcByGeo.get(c.geo_code),pair=byGeo.get(c.geography_id);assert(src&&pair,`${c.geo_code}: source/observation missing`);const expected=Math.round((Number(src.facilities_assessed)/Number(src.projected_population_2023)*10000)*10)/10;assert(Number(src.value)===expected,`${c.geo_code}: source rate is not recomputable`);assert(Number(pair.o.value)===expected,`${c.geo_code}: observation rate mismatch`);assert(pair.o.badge==='B'&&pair.o.geographic_method==='aggregated'&&pair.s.geographic_method==='aggregated',`${c.geo_code}: transparent derived Badge B/aggregated provenance required`);assert(pair.s.dataset_id===dataset.dataset_id,`${c.geo_code}: dataset mismatch`);assert(String(pair.o.notes).includes(String(src.facilities_assessed))&&String(pair.o.notes).includes(String(src.projected_population_2023)),`${c.geo_code}: numerator/denominator trace missing`);const row=ledger.rows.find(r=>r.level==='county'&&r.geo_code===c.geo_code&&r.indicator_code==='IND-HEALTH-FACILITY-DENSITY');assert(row?.resolved===true,`${c.geo_code}: completeness slot must resolve`);assert(Number(row.value)===expected,`${c.geo_code}: ledger rate mismatch`);}
  const lower=ledger.rows.filter(r=>['constituency','ward'].includes(r.level)&&r.indicator_code==='IND-HEALTH-FACILITY-DENSITY');
  assert(lower.length===1740,`expected 290 constituency + 1450 ward density slots, found ${lower.length}`);
  for(const row of lower){
    assert(row.source_status!=='inherited'&&row.geographic_method!=='inherited',`${row.geo_code}: county density must not be inherited to ${row.level}`);
    if(!row.resolved)continue;
    const closure=row.resolution_status||row.status;
    assert(closure==='official_unavailable',`${row.geo_code}: resolved lower-level density slot must be explicit official_unavailable closure, got ${closure}`);
    assert(row.observation_id==null||row.observation_id==='',`${row.geo_code}: governed closure must not have an observation`);
    assert(row.series_code==null||row.series_code==='',`${row.geo_code}: governed closure must not have a series`);
    assert(row.value==null||row.value==='',`${row.geo_code}: governed closure must not manufacture a value`);
  }
  console.log('P20_FACILITY_DENSITY_47X1_OK promoted=47 badge=B');
  console.log('P20_FACILITY_DENSITY_DENOMINATOR_OK year=2023 facilities=14883 population=51525585 lower_level_inheritance=false governed_closures_allowed=true');
}catch(error){console.error(error.message||error);process.exit(1);}
