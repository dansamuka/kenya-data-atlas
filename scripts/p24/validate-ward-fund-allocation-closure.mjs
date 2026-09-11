import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P24 ward-fund allocation closure validation: ${msg}`);};

const contract=json('data/p24/ward-fund-allocation-closure-contract.json');
const geographies=json('data/geography/registry/geographies.json');
const evidence=json('data/completeness/evidence-states.json');
const ledger=json('data/completeness/slot-ledger.json');
const summary=json('data/completeness/summary.json');
const indicators=json('data/indicators/registry/indicators.json');
const series=json('data/indicators/registry/series.json');
const taxonomy=json('data/indicators/seed/placeholder-taxonomy.json');

assert(contract.schema_version==='kda.p24.ward-fund-allocation-closure.v1','unexpected contract schema');
const wards=geographies.filter(g=>g.level==='ward');
assert(wards.length===1450,`expected 1,450 canonical wards, got ${wards.length}`);
const expectedCodes=new Set(wards.map(g=>g.geo_code));
assert(expectedCodes.size===1450,'ward geo_codes must be unique');

const states=(evidence.states||[]).filter(s=>s.contract_id===contract.contract_id&&s.level==='ward'&&s.indicator_code===contract.indicator_code);
assert(states.length===1,`expected one expanded evidence record, got ${states.length}`);
const state=states[0];
assert(state.status==='not_applicable',`${contract.indicator_code}: must remain not_applicable`);
const stateCodes=new Set(state.geo_codes||[]);
assert(stateCodes.size===1450&&[...expectedCodes].every(code=>stateCodes.has(code)),`${contract.indicator_code}: must cover all 1,450 canonical wards`);
assert(state.reason===contract.reason&&state.period_label===contract.period_label&&state.source===contract.source&&state.source_url===contract.source_url,`${contract.indicator_code}: provenance diverged from contract`);
assert(state.evidence_constraint===contract.evidence_constraint&&state.refresh_trigger===contract.refresh_trigger,`${contract.indicator_code}: evidence constraint/refresh trigger diverged`);

const rows=ledger.rows.filter(r=>r.level==='ward'&&r.indicator_code===contract.indicator_code);
assert(rows.length===1450,`expected 1,450 rendered ward-fund slots, got ${rows.length}`);
assert(rows.every(r=>r.resolved===true&&r.status==='not_applicable'&&r.completion_phase==='complete'),'every ward-fund slot must be governed closed');
assert(rows.every(r=>!r.series_code&&!r.observation_id&&(r.value===''||r.value===null||r.value===undefined)),'closure must not fabricate values or observations');
assert(rows.every(r=>r.reason===contract.reason&&r.period_label===contract.period_label&&r.source===contract.source&&r.source_url===contract.source_url),'rendered provenance mismatch');
assert(new Set(rows.map(r=>r.geo_code)).size===1450,'ward-fund closure must cover 1,450 distinct wards, not a subset repeated');

// The indicator must never be activated with fabricated data: no series may
// exist for this indicator anywhere, and the placeholder-taxonomy note must
// no longer read as an unreviewed "planned" slot.
const ind=indicators.find(i=>i.indicator_code===contract.indicator_code);
assert(ind,`${contract.indicator_code}: indicator missing from registry`);
assert(ind.active===false,`${contract.indicator_code}: must remain inactive; no fabricated national series exists`);
assert(series.every(s=>s.indicator_id!==ind.indicator_id),`${contract.indicator_code}: no canonical series may exist for a not_applicable indicator`);
const def=(taxonomy.indicators||[]).find(i=>i.code===contract.indicator_code);
assert(def&&def.status==='sourced',`${contract.indicator_code}: placeholder-taxonomy status must reflect the reviewed finding (sourced)`);

assert(summary.total_slots===20115,'governed denominator changed');
assert(summary.unknown_missing===0,`unknown_missing=${summary.unknown_missing}`);

console.log(`P24_WARD_FUND_CLOSURE_OK wards=1450 rendered_slots=${rows.length} status=not_applicable contract=${contract.contract_id}`);
