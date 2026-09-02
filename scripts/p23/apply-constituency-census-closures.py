import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
contract = json.loads((root / 'data/p23/constituency-census-closure-contract.json').read_text())
geos = json.loads((root / 'data/geography/registry/geographies.json').read_text())
codes = sorted(g['geo_code'] for g in geos if g.get('level') == 'constituency')
if len(codes) != 290 or len(set(codes)) != 290:
    raise SystemExit(f'Expected 290 unique constituencies, got {len(codes)}/{len(set(codes))}')

# Materialise the two governed publication decisions across the canonical 290
# constituency codes. Keep one evidence record per indicator so the decision is
# auditable while the existing completeness builder expands geo_codes.
evidence_path = root / 'data/completeness/evidence-states.json'
evidence = json.loads(evidence_path.read_text())
states = [s for s in evidence.get('states', []) if s.get('contract_id') != contract['contract_id']]
for decision in contract['decisions']:
    states.append({
        'contract_id': contract['contract_id'],
        'level': 'constituency',
        'indicator_code': decision['indicator_code'],
        'status': 'official_unavailable',
        'geo_codes': codes,
        'period_label': decision['period_label'],
        'source': decision['source'],
        'source_url': decision['source_url'],
        'reason': decision['reason'],
        'as_of': contract['as_of'],
        'evidence_constraint': 'official_publication_not_available_at_current_290_constituency_boundary',
        'refresh_trigger': decision['refresh_trigger']
    })
evidence['states'] = states
evidence_path.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + '\n')

# P23 introduces a legitimate cross-listed closure: population appears in both
# Overview and People. One geography+indicator evidence decision must therefore
# govern every rendered occurrence, rather than being rejected because there is
# more than one public slot.
validator_path = root / 'scripts/completeness/validate-slot-ledger.mjs'
validator = validator_path.read_text()
old = """  assert(matches.length===1,`${state.geo_code}/${state.indicator_code}: explicit evidence state must map to exactly one public slot, got ${matches.length}`);
  const row=matches[0];
  assert(row.resolved===true&&row.status===state.status,`${state.geo_code}/${state.indicator_code}: configured evidence state not resolved correctly`);
  assert(row.reason===state.reason&&row.period_label===state.period_label&&row.source===state.source&&row.source_url===state.source_url,`${state.geo_code}/${state.indicator_code}: evidence-state provenance diverged`);
"""
new = """  assert(matches.length>=1,`${state.geo_code}/${state.indicator_code}: explicit evidence state must map to at least one public slot, got ${matches.length}`);
  assert(matches.every(row=>row.resolved===true&&row.status===state.status),`${state.geo_code}/${state.indicator_code}: configured evidence state not resolved correctly across all rendered occurrences`);
  assert(matches.every(row=>row.reason===state.reason&&row.period_label===state.period_label&&row.source===state.source&&row.source_url===state.source_url),`${state.geo_code}/${state.indicator_code}: evidence-state provenance diverged across rendered occurrences`);
"""
if old in validator:
    validator = validator.replace(old, new, 1)
elif new not in validator:
    raise SystemExit('Expected explicit-evidence slot-mapping validator block not found')

old = """for(const status of authorizedExplicit){
  const configuredCount=configured.filter(s=>s.status===status).length;
  assert(ledger.rows.filter(r=>r.status===status).length===configuredCount,`no ungoverned ${status} states may appear`);
}
"""
new = """for(const status of authorizedExplicit){
  const configuredStates=configured.filter(s=>s.status===status);
  const expectedRenderedRows=configuredStates.reduce((count,state)=>count+ledger.rows.filter(r=>r.level===state.level&&r.geo_code===state.geo_code&&r.indicator_code===state.indicator_code).length,0);
  assert(ledger.rows.filter(r=>r.status===status).length===expectedRenderedRows,`no ungoverned ${status} rendered states may appear`);
}
"""
if old in validator:
    validator = validator.replace(old, new, 1)
elif new not in validator:
    raise SystemExit('Expected explicit-evidence reconciliation validator block not found')

old = """const p22Codes=new Set(['IND-DROUGHT-EARLY-WARNING','IND-FOOD-SECURITY-PHASE','IND-RAINFALL-TEMPERATURE']);
const p22Unavailable=officialUnavailable.filter(s=>p22Codes.has(s.indicator_code));
const preP22Unavailable=officialUnavailable.filter(s=>!p22Codes.has(s.indicator_code));
assert(preP22Unavailable.length===48,`pre-P22 official-unavailable inventory must remain 48 states, got ${preP22Unavailable.length}`);
assert(p22Unavailable.length===66,`P22 terminal snapshot must contribute exactly 66 governed official-unavailable states, got ${p22Unavailable.length}`);
assert(officialUnavailable.length===114,`official-unavailable inventory must reconcile 48 existing + 66 P22 = 114, got ${officialUnavailable.length}`);
assert(p22Unavailable.every(s=>s.as_of==='2026-09-01'&&s.evidence_constraint==='current_observation_unavailable_under_p22_contract'), 'P22 unavailable states must retain snapshot date and evidence-constraint marker');
assert(p22Unavailable.every(s=>String(s.refresh_trigger||'').length>0),'P22 unavailable states must retain refresh triggers');
"""
new = """const p22Codes=new Set(['IND-DROUGHT-EARLY-WARNING','IND-FOOD-SECURITY-PHASE','IND-RAINFALL-TEMPERATURE']);
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
if old in validator:
    validator = validator.replace(old, new, 1)
elif new not in validator:
    raise SystemExit('Expected official-unavailable inventory validator block not found')
validator_path.write_text(validator)

package_path = root / 'package.json'
package = json.loads(package_path.read_text())
extra = 'node scripts/p23/validate-constituency-census-closures.mjs'
command = package['scripts']['p23:validate']
if extra not in command:
    package['scripts']['p23:validate'] = command + ' && ' + extra
package_path.write_text(json.dumps(package, indent=2, ensure_ascii=False) + '\n')

print(f"P23_CENSUS_CLOSURE_PREPARED constituencies={len(codes)} evidence_decisions={len(contract['decisions'])}")
