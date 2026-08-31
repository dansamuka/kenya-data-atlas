import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P21 inpatient-availability validation: ${msg}`);};
const OLD='IND-HOSPITAL-BED-UTILIZATION';
const NEW='IND-INPATIENT-SERVICE-AVAILABILITY';
const PREFIX='KDA-P21-INPATIENT-AVAIL-';

const source=json('data/p21/source/inpatient-service-availability-sara-2025.json');
const taxonomy=json('data/indicators/seed/placeholder-taxonomy.json');
const evidence=json('data/completeness/evidence-states.json');
const queue=json('data/completeness/p21-work-queue.json');
const indicators=json('data/indicators/registry/indicators.json');
const series=json('data/indicators/registry/series.json');
const observations=json('data/indicators/registry/observations.json');
const geographies=json('data/geography/registry/geographies.json');
const datasets=json('data/catalogue/registry/datasets.json');
const releases=json('data/catalogue/registry/releases.json');

const expectedCodes=Array.from({length:47},(_,i)=>`KEN-C${String(i+1).padStart(3,'0')}`);
const rows=source.counties||[];
const byCode=new Map(rows.map(r=>[r.geo_code,r]));
assert(rows.length===47&&byCode.size===47,'source must contain exactly 47 unique counties');
assert(expectedCodes.every(code=>byCode.has(code)),'source county universe must equal KEN-C001–KEN-C047');
assert(rows.reduce((s,r)=>s+Number(r.facility_count),0)===13361,'facility denominators must total 13,361');
assert(Number(source.national_value)===22,'national availability must equal published 22%');

const oldDef=(taxonomy.indicators||[]).find(i=>i.code===OLD);
const newDef=(taxonomy.indicators||[]).find(i=>i.code===NEW);
assert(oldDef?.status==='retired','old bed-utilisation placeholder must be retired');
assert(newDef?.status==='sourced','successor taxonomy definition must remain sourced');
assert(String(oldDef.note||'').includes('Do not interpret that successor as bed occupancy/utilisation'),'old taxonomy note must prohibit proxy interpretation');
assert(String(newDef.note||'').includes('not bed occupancy/utilisation'),'successor taxonomy must distinguish availability from utilisation');

const closure=(evidence.states||[]).find(s=>s.indicator_code===OLD&&s.status==='retired_replaced');
assert(closure,'retired/replaced evidence state missing');
assert(closure.level==='county','closure must be county-level');
assert(JSON.stringify(closure.geo_codes)===JSON.stringify(expectedCodes),'closure must cover exactly all 47 counties');
assert(JSON.stringify(closure.successor_indicator_codes)==JSON.stringify([NEW]),'closure successor must be the inpatient-availability indicator only');
assert(String(closure.reason||'').includes('national average inpatient bed occupancy rate of 46%'),'closure must document why the national 46% rate cannot fill county slots');
assert(!(queue.family_counts||{})[OLD],'old bed-utilisation family must no longer be in the P21 queue');

const indicator=indicators.find(i=>i.indicator_code===NEW);
assert(indicator?.active===true&&indicator?.lifecycle_status==='active','successor indicator must be active after build');
assert(indicator.ranking_allowed===false,'successor must not be rankable');
assert(String(indicator.expected_availability_note||'').includes('not bed occupancy/utilisation'),'registry metadata must prohibit utilisation interpretation');

const geoById=new Map(geographies.map(g=>[g.geography_id,g]));
const successorSeries=series.filter(s=>String(s.series_code||'').startsWith(PREFIX));
assert(successorSeries.length===47,'successor must publish exactly 47 county series');
assert(successorSeries.every(s=>s.indicator_id===indicator.indicator_id),'all successor series must map to successor indicator');
assert(successorSeries.every(s=>s.geographic_method==='direct'&&s.observation_count===1),'all successor series must be one direct observation');
const obsBySeries=new Map(observations.map(o=>[o.series_id,o]));
for(const s of successorSeries){
  const geo=geoById.get(s.geography_id),src=geo?byCode.get(geo.geo_code):null,o=obsBySeries.get(s.series_id);
  assert(geo?.level==='county'&&src,`series geography must map to source county: ${s.series_code}`);
  assert(o,`observation missing: ${s.series_code}`);
  assert(Number(o.value)===Number(src.value),`value mismatch ${geo.geo_code}`);
  assert(Number(o.sample_size)===Number(src.facility_count),`facility denominator mismatch ${geo.geo_code}`);
  assert(o.source_class==='official'&&o.badge==='A','successor observations must retain direct official provenance');
  assert(String(o.notes||'').includes('not bed occupancy/utilisation'),'observation note must distinguish availability from utilisation');
  assert(!String(o.notes||'').includes('allocated to counties.' ) || String(o.notes||'').includes('not allocated to counties'),'occupancy national value must not be allocated');
}

const dataset=datasets.find(d=>d.dataset_code==='DS-MOH-SARA-INPATIENT-AVAILABILITY-2025-P21');
const release=releases.find(r=>r.release_code==='REL-MOH-SARA-INPATIENT-AVAILABILITY-2025-P21');
assert(dataset&&release,'catalogue dataset and release must exist');
assert(String(dataset.known_limitations||'').includes('not a bed-occupancy/utilisation rate'),'dataset limitations must distinguish the concepts');

console.log('P21_INPATIENT_AVAILABILITY_VALIDATE_OK retired_slots=47 successor_series=47 facility_denominator=13361 national_availability=22 occupancy_national_only=46');
