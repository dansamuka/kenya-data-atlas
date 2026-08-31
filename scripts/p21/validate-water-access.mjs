import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P21 water access validation: ${msg}`);};
const CODE='IND-WATER-ACCESS';
const DATASET_CODE='DS-KNBS-KHS-WATER-ACCESS-2023-24-P21';
const PREFIX='KDA-P21-WATER-ACCESS-';
const SOURCE_URL='https://www.knbs.or.ke/reports/2023-24-kenya-housing-survey-basic-report/';

const source=json('data/p21/source/water-access-khs-2023-24.json');
const taxonomy=json('data/indicators/seed/placeholder-taxonomy.json');
const indicators=json('data/indicators/registry/indicators.json');
const series=json('data/indicators/registry/series.json');
const observations=json('data/indicators/registry/observations.json');
const geographies=json('data/geography/registry/geographies.json');
const datasets=json('data/catalogue/registry/datasets.json');
const releases=json('data/catalogue/registry/releases.json');
const ledger=json('data/completeness/slot-ledger.json');
const summary=json('data/completeness/summary.json');
const queue=json('data/completeness/p21-work-queue.json');

assert(source.counties?.length===47&&new Set(source.counties.map(r=>r.geo_code)).size===47,'source snapshot must retain 47 unique county rows');
assert(Number(source.national_value)===78.1,'source snapshot national improved-source subtotal must be 78.1');
assert(source.source_table?.includes('Table 5.14'),'source snapshot must identify KNBS Table 5.14');
assert(source.reference_period_start==='2024-03-07'&&source.reference_period_end==='2024-05-10','source snapshot must retain documented KHS fieldwork period');
assert(source.counties.every(r=>Number.isFinite(Number(r.value))&&Number(r.value)>=0&&Number(r.value)<=100),'all source percentages must be finite and within 0–100');

const def=(taxonomy.indicators||[]).find(i=>i.code===CODE);
assert(def?.status==='sourced',`${CODE} taxonomy lifecycle must be sourced`);
assert(def?.source_url===SOURCE_URL,`${CODE} taxonomy source URL mismatch`);

const dataset=datasets.find(d=>d.dataset_code===DATASET_CODE);
assert(dataset?.publication_status==='published',`${DATASET_CODE} must be a published canonical dataset`);
const release=releases.find(r=>r.dataset_id===dataset.dataset_id&&r.release_status==='published');
assert(release,'published water-access release missing');

const indicator=indicators.find(i=>i.indicator_code===CODE);
assert(indicator?.lifecycle_status==='active'&&indicator.active===true,`${CODE} must be active in canonical registry`);
assert(indicator.expected_source_url===SOURCE_URL,`${CODE} canonical source URL mismatch`);
assert(indicator.ranking_allowed===false,'water-access ranking must remain withheld without fabricated uncertainty');
assert(indicator.requires_sampling_uncertainty===true,'water-access survey indicator must preserve sampling-uncertainty requirement');

const counties=geographies.filter(g=>g.level==='county');
assert(counties.length===47,'canonical geography registry must retain 47 counties');
const countyIds=new Set(counties.map(g=>g.geography_id));
const sourceByGeo=new Map(source.counties.map(r=>[r.geo_code,r]));
const geoById=new Map(counties.map(g=>[g.geography_id,g]));
const waterSeries=series.filter(s=>s.indicator_id===indicator.indicator_id&&countyIds.has(s.geography_id)&&String(s.series_code).startsWith(PREFIX));
assert(waterSeries.length===47,`expected 47 canonical county water series, got ${waterSeries.length}`);
assert(new Set(waterSeries.map(s=>s.geography_id)).size===47,'water series must cover 47 unique county geographies');
for(const s of waterSeries){
  assert(s.geographic_method==='direct','all water series must use direct geography method');
  assert(s.dataset_id===dataset.dataset_id,'all water series must use governed KHS dataset');
  assert(Number(s.observation_count)===1,'each water series must have exactly one governed observation');
  const obs=observations.find(o=>o.observation_id===s.latest_observation_id&&o.series_id===s.series_id);
  assert(obs,'latest governed water observation missing');
  const geo=geoById.get(s.geography_id),src=geo?sourceByGeo.get(geo.geo_code):null;
  assert(src,`source row missing for ${geo?.geo_code||s.geography_id}`);
  assert(Number(obs.value)===Number(src.value),`observation/source mismatch for ${geo.geo_code}`);
  assert(obs.geographic_method==='direct'&&obs.source_class==='official','water observation must be direct official evidence');
  assert(obs.source_dataset_id===dataset.dataset_id&&obs.source_release_id===release.release_id,'water observation provenance must resolve to governed dataset/release');
  assert(obs.lower_bound===null&&obs.upper_bound===null&&obs.standard_error===null,'water observation must not fabricate uncertainty fields');
}

const rows=ledger.rows.filter(r=>r.level==='county'&&r.indicator_code===CODE);
assert(rows.length===47,`governed water-access surface must remain 47 slots, got ${rows.length}`);
assert(rows.every(r=>r.resolved===true&&r.completion_phase==='complete'),'all 47 water-access slots must resolve after canonical promotion');
assert(rows.every(r=>r.status==='published_direct'),'all 47 water-access ledger rows must be published_direct');
assert(!Object.hasOwn(queue.family_counts||{},CODE),'water access must no longer appear in P21 work queue');
assert(queue.remaining_slots===(summary.by_completion_phase?.P21||0),'P21 queue must reconcile to completeness summary');
assert(queue.remaining_slots<=329,`P21 queue should be 329 or lower after water promotion, got ${queue.remaining_slots}`);
assert(summary.total_slots===20115,'fixed governed denominator must remain 20,115');
assert(summary.unknown_missing===0,'unknown/unclassified blanks must remain zero');

console.log(`P21_WATER_ACCESS_OK direct=${rows.length} remaining=${queue.remaining_slots}`);
console.log('P21_WATER_ACCESS_47X_DIRECT_OFFICIAL_OK');
console.log('P21_WATER_ACCESS_NO_INHERITANCE_NO_FAKE_UNCERTAINTY_OK');
