import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P21 agriculture validation: ${msg}`);};
const CODE='IND-AGRI-PRODUCTION';
const SUCCESSORS=['IND-MAIZE-AREA','IND-MAIZE-PRODUCTION','IND-MAIZE-YIELD'];
const SOURCE_URL='https://www.knbs.or.ke/wp-content/uploads/2025/01/National-Agriculture-Production-Report-2024.pdf';

const taxonomy=json('data/indicators/seed/placeholder-taxonomy.json');
const indicators=json('data/indicators/registry/indicators.json');
const series=json('data/indicators/registry/series.json');
const geographies=json('data/geography/registry/geographies.json');
const datasets=json('data/catalogue/registry/datasets.json');
const evidence=json('data/completeness/evidence-states.json');
const ledger=json('data/completeness/slot-ledger.json');
const summary=json('data/completeness/summary.json');
const queue=json('data/completeness/p21-work-queue.json');
const maize=read('data/p05/source/maize-2023.csv').trim().split(/\r?\n/).slice(1);
const profile=read('assets/place-profile.js');

const def=(taxonomy.indicators||[]).find(i=>i.code===CODE);
assert(def?.status==='retired',`${CODE} taxonomy lifecycle must be retired`);
assert(def?.source_url===SOURCE_URL,`${CODE} must retain the official report URL`);
assert(String(def.note||'').includes('IND-MAIZE-PRODUCTION')&&String(def.note||'').includes('IND-MAIZE-YIELD'),`${CODE} retirement note must identify successors`);

assert(maize.length===47,'validated maize source snapshot must retain 47 county rows');
const geoCodes=new Set(maize.map(line=>line.split(',')[1]));
assert(geoCodes.size===47,'validated maize source snapshot must contain 47 unique county codes');
assert(datasets.some(d=>d.dataset_code==='DS-KNBS-MAIZE-2023'&&d.publication_status==='published'),'DS-KNBS-MAIZE-2023 must remain a published canonical dataset');

const indByCode=new Map(indicators.map(i=>[i.indicator_code,i]));
const countyIds=new Set(geographies.filter(g=>g.level==='county').map(g=>g.geography_id));
for(const code of SUCCESSORS){
  const ind=indByCode.get(code);
  assert(ind?.lifecycle_status==='active',`${code} must be an active canonical successor`);
  const countySeries=series.filter(s=>s.indicator_id===ind.indicator_id&&countyIds.has(s.geography_id)&&Number(s.observation_count||0)>0);
  assert(countySeries.length===47,`${code} must retain 47 county series, got ${countySeries.length}`);
}

const closure=(evidence.states||[]).find(s=>s.indicator_code===CODE&&s.status==='retired_replaced');
assert(closure,'retired/replaced evidence state missing');
assert(closure.geo_codes?.length===47&&new Set(closure.geo_codes).size===47,'retired/replaced evidence state must cover 47 unique counties');
assert(closure.source_url===SOURCE_URL,'retired/replaced evidence state source URL mismatch');
assert(JSON.stringify(closure.successor_indicator_codes)===JSON.stringify(SUCCESSORS),'retired/replaced successor set mismatch');

const rows=ledger.rows.filter(r=>r.level==='county'&&r.indicator_code===CODE);
assert(rows.length===47,`governed agriculture placeholder must remain 47 slots, got ${rows.length}`);
assert(rows.every(r=>r.resolved===true&&r.status==='retired_replaced'&&r.completion_phase==='complete'),'all generic agriculture slots must resolve as retired_replaced');
assert(rows.every(r=>!r.series_code&&!r.observation_id&&(r.value===''||r.value===null||r.value===undefined)),'retired/replaced slots must not fabricate observations');
assert((summary.by_status?.retired_replaced||0)>=47,'summary must report the 47 retired/replaced agriculture slots');
assert((summary.by_completion_phase?.P21||0)<=376,`P21 queue should be 376 or lower after agriculture closure, got ${summary.by_completion_phase?.P21}`);
assert(!Object.hasOwn(queue.family_counts||{},CODE),'agriculture placeholder must no longer appear in P21 work queue');
assert(queue.remaining_slots===(summary.by_completion_phase?.P21||0),'P21 queue must reconcile to completeness summary');

assert(profile.includes("life==='retired'?'Replaced'"),'public profile must label retired lifecycle as Replaced');
assert(profile.includes("life==='sourced'||life==='retired'"),'public profile must link the source for retired/replaced cards');

console.log(`P21_AGRICULTURE_REPLACEMENT_OK closed=${rows.length} remaining=${queue.remaining_slots}`);
console.log('P21_AGRICULTURE_SUCCESSORS_47X3_OK');
console.log('P21_AGRICULTURE_NO_FABRICATION_OK');
