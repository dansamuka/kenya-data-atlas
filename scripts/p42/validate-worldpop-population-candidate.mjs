#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const fail=m=>{console.error('P42_WORLDPOP_FAIL '+m);process.exit(1);};

const contract=read('data/p42/worldpop-population-contract.json');
const candidate=read('data/p42/worldpop-population-candidate.json');
const subset=read(contract.sources.official_controls.repo_path);

const controls=new Map();
for(const o of subset.observations||[]){
  if(o.indicator_code!=='IND-POPULATION') continue;
  if(!String(o.geo_code||'').startsWith('KEN-C')) continue;
  if(o.period_start!=='2019-08-24' || o.source_class!=='official') continue;
  controls.set(o.geography_id,Math.round(Number(o.value)));
}
if(controls.size!==47) fail('expected 47 official county controls, got '+controls.size);
const national=[...controls.values()].reduce((a,b)=>a+b,0);
if(national!==contract.sources.official_controls.expected_national_total) fail('official national total drift');

if(candidate.execution_id!==contract.execution_id) fail('execution_id mismatch');
if(candidate.status!=='candidate_only_not_yet_promoted') fail('candidate status must remain non-promoted until governed apply step');
if(!Array.isArray(candidate.rows) || candidate.rows.length!==1740) fail('expected exactly 1,740 local population candidates');

const seen=new Set();
const sums={constituency:new Map(),ward:new Map()};
let eligible=0;
const limit=contract.predeclared_publication_gate.max_model_structure_spread_pct;
for(const r of candidate.rows){
  if(!['constituency','ward'].includes(r.level)) fail('unexpected level '+r.level);
  const key=r.level+'|'+r.geography_id;
  if(seen.has(key)) fail('duplicate row '+key);
  seen.add(key);
  if(r.indicator_id!=='IND-POPULATION') fail('wrong indicator in '+key);
  if(r.source_tier!=='S5') fail('non-S5 row '+key);
  if(!controls.has(r.county_geography_id)) fail('unknown county control '+r.county_geography_id);
  if(!Number.isInteger(r.value) || !Number.isInteger(r.sensitivity_value)) fail('population allocations must be integer persons');
  if(r.lower_bound!==Math.min(r.value,r.sensitivity_value) || r.upper_bound!==Math.max(r.value,r.sensitivity_value)) fail('sensitivity envelope mismatch '+key);
  const denom=(r.value+r.sensitivity_value)/2;
  const spread=denom===0?0:Math.abs(r.value-r.sensitivity_value)/denom*100;
  if(Math.abs(spread-r.model_structure_spread_pct)>0.001) fail('spread metric mismatch '+key);
  const expectedEligible=r.value>0 && r.sensitivity_value>0 && spread<=limit;
  if(r.publish_eligible!==expectedEligible) fail('eligibility rule mismatch '+key);
  if(expectedEligible) eligible++;
  const m=sums[r.level];
  m.set(r.county_geography_id,(m.get(r.county_geography_id)||0)+r.value);
}
if(seen.size!==1740) fail('unique row count mismatch');
for(const level of ['constituency','ward']){
  if(sums[level].size!==47) fail(level+' does not cover all 47 counties');
  let levelNational=0;
  for(const [cid,total] of sums[level]){
    if(total!==controls.get(cid)) fail(level+'/'+cid+' does not reconcile to official county control');
    levelNational+=total;
  }
  if(levelNational!==national) fail(level+' national reconciliation failed');
}
if(eligible<1) fail('zero local cells pass the predeclared stability gate');
if(candidate.summary?.promotion_eligible_cells!==eligible) fail('summary eligible-cell count mismatch');
console.log('P42_WORLDPOP_OK rows=1740 eligible='+eligible+' national='+national);
