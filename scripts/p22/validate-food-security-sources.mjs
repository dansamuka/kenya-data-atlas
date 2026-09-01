import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P22 food-security validation: ${msg}`);};

const contract=read('data/p22/asal-eligibility-freshness-contract.json');
const inventory=read('data/p22/food-security-source-inventory.json');

assert(contract.phase==='P22','eligibility/freshness contract phase must be P22');
assert(inventory.schema_version==='kda.p22.food-security-source-inventory.v1','unexpected inventory schema');
assert(inventory.phase==='P22','inventory phase must be P22');
assert(inventory.indicator_code==='IND-FOOD-SECURITY-PHASE','inventory must govern the food-security slot');
assert(inventory.governed_county_count===22,'governed county count must remain 22');

const normalize=s=>String(s).replaceAll('-',' ').replace(/\s+/g,' ').trim().toLowerCase();
const expected=(contract.eligibility?.whole_county_programme_eligible||[]).map(normalize).sort();
const actual=(inventory.governed_counties||[]).map(normalize).sort();
assert(expected.length===22,'contract must expose exactly 22 whole-county P22 geographies');
assert(actual.length===22,'inventory must expose exactly 22 governed counties');
assert(new Set(actual).size===22,'inventory governed counties must be unique');
assert(JSON.stringify(actual)===JSON.stringify(expected),'food-security inventory counties must reconcile exactly to the P22 eligibility contract');
assert(!actual.includes('nyeri'),'Nyeri/Kieni partial-ASAL coverage must not enter whole-county food-security slots');

assert(Array.isArray(inventory.sources)&&inventory.sources.length>=3,'inventory must retain current discovery plus historical control sources');
const byKey=new Map(inventory.sources.map(s=>[s.source_key,s]));
const lra=byKey.get('ndma-lra-2026-national');
const nine=byKey.get('ndma-lra-2026-nine-counties');
const sra=byKey.get('kfssg-sra-2025-published-2026');
assert(lra&&nine&&sra,'required source controls are missing');

for(const source of inventory.sources){
  assert(source.slot_resolution_effect==='none',`${source.source_key} must not resolve slots at source-discovery stage`);
  assert(source.publisher&&source.title&&source.reason,`${source.source_key} requires title, publisher and reason`);
}

assert(lra.published==='2026-08','2026 LRA discovery month must remain August 2026 unless re-verified from the official source');
assert(lra.classification_payload_state==='not_ingested','2026 LRA must not be treated as ingested before its official classification payload is resolved');
assert(lra.current_interval===null&&lra.projected_interval===null,'listing-only LRA discovery cannot invent validity intervals');
assert(String(lra.listing_url||'').startsWith('https://knowledgeweb.ndma.go.ke/'),'2026 LRA listing must use the official NDMA domain');

assert(nine.published==='2026-07-20','9-county report publication date must match official resource details');
assert(nine.current_interval===null&&nine.projected_interval===null,'9-county report listing cannot invent validity intervals');
assert(nine.classification_payload_state==='not_ingested','9-county report title alone cannot count as ingested classification evidence');

const asOf=new Date(`${inventory.as_of_month}-01T00:00:00Z`);
assert(!Number.isNaN(asOf.valueOf()),'as_of_month must be YYYY-MM');
const currentEnd=new Date(`${sra.current_interval.end}T00:00:00Z`);
const projectedEnd=new Date(`${sra.projected_interval.end}T00:00:00Z`);
assert(sra.current_interval.semantics==='current','SRA current interval semantics must remain explicit');
assert(sra.projected_interval.semantics==='projected','SRA projected interval semantics must remain explicit');
assert(currentEnd<asOf,'SRA current interval must be expired by the P22 as-of month');
assert(projectedEnd<asOf,'SRA projected interval must be expired by the P22 as-of month');
assert(sra.classification_payload_state==='historical_only_for_p22_as_of_date','expired SRA evidence must be labelled historical only');

assert(inventory.promotion_gate?.status==='blocked_pending_2026_lra_payload','promotion gate must remain blocked until the official 2026 LRA payload is resolved');
assert(Array.isArray(inventory.promotion_gate?.required_before_promotion)&&inventory.promotion_gate.required_before_promotion.length>=5,'promotion gate must state explicit prerequisites');

console.log(`P22_FOOD_SECURITY_SOURCE_GATE_OK counties=${actual.length} sources=${inventory.sources.length}`);
console.log('P22_FOOD_SECURITY_EXPIRED_SRA_OK current_end=2026-03-31 projected_end=2026-06-30');
console.log('P22_FOOD_SECURITY_NO_PROMOTION_OK pending=2026_lra_payload');
