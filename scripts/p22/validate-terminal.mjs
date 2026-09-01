import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P22 terminal validation: ${msg}`);};
const norm=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');

const contract=json('data/p22/asal-eligibility-freshness-contract.json');
const closure=json('data/p22/terminal-evidence-closure.json');
const drought=json('data/p22/ndma-county-bulletin-source-inventory.json');
const food=json('data/p22/food-security-source-inventory.json');
const climate=json('data/p22/climate-anomaly-source-inventory.json');
const evidence=json('data/completeness/evidence-states.json');
const ledger=json('data/completeness/slot-ledger.json');
const summary=json('data/completeness/summary.json');
const queue=json('data/completeness/p22-work-queue.json');
const roadmap=json('data/data-completion-roadmap.json');
const geographies=json('data/geography/registry/geographies.json');

assert(contract.phase==='P22'&&contract.status==='active_contract','freshness contract must remain active for future refreshes');
assert(contract.governed_slot_count===66&&contract.slot_math?.eligible_counties===22&&contract.slot_math?.families_per_county===3,'contract slot math must remain 22 × 3 = 66');
assert(closure.as_of==='2026-09-01'&&closure.governed_slot_count===66,'terminal closure snapshot mismatch');
assert(drought.freshness_policy?.county_freshness_state==='stale','drought inventory must classify June 2026 county evidence as stale');
assert(food.promotion_gate?.status==='blocked_pending_2026_lra_payload','food-security source gate must remain blocked pending exact 2026 LRA payload');
assert(climate.promotion_gate?.status==='blocked_pending_direct_county_anomaly_or_governed_spatial_derivation','climate source gate must remain blocked pending exact governed measure');

const counties=geographies.filter(g=>g.level==='county');
const byName=new Map(counties.map(g=>[norm(g.name),g]));
const expectedCodes=(contract.eligibility?.whole_county_programme_eligible||[]).map(name=>{
  const g=byName.get(norm(name));
  assert(g,`canonical county missing for ${name}`);
  return g.geo_code;
}).sort();
assert(expectedCodes.length===22&&new Set(expectedCodes).size===22,'expected exact 22 eligible county codes');
const nyeri=counties.find(g=>norm(g.name)==='nyeri');
assert(nyeri&&!expectedCodes.includes(nyeri.geo_code),'Nyeri/Kieni must remain outside whole-county P22 closure');

const families=['IND-DROUGHT-EARLY-WARNING','IND-FOOD-SECURITY-PHASE','IND-RAINFALL-TEMPERATURE'];
for(const code of families){
  const state=(evidence.states||[]).find(s=>s.level==='county'&&s.indicator_code===code&&s.status==='official_unavailable');
  assert(state,`${code}: official-unavailable evidence state missing`);
  assert(JSON.stringify([...(state.geo_codes||[])].sort())===JSON.stringify(expectedCodes),`${code}: closure geography set must equal governed 22 counties`);
  assert(state.as_of==='2026-09-01',`${code}: closure as-of date must be 2026-09-01`);
  assert(state.evidence_constraint==='current_observation_unavailable_under_p22_contract',`${code}: evidence constraint marker missing`);
  assert(String(state.refresh_trigger||'').length>40,`${code}: refresh trigger must be explicit`);
}

const droughtState=evidence.states.find(s=>s.indicator_code==='IND-DROUGHT-EARLY-WARNING'&&s.status==='official_unavailable');
assert(norm(droughtState.reason).includes('threecalendarmonths')&&norm(droughtState.reason).includes('fails')&&norm(droughtState.reason).includes('currentlabeltolerance'),'drought closure must document freshness failure');
assert(norm(droughtState.reason).includes('nationalbulletin')&&norm(droughtState.reason).includes('cannotbeinheritedtocounties'),'drought closure must retain national-to-county anti-inheritance');
const foodState=evidence.states.find(s=>s.indicator_code==='IND-FOOD-SECURITY-PHASE'&&s.status==='official_unavailable');
assert(norm(foodState.reason).includes('2026')&&norm(foodState.reason).includes('classificationgeography')&&norm(foodState.reason).includes('validityintervals'),'food closure must document missing deterministic payload semantics');
assert(norm(foodState.reason).includes('endedbyjune2026'),'food closure must document expiry of older assessment windows');
const climateState=evidence.states.find(s=>s.indicator_code==='IND-RAINFALL-TEMPERATURE'&&s.status==='official_unavailable');
assert(norm(climateState.reason).includes('directnumeric')&&norm(climateState.reason).includes('climatologicalbaseline')&&norm(climateState.reason).includes('countyaggregationmethod'),'climate closure must document exact measure gap');
assert(norm(climateState.reason).includes('mapcolours')&&norm(climateState.reason).includes('notreverseengineered'),'climate closure must prohibit map-colour reverse engineering');

const p22Rows=(ledger.rows||[]).filter(r=>r.level==='county'&&r.tab==='resilience'&&families.includes(r.indicator_code));
assert(p22Rows.length===66,`expected 66 governed resilience ledger rows, got ${p22Rows.length}`);
assert(p22Rows.every(r=>r.resolved===true&&r.status==='official_unavailable'&&r.completion_phase==='complete'),'all 66 P22 rows must resolve only through explicit official-unavailable evidence states');
assert(p22Rows.every(r=>!r.series_code&&!r.observation_id&&r.value===''),'terminal closure must not fabricate canonical observations or values');
assert(new Set(p22Rows.map(r=>r.geo_code)).size===22,'terminal ledger must cover exactly 22 counties');
assert(!p22Rows.some(r=>r.geo_code===nyeri.geo_code),'Nyeri must not enter the P22 ledger closure');

assert(queue.schema_version==='kda.completeness.p22-work-queue.v1'&&queue.phase==='P22','P22 work queue schema/phase mismatch');
assert(queue.remaining_slots===0&&queue.family_count===0&&Object.keys(queue.family_counts||{}).length===0,'P22 queue must be terminally empty');
assert((summary.by_completion_phase?.P22||0)===0,'completeness summary must have zero P22 unresolved rows');
assert(summary.total_slots===20115,'governed slot denominator must remain 20,115');
assert(summary.resolved_slots===3874&&summary.unresolved_slots===16241&&summary.resolved_pct===19.26,'terminal completeness totals must equal 3,874 / 16,241 / 19.26%');
assert(summary.unknown_missing===0,'unknown_missing must remain zero');
assert(summary.by_status?.official_unavailable===114,'official_unavailable count must equal prior 48 plus 66 P22 closures = 114');

const p22=(roadmap.phases||[]).find(p=>p.id==='P22');
assert(p22?.status==='complete','P22 roadmap status must be complete');
assert(p22.progress?.governed_slots===66&&p22.progress?.resolved_total===66&&p22.progress?.remaining_slots===0,'P22 roadmap progress must reconcile 66/66');
assert(p22.progress?.direct_current_observations===0&&p22.progress?.evidence_constrained_current_unavailable===66,'P22 roadmap must distinguish evidence closure from direct current observations');
assert(p22.progress?.completion_as_of==='2026-09-01'&&p22.progress?.next_phase==='P23','P22 completion date/next phase must be explicit');

console.log('P22_TERMINAL_VALIDATE_OK governed=66 resolved=66 direct_current=0 evidence_constrained=66 queue=0');
console.log('P22_FRESHNESS_GUARD_OK stale_drought_not_current=true expired_food_not_current=true climate_proxy_blocked=true');
console.log('P22_COMPLETENESS_OK resolved=3874 unresolved=16241 resolved_pct=19.26 unknown=0 next=P23');
