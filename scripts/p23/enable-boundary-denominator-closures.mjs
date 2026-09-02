import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
if(!String(pkg.scripts['build:data']).includes('npm run p23:prepare')){
  pkg.scripts['build:data']=pkg.scripts['build:data'].replace('npm run p21:prepare &&','npm run p21:prepare && npm run p23:prepare &&');
}
pkg.scripts['p23:prepare']='node scripts/p23/prepare-boundary-denominator-closures.mjs';
if(!String(pkg.scripts['p23:validate']).includes('validate-boundary-denominator-closures.mjs')){
  pkg.scripts['p23:validate']=`${pkg.scripts['p23:validate']} && node scripts/p23/validate-boundary-denominator-closures.mjs`;
}
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');

const file='scripts/completeness/validate-slot-ledger.mjs';
let s=fs.readFileSync(file,'utf8');
s=s.replace("const p22Unavailable=officialUnavailable.filter(s=>p22Codes.has(s.indicator_code));\nconst preP22Unavailable=officialUnavailable.filter(s=>!p22Codes.has(s.indicator_code));\nassert(preP22Unavailable.length===48,`pre-P22 official-unavailable inventory must remain 48 states, got ${preP22Unavailable.length}`);\nassert(p22Unavailable.length===66,`P22 terminal snapshot must contribute exactly 66 governed official-unavailable states, got ${p22Unavailable.length}`);\nassert(officialUnavailable.length===114,`official-unavailable inventory must reconcile 48 existing + 66 P22 = 114, got ${officialUnavailable.length}`);",
"const p22Unavailable=officialUnavailable.filter(s=>p22Codes.has(s.indicator_code));\nconst p23BoundaryCodes=new Set(['IND-HOUSEHOLD-SIZE','IND-HEALTH-FACILITY-DENSITY']);\nconst p23BoundaryUnavailable=officialUnavailable.filter(s=>s.level==='constituency'&&p23BoundaryCodes.has(s.indicator_code));\nconst preP22Unavailable=officialUnavailable.filter(s=>!p22Codes.has(s.indicator_code)&&!p23BoundaryUnavailable.includes(s));\nassert(preP22Unavailable.length===48,`pre-P22 official-unavailable inventory must remain 48 states, got ${preP22Unavailable.length}`);\nassert(p22Unavailable.length===66,`P22 terminal snapshot must contribute exactly 66 governed official-unavailable states, got ${p22Unavailable.length}`);\nassert(p23BoundaryUnavailable.length===580,`P23 boundary-denominator closure must contribute exactly 580 states, got ${p23BoundaryUnavailable.length}`);\nassert(p23BoundaryUnavailable.every(s=>s.as_of==='2026-09-02'&&s.evidence_constraint==='current_290_constituency_denominator_unavailable_under_p23_contract'),'P23 boundary closures must retain snapshot date and evidence constraint');\nassert(p23BoundaryUnavailable.every(s=>String(s.refresh_trigger||'').length>0),'P23 boundary closures must retain refresh triggers');\nassert(officialUnavailable.length===694,`official-unavailable inventory must reconcile 48 existing + 66 P22 + 580 P23 = 694, got ${officialUnavailable.length}`);");
s=s.replace("console.log(`P18_P22_UNAVAILABLE_RECONCILIATION_OK pre_p22=${preP22Unavailable.length} p22=${p22Unavailable.length} total=${officialUnavailable.length}`);",
"console.log(`P18_P22_UNAVAILABLE_RECONCILIATION_OK pre_p22=${preP22Unavailable.length} p22=${p22Unavailable.length} p23_boundary=${p23BoundaryUnavailable.length} total=${officialUnavailable.length}`);");
if(!s.includes('p23BoundaryUnavailable.length===580'))throw new Error('Could not wire P23 boundary closure accounting');
fs.writeFileSync(file,s);
console.log('P23_BOUNDARY_DENOMINATOR_BUILD_WIRING_OK');
