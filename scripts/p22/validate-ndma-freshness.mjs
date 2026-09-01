import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const readJson=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P22 NDMA freshness validation: ${msg}`);};
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const monthIndex=value=>{
  const m=/^(\d{4})-(\d{2})$/.exec(String(value||''));
  assert(m,`invalid YYYY-MM month ${value}`);
  const year=Number(m[1]),month=Number(m[2]);
  assert(month>=1&&month<=12,`invalid month ${value}`);
  return year*12+(month-1);
};

const contract=readJson('data/p22/asal-eligibility-freshness-contract.json');
const inventory=readJson('data/p22/ndma-county-bulletin-source-inventory.json');
const subsets=readJson('data/geography/reference/geography-subsets.json');

assert(contract.phase==='P22','contract must belong to P22');
assert(contract.status==='active_contract','P22 contract must be active');
assert(contract.slot_math?.eligible_counties===22,'contract must govern 22 whole-county ASAL geographies');
assert(contract.slot_math?.families_per_county===3,'contract must govern three resilience families');
assert(contract.slot_math?.expected_slots===66&&contract.governed_slot_count===66,'contract slot math must remain 22 × 3 = 66');

const subset=(subsets.subsets||[]).find(s=>s.key==='ASAL_COUNTIES');
assert(subset,'ASAL_COUNTIES geography subset missing');
assert((subset.members||[]).length===22,'ASAL_COUNTIES subset must contain exactly 22 whole-county members');
assert((subset.partial_memberships||[]).some(x=>norm(x.county)==='nyeri'&&norm(x.scope).includes('kieni')),'Nyeri/Kieni partial-ASAL exclusion must remain explicit');

const contractNames=(contract.eligibility?.whole_county_programme_eligible||[]).map(norm).sort();
const subsetNames=(subset.members||[]).map(norm).sort();
assert(contractNames.length===22,'contract eligibility list must contain 22 counties');
assert(JSON.stringify(contractNames)===JSON.stringify(subsetNames),'P22 contract and ASAL_COUNTIES subset must reconcile exactly after punctuation normalization');
assert(!contractNames.includes('nyeri'),'Nyeri must not enter whole-county P22 eligibility');

assert(inventory.phase==='P22','inventory must belong to P22');
assert(inventory.contract==='data/p22/asal-eligibility-freshness-contract.json','inventory must bind to the P22 freshness contract');
assert(inventory.source?.publisher==='National Drought Management Authority','inventory publisher must be NDMA');
assert(/^https:\/\/knowledgeweb\.ndma\.go\.ke\//.test(inventory.source?.listing_url||''),'county bulletin listing must use the official NDMA knowledgeweb domain');
assert(/^https:\/\/knowledgeweb\.ndma\.go\.ke\//.test(inventory.source?.national_control_url||''),'national control must use the official NDMA knowledgeweb domain');

const rows=inventory.county_bulletins||[];
assert(rows.length===22,`expected 22 county bulletin rows, got ${rows.length}`);
const rowNames=rows.map(r=>norm(r.county)).sort();
assert(new Set(rowNames).size===22,'county bulletin inventory must not contain duplicate counties');
assert(JSON.stringify(rowNames)===JSON.stringify(contractNames),'county bulletin inventory must cover exactly the governed 22 counties');
assert(!rowNames.includes('nyeri'),'Nyeri/Kieni partial evidence must not leak into whole-county inventory');

const asOf=monthIndex(inventory.freshness_policy?.as_of_month);
const latestCounty=monthIndex(inventory.freshness_policy?.latest_county_reference_month_seen);
const latestNational=monthIndex(inventory.freshness_policy?.latest_national_reference_month_seen);
const lag=asOf-latestCounty;
assert(lag===3,`expected June 2026 county evidence to be three months behind September 2026 as-of month, got ${lag}`);
assert(latestNational>latestCounty,'national control should be newer than the county bulletin inventory in this snapshot');
assert(inventory.freshness_policy?.county_freshness_state==='stale','inventory must classify the June county bulletin set as stale');
assert(norm(inventory.freshness_policy?.national_control_treatment).includes('must not be inherited to counties'),'national bulletin must be explicitly barred from county inheritance');

for(const row of rows){
  assert(row.reference_month===inventory.freshness_policy.latest_county_reference_month_seen,`${row.county}: reference month must reconcile to latest county month`);
  assert(row.published_month===inventory.freshness_policy.latest_county_publication_month_seen,`${row.county}: publication month must reconcile to inventory header`);
  assert(row.freshness_state==='stale',`${row.county}: stale source may not be labelled current`);
  assert(row.slot_resolution_effect==='none',`${row.county}: stale inventory must not claim slot resolution`);
  assert(norm(row.bulletin_title).includes(norm(row.county).split(' ')[0]),`${row.county}: bulletin title does not visibly identify the county`);
}

assert((contract.acceptance_guardrails||[]).some(x=>norm(x).includes('no stale drought warning')&&norm(x).includes('current')),'contract must retain the no-stale-warning-as-current guardrail');
assert((contract.eligibility?.anti_inheritance||[]).some(x=>norm(x).includes('national drought state')&&norm(x).includes('county')),'contract must retain national-to-county anti-inheritance');

console.log(`P22_NDMA_FRESHNESS_OK counties=${rows.length} county_reference=${inventory.freshness_policy.latest_county_reference_month_seen} as_of=${inventory.freshness_policy.as_of_month} lag_months=${lag}`);
console.log('P22_ASAL_ELIGIBILITY_OK whole_county=22 partial_nyeri_kieni=excluded');
console.log('P22_NO_STALE_PROMOTION_OK slot_resolution_effect=none national_inheritance=blocked');
