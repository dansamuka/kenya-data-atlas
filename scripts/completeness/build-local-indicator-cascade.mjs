import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,value)=>fs.writeFileSync(path.join(root,p),JSON.stringify(value,null,2)+'\n');
const round2=n=>Math.round(n*100)/100;

const contract=json('data/local-indicator-cascade-contract.json');
const decisionsDoc=json('data/local-indicator-cascade-decisions.json');
const geographies=json('data/geography/registry/geographies.json');
const indicators=json('data/indicators/registry/indicators.json');
const series=json('data/indicators/registry/series.json');
const observations=json('data/indicators/registry/observations.json');

const geoById=new Map(geographies.map(g=>[g.geography_id,g]));
const obsById=new Map(observations.map(o=>[o.observation_id,o]));
const decisions=new Map((decisionsDoc.decisions||[]).map(d=>[`${d.indicator_code}|${d.level}`,d]));
const allowed=new Set(contract.allowed_dispositions||[]);

const seriesByIndicator=new Map();
for(const s of series){
  if(!seriesByIndicator.has(s.indicator_id))seriesByIndicator.set(s.indicator_id,[]);
  seriesByIndicator.get(s.indicator_id).push(s);
}

const countyIndicators=indicators.filter(ind=>{
  if(ind.active!==true || ind.lifecycle_status!=='active')return false;
  if((ind.applies_to_levels||[]).includes('county'))return true;
  return (seriesByIndicator.get(ind.indicator_id)||[]).some(s=>geoById.get(s.geography_id)?.level==='county');
}).sort((a,b)=>a.indicator_code.localeCompare(b.indicator_code));

const expectedByLevel={
  constituency:geographies.filter(g=>g.level==='constituency').length,
  ward:geographies.filter(g=>g.level==='ward').length
};

const rows=[];
let prohibitedParentChildInheritanceCount=0;
for(const ind of countyIndicators){
  for(const level of contract.levels||[]){
    const localSeries=(seriesByIndicator.get(ind.indicator_id)||[]).filter(s=>geoById.get(s.geography_id)?.level===level && s.status!=='retired');
    const localObservations=localSeries.map(s=>obsById.get(s.latest_observation_id)).filter(Boolean);
    const inherited=localSeries.filter(s=>s.geographic_method==='inherited').length + localObservations.filter(o=>o.geographic_method==='inherited').length;
    prohibitedParentChildInheritanceCount+=inherited;
    const numeric=localObservations.filter(o=>Number.isFinite(Number(o.value)) || String(o.text_value??'').trim()!=='').length;
    const decision=decisions.get(`${ind.indicator_code}|${level}`);
    const disposition=decision?.disposition||null;
    const fullCoverage=localSeries.length===expectedByLevel[level] && localObservations.length===expectedByLevel[level];
    const invalidDecision=disposition!=null&&!allowed.has(disposition);
    rows.push({
      indicator_code:ind.indicator_code,
      indicator_name:ind.name,
      topic:ind.topic||'',
      level,
      expected_geographies:expectedByLevel[level],
      canonical_series:localSeries.length,
      canonical_latest_observations:localObservations.length,
      canonical_value_observations:numeric,
      full_canonical_coverage:fullCoverage,
      disposition,
      disposition_reason:decision?.reason||'',
      audit_status:invalidDecision?'invalid_decision':(disposition?'decided':'review_required'),
      inherited_records:inherited
    });
  }
}

const metrics={};
for(const level of contract.levels||[]){
  const levelRows=rows.filter(r=>r.level===level);
  const decided=levelRows.filter(r=>allowed.has(r.disposition)).length;
  const numeric=levelRows.filter(r=>r.canonical_value_observations>0).length;
  metrics[`${level}_disposition_count`]=decided;
  metrics[`${level}_disposition_pct`]=levelRows.length?round2(decided/levelRows.length*100):100;
  metrics[`${level}_numeric_indicator_count`]=numeric;
  metrics[`${level}_review_required`]=levelRows.filter(r=>r.audit_status==='review_required').length;
}
const dispositionCounts={};
for(const r of rows){const k=r.disposition||'review_required';dispositionCounts[k]=(dispositionCounts[k]||0)+1;}

const summary={
  schema_version:'kda.local-indicator-cascade-summary.v1',
  as_of:decisionsDoc.as_of||'',
  active_county_indicators:countyIndicators.length,
  required_level_decisions:countyIndicators.length*(contract.levels||[]).length,
  ...metrics,
  disposition_counts_by_method:dispositionCounts,
  prohibited_parent_child_inheritance_count:prohibitedParentChildInheritanceCount
};
const output={
  schema_version:'kda.local-indicator-cascade-audit.v1',
  contract_schema_version:contract.schema_version,
  definition:'Every active county indicator receives a constituency and ward disposition; published child data are counted from canonical series and never inferred from parent values.',
  rows
};

fs.mkdirSync(path.join(root,'data/completeness'),{recursive:true});
write('data/completeness/local-indicator-cascade.json',output);
write('data/completeness/local-indicator-cascade-summary.json',summary);
console.log(`LOCAL_INDICATOR_CASCADE_BUILT county_indicators=${summary.active_county_indicators} decisions=${summary.constituency_disposition_count+summary.ward_disposition_count}/${summary.required_level_decisions} constituency_review=${summary.constituency_review_required} ward_review=${summary.ward_review_required} inherited=${summary.prohibited_parent_child_inheritance_count}`);
