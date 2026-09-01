import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const json=p=>JSON.parse(read(p));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P18-P22 public surface validation: ${msg}`);};

const surface=read('assets/completion-surface.js');
const loader=read('assets/lazy-integrations.js');
const css=read('assets/completion-surface.css');
const summary=json('data/completeness/summary.json');
const roadmap=json('data/data-completion-roadmap.json');
const evidence=json('data/completeness/evidence-states.json');
const indicators=json('data/indicators/registry/indicators.json');
const series=json('data/indicators/registry/series.json');
const geos=json('data/geography/registry/geographies.json');

assert(summary.total_slots===20115,'governed denominator must remain 20,115');
assert(summary.unknown_missing===0,'unknown blanks must remain zero');
for(const id of ['P18','P19','P20','P21','P22']){
  const phase=(roadmap.phases||[]).find(p=>p.id===id);
  assert(phase?.status==='complete',`${id} must be complete before it is labelled complete publicly`);
}
assert((summary.by_completion_phase?.P22||0)===0,'P22 must have no unresolved slots');

const requiredActive=[
  'IND-WATER-ACCESS','IND-INPATIENT-SERVICE-AVAILABILITY',
  'IND-HOUSEHOLDS-CASH-TRANSFER-SOCIAL-ASSISTANCE',
  'IND-HOUSEHOLD-MOTORCYCLE-OWNERSHIP','IND-HOUSEHOLD-CAR-OWNERSHIP',
  'IND-CLASS-C-RURAL-ROAD-LENGTH','IND-COUNTY-OSR','IND-COUNTY-AUDIT-OPINION',
  'IND-HOUSEHOLD-SIZE','IND-DISABILITY-PREVALENCE','IND-HEALTH-FACILITY-DENSITY'
];
const indByCode=new Map(indicators.map(i=>[i.indicator_code,i]));
for(const code of requiredActive){
  const ind=indByCode.get(code);
  assert(ind?.active===true&&ind?.lifecycle_status==='active',`${code} must be active in the canonical registry`);
  assert(surface.includes(code),`${code} must be mapped into the public completion surface`);
}

const p22=['IND-DROUGHT-EARLY-WARNING','IND-FOOD-SECURITY-PHASE','IND-RAINFALL-TEMPERATURE'];
for(const code of p22){
  const state=(evidence.states||[]).find(e=>e.indicator_code===code&&e.status==='official_unavailable');
  assert(state?.geo_codes?.length===22,`${code} must retain exactly 22 governed P22 evidence closures`);
  assert(Boolean(state.refresh_trigger),`${code} must retain a refresh trigger`);
  assert(surface.includes(code),`${code} must be publicly mapped as an evidence state`);
}

const p21Retired=['IND-AGRI-PRODUCTION','IND-EXAM-PERFORMANCE','IND-BUSINESS-LICENSES','IND-FACILITY-INFRASTRUCTURE','IND-HOSPITAL-BED-UTILIZATION','IND-SOCIAL-PROTECTION-BENEFICIARIES','IND-VEHICLE-REGISTRATIONS','IND-ROAD-NETWORK-LENGTH'];
for(const code of p21Retired){
  const state=(evidence.states||[]).find(e=>e.indicator_code===code&&e.status==='retired_replaced');
  assert(state,`${code} must retain an auditable retired/replaced state`);
  assert(surface.includes(code),`${code} replacement decision must be visible publicly`);
}

const countyIds=new Set(geos.filter(g=>g.level==='county').map(g=>g.geography_id));
assert(countyIds.size===47,'canonical county universe must remain 47');
for(const code of requiredActive){
  const ind=indByCode.get(code);if(!ind)continue;
  const coverage=new Set(series.filter(s=>s.indicator_id===ind.indicator_id&&countyIds.has(s.geography_id)&&Number(s.observation_count||0)>0).map(s=>s.geography_id));
  if(['IND-WATER-ACCESS','IND-INPATIENT-SERVICE-AVAILABILITY','IND-HOUSEHOLDS-CASH-TRANSFER-SOCIAL-ASSISTANCE','IND-HOUSEHOLD-MOTORCYCLE-OWNERSHIP','IND-HOUSEHOLD-CAR-OWNERSHIP','IND-CLASS-C-RURAL-ROAD-LENGTH'].includes(code))assert(coverage.size===47,`${code} must retain 47-county published coverage`);
}

assert(loader.includes("loadPlaceProfile"),'Explore must load the registry-driven place profile');
assert(loader.includes("assets/place-profile.js"),'Explore loader must request place-profile.js');
assert(loader.includes("loadCompletionSurface"),'route loader must load the P18-P22 completion surface');
assert(loader.includes("assets/completion-surface.js"),'completion-surface.js must be wired into lazy loading');
for(const path of ['data/completeness/summary.json','data/data-completion-roadmap.json','data/completeness/evidence-states.json'])assert(surface.includes(path),`${path} must be consumed by the public surface`);
for(const mount of ['#profile','#catalogue','#countyiq-view','#compare','#rankings-results'])assert(surface.includes(mount),`${mount} must receive the reconciliation layer`);
assert(surface.includes('Current observation unavailable'),'P22 must be described as unavailable, not assigned a numeric proxy');
assert(surface.includes('Stale NDMA warnings'),'P22 freshness/no-proxy public warning must be present');
assert(!/Number\(e\.(?:value|reason|status)\)/.test(surface),'evidence closure records must not be coerced into numeric values');
assert(css.includes('.kda-evidence-card'),'evidence-state styling must exist');

console.log(`P18_P22_PUBLIC_SURFACE_VALIDATE_OK resolved=${summary.resolved_slots} pct=${summary.resolved_pct} p22=0 county=47`);
