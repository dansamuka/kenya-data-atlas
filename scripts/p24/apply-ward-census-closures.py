import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
contract = json.loads((root / 'data/p24/ward-census-closure-contract.json').read_text())
geos = json.loads((root / 'data/geography/registry/geographies.json').read_text())
codes = sorted(g['geo_code'] for g in geos if g.get('level') == 'ward')
if len(codes) != 1450 or len(set(codes)) != 1450:
    raise SystemExit(f'Expected 1,450 unique wards, got {len(codes)}/{len(set(codes))}')

# Materialise the governed ward-level census publication-gap closure across the
# canonical 1,450 ward codes. One evidence record per indicator keeps the
# decision auditable while the existing completeness builder expands geo_codes
# to every rendered slot (IND-POPULATION renders on both the overview and
# people profile tabs).
evidence_path = root / 'data/completeness/evidence-states.json'
evidence = json.loads(evidence_path.read_text())
states = [s for s in evidence.get('states', []) if s.get('contract_id') != contract['contract_id']]
for decision in contract['decisions']:
    states.append({
        'contract_id': contract['contract_id'],
        'level': 'ward',
        'indicator_code': decision['indicator_code'],
        'status': 'official_unavailable',
        'geo_codes': codes,
        'period_label': decision['period_label'],
        'source': decision['source'],
        'source_url': decision['source_url'],
        'reason': decision['reason'],
        'as_of': contract['as_of'],
        'evidence_constraint': 'official_publication_not_available_at_current_1450_ward_boundary',
        'refresh_trigger': decision['refresh_trigger']
    })
evidence['states'] = states
evidence_path.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + '\n')

# Extend the shared slot-ledger validator's official-unavailable reconciliation
# so the new P24 ward census closure is counted explicitly rather than folding
# invisibly into an unrelated bucket.
validator_path = root / 'scripts/completeness/validate-slot-ledger.mjs'
validator = validator_path.read_text()

