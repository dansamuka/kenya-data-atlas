import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const text=p=>fs.readFileSync(path.join(root,p),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(`P18 completeness validation: ${msg}`);};

const ledger=json('data/completeness/slot-ledger.json');
const summary=json('data/completeness/summary.json');
const profile=text('assets/place-profile.js');

assert(ledger.schema_version==='kda.completeness.slot-ledger.v1','unexpected ledger schema');
assert(summary.schema_version==='kda.completeness.summary.v1','unexpected summary schema');
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

const allowed=new Set(['published_direct','published_derived','published_modelled','external_verified','active_missing','sourced_uningested','planned_unresolved']);
for(const row of ledger.rows){
  assert(allowed.has(row.status),`${row.slot_key} has unsupported status ${row.status}`);
  assert(row.indicator_code&&row.level&&row.tab,`${row.slot_key} is missing identity fields`);
  assert(row.reason,`${row.slot_key} must explain its state`);
  assert(row.completion_phase,`${row.slot_key} must map to a completion phase`);
  if(row.resolved){
    assert(['published_direct','published_derived','published_modelled','external_verified'].includes(row.status),`${row.slot_key} resolved with non-evidence status ${row.status}`);
    assert(row.series_code&&row.observation_id,`${row.slot_key} resolved without canonical series/observation`);
    assert(row.completion_phase==='complete',`${row.slot_key} resolved slot must be marked complete`);
  }else{
    assert(row.completion_phase!=='complete',`${row.slot_key} unresolved slot cannot be complete`);
  }
}

// The canonical generated indicator registry is authoritative. The UI taxonomy may
// enrich missing metadata, but it must never downgrade an already-active indicator
// back to sourced/planned and thereby create a false empty card.
assert(profile.includes("i.lifecycle_status=i.lifecycle_status||d.status||'active'"),'place-profile runtime must preserve canonical lifecycle status');
assert(!profile.includes("i.lifecycle_status=d.status||i.lifecycle_status||'active'"),'stale taxonomy-first lifecycle assignment must not return');

console.log(`P18_COMPLETENESS_VALIDATE_OK slots=${summary.total_slots} resolved=${summary.resolved_slots} unresolved=${summary.unresolved_slots}`);
console.log(`P18_NO_UNKNOWN_BLANKS_OK unknown=${summary.unknown_missing}`);
console.log('P18_CANONICAL_LIFECYCLE_AUTHORITY_OK');
