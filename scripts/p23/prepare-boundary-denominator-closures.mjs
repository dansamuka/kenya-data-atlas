import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,v)=>fs.writeFileSync(path.join(root,p),JSON.stringify(v,null,2)+'\n');
const geos=read('data/geography/registry/geographies.json');
const doc=read('data/completeness/evidence-states.json');
const constituencies=geos.filter(g=>g.level==='constituency').sort((a,b)=>Number(a.constituency_code)-Number(b.constituency_code));
if(constituencies.length!==290)throw new Error(`P23 boundary closures: expected 290 constituencies, got ${constituencies.length}`);
const codes=constituencies.map(g=>g.geo_code);
if(new Set(codes).size!==290)throw new Error('P23 boundary closures: duplicate constituency geo codes');
const targets=new Set(['IND-HOUSEHOLD-SIZE','IND-HEALTH-FACILITY-DENSITY']);
doc.states=(doc.states||[]).filter(s=>!(s.level==='constituency'&&targets.has(s.indicator_code)));
const common={
  level:'constituency',
  geo_codes:codes,
  status:'official_unavailable',
  as_of:'2026-09-02',
  evidence_constraint:'current_290_constituency_denominator_unavailable_under_p23_contract',
  refresh_trigger:'Supersede this closure when KNBS or another competent official authority publishes a current-boundary 290-constituency census/household denominator table, or an exact official crosswalk that permits deterministic reconciliation to the 2012 electoral constituency registry.'
};
doc.states.push({
  ...common,
  indicator_code:'IND-HOUSEHOLD-SIZE',
  period_label:'2019 KPHC · current 290-constituency boundary review (P23)',
  source:'Kenya National Bureau of Statistics — 2019 Kenya Population and Housing Census, Volume I',
  source_url:'https://repository.knbs.or.ke/handle/knbs-ke-repo/385',
  reason:'KNBS publishes 2019 KPHC household-size evidence at county level, but the governed Atlas review has not identified a direct official 2019 table reconciled to all 290 current electoral constituencies. The older official constituency population/household publication belongs to the 2009 census and pre-2012 constituency geography, while census sub-counties are not silently equated with electoral constituencies. A county household-size value is therefore not inherited downward and no synthetic constituency denominator is created.'
});
doc.states.push({
  ...common,
  indicator_code:'IND-HEALTH-FACILITY-DENSITY',
  period_label:'Current KMHFR numerator · 2019 KPHC/current-boundary denominator review (P23)',
  source:'Kenya National Bureau of Statistics — 2019 KPHC denominator contract; Ministry of Health KMHFR facility registry',
  source_url:'https://repository.knbs.or.ke/handle/knbs-ke-repo/385',
  reason:'The Ministry of Health facility registry can identify facilities by constituency, but a defensible facility-density rate also requires a population denominator on the same current 290-constituency geography. The governed Atlas review has not identified a direct official 2019 population table reconciled to all current electoral constituencies. The Atlas therefore does not divide a constituency facility count by a county population, an obsolete pre-2012 constituency denominator, or a silently substituted sub-county population.'
});
write('data/completeness/evidence-states.json',doc);
console.log(`P23_BOUNDARY_DENOMINATOR_PREPARE_OK constituencies=${codes.length} states=${codes.length*2}`);
