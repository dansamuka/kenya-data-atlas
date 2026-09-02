import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const fail=m=>{throw new Error(`P23 NG-CDF allocation validate: ${m}`);};
const [contract,geos,inds,units,series,obs,datasets,releases,summary]=await Promise.all([
  read('data/p23/ngcdf-allocation-contract.json'),read('data/geography/registry/geographies.json'),read('data/indicators/registry/indicators.json'),read('data/indicators/registry/units.json'),read('data/indicators/registry/series.json'),read('data/indicators/registry/observations.json'),read('data/catalogue/registry/datasets.json'),read('data/catalogue/registry/releases.json'),read('data/completeness/summary.json')
]);
const cons=geos.filter(g=>g.level==='constituency'),wards=geos.filter(g=>g.level==='ward');
if(cons.length!==290||wards.length!==1450)fail(`canonical geography mismatch constituencies=${cons.length} wards=${wards.length}`);
const counts=new Map(cons.map(g=>[g.geography_id,0]));
for(const w of wards){if(!counts.has(w.parent_id))fail(`ward ${w.geo_code} has invalid constituency parent`);counts.set(w.parent_id,counts.get(w.parent_id)+1);}
const distribution={};for(const n of counts.values())distribution[n]=(distribution[n]||0)+1;
for(const [n,expected] of Object.entries(contract.derivation.required_registry_distribution)){if(Number(distribution[n]||0)!==Number(expected))fail(`ward-count class ${n}: got ${distribution[n]||0}, expected ${expected}`);}
if(Object.values(distribution).reduce((a,b)=>a+b,0)!==290)fail('ward-count distribution does not cover 290 constituencies');
const ind=inds.find(i=>i.indicator_code==='IND-NGCDF-ALLOCATION');if(!ind||ind.lifecycle_status!=='active')fail('allocation indicator not active');
const unit=units.find(u=>u.unit_id===ind.unit_id);if(unit?.code!=='kes_million')fail(`allocation unit=${unit?.code}`);
const geoIds=new Set(cons.map(g=>g.geography_id));
const ss=series.filter(s=>s.indicator_id===ind.indicator_id&&geoIds.has(s.geography_id));if(ss.length!==290)fail(`allocation series=${ss.length}`);
if(new Set(ss.map(s=>s.geography_id)).size!==290)fail('duplicate/missing constituency series');
const ids=new Set(ss.map(s=>s.series_id)),oo=obs.filter(o=>ids.has(o.series_id));if(oo.length!==290)fail(`allocation observations=${oo.length}`);
if(oo.some(o=>o.badge!=='B'||o.geographic_method!=='derived'||o.source_class!=='official'||!Number.isFinite(o.value)))fail('allocation observations must be numeric official-derived B-badge values');
if(oo.some(o=>o.period_start!=='2025-07-01'||o.period_end!=='2026-06-30'||o.period_label!=='FY2025/26'))fail('allocation fiscal period mismatch');
const bandValues=new Set(contract.derivation.ward_count_bands.map(b=>Number((Number(b.allocation_kes)/1_000_000).toFixed(6))));
if(oo.some(o=>!bandValues.has(Number(o.value))))fail('observation value outside official Parliament ward-count bands');
const obsByGeo=new Map(oo.map(o=>[o.geography_id,o]));
const bandByWards=new Map(contract.derivation.ward_count_bands.map(b=>[Number(b.wards),Number((Number(b.allocation_kes)/1_000_000).toFixed(6))]));
for(const c of cons){const expected=bandByWards.get(counts.get(c.geography_id));if(obsByGeo.get(c.geography_id)?.value!==expected)fail(`allocation mismatch ${c.geo_code}: got ${obsByGeo.get(c.geography_id)?.value}, expected ${expected}`);}
if(!datasets.some(d=>d.dataset_code==='DS-NGCDF-CONSTITUENCY-ALLOCATION-FY2025-26-P23'))fail('allocation dataset missing');
if(!releases.some(r=>r.release_code==='REL-NGCDF-CONSTITUENCY-ALLOCATION-FY2025-26-P23'))fail('allocation release missing');
if(summary.total_slots!==20115)fail(`governed denominator changed: ${summary.total_slots}`);
if(summary.resolved_slots!==5324||summary.unresolved_slots!==14791)fail(`unexpected completeness: resolved=${summary.resolved_slots} unresolved=${summary.unresolved_slots}`);
if(summary.by_completion_phase?.P23!==1740)fail(`expected P23 remaining=1740, got ${summary.by_completion_phase?.P23}`);
if(summary.unknown_missing!==0)fail(`unknown_missing=${summary.unknown_missing}`);
console.log(`P23_NGCDF_ALLOCATION_OK constituencies=290 observations=290 distribution=${JSON.stringify(distribution)} resolved=5324 p23_remaining=1740 unknown=0`);
