import { readFile } from 'node:fs/promises';

const read=async p=>JSON.parse(await readFile(p,'utf8'));
const [cand,contract,probe]=await Promise.all([
  read('data/p42/agriculture-gva-candidate.json'),
  read('data/p42/agriculture-gva-contract.json'),
  read('data/p42/economic-gridded-source-probe.json')
]);
const fail=m=>{throw new Error('P42_AGRICULTURE_GVA_CANDIDATE_INVALID: '+m)};
if(cand.status!=='candidate_only_not_yet_promoted') fail('candidate status');
if(cand.indicator_id!=='IND-AGRICULTURE-GVA') fail('indicator');
if(cand.rows.length!==1740) fail('expected 1740 cells');
if(cand.summary?.promotion_eligible_cells!==1661) fail('expected frozen-run eligible count 1661');
if(cand.summary?.eligible_by_level?.constituency!==279) fail('expected 279 constituency eligible cells');
if(cand.summary?.eligible_by_level?.ward!==1382) fail('expected 1382 ward eligible cells');
const gate=contract.predeclared_publication_gate;
if(Number(probe.agriculture?.county_spearman_raw_aggdp2010_vs_knbs_agriculture_gva_2024)<gate.feasibility_spearman_min) fail('feasibility Spearman');
const keys=new Set();
for(const r of cand.rows){
  const k=r.level+'|'+r.geo_code;
  if(keys.has(k)) fail('duplicate '+k); keys.add(k);
  if(!['constituency','ward'].includes(r.level)) fail('bad level '+r.level);
  if(!Number.isFinite(r.value)||!Number.isFinite(r.lower_bound)||!Number.isFinite(r.upper_bound)) fail('non-numeric '+k);
  if(r.lower_bound>r.value||r.value>r.upper_bound) fail('bad envelope '+k);
  if(r.publish_eligible){
    if(!(r.value>0&&r.lower_bound>0&&r.upper_bound>0)) fail('eligible non-positive '+k);
    if(!(r.model_structure_spread_pct<=gate.max_model_structure_spread_pct)) fail('eligible spread '+k);
    if((r.rejection_reasons||[]).length) fail('eligible has rejection '+k);
  } else {
    if(!(r.rejection_reasons||[]).length) fail('ineligible lacks reason '+k);
  }
}
const rejected=cand.rows.filter(r=>!r.publish_eligible);
if(rejected.length!==79) fail('expected 79 rejected cells');
if(!rejected.every(r=>(r.rejection_reasons||[]).includes('model_structure_spread_exceeds_gate'))) fail('unexpected rejection class');
console.log('P42_AGRICULTURE_GVA_CANDIDATE_OK cells=1740 eligible=1661 constituency=279 ward=1382 rejected=79');
