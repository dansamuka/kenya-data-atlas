import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P21 Class C road validation: ${msg}`);};
const OLD='IND-ROAD-NETWORK-LENGTH';
const NEW='IND-CLASS-C-RURAL-ROAD-LENGTH';
const PREFIX='KDA-P21-CLASS-C-ROAD-';
const expected=Array.from({length:47},(_,i)=>`KEN-C${String(i+1).padStart(3,'0')}`);

const source=json('data/p21/source/class-c-rural-road-length-economic-survey-2026.json');
const taxonomy=json('data/indicators/seed/placeholder-taxonomy.json');
const evidence=json('data/completeness/evidence-states.json');
const queue=json('data/completeness/p21-work-queue.json');
const summary=json('data/completeness/summary.json');
const indicators=json('data/indicators/registry/indicators.json');
const series=json('data/indicators/registry/series.json');
const observations=json('data/indicators/registry/observations.json');
const geographies=json('data/geography/registry/geographies.json');
const datasets=json('data/catalogue/registry/datasets.json');
const releases=json('data/catalogue/registry/releases.json');
const roadmap=json('data/data-completion-roadmap.json');

const rows=source.counties||[],byCode=new Map(rows.map(r=>[r.geo_code,r]));
assert(rows.length===47&&byCode.size===47,'source must contain exactly 47 unique counties');
assert(expected.every(code=>byCode.has(code)),'source county universe must equal KEN-C001–KEN-C047');
assert(rows.every(r=>Number.isFinite(Number(r.total))&&Number(r.total)>=0),'all 47 published Total values must be numeric and non-negative');
const displayed=Number(rows.reduce((s,r)=>s+Number(r.total),0).toFixed(1));
assert(displayed===28150.5,`displayed county total sum must remain 28,150.5; got ${displayed}`);
assert(Number(source.national_values?.total)===28149.9,'published national total must remain 28,149.9');
assert(Number(source.displayed_county_sums?.total)===28150.5,'source metadata must preserve displayed county sum');
assert(String(source.rounding_note||'').includes('No balancing, recalculation or residual allocation is applied'),'source must document no balancing adjustment');

const oldDef=(taxonomy.indicators||[]).find(i=>i.code===OLD),newDef=(taxonomy.indicators||[]).find(i=>i.code===NEW);
assert(oldDef?.status==='retired','generic road placeholder must be retired');
assert(newDef?.status==='sourced','Class C successor taxonomy must be sourced');
assert(String(oldDef.note||'').includes('Do not interpret the successor as total road length across all road classes'),'old taxonomy must prohibit all-class interpretation');
assert(String(newDef.note||'').includes('not the entire county road network'),'successor taxonomy must define fixed Class C scope');

const closure=(evidence.states||[]).find(s=>s.indicator_code===OLD&&s.status==='retired_replaced');
assert(closure,'road retired/replaced evidence state missing');
assert(JSON.stringify(closure.geo_codes)===JSON.stringify(expected),'road closure must cover exactly all 47 counties');
assert(JSON.stringify(closure.successor_indicator_codes)===JSON.stringify([NEW]),'road successor set must be Class C only');
assert(String(closure.reason||'').includes('Class C is not presented as the entire county road network'),'closure must prohibit broad proxy interpretation');

const indicator=indicators.find(i=>i.indicator_code===NEW);
assert(indicator?.active===true&&indicator?.lifecycle_status==='active','Class C successor must be active');
assert(indicator.ranking_allowed===false&&indicator.higher_is_better==null,'Class C successor must be non-directional and non-rankable');
assert(String(indicator.expected_availability_note||'').includes('not total county road-network length'),'registry metadata must preserve scope distinction');

const geoById=new Map(geographies.map(g=>[g.geography_id,g]));
const roadSeries=series.filter(s=>String(s.series_code||'').startsWith(PREFIX));
assert(roadSeries.length===47,'must publish exactly 47 Class C county series');
const obsBySeries=new Map(observations.map(o=>[o.series_id,o]));
for(const s of roadSeries){const g=geoById.get(s.geography_id),src=g?byCode.get(g.geo_code):null,o=obsBySeries.get(s.series_id);assert(g?.level==='county'&&src,`series geography/source missing ${s.series_code}`);assert(o,`observation missing ${s.series_code}`);assert(Number(o.value)===Number(src.total),`published Total value drift ${g.geo_code}`);assert(o.statistical_status==='provisional'&&o.source_class==='official'&&o.badge==='A',`provenance/status drift ${g.geo_code}`);assert(String(o.notes||'').includes('not all-class county road-network length'),'observation must prohibit broad interpretation');assert(String(o.notes||'').includes('No balancing against the published national 28,149.9 km total is applied'),'observation must preserve no-balancing contract');}

assert(datasets.some(d=>d.dataset_code==='DS-KNBS-CLASS-C-RURAL-ROADS-2025-P21'),'Class C dataset missing');
assert(releases.some(r=>r.release_code==='REL-KNBS-CLASS-C-RURAL-ROADS-2025-P21'),'Class C release missing');
assert(queue.remaining_slots===0&&queue.family_count===0&&Object.keys(queue.family_counts||{}).length===0,'P21 queue must be empty');
assert((summary.by_completion_phase?.P21||0)===0,'completeness summary P21 must be zero');
assert(summary.resolved_slots===3808&&summary.unresolved_slots===16307&&summary.unknown_missing===0,'terminal completeness totals drifted');
const p21=(roadmap.phases||[]).find(p=>p.id==='P21');assert(p21?.status==='complete','P21 roadmap must be complete');

console.log('P21_CLASS_C_ROAD_VALIDATE_OK counties=47 displayed_county_sum=28150.5 national=28149.9 p21=0 resolved=3808');
