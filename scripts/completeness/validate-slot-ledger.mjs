import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const text=p=>fs.readFileSync(path.join(root,p),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(`P18 completeness validation: ${msg}`);};

const ledger=json('data/completeness/slot-ledger.json');
const summary=json('data/completeness/summary.json');
const evidenceStates=json('data/completeness/evidence-states.json');
const profile=text('assets/place-profile.js');

assert(ledger.schema_version==='kda.completeness.slot-ledger.v1','unexpected ledger schema');
assert(summary.schema_version==='kda.completeness.summary.v1','unexpected summary schema');
assert(evidenceStates.schema_version==='kda.completeness.evidence-states.v1','unexpected explicit-evidence schema');
assert(Array.isArray(ledger.rows),'ledger rows missing');
assert(ledger.expected_slot_instances===20115,'expected-slot contract must remain 20,115 for the current taxonomy');
assert(ledger.rows.length===20115,`expected 20,115 rendered slot instances, got ${ledger.rows.length}`);
assert(summary.total_slots===ledger.rows.length,'summary total does not match ledger');
assert((summary.by_level?.county||0)===2134,`county slot count changed: ${summary.by_level?.county}`);
assert((summary.by_level?.constituency||0)===3480,`constituency slot count changed: ${summary.by_level?.constituency}`);
assert((summary.by_level?.ward||0)===14500,`ward slot count changed: ${summary.by_level?.ward}`);
assert((summary.by_level?.country||0)===1,`national Pulse slot count changed: ${summary.by_level?.country}`);

const keys=new Set(ledger.rows.map(r=>r.slot_key));
assert(keys.size===ledger.rows.length,'slot_key values must be unique');
assert(summary.resolved_slots+summary.unresolved_slots===summary.total_slots,'resolved and unresolved totals must reconcile');
assert(summary.unknown_missing===0,'every slot must be classified; unknown_missing must be zero');

const resolvedEvidence=new Set(['published_direct','published_derived','published_modelled','external_verified']);
const closureStatuses=new Set(['official_unavailable','retired_replaced']);
const allowed=new Set([...resolvedEvidence,...closureStatuses,'active_missing','sourced_uningested','planned_unresolved']);
for(const row of ledger.rows){
  assert(allowed.has(row.status),`${row.slot_key} has unsupported status ${row.status}`);
  assert(row.indicator_code&&row.level&&row.tab,`${row.slot_key} is missing identity fields`);
  assert(row.reason,`${row.slot_key} must explain its state`);
  assert(row.completion_phase,`${row.slot_key} must map to a completion phase`);
  if(row.resolved){
    assert(resolvedEvidence.has(row.status)||closureStatuses.has(row.status),`${row.slot_key} resolved with non-evidence status ${row.status}`);
    assert(row.completion_phase==='complete',`${row.slot_key} resolved slot must be marked complete`);
    if(closureStatuses.has(row.status)){
      assert(!row.series_code&&!row.observation_id,`${row.slot_key} governed closure must not fabricate canonical series/observation`);
      assert(row.value===''||row.value===null||row.value===undefined,`${row.slot_key} governed closure must not carry a fabricated value`);
      assert(row.period_label&&row.source&&row.source_url,`${row.slot_key} governed closure requires period/source/source_url`);
    }else{
      assert(row.series_code&&row.observation_id,`${row.slot_key} resolved numeric/categorical evidence without canonical series/observation`);
    }
  }else{
    assert(row.completion_phase!=='complete',`${row.slot_key} unresolved slot cannot be complete`);
  }
}

const configured=[];
for(const state of evidenceStates.states||[])for(const geoCode of state.geo_codes||(state.geo_code?[state.geo_code]:[]))configured.push({...state,geo_code:geoCode});
const authorizedExplicit=new Set(['official_unavailable','retired_replaced']);
for(const state of configured){
  assert(authorizedExplicit.has(state.status),`${state.geo_code}/${state.indicator_code}: unauthorized explicit evidence status ${state.status}`);
  const matches=ledger.rows.filter(r=>r.level===state.level&&r.geo_code===state.geo_code&&r.indicator_code===state.indicator_code);
  assert(matches.length>=1,`${state.geo_code}/${state.indicator_code}: explicit evidence state must map to at least one public slot, got ${matches.length}`);
  assert(matches.every(row=>row.resolved===true&&row.status===state.status),`${state.geo_code}/${state.indicator_code}: configured evidence state not resolved correctly across all rendered occurrences`);
  assert(matches.every(row=>row.reason===state.reason&&row.period_label===state.period_label&&row.source===state.source&&row.source_url===state.source_url),`${state.geo_code}/${state.indicator_code}: evidence-state provenance diverged across rendered occurrences`);
  if(state.status==='retired_replaced'){
    assert(Array.isArray(state.successor_indicator_codes)&&state.successor_indicator_codes.length>0,`${state.geo_code}/${state.indicator_code}: retired/replaced closure requires successor_indicator_codes`);
  }
}
for(const status of authorizedExplicit){
  const configuredStates=configured.filter(s=>s.status===status);
  const expectedRenderedRows=configuredStates.reduce((count,state)=>count+ledger.rows.filter(r=>r.level===state.level&&r.geo_code===state.geo_code&&r.indicator_code===state.indicator_code).length,0);
  assert(ledger.rows.filter(r=>r.status===status).length===expectedRenderedRows,`no ungoverned ${status} rendered states may appear`);
}

const officialUnavailable=configured.filter(s=>s.status==='official_unavailable');
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

// The canonical generated indicator registry is authoritative. The UI taxonomy may
// enrich missing metadata, but it must never downgrade an already-active indicator
// back to sourced/planned and thereby create a false empty card.
assert(profile.includes("i.lifecycle_status=i.lifecycle_status||d.status||'active'"),'place-profile runtime must preserve canonical lifecycle status');
assert(!profile.includes("i.lifecycle_status=d.status||i.lifecycle_status||'active'"),'stale taxonomy-first lifecycle assignment must not return');

console.log(`P18_COMPLETENESS_VALIDATE_OK slots=${summary.total_slots} resolved=${summary.resolved_slots} unresolved=${summary.unresolved_slots}`);
console.log(`P18_NO_UNKNOWN_BLANKS_OK unknown=${summary.unknown_missing}`);
console.log(`P18_GOVERNED_CLOSURE_STATES_OK configured=${configured.length} unavailable=${officialUnavailable.length} retired_replaced=${configured.filter(s=>s.status==='retired_replaced').length}`);
console.log(`P18_P22_P23_UNAVAILABLE_RECONCILIATION_OK legacy=${legacyUnavailable.length} p22=${p22Unavailable.length} p23_census=${p23CensusUnavailable.length} p23_evidence_gaps=${p23EvidenceGapUnavailable.length} total=${officialUnavailable.length}`);
console.log('P18_CANONICAL_LIFECYCLE_AUTHORITY_OK');
