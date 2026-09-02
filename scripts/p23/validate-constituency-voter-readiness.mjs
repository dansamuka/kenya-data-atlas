import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const readJson=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 constituency voter readiness: ${msg}`);};

const contract=readJson('data/p23/constituency-voter-promotion-contract.json');
const geographies=readJson('data/geography/registry/geographies.json');
const ledger=readJson('data/completeness/slot-ledger.json');
const summary=readJson('data/completeness/summary.json');

assert(contract.schema_version==='kda.p23.constituency-voter-promotion.v1','unexpected contract schema');
assert(contract.phase==='P23'&&contract.accelerator==='P23A','contract must belong to P23/P23A');
assert(contract.indicator_code==='IND-REGISTERED-VOTERS','wrong first-tranche indicator');
assert(contract.target_geography_count===290&&contract.target_observation_count===290,'target must remain 290 canonical observations');
assert(contract.expected_existing_p23_slot_instances===870,'target must remain 870 existing P23 slot instances');
assert(summary.total_slots===20115,'governed denominator changed');
assert(summary.resolved_slots+summary.unresolved_slots===summary.total_slots,'live completeness arithmetic changed');

const promoted=contract.status==='promoted_complete';
if(promoted){
  assert(contract.completion?.p23_slot_instances_resolved===870,'promoted completion must record 870 resolved slot instances');
  assert(contract.completion?.post_promotion_p23_remaining===2320,'promoted completion must record 2,320 remaining P23 slots');
  // The completion block is a historical checkpoint for the voter tranche, not a freeze on later P23 progress.
  assert((summary.by_completion_phase?.P23||0)<=contract.completion.post_promotion_p23_remaining,'live P23 queue regressed above voter-promotion checkpoint');
  assert(summary.resolved_slots>=contract.completion.post_promotion_resolved_slots,'live resolved slots regressed below voter-promotion checkpoint');
  assert(summary.unresolved_slots<=contract.completion.post_promotion_unresolved_slots,'live unresolved slots regressed above voter-promotion checkpoint');
  assert(summary.unknown_missing===contract.completion.post_promotion_unknown_missing,'live unknown-missing state regressed');
}else{
  assert((summary.by_completion_phase?.P23||0)===3190,'P23 queue changed before first P23 promotion');
}

const constituencies=geographies.filter(g=>g.level==='constituency');
assert(constituencies.length===290,`canonical constituency count ${constituencies.length} != 290`);
const byCode=new Map();
for(const geo of constituencies){
  const code=Number(geo.constituency_code);
  assert(Number.isInteger(code)&&code>=1&&code<=290,`invalid canonical constituency code ${geo.constituency_code}`);
  assert(!byCode.has(code),`duplicate canonical constituency code ${code}`);
  byCode.set(code,geo);
}
for(let code=1;code<=290;code++)assert(byCode.has(code),`canonical constituency code ${code} missing`);

const targetSlots=ledger.rows.filter(r=>r.level==='constituency'&&r.indicator_code==='IND-REGISTERED-VOTERS');
assert(targetSlots.length===870,`expected 870 constituency voter slot instances, found ${targetSlots.length}`);
if(promoted){
  assert(targetSlots.every(r=>r.completion_phase==='complete'),'promoted voter slot instances must remain reclassified to complete');
  assert(targetSlots.every(r=>r.resolved===true),'promoted contract requires every target slot instance to remain resolved');
}else{
  assert(targetSlots.every(r=>r.completion_phase==='P23'),'pre-promotion voter slot instances must remain assigned to P23');
  assert(targetSlots.every(r=>r.resolved===false),'readiness contract must precede native promotion; a target slot instance is already resolved');
}
const expectedTabs=['overview','people','representation'];
assert(JSON.stringify([...new Set(targetSlots.map(r=>r.tab))].sort())===JSON.stringify(expectedTabs),'constituency voter slot surfaces changed');
for(const geo of constituencies){
  const slots=targetSlots.filter(r=>r.geography_id===geo.geography_id);
  assert(slots.length===3,`${geo.geo_code} must have exactly three governed voter slot instances`);
  assert(JSON.stringify(slots.map(r=>r.tab).sort())===JSON.stringify(expectedTabs),`${geo.geo_code} voter slot surfaces changed`);
}
assert(new Set(targetSlots.map(r=>`${r.geography_id}|${r.indicator_code}`)).size===290,'slot instances do not collapse to exactly 290 geography/indicator observation keys');

async function fetchText(url){
  const response=await fetch(url,{headers:{'User-Agent':'Kenya-Data-Atlas-P23-readiness'}});
  assert(response.ok,`failed to fetch pinned extraction (${response.status})`);
  return response.text();
}
function parseCoded(raw){
  const lines=raw.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  const header=lines.shift();
  assert(header?.includes('Registered Voters'),'pinned extraction header changed');
  return lines.filter(Boolean).map((line,i)=>{
    const c=line.split(',');
    assert(c.length>=8,`malformed source row ${i+2}`);
    return {county_code:Number(c[1]),constituency_code:Number(c[3]),ward_code:Number(c[5]),voters:Number(c[7])};
  });
}

const raw=await fetchText(contract.deterministic_extraction.coded_transcription_url);
const rows=parseCoded(raw);
assert(rows.length===1450,`source ward rows ${rows.length} != 1,450`);
assert(rows.every(r=>Number.isInteger(r.voters)&&r.voters>0),'every source voter count must be a positive integer');
assert(new Set(rows.map(r=>r.ward_code)).size===1450,'source ward codes are not unique');
assert(new Set(rows.map(r=>r.constituency_code)).size===290,'source does not cover 290 constituencies');
assert(new Set(rows.map(r=>r.county_code)).size===47,'source does not cover 47 counties');
assert(rows.reduce((a,r)=>a+r.voters,0)===contract.deterministic_extraction.national_domestic_total,'source national total changed');

const totals=new Map();
for(const row of rows)totals.set(row.constituency_code,(totals.get(row.constituency_code)||0)+row.voters);
assert(totals.size===290,'derived constituency totals incomplete');
for(let code=1;code<=290;code++)assert(Number.isInteger(totals.get(code))&&totals.get(code)>0,`constituency ${code} has no valid derived total`);
for(const anchor of contract.locked_anchors||[])assert(totals.get(anchor.constituency_code)===anchor.registered_voters,`${anchor.name} anchor changed`);

assert(contract.canonicalisation_rules.some(x=>x.includes('Do not inherit county')),'anti-inheritance rule missing');
assert(contract.canonicalisation_rules.some(x=>x.includes('Mandera East/Lafey')),'Mandera/Lafey statistical-versus-spatial rule missing');
if(promoted){
  assert(contract.scope_note.includes('registered-voter tranche is closed'),'promoted contract must close the registered-voter tranche');
  assert(contract.next_tranche?.status==='in_progress','promoted contract must identify the next active P23 tranche');
}else{
  assert(contract.scope_note.includes('does not itself resolve a slot instance'),'readiness tranche must not claim completion');
}

console.log(`P23_VOTER_READINESS_OK state=${promoted?'promoted_complete':'pre_promotion'} source_wards=${rows.length} constituencies=${totals.size} target_observations=${contract.target_observation_count} target_slot_instances=${targetSlots.length} live_p23=${summary.by_completion_phase?.P23||0}`);
console.log(`P23_VOTER_SOURCE_TOTAL_OK total=${contract.deterministic_extraction.national_domestic_total}`);
console.log('P23_VOTER_ANTI_INHERITANCE_OK');
