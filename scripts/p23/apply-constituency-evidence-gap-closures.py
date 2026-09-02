import json
from pathlib import Path

root=Path(__file__).resolve().parents[2]
contract=json.loads((root/'data/p23/constituency-evidence-gap-closure-contract.json').read_text())
geos=json.loads((root/'data/geography/registry/geographies.json').read_text())
codes=sorted(g['geo_code'] for g in geos if g.get('level')=='constituency')
if len(codes)!=290 or len(set(codes))!=290:
    raise SystemExit(f'Expected 290 unique constituencies, got {len(codes)}/{len(set(codes))}')

ep=root/'data/completeness/evidence-states.json'
evidence=json.loads(ep.read_text())
states=[s for s in evidence.get('states',[]) if s.get('contract_id')!=contract['contract_id']]
for d in contract['decisions']:
    states.append({
        'contract_id':contract['contract_id'],
        'level':'constituency',
        'indicator_code':d['indicator_code'],
        'status':'official_unavailable',
        'geo_codes':codes,
        'period_label':d['period_label'],
        'source':d['source'],
        'source_url':d['source_url'],
        'reason':d['reason'],
        'as_of':contract['as_of'],
        'evidence_constraint':d['evidence_constraint'],
        'refresh_trigger':d['refresh_trigger']
    })
evidence['states']=states
ep.write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n')

