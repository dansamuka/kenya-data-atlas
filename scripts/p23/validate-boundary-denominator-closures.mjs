import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(`P23 boundary denominator validate: ${m}`);};
const [geos,states,ledger,summary,inds,series]=[
  'data/geography/registry/geographies.json','data/completeness/evidence-states.json','data/completeness/slot-ledger.json','data/completeness/summary.json','data/indicators/registry/indicators.json','data/indicators/registry/series.json'
].map(read);
const cons=geos.filter(g=>g.level==='constituency');
if(cons.length!==290)fail(`constituencies=${cons.length}`);
const geoCodes=new Set(cons.map(g=>g.geo_code));
const targets=['IND-HOUSEHOLD-SIZE','IND-HEALTH-FACILITY-DENSITY'];
let configured=0;
for(const code of targets){
  const matching=(states.states||[]).filter(s=>s.level==='constituency'&&s.indicator_code===code);
  if(matching.length!==1)fail(`${code} evidence-state records=${matching.length}`);
  const s=matching[0];
  if(s.status!=='official_unavailable')fail(`${code} status=${s.status}`);
  if(s.as_of!=='2026-09-02'||s.evidence_constraint!=='current_290_constituency_denominator_unavailable_under_p23_contract'||!s.refresh_trigger)fail(`${code} provenance contract incomplete`);
  if(s.geo_codes?.length!==290||new Set(s.geo_codes).size!==290||s.geo_codes.some(g=>!geoCodes.has(g)))fail(`${code} geography coverage is not canonical 290/290`);
  configured+=s.geo_codes.length;
  const rows=ledger.rows.filter(r=>r.level==='constituency'&&r.indicator_code===code);
  if(rows.length!==290)fail(`${code} ledger slots=${rows.length}`);
  if(rows.some(r=>!r.resolved||r.status!=='official_unavailable'||r.value!==''||r.series_code||r.observation_id))fail(`${code} closure fabricated or unresolved`);
}
if(configured!==580)fail(`configured closures=${configured}`);
for(const code of targets){
  const ind=inds.find(i=>i.indicator_code===code);
  if(!ind)fail(`indicator missing ${code}`);
  const ids=new Set(cons.map(g=>g.geography_id));
  if(series.some(s=>s.indicator_id===ind.indicator_id&&ids.has(s.geography_id)))fail(`${code} must not create constituency series`);
}
if(summary.total_slots!==20115||summary.resolved_slots!==5904||summary.unresolved_slots!==14211||summary.by_completion_phase?.P23!==1160||summary.unknown_missing!==0)fail(`unexpected summary ${summary.resolved_slots}/${summary.unresolved_slots} P23=${summary.by_completion_phase?.P23} unknown=${summary.unknown_missing}`);
console.log('P23_BOUNDARY_DENOMINATOR_CLOSURES_OK states=580 resolved=5904 p23_remaining=1160 unknown=0 no_inheritance=true');
