import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P24 ward voters boundary hold validation: ${msg}`);};

const contract=json('data/p24/ward-voters-boundary-hold-contract.json');
const geographies=json('data/geography/registry/geographies.json');
const evidence=json('data/completeness/evidence-states.json');
const ledger=json('data/completeness/slot-ledger.json');
const summary=json('data/completeness/summary.json');
const indicators=json('data/indicators/registry/indicators.json');
const series=json('data/indicators/registry/series.json');

assert(contract.schema_version==='kda.p24.ward-voters-boundary-hold.v1','unexpected contract schema');
const held=geographies.filter(g=>g.level==='ward'&&Number(g.county_code)===contract.county_code&&(contract.held_constituency_codes||[]).includes(Number(g.constituency_code)));
assert(held.length===contract.expected_held_wards,`expected ${contract.expected_held_wards} held wards, got ${held.length}`);
const expectedCodes=new Set(held.map(g=>g.geo_code));
assert(expectedCodes.size===10,'held ward geo_codes must be unique');

const states=(evidence.states||[]).filter(s=>s.contract_id===contract.contract_id&&s.level==='ward'&&s.indicator_code===contract.indicator_code);
assert(states.length===1,`expected one expanded evidence record, got ${states.length}`);
const state=states[0];
assert(state.status==='boundary_unresolved',`${contract.indicator_code}: must remain boundary_unresolved`);
const stateCodes=new Set(state.geo_codes||[]);
assert(stateCodes.size===10&&[...expectedCodes].every(code=>stateCodes.has(code)),`${contract.indicator_code}: must cover exactly the ten Mandera East/Lafey wards`);
assert(state.reason===contract.reason&&state.period_label===contract.period_label&&state.source===contract.source&&state.source_url===contract.source_url,`${contract.indicator_code}: provenance diverged from contract`);
assert(state.evidence_constraint===contract.evidence_constraint&&state.refresh_trigger===contract.refresh_trigger,`${contract.indicator_code}: evidence constraint/refresh trigger diverged`);

const rows=ledger.rows.filter(r=>r.level==='ward'&&r.indicator_code===contract.indicator_code&&expectedCodes.has(r.geo_code));
assert(rows.length===30,`expected 30 rendered voter slots (10 wards x 3 tabs), got ${rows.length}`);
assert(rows.every(r=>r.resolved===true&&r.status==='boundary_unresolved'&&r.completion_phase==='complete'),'every held ward-voter slot must be governed closed');
assert(rows.every(r=>!r.series_code&&!r.observation_id&&(r.value===''||r.value===null||r.value===undefined)),'boundary hold must not fabricate values or observations');
assert(rows.every(r=>r.reason===contract.reason&&r.period_label===contract.period_label&&r.source===contract.source&&r.source_url===contract.source_url),'rendered provenance mismatch');
assert(new Set(rows.map(r=>r.geo_code)).size===10,'closure must cover exactly ten distinct wards');

// Cross-check against the audited P23X materialisation: the ten held wards
// must remain exactly the wards with no published IND-REGISTERED-VOTERS
// series, and the other 1,440 wards must remain untouched by this closure.
const ind=indicators.find(i=>i.indicator_code===contract.indicator_code);
assert(ind,`${contract.indicator_code}: indicator missing from registry`);
const publishedGeoIds=new Set(series.filter(s=>s.indicator_id===ind.indicator_id).map(s=>s.geography_id));
const heldGeoIds=new Set(held.map(g=>g.geography_id));
assert([...heldGeoIds].every(id=>!publishedGeoIds.has(id)),'a held Mandera East/Lafey ward unexpectedly already has a published voter series');
const wards=geographies.filter(g=>g.level==='ward');
assert(wards.length===1450,`expected 1,450 canonical wards, got ${wards.length}`);
const otherWards=wards.filter(g=>!heldGeoIds.has(g.geography_id));
assert(otherWards.length===1440,'held/published ward partition must remain 10/1,440');
assert(otherWards.every(g=>publishedGeoIds.has(g.geography_id)),'every non-held ward must already carry a published registered-voters series');

assert(summary.total_slots===20115,'governed denominator changed');
assert(summary.unknown_missing===0,`unknown_missing=${summary.unknown_missing}`);

console.log(`P24_WARD_VOTERS_BOUNDARY_HOLD_OK held_wards=10 rendered_slots=${rows.length} status=boundary_unresolved contract=${contract.contract_id}`);
