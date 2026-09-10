// P24 ward MCA identity — materialise the two governed `official_unavailable`
// completeness evidence states for the 17 wards the frozen Gazette Notice
// No. 9956 snapshot could not resolve to `direct_official` (10 Mandera
// East/Lafey ward-roster conflict wards + 7 election-postponed wards).
// Idempotent: re-running replaces any prior IND-MCA-IDENTITY|ward states
// rather than duplicating them. Also extends the shared slot-ledger
// validator's official-unavailable reconciliation so these 17 states are
// counted in their own explicit bucket, mirroring the P24 ward-census
// closure precedent (scripts/p24/apply-ward-census-closures.py).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const AS_OF = '2026-09-09';

const snapshot = await readJson('data/p24/source/ward-mca-gazette-9956-2022.json');
const heldConstituencyCodes = new Set(snapshot.held_constituency_codes || []);
const boundaryHeld = snapshot.held_rows.filter(r => heldConstituencyCodes.has(r.constituency_code));
const postponedHeld = snapshot.held_rows.filter(r => !heldConstituencyCodes.has(r.constituency_code));
if (boundaryHeld.length !== 10) throw new Error(`expected 10 Mandera East/Lafey held wards, got ${boundaryHeld.length}`);
if (postponedHeld.length !== 7) throw new Error(`expected 7 election-postponed held wards, got ${postponedHeld.length}`);
const boundaryReasons = new Set(boundaryHeld.map(r => r.disposition_reason));
const postponedReasons = new Set(postponedHeld.map(r => r.disposition_reason));
if (boundaryReasons.size !== 1) throw new Error('boundary-held disposition reasons are not uniform');
if (postponedReasons.size !== 1) throw new Error('postponed-held disposition reasons are not uniform');

const PERIOD_LABEL = 'IEBC Gazette Notice No. 9956, declared 22 Aug 2022';
const SOURCE = 'IEBC Gazette Notice No. 9956 (Kenya Gazette Special Issue Vol. CXXIV No. 170, 24 Aug 2022) — Declaration of Persons Elected as Members of the County Assemblies';
const SOURCE_URL = snapshot.source_url;

const newStates = [
  {
    level: 'ward',
    indicator_code: 'IND-MCA-IDENTITY',
    status: 'official_unavailable',
    geo_codes: boundaryHeld.map(r => r.geo_code).sort(),
    period_label: PERIOD_LABEL,
    source: SOURCE,
    source_url: SOURCE_URL,
    reason: [...boundaryReasons][0],
    as_of: AS_OF,
    evidence_constraint: 'ward_roster_boundary_conflict_no_defensible_crosswalk',
    refresh_trigger: 'IEBC publishes a corrected/reconciled County Assembly Ward roster for Mandera East and Lafey constituencies that maps one-to-one onto the Atlas canonical 2012-vintage ward list, or a subsequent gazette notice resolves the naming conflict.'
  },
  {
    level: 'ward',
    indicator_code: 'IND-MCA-IDENTITY',
    status: 'official_unavailable',
    geo_codes: postponedHeld.map(r => r.geo_code).sort(),
    period_label: PERIOD_LABEL,
    source: SOURCE,
    source_url: SOURCE_URL,
    reason: [...postponedReasons][0],
    as_of: AS_OF,
    evidence_constraint: 'election_postponed_no_declared_winner_in_notice',
    refresh_trigger: 'IEBC gazettes a declaration of the winner for the postponed 9 August 2022 (rerun 29 August 2022, or subsequent) poll in these wards.'
  }
];

const evidencePath = 'data/completeness/evidence-states.json';
const evidence = await readJson(evidencePath);
evidence.states = (evidence.states || []).filter(s => !(s.level === 'ward' && s.indicator_code === 'IND-MCA-IDENTITY'));
evidence.states.push(...newStates);
await writeFile(path.join(root, evidencePath), JSON.stringify(evidence, null, 2) + '\n');

// Extend the shared slot-ledger validator's official-unavailable reconciliation
// so these 17 new IND-MCA-IDENTITY|ward states are counted explicitly.
const validatorPath = 'scripts/completeness/validate-slot-ledger.mjs';
const validatorRaw = await readFile(path.join(root, validatorPath), 'utf8');
const usesCRLF = validatorRaw.includes('\r\n');
let validator = validatorRaw.replace(/\r\n/g, '\n');

