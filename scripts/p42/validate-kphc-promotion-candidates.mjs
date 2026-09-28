import fs from 'node:fs';

const c=JSON.parse(fs.readFileSync('data/p42/kphc-constituency-candidates.json','utf8'));
const contract=JSON.parse(fs.readFileSync('data/p42/kphc-constituency-promotion-contract.json','utf8'));
const failures=[];
const allowed=new Set(contract.indicators.map(x=>x.indicator_id));
for(const r of c.rows??[]){
  if(!r.promotion_candidate) continue;
  if(!allowed.has(r.indicator_id)) failures.push('unexpected indicator '+r.indicator_id);
  if(!(r.geometry_gate?.passes || r.secondary_crosswalk_gate?.passes)) failures.push('candidate lacks approved geography route '+r.matched_geo_code);
  if(!r.county_reconciliation_pass) failures.push('candidate lacks reconciliation '+r.matched_geo_code);
  if(!Number.isFinite(Number(r.source_value)) || Number(r.source_value)<0 || Number(r.source_value)>100) failures.push('invalid percentage '+r.matched_geo_code);
  if(!r.matched_geo_code) failures.push('candidate missing KDA geography');
  if(r.publication_eligible!==false) failures.push('pre-apply artifact must remain publication_eligible=false');
}
const keys=new Set();
for(const r of (c.rows??[]).filter(r=>r.promotion_candidate)){
  const k=r.indicator_id+'|'+r.matched_geo_code;
  if(keys.has(k)) failures.push('duplicate promotion candidate '+k);
  keys.add(k);
}
if(contract.publication?.geographic_method!=='interpolated') failures.push('crosswalk promotion must remain interpolated');
if(contract.publication?.provenance_class!=='C') failures.push('crosswalk promotion must remain provenance class C');
if(failures.length){ console.error('FAIL: KPHC promotion contract\n - '+failures.join('\n - ')); process.exit(1); }
console.log('PASS: KPHC promotion candidates='+keys.size+' remain geography-crosswalked + county-reconciled.');