old = """const officialUnavailable=configured.filter(s=>s.status==='official_unavailable');
const p22Codes=new Set(['IND-DROUGHT-EARLY-WARNING','IND-FOOD-SECURITY-PHASE','IND-RAINFALL-TEMPERATURE']);
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
new = """const officialUnavailable=configured.filter(s=>s.status==='official_unavailable');
const p22Codes=new Set(['IND-DROUGHT-EARLY-WARNING','IND-FOOD-SECURITY-PHASE','IND-RAINFALL-TEMPERATURE']);
const p23CensusCodes=new Set(['IND-POPULATION','IND-HOUSEHOLD-SIZE']);
const p23EvidenceGapCodes=new Set(['IND-NG-CDF-UTILIZATION','IND-HEALTH-FACILITY-DENSITY']);
const p24CensusCodes=new Set(['IND-POPULATION']);
const p22Unavailable=officialUnavailable.filter(s=>p22Codes.has(s.indicator_code));
const p23CensusUnavailable=officialUnavailable.filter(s=>s.level==='constituency'&&p23CensusCodes.has(s.indicator_code));
const p23EvidenceGapUnavailable=officialUnavailable.filter(s=>s.level==='constituency'&&p23EvidenceGapCodes.has(s.indicator_code));
const p24CensusUnavailable=officialUnavailable.filter(s=>s.level==='ward'&&p24CensusCodes.has(s.indicator_code));
const legacyUnavailable=officialUnavailable.filter(s=>!p22Codes.has(s.indicator_code)&&!(s.level==='constituency'&&(p23CensusCodes.has(s.indicator_code)||p23EvidenceGapCodes.has(s.indicator_code)))&&!(s.level==='ward'&&p24CensusCodes.has(s.indicator_code)));
assert(legacyUnavailable.length===48,`pre-P22/P23 official-unavailable inventory must remain 48 states, got ${legacyUnavailable.length}`);
assert(p22Unavailable.length===66,`P22 terminal snapshot must contribute exactly 66 governed official-unavailable states, got ${p22Unavailable.length}`);
assert(p23CensusUnavailable.length===580,`P23 census publication closure must contribute exactly 580 geography/indicator evidence states, got ${p23CensusUnavailable.length}`);
assert(p23EvidenceGapUnavailable.length===580,`P23 utilisation/density closure must contribute exactly 580 geography/indicator evidence states, got ${p23EvidenceGapUnavailable.length}`);
assert(p24CensusUnavailable.length===1450,`P24 ward census publication closure must contribute exactly 1,450 geography/indicator evidence states, got ${p24CensusUnavailable.length}`);
assert(officialUnavailable.length===2724,`official-unavailable evidence inventory must reconcile 48 legacy + 66 P22 + 580 P23 census + 580 P23 evidence gaps + 1450 P24 ward census = 2724, got ${officialUnavailable.length}`);
assert(p22Unavailable.every(s=>s.as_of==='2026-09-01'&&s.evidence_constraint==='current_observation_unavailable_under_p22_contract'), 'P22 unavailable states must retain snapshot date and evidence-constraint marker');
assert(p22Unavailable.every(s=>String(s.refresh_trigger||'').length>0),'P22 unavailable states must retain refresh triggers');
assert(p23CensusUnavailable.every(s=>s.as_of==='2026-09-02'&&s.evidence_constraint==='official_publication_not_available_at_current_290_constituency_boundary'),'P23 census unavailable states must retain boundary-publication evidence constraint');
assert(p23CensusUnavailable.every(s=>String(s.refresh_trigger||'').length>0),'P23 census unavailable states must retain refresh triggers');
assert(p23EvidenceGapUnavailable.every(s=>s.as_of==='2026-09-02'&&String(s.evidence_constraint||'').length>0),'P23 utilisation/density states must retain snapshot date and evidence constraint');
assert(p23EvidenceGapUnavailable.every(s=>String(s.refresh_trigger||'').length>0),'P23 utilisation/density states must retain refresh triggers');
assert(p24CensusUnavailable.every(s=>s.as_of==='2026-09-08'&&s.evidence_constraint==='official_publication_not_available_at_current_1450_ward_boundary'),'P24 ward census unavailable states must retain boundary-publication evidence constraint');
assert(p24CensusUnavailable.every(s=>String(s.refresh_trigger||'').length>0),'P24 ward census unavailable states must retain refresh triggers');
"""
if old in validator:
    validator = validator.replace(old, new, 1)
elif new not in validator:
    raise SystemExit('Expected official-unavailable inventory validator block not found')

old_log = """console.log(`P18_P22_P23_UNAVAILABLE_RECONCILIATION_OK legacy=${legacyUnavailable.length} p22=${p22Unavailable.length} p23_census=${p23CensusUnavailable.length} p23_evidence_gaps=${p23EvidenceGapUnavailable.length} total=${officialUnavailable.length}`);
"""
new_log = """console.log(`P18_P22_P23_P24_UNAVAILABLE_RECONCILIATION_OK legacy=${legacyUnavailable.length} p22=${p22Unavailable.length} p23_census=${p23CensusUnavailable.length} p23_evidence_gaps=${p23EvidenceGapUnavailable.length} p24_ward_census=${p24CensusUnavailable.length} total=${officialUnavailable.length}`);
"""
if old_log in validator:
    validator = validator.replace(old_log, new_log, 1)
elif new_log not in validator:
    raise SystemExit('Expected reconciliation log line not found')
validator_path.write_text(validator)

# Wire the new P24 ward census closure validator into package.json.
package_path = root / 'package.json'
package = json.loads(package_path.read_text())
p24_validate = 'node scripts/p24/validate-ward-census-closures.mjs'
package['scripts']['p24:validate'] = p24_validate
test_command = package['scripts']['test']
insertion_point = 'npm run p23:validate'
if insertion_point in test_command and 'npm run p24:validate' not in test_command:
    package['scripts']['test'] = test_command.replace(insertion_point, insertion_point + ' && npm run p24:validate', 1)
package_path.write_text(json.dumps(package, indent=2, ensure_ascii=False) + '\n')

print(f"P24_CENSUS_CLOSURE_PREPARED wards={len(codes)} evidence_decisions={len(contract['decisions'])}")