const old1 = `const p24CensusCodes=new Set(['IND-POPULATION']);
const p22Unavailable=officialUnavailable.filter(s=>p22Codes.has(s.indicator_code));
const p23CensusUnavailable=officialUnavailable.filter(s=>s.level==='constituency'&&p23CensusCodes.has(s.indicator_code));
const p23EvidenceGapUnavailable=officialUnavailable.filter(s=>s.level==='constituency'&&p23EvidenceGapCodes.has(s.indicator_code));
const p24CensusUnavailable=officialUnavailable.filter(s=>s.level==='ward'&&p24CensusCodes.has(s.indicator_code));
const legacyUnavailable=officialUnavailable.filter(s=>!p22Codes.has(s.indicator_code)&&!(s.level==='constituency'&&(p23CensusCodes.has(s.indicator_code)||p23EvidenceGapCodes.has(s.indicator_code)))&&!(s.level==='ward'&&p24CensusCodes.has(s.indicator_code)));
assert(legacyUnavailable.length===48,\`pre-P22/P23 official-unavailable inventory must remain 48 states, got \${legacyUnavailable.length}\`);
assert(p22Unavailable.length===66,\`P22 terminal snapshot must contribute exactly 66 governed official-unavailable states, got \${p22Unavailable.length}\`);
assert(p23CensusUnavailable.length===580,\`P23 census publication closure must contribute exactly 580 geography/indicator evidence states, got \${p23CensusUnavailable.length}\`);
assert(p23EvidenceGapUnavailable.length===580,\`P23 utilisation/density closure must contribute exactly 580 geography/indicator evidence states, got \${p23EvidenceGapUnavailable.length}\`);
assert(p24CensusUnavailable.length===1450,\`P24 ward census publication closure must contribute exactly 1,450 geography/indicator evidence states, got \${p24CensusUnavailable.length}\`);
assert(officialUnavailable.length===2724,\`official-unavailable evidence inventory must reconcile 48 legacy + 66 P22 + 580 P23 census + 580 P23 evidence gaps + 1450 P24 ward census = 2724, got \${officialUnavailable.length}\`);`;

const new1 = `const p24CensusCodes=new Set(['IND-POPULATION']);
const p24McaIdentityCodes=new Set(['IND-MCA-IDENTITY']);
const p22Unavailable=officialUnavailable.filter(s=>p22Codes.has(s.indicator_code));
const p23CensusUnavailable=officialUnavailable.filter(s=>s.level==='constituency'&&p23CensusCodes.has(s.indicator_code));
const p23EvidenceGapUnavailable=officialUnavailable.filter(s=>s.level==='constituency'&&p23EvidenceGapCodes.has(s.indicator_code));
const p24CensusUnavailable=officialUnavailable.filter(s=>s.level==='ward'&&p24CensusCodes.has(s.indicator_code));
const p24McaIdentityUnavailable=officialUnavailable.filter(s=>s.level==='ward'&&p24McaIdentityCodes.has(s.indicator_code));
const legacyUnavailable=officialUnavailable.filter(s=>!p22Codes.has(s.indicator_code)&&!(s.level==='constituency'&&(p23CensusCodes.has(s.indicator_code)||p23EvidenceGapCodes.has(s.indicator_code)))&&!(s.level==='ward'&&(p24CensusCodes.has(s.indicator_code)||p24McaIdentityCodes.has(s.indicator_code))));
assert(legacyUnavailable.length===48,\`pre-P22/P23 official-unavailable inventory must remain 48 states, got \${legacyUnavailable.length}\`);
assert(p22Unavailable.length===66,\`P22 terminal snapshot must contribute exactly 66 governed official-unavailable states, got \${p22Unavailable.length}\`);
assert(p23CensusUnavailable.length===580,\`P23 census publication closure must contribute exactly 580 geography/indicator evidence states, got \${p23CensusUnavailable.length}\`);
assert(p23EvidenceGapUnavailable.length===580,\`P23 utilisation/density closure must contribute exactly 580 geography/indicator evidence states, got \${p23EvidenceGapUnavailable.length}\`);
assert(p24CensusUnavailable.length===1450,\`P24 ward census publication closure must contribute exactly 1,450 geography/indicator evidence states, got \${p24CensusUnavailable.length}\`);
assert(p24McaIdentityUnavailable.length===17,\`P24 ward MCA identity closure must contribute exactly 17 geography/indicator evidence states, got \${p24McaIdentityUnavailable.length}\`);
assert(officialUnavailable.length===2741,\`official-unavailable evidence inventory must reconcile 48 legacy + 66 P22 + 580 P23 census + 580 P23 evidence gaps + 1450 P24 ward census + 17 P24 ward MCA identity = 2741, got \${officialUnavailable.length}\`);`;

if (validator.includes(old1)) {
  validator = validator.replace(old1, new1);
} else if (!validator.includes(new1)) {
  throw new Error('Expected official-unavailable inventory validator block not found');
}

const old2 = 'console.log(`P18_P22_P23_P24_UNAVAILABLE_RECONCILIATION_OK legacy=${legacyUnavailable.length} p22=${p22Unavailable.length} p23_census=${p23CensusUnavailable.length} p23_evidence_gaps=${p23EvidenceGapUnavailable.length} p24_ward_census=${p24CensusUnavailable.length} total=${officialUnavailable.length}`);';
const new2 = 'console.log(`P18_P22_P23_P24_UNAVAILABLE_RECONCILIATION_OK legacy=${legacyUnavailable.length} p22=${p22Unavailable.length} p23_census=${p23CensusUnavailable.length} p23_evidence_gaps=${p23EvidenceGapUnavailable.length} p24_ward_census=${p24CensusUnavailable.length} p24_ward_mca_identity=${p24McaIdentityUnavailable.length} total=${officialUnavailable.length}`);';
if (validator.includes(old2)) {
  validator = validator.replace(old2, new2);
} else if (!validator.includes(new2)) {
  throw new Error('Expected reconciliation log line not found');
}

if (usesCRLF) validator = validator.replace(/\n/g, '\r\n');
await writeFile(path.join(root, validatorPath), validator);

console.log(`P24_MCA_EVIDENCE_CLOSURES_OK boundary=${boundaryHeld.length} postponed=${postponedHeld.length} total_geo_codes=${boundaryHeld.length + postponedHeld.length}`);
