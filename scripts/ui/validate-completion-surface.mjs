import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const json=p=>JSON.parse(read(p));
const assert=(ok,msg)=>{if(!ok)throw new Error(`Public UI governance cleanup validation: ${msg}`);};

const surface=read('assets/completion-surface.js');
const loader=read('assets/lazy-integrations.js');
const browserAudit=read('tests/p16/release-audit.spec.mjs');
const summary=json('data/completeness/summary.json');
const roadmap=json('data/data-completion-roadmap.json');
const evidence=json('data/completeness/evidence-states.json');
const indicators=json('data/indicators/registry/indicators.json');
const series=json('data/indicators/registry/series.json');
const geos=json('data/geography/registry/geographies.json');

// Governance remains authoritative internally.
assert(summary.total_slots===20115,'governed denominator must remain 20,115');
assert(summary.unknown_missing===0,'unknown blanks must remain zero');
for(const id of ['P18','P19','P20','P21','P22']){
  const phase=(roadmap.phases||[]).find(p=>p.id===id);
  assert(phase?.status==='complete',`${id} must remain complete in the internal roadmap`);
}
assert((summary.by_completion_phase?.P22||0)===0,'P22 must retain zero unresolved slots internally');

const countyIds=new Set(geos.filter(g=>g.level==='county').map(g=>g.geography_id));
assert(countyIds.size===47,'canonical county universe must remain 47');
const indByCode=new Map(indicators.map(i=>[i.indicator_code,i]));
for(const code of [
  'IND-WATER-ACCESS','IND-INPATIENT-SERVICE-AVAILABILITY',
  'IND-HOUSEHOLDS-CASH-TRANSFER-SOCIAL-ASSISTANCE',
  'IND-HOUSEHOLD-MOTORCYCLE-OWNERSHIP','IND-HOUSEHOLD-CAR-OWNERSHIP',
  'IND-CLASS-C-RURAL-ROAD-LENGTH'
]){
  const ind=indByCode.get(code);
  assert(ind?.active===true&&ind?.lifecycle_status==='active',`${code} must remain active`);
  const coverage=new Set(series.filter(s=>s.indicator_id===ind.indicator_id&&countyIds.has(s.geography_id)&&Number(s.observation_count||0)>0).map(s=>s.geography_id));
  assert(coverage.size===47,`${code} must retain 47-county published coverage`);
}
for(const code of ['IND-DROUGHT-EARLY-WARNING','IND-FOOD-SECURITY-PHASE','IND-RAINFALL-TEMPERATURE']){
  const state=(evidence.states||[]).find(e=>e.indicator_code===code&&e.status==='official_unavailable');
  assert(state?.geo_codes?.length===22,`${code} must retain exactly 22 governed evidence closures`);
  assert(Boolean(state.refresh_trigger),`${code} must retain its refresh trigger`);
}

// Public rendering is now intentionally decoupled from the completion programme.
for(const selector of ['#kda-data-programme','#kda-p18-p22-profile','#kda-p18-p22-ciq','#kda-completion-compare-note','#kda-completion-ranking-note','.kda-completion-surface']){
  assert(surface.includes(selector),`${selector} must remain on the retirement cleanup list`);
}
assert(surface.includes('phaseToken'),'public cleanup must scrub internal phase tokens from rendered text');
assert(surface.includes('scrubText'),'public cleanup must scrub newly rendered text');
assert(surface.includes("new MutationObserver(cleanup)"),'public cleanup must cover dynamically rendered route content');
assert(!surface.includes('data/completeness/summary.json'),'public cleanup must not rebuild a second metric surface');
assert(!surface.includes('data/data-completion-roadmap.json'),'public cleanup must not expose the internal roadmap');
assert(!surface.includes('data/completeness/evidence-states.json'),'public cleanup must not render governance evidence cards');
assert(loader.includes("loadCompletionSurface"),'route loader must still apply the cleanup guard on governed public routes');
assert(loader.includes("assets/completion-surface.js"),'cleanup guard must remain route-wired');
assert(browserAudit.includes('duplicate governance overlay stay off public surfaces'),'browser regression must cover overlay retirement');
assert(browserAudit.includes("not.toMatch(/\\bP\\d{2}\\b/)"),'browser regression must reject visible phase labels');

console.log(`PUBLIC_UI_GOVERNANCE_CLEANUP_OK resolved=${summary.resolved_slots} pct=${summary.resolved_pct} county=47`);