vp=root/'scripts/completeness/validate-slot-ledger.mjs'
s=vp.read_text()
old="""const p22Codes=new Set(['IND-DROUGHT-EARLY-WARNING','IND-FOOD-SECURITY-PHASE','IND-RAINFALL-TEMPERATURE']);
const p23CensusCodes=new Set(['IND-POPULATION','IND-HOUSEHOLD-SIZE']);
const p22Unavailable=officialUnavailable.filter(s=>p22Codes.has(s.indicator_code));
const p23CensusUnavailable=officialUnavailable.filter(s=>s.level==='constituency'&&p23CensusCodes.has(s.indicator_code));
const legacyUnavailable=officialUnavailable.filter(s=>!p22Codes.has(s.indicator_code)&&!(s.level==='constituency'&&p23CensusCodes.has(s.indicator_code)));
assert(legacyUnavailable.length===48,`pre-P22/P23 official-unavailable inventory must remain 48 states, got ${legacyUnavailable.length}`);
assert(p22Unavailable.length===66,`P22 terminal snapshot must contribute exactly 66 governed official-unavailable states, got ${p22Unavailable.length}`);
assert(p23CensusUnavailable.length===580,`P23 census publication closure must contribute exactly 580 geography/indicator evidence states, got ${p23CensusUnavailable.length}`);
assert(officialUnavailable.length===694,`official-unavailable evidence inventory must reconcile 48 legacy + 66 P22 + 580 P23 census = 694, got ${officialUnavailable.length}`);
assert(p22Unavailable.every(s=>s.as_of==='2026-09-01'&&s.evidence_constraint==='current_observation_unavailable_under_p22_contract'), 'P22 unavailable states must retain snapshot date and evidence-constraint marker');
assert(p22Unavailable.every(s=>String(s.refresh_trigger||'').length>0),'P22 unavailable states must retain refresh triggers');
assert(p23CensusUnavailable.every(s=>s.as_of==='2026-09-02'&&s.evidence_constraint==='official_publication_not_available_at_current_290_constituency_boundary'),'P23 census unavailable states must retain boundary-publication evidence constraint');
assert(p23CensusUnavailable.every(s=>String(s.refresh_trigger||'').length>0),'P23 census unavailable states must retain refresh triggers');
"""
new="""const p22Codes=new Set(['IND-DROUGHT-EARLY-WARNING','IND-FOOD-SECURITY-PHASE','IND-RAINFALL-TEMPERATURE']);
const p23CensusCodes=new Set(['IND-POPULATION','IND-HOUSEHOLD-SIZE']);
const p23EvidenceGapCodes=new Set(['IND-NG-CDF-UTILIZATION','IND-HEALTH-FACILITY-DENSITY']);
const p22Unavailable=officialUnavailable.filter(s=>p22Codes.has(s.indicator_code));
const p23CensusUnavailable=officialUnavailable.filter(s=>s.level==='constituency'&&p23CensusCodes.has(s.indicator_code));
const p23EvidenceGapUnavailable=officialUnavailable.filter(s=>s.level==='constituency'&&p23EvidenceGapCodes.has(s.indicator_code));
const legacyUnavailable=officialUnavailable.filter(s=>!p22Codes.has(s.indicator_code)&&!(s.level==='constituency'&&(p23CensusCodes.has(s.indicator_code)||p23EvidenceGapCodes.has(s.indicator_code))));
assert(legacyUnavailable.length===48,`pre-P22/P23 official-unavailable inventory must remain 48 states, got ${legacyUnavailable.length}`);
assert(p22Unavailable.length===66,`P22 terminal snapshot must contribute exactly 66 governed official-unavailable states, got ${p22Unavailable.length}`);
assert(p23CensusUnavailable.length===580,`P23 census publication closure must contribute exactly 580 geography/indicator evidence states, got ${p23CensusUnavailable.length}`);
assert(p23EvidenceGapUnavailable.length===580,`P23 utilisation/density closure must contribute exactly 580 geography/indicator evidence states, got ${p23EvidenceGapUnavailable.length}`);
assert(officialUnavailable.length===1274,`official-unavailable evidence inventory must reconcile 48 legacy + 66 P22 + 580 P23 census + 580 P23 evidence gaps = 1274, got ${officialUnavailable.length}`);
assert(p22Unavailable.every(s=>s.as_of==='2026-09-01'&&s.evidence_constraint==='current_observation_unavailable_under_p22_contract'), 'P22 unavailable states must retain snapshot date and evidence-constraint marker');
assert(p22Unavailable.every(s=>String(s.refresh_trigger||'').length>0),'P22 unavailable states must retain refresh triggers');
assert(p23CensusUnavailable.every(s=>s.as_of==='2026-09-02'&&s.evidence_constraint==='official_publication_not_available_at_current_290_constituency_boundary'),'P23 census unavailable states must retain boundary-publication evidence constraint');
assert(p23CensusUnavailable.every(s=>String(s.refresh_trigger||'').length>0),'P23 census unavailable states must retain refresh triggers');
assert(p23EvidenceGapUnavailable.every(s=>s.as_of==='2026-09-02'&&String(s.evidence_constraint||'').length>0),'P23 utilisation/density states must retain snapshot date and evidence constraint');
assert(p23EvidenceGapUnavailable.every(s=>String(s.refresh_trigger||'').length>0),'P23 utilisation/density states must retain refresh triggers');
"""
if old not in s:
    raise SystemExit('Expected official-unavailable reconciliation block not found')
s=s.replace(old,new,1)
s=s.replace("console.log(`P18_P22_P23_UNAVAILABLE_RECONCILIATION_OK legacy=${legacyUnavailable.length} p22=${p22Unavailable.length} p23_census=${p23CensusUnavailable.length} total=${officialUnavailable.length}`);","console.log(`P18_P22_P23_UNAVAILABLE_RECONCILIATION_OK legacy=${legacyUnavailable.length} p22=${p22Unavailable.length} p23_census=${p23CensusUnavailable.length} p23_evidence_gaps=${p23EvidenceGapUnavailable.length} total=${officialUnavailable.length}`);")
vp.write_text(s)

pp=root/'package.json'
pkg=json.loads(pp.read_text())
extra='node scripts/p23/validate-constituency-evidence-gap-closures.mjs'
if extra not in pkg['scripts']['p23:validate']:
    pkg['scripts']['p23:validate'] += ' && '+extra
pp.write_text(json.dumps(pkg,indent=2,ensure_ascii=False)+'\n')
print('P23_EVIDENCE_GAP_CLOSURES_PREPARED constituencies=290 decisions=2 rendered_slots=580')
