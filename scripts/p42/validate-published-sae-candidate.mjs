import { readFile } from 'node:fs/promises';

const read=async p=>JSON.parse(await readFile(p,'utf8'));
const [cand,county,geom,contract]=await Promise.all([
  read('data/p42/published-sae-constituency-candidate.json'),
  read('data/p42/published-sae-county-validation.json'),
  read('data/p42/published-sae-geometry-crosswalk.json'),
  read('data/p42/published-sae-promotion-contract.json')
]);
const fail=m=>{throw new Error('P42_PUBLISHED_SAE_CANDIDATE_INVALID: '+m)};
if(cand.status!=='candidate_only_not_yet_promoted') fail('candidate status');
const passing=new Set(county.passing_indicators);
if(passing.size!==3||![...passing].every(x=>['IND-CONTRACEPTIVE-USE','IND-STUNTING-RATE','IND-LITERACY-RATE'].includes(x))) fail('unexpected county pass set '+[...passing]);
const g=contract.geography_gate;
const eligible=(geom.rows||[]).filter(r=>{
 const b=r.best_match;
 return b&&b.intersection_over_union>=g.direct_assignment_min_iou&&b.source_area_covered>=g.direct_assignment_min_source_coverage&&b.kda_area_covered>=g.direct_assignment_min_kda_coverage;
});
const unique=new Set(eligible.map(r=>r.best_match.geo_code));
if(eligible.length!==5||unique.size!==5) fail('expected exactly five one-to-one full-gate geographies');
if(cand.candidate_count!==15||cand.candidates.length!==15) fail('expected 15 candidates');
const keys=new Set();
for(const r of cand.candidates){
 if(!passing.has(r.indicator_id)) fail('non-passing indicator '+r.indicator_id);
 if(!unique.has(r.geo_code)) fail('non-gated geography '+r.geo_code);
 if(!(Number.isFinite(r.value)&&Number.isFinite(r.lower_bound)&&Number.isFinite(r.upper_bound)&&r.lower_bound<=r.value&&r.value<=r.upper_bound)) fail('bad interval '+r.indicator_id+' '+r.geo_code);
 if(r.iou<g.direct_assignment_min_iou||r.source_area_covered<g.direct_assignment_min_source_coverage||r.kda_area_covered<g.direct_assignment_min_kda_coverage) fail('geometry threshold regression');
 const k=r.indicator_id+'|'+r.geo_code; if(keys.has(k)) fail('duplicate '+k); keys.add(k);
}
console.log('P42_PUBLISHED_SAE_CANDIDATE_OK passing_indicators=3 geographies=5 cells=15');
