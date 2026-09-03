import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 Form34B extraction contract: ${msg}`);};

const c=json('data/p23/form34b-extraction-contract.json');
const turnout=json('data/p23/constituency-turnout-readiness-contract.json');
const source=json('data/p23/form34b-source-index-contract.json');
const ocr=json('data/p23/form34b-ocr-feasibility-contract.json');
const summary=json('data/completeness/summary.json');
const geos=json('data/geography/registry/geographies.json');

assert(c.schema_version==='kda.p23.form34b-extraction.v1','unexpected schema');
assert(c.indicator_code==='IND-TURNOUT-HISTORY'&&c.level==='constituency','target changed');
assert(c.expected_geographies===290,'expected geography count changed');
assert(geos.filter(g=>g.level==='constituency').length===290,'canonical constituency registry changed');
assert(source.source_index_relation?.verified_rows===290,'source index is not verified 290/290');
assert(ocr.sample?.form_id===277629,'OCR feasibility authority changed unexpectedly');
assert(turnout.measure?.formula===c.turnout_derivation?.formula,'turnout formulas diverge');
assert(c.promotion_policy?.denominator_invariant===20115,'governed denominator invariant changed');
assert(Number(summary.total_slots)===20115,'current completeness denominator changed');
assert(Number(summary.by_completion_phase?.P23)===290,'extraction contract must not resolve P23 slots');

const required=new Set(c.required_row_fields||[]);
for(const f of ['geo_code','form_id','source_sha256','registered_voters','total_valid_votes','rejected_ballots','turnout_pct','verification_state']) assert(required.has(f),`required row field ${f} missing`);
for(const name of ['registered_voters','total_valid_votes','rejected_ballots']){
  const f=c.numeric_fields?.[name];
  assert(f?.type==='integer',`${name}: must be integer`);
  assert(String(f?.verification||'').toLowerCase().includes('source-image'),`${name}: source-image verification missing`);
  assert(f?.mismatch_treatment==='unresolved',`${name}: mismatches must remain unresolved`);
}
const states=new Set(c.field_evidence?.allowed_verification_states||[]);
for(const s of ['machine_candidate','source_verified','source_unreadable','source_mismatch']) assert(states.has(s),`field state ${s} missing`);
assert(c.field_evidence?.promotion_state_required==='source_verified','machine candidates must not be promotable');
const rowStates=new Set(c.row_verification_states||[]);
for(const s of ['pending_source_verification','verified','partial_unresolved','source_unreadable','denominator_mismatch','arithmetic_mismatch']) assert(rowStates.has(s),`row state ${s} missing`);
assert(c.promotion_policy?.permitted_row_state==='verified','only verified rows may promote');
assert((c.turnout_derivation?.preconditions||[]).length>=5,'turnout preconditions incomplete');
assert((c.prohibited_methods||[]).some(x=>x.includes('raw OCR')),'raw OCR promotion prohibition missing');
assert((c.prohibited_methods||[]).some(x=>x.includes('silently correcting')),'silent correction prohibition missing');
assert(String(c.promotion_policy?.partial_rows||'').includes('do not create series or observations'),'partial-row non-promotion rule missing');

console.log(`P23_FORM34B_EXTRACTION_CONTRACT_OK geographies=290 p23_remaining=${summary.by_completion_phase.P23} denominator=${summary.total_slots} pending_state=governed machine_promotion=blocked`);
