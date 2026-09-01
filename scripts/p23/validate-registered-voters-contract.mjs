import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const text=p=>fs.readFileSync(path.join(root,p),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 registered-voter contract validation: ${msg}`);};

const contract=json('data/p23/registered-voters-promotion-contract.json');
const ledger=json('data/completeness/slot-ledger.json');
const summary=json('data/completeness/summary.json');
const sprint2=text('data/sprint2/README.md');
const runtime=text('assets/sprint2-data.js');

assert(contract.schema_version==='kda.p23.registered-voters-promotion.v1','unexpected contract schema');
assert(contract.phase==='P23'&&contract.accelerator==='P23A','contract must remain scoped to P23/P23A');
assert(contract.indicator_code==='IND-REGISTERED-VOTERS','wrong indicator code');
assert(contract.target_level==='constituency','target level must remain constituency');
assert(contract.expected_slot_count===290,'expected slot count must remain 290');
assert(contract.governed_denominator===20115,'governed denominator changed');
assert(contract.statistical_treatment?.classification==='B — Official derived','Sprint 2 treatment must remain B — Official derived');
assert(contract.slot_resolution_effect==='none','contract tranche must not itself resolve slots');

const slots=ledger.rows.filter(r=>r.level==='constituency'&&r.indicator_code==='IND-REGISTERED-VOTERS');
assert(slots.length===290,`expected 290 governed constituency voter slots, got ${slots.length}`);
assert(new Set(slots.map(r=>r.geo_code)).size===290,'constituency voter slot geo_codes must be unique');
assert(slots.every(r=>r.completion_phase==='P23'),'all constituency voter slots must remain assigned to P23 before numeric promotion');
assert(slots.every(r=>r.resolved===false),'contract tranche must not prematurely resolve constituency voter slots');
assert(summary.total_slots===20115,'summary denominator changed');
assert((summary.by_completion_phase?.P23||0)>=290,'summary must retain at least the 290 voter slots in P23');

assert(sprint2.includes('290/290 constituencies'),'Sprint 2 audited 290/290 constituency coverage anchor missing');
assert(sprint2.includes('22,102,532'),'Sprint 2 national ward-sum anchor missing');
assert(sprint2.includes('B — Official derived'),'Sprint 2 treatment anchor missing');
assert(sprint2.includes('Ol Kalou Constituency — **72,997**'),'Ol Kalou locked anchor missing');
assert(sprint2.includes('10/1,450 ward rows'),'Mandera East/Lafey hold anchor missing');

assert(runtime.includes('constituencies: 290'),'runtime 290-constituency coverage anchor missing');
assert(runtime.includes('ward_source_rows: 1450'),'runtime 1,450 ward-row anchor missing');
assert(runtime.includes('mapped_wards: 1440'),'runtime 1,440 mapped-ward anchor missing');
assert(runtime.includes('spatial_holds: 10'),'runtime ten-row hold anchor missing');
assert(runtime.includes("SPATIAL_HOLD_CONSTITUENCIES = new Set([43, 44])"),'Mandera East/Lafey hold implementation missing');
assert(runtime.includes('including held rows')||sprint2.includes('including held rows'),'held rows must remain included in constituency totals');

for(const item of contract.promotion_gate||[]) assert(typeof item==='string'&&item.length>10,'promotion gate entries must be explicit');
assert((contract.statistical_treatment?.anti_inheritance||[]).some(x=>x.includes('Never inherit a county')),'county-to-constituency anti-inheritance rule missing');

console.log(`P23_REGISTERED_VOTER_CONTRACT_OK slots=${slots.length} p23_remaining=${summary.by_completion_phase?.P23||0}`);
console.log('P23_REGISTERED_VOTER_ANTI_INHERITANCE_OK');
console.log('P23_REGISTERED_VOTER_BOUNDARY_HOLD_OK');
console.log('P23_REGISTERED_VOTER_PROMOTION_PENDING_NATIVE_BUILD');
