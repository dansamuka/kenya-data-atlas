import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const write=(p,v)=>fs.writeFileSync(path.join(root,p),v);
const writeJson=(p,v)=>write(p,JSON.stringify(v,null,2)+'\n');
const assert=(ok,msg)=>{if(!ok)throw new Error(`P22 terminal prepare: ${msg}`);};
const norm=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');

const contract=json('data/p22/asal-eligibility-freshness-contract.json');
const closure=json('data/p22/terminal-evidence-closure.json');
const drought=json('data/p22/ndma-county-bulletin-source-inventory.json');
const food=json('data/p22/food-security-source-inventory.json');
const climate=json('data/p22/climate-anomaly-source-inventory.json');
const geographies=json('data/geography/registry/geographies.json');

assert(contract.phase==='P22'&&contract.status==='active_contract','active P22 contract required');
assert(contract.governed_slot_count===66&&contract.slot_math?.eligible_counties===22,'contract must remain 22 counties × 3 families = 66');
assert(closure.phase==='P22'&&closure.as_of==='2026-09-01','terminal closure snapshot/date mismatch');
assert(closure.governed_county_count===22&&closure.governed_slot_count===66,'terminal closure slot math must be 22 × 3 = 66');
assert((closure.families||[]).length===3,'terminal closure must define exactly three families');
assert(drought.freshness_policy?.county_freshness_state==='stale','drought inventory must remain stale at the P22 as-of date');
assert(food.promotion_gate?.status==='blocked_pending_2026_lra_payload','food-security promotion must remain blocked pending deterministic 2026 LRA payload');
assert(climate.promotion_gate?.status==='blocked_pending_direct_county_anomaly_or_governed_spatial_derivation','climate promotion gate must remain blocked');

const counties=geographies.filter(g=>g.level==='county');
const byName=new Map(counties.map(g=>[norm(g.name),g]));
const eligibleNames=contract.eligibility?.whole_county_programme_eligible||[];
assert(eligibleNames.length===22,'contract eligibility list must contain 22 counties');
const eligible=eligibleNames.map(name=>{
  const g=byName.get(norm(name));
  assert(g,`canonical county not found for ${name}`);
  return g;
}).sort((a,b)=>String(a.geo_code).localeCompare(String(b.geo_code)));
const codes=eligible.map(g=>g.geo_code);
assert(new Set(codes).size===22,'eligible county codes must be unique');
assert(!eligible.some(g=>norm(g.name)==='nyeri'),'Nyeri/Kieni partial-ASAL evidence must not enter whole-county closure');

const evidencePath='data/completeness/evidence-states.json';
const evidence=json(evidencePath);
evidence.definition='Explicit resolved states for governed public slots where primary official evidence establishes that the requested observation is unavailable, or where a governed phase decision retires/replaces a weak placeholder. P22 time-sensitive closures may also resolve a snapshot when the exact current county observation is unavailable under explicit freshness, geography or measure-definition contracts. These states never manufacture a zero, proxy, regional inheritance or synthetic observation.';
const indicatorCodes=(closure.families||[]).map(f=>f.indicator_code);
evidence.states=(evidence.states||[]).filter(s=>!(s.level==='county'&&indicatorCodes.includes(s.indicator_code)));
for(const family of closure.families){
  assert(family.status==='official_unavailable',`${family.indicator_code}: terminal status must be official_unavailable`);
  evidence.states.push({
    level:'county',
    geo_codes:codes,
    indicator_code:family.indicator_code,
    status:family.status,
    period_label:family.period_label,
    source:family.source,
    source_url:family.source_url,
    as_of:closure.as_of,
    evidence_constraint:'current_observation_unavailable_under_p22_contract',
    refresh_trigger:family.refresh_trigger,
    reason:family.reason
  });
}
writeJson(evidencePath,evidence);

const roadmapPath='data/data-completion-roadmap.json';
const roadmap=json(roadmapPath);
const p22=(roadmap.phases||[]).find(p=>p.id==='P22');
assert(p22,'P22 roadmap phase missing');
p22.status='complete';
p22.progress={
  ...(p22.progress||{}),
  governed_slots:66,
  resolved_total:66,
  direct_current_observations:0,
  evidence_constrained_current_unavailable:66,
  remaining_slots:0,
  completion_as_of:'2026-09-01',
  completion_note:'P22 closes the September 2026 snapshot through explicit official-unavailable evidence states for all 66 governed slots. NDMA county drought bulletins are stale under the active freshness contract; the 2026 LRA is officially listed but its exact classification payload and validity windows are not deterministically resolved; and fresh KMD material does not publish the exact 22-county numeric anomaly measure. No stale warning, expired IPC phase, national/regional inheritance, station proxy, map-colour reverse engineering or fabricated value is used. Each closure carries a refresh trigger for later official supersession.',
  next_phase:'P23'
};
writeJson(roadmapPath,roadmap);

const planPath='docs/DATA-COMPLETION-PLAN.md';
let plan=read(planPath);
const marker='**P22 terminal snapshot — evidence-constrained completion:**';
if(!plan.includes(marker)){
  plan += `\n\n${marker} as of **1 September 2026**, all **66** governed ASAL resilience slots are resolved through explicit evidence states rather than fabricated current values. The 22 whole-county eligibility set remains fixed and Nyeri/Kieni remains partial/excluded. NDMA June 2026 county drought bulletins are stale under the two-month freshness tolerance; the officially listed 2026 Long Rains Assessment is not promoted until its exact county classification payload and validity intervals are deterministically resolved; and KMD August 2026 products do not directly publish the exact governed 22-county numeric rainfall/temperature anomaly series. P22 therefore closes with **0 current numeric/categorical promotions and 66 evidence-constrained official-unavailable states**, each carrying a refresh trigger. **P22 queue: 0. P22 complete.**\n`;
  write(planPath,plan);
}

console.log(`P22_TERMINAL_PREPARE_OK counties=${codes.length} families=${closure.families.length} closures=${codes.length*closure.families.length} nyeri=excluded`);
