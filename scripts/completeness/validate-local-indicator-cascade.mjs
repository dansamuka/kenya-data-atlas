import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`Local indicator cascade validation: ${msg}`);};
const strict=process.argv.includes('--strict');

const contract=json('data/local-indicator-cascade-contract.json');
const decisions=json('data/local-indicator-cascade-decisions.json');
const audit=json('data/completeness/local-indicator-cascade.json');
const summary=json('data/completeness/local-indicator-cascade-summary.json');
const indicators=json('data/indicators/registry/indicators.json');
const series=json('data/indicators/registry/series.json');
const observations=json('data/indicators/registry/observations.json');
const geographies=json('data/geography/registry/geographies.json');

assert(contract.status==='mandatory','contract must remain mandatory');
const allowed=new Set(contract.allowed_dispositions||[]);
const geoById=new Map(geographies.map(g=>[g.geography_id,g]));
const obsById=new Map(observations.map(o=>[o.observation_id,o]));
const seriesByIndicator=new Map();
for(const s of series){if(!seriesByIndicator.has(s.indicator_id))seriesByIndicator.set(s.indicator_id,[]);seriesByIndicator.get(s.indicator_id).push(s);}
const activeCounty=indicators.filter(ind=>ind.active===true&&ind.lifecycle_status==='active'&&((ind.applies_to_levels||[]).includes('county')||(seriesByIndicator.get(ind.indicator_id)||[]).some(s=>geoById.get(s.geography_id)?.level==='county')));
const expectedRows=activeCounty.length*(contract.levels||[]).length;
assert(audit.rows.length===expectedRows,`audit rows ${audit.rows.length} != required ${expectedRows}`);
assert(summary.active_county_indicators===activeCounty.length,`summary active_county_indicators ${summary.active_county_indicators} != ${activeCounty.length}`);
assert(summary.required_level_decisions===expectedRows,'required decision denominator mismatch');

const keySet=new Set();
for(const row of audit.rows){
  const key=`${row.indicator_code}|${row.level}`;
  assert(!keySet.has(key),`duplicate audit row ${key}`);keySet.add(key);
  assert((contract.levels||[]).includes(row.level),`${key}: unexpected level`);
  assert(row.inherited_records===0,`${key}: prohibited parent→child inheritance detected (${row.inherited_records})`);
  if(row.disposition!=null)assert(allowed.has(row.disposition),`${key}: invalid disposition ${row.disposition}`);
  if(row.full_canonical_coverage)assert(!['governed_unavailable','not_applicable'].includes(row.disposition),`${key}: full canonical coverage cannot be labelled ${row.disposition}`);
  if(['governed_unavailable','not_applicable'].includes(row.disposition))assert(row.canonical_latest_observations===0,`${key}: ${row.disposition} conflicts with ${row.canonical_latest_observations} published child observations`);
}
for(const ind of activeCounty)for(const level of contract.levels||[])assert(keySet.has(`${ind.indicator_code}|${level}`),`missing audit disposition row ${ind.indicator_code}|${level}`);

const decisionKeys=new Set();
for(const decision of decisions.decisions||[]){
  const key=`${decision.indicator_code}|${decision.level}`;
  assert(!decisionKeys.has(key),`duplicate decision ${key}`);decisionKeys.add(key);
  assert(activeCounty.some(i=>i.indicator_code===decision.indicator_code),`${key}: decision is not for an active county indicator`);
  assert((contract.levels||[]).includes(decision.level),`${key}: invalid level`);
  assert(allowed.has(decision.disposition),`${key}: invalid disposition ${decision.disposition}`);
  assert(String(decision.reason||'').trim().length>=20,`${key}: reason must be substantive`);
}

assert(summary.prohibited_parent_child_inheritance_count===0,`prohibited_parent_child_inheritance_count=${summary.prohibited_parent_child_inheritance_count}`);
assert(summary.constituency_disposition_count+summary.constituency_review_required===activeCounty.length,'constituency decision/review counts do not reconcile');
assert(summary.ward_disposition_count+summary.ward_review_required===activeCounty.length,'ward decision/review counts do not reconcile');

if(strict){
  assert(summary.constituency_disposition_pct===100,`strict P23X requires constituency disposition 100%, got ${summary.constituency_disposition_pct}%`);
  assert(summary.ward_disposition_pct===100,`strict P24X requires ward disposition 100%, got ${summary.ward_disposition_pct}%`);
  assert(summary.constituency_review_required===0,'strict P23X has unresolved review rows');
  assert(summary.ward_review_required===0,'strict P24X has unresolved review rows');
}

console.log(`LOCAL_INDICATOR_CASCADE_VALIDATE_OK active_county=${activeCounty.length} constituency=${summary.constituency_disposition_pct}% ward=${summary.ward_disposition_pct}% review=${summary.constituency_review_required+summary.ward_review_required} inherited=0 strict=${strict}`);
