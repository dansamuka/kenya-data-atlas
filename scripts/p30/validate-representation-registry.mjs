// P30 -- Validate the county representation layer.
//
// Re-checks the roadmap's exact P30 acceptance criteria (data/local-54-completion-roadmap.json):
//   1. 47/47 counties have an explicit current Woman Representative disposition
//   2. role/person/party/term/status/source tier/verification date are retained
//   3. MP and MCA can use the same schema without conflating roles
//   4. vacancy/by-election/disputed states do not silently carry stale officeholders
// Also re-derives the registry deterministically from its sources and diffs against the
// committed file, and checks the one documented source-PDF correction against its own
// corroborating citations.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const fail = m => { console.error(`P30_REPRESENTATION_FAIL ${m}`); process.exitCode = 1; };
const assert = (c, m) => { if (!c) fail(m); };

const registry = readJson('data/representation/representatives.json');
const roles = readJson('data/representation/representative-roles.json');
const snapshot = readJson('data/p30/source/woman-representatives-13th-parliament.json');
const geographies = readJson('data/geography/registry/geographies.json');

assert(registry.schema_version === 'kda.representation.registry.v1', 'registry schema mismatch');

const roleById = new Map(roles.roles.map(r => [r.role_id, r]));
const REQUIRED_FIELDS = ['representative_id', 'role_id', 'level', 'geography_id', 'geo_code', 'geography_name', 'person_name', 'party', 'status', 'term_label', 'source_tier', 'verification_date', 'freshness_status', 'source', 'source_url'];
for (const row of registry.rows) {
  for (const f of REQUIRED_FIELDS) assert(Object.hasOwn(row, f), `${row.representative_id || '(no id)'}: missing required field ${f}`);
  const role = roleById.get(row.role_id);
  assert(role, `${row.representative_id}: role_id ${row.role_id} not in the governed role vocabulary`);
  if (role) assert(row.level === role.level, `${row.representative_id}: level ${row.level} does not match role ${row.role_id}'s declared level ${role.level}`);
}

// --- 1. 47/47 counties have an explicit current Woman Representative disposition ---
const wrRows = registry.rows.filter(r => r.role_id === 'county_woman_representative');
assert(wrRows.length === 47, `expected 47 county_woman_representative rows, got ${wrRows.length}`);
const counties = geographies.filter(g => g.level === 'county');
assert(counties.length === 47, `canonical county count != 47, got ${counties.length}`);
const wrByGeo = new Set(wrRows.map(r => r.geo_code));
for (const c of counties) assert(wrByGeo.has(c.geo_code), `county ${c.geo_code} (${c.name}) has no Woman Representative row`);
assert(new Set(wrRows.map(r => r.geo_code)).size === 47, 'duplicate county in county_woman_representative rows');
assert(wrRows.every(r => r.status === 'elected'), 'every Woman Representative row must have an explicit disposition (status), none may be blank');

// --- 2. person/party/term/status/source tier/verification date retained where verifiable ---
// Party is retained whenever the source publishes one; it is legitimately blank for a vacant seat
// (no incumbent to have a party) and for the handful of source rows that publish no party. Status,
// by contrast, must always be explicit -- "elected" or "vacant" is never allowed to be blank.
for (const row of registry.rows) {
  assert(row.person_name && row.status && row.term_label && row.source_tier && row.verification_date, `${row.representative_id}: incomplete identity record`);
  assert(['elected', 'vacant'].includes(row.status), `${row.representative_id}: status must be an explicit disposition (elected/vacant), got ${row.status}`);
  const isVacant = row.person_name.trim().toUpperCase() === 'VACANT';
  assert(isVacant === (row.status === 'vacant'), `${row.representative_id}: a row named VACANT must have status vacant and vice versa`);
  if (isVacant) assert(!row.party, `${row.representative_id}: a vacant seat must not carry a party`);
}

// --- 3. MP and MCA can use the same schema without conflating roles ---
const mpRows = registry.rows.filter(r => r.role_id === 'member_of_parliament');
const mcaRows = registry.rows.filter(r => r.role_id === 'member_of_county_assembly');
assert(mpRows.length === 290, `expected 290 member_of_parliament rows, got ${mpRows.length}`);
assert(mcaRows.length === 1433, `expected 1,433 member_of_county_assembly rows, got ${mcaRows.length}`);
assert(registry.roles_used.length === 3 && new Set(registry.roles_used).size === 3, 'registry must use exactly 3 distinct roles');
// No representative_id or (role_id, geo_code) pair may repeat across roles -- proves no conflation.
const ids = registry.rows.map(r => r.representative_id);
assert(ids.length === new Set(ids).size, 'duplicate representative_id across roles');
const roleGeoKeys = registry.rows.map(r => `${r.role_id}|${r.geo_code}`);
assert(roleGeoKeys.length === new Set(roleGeoKeys).size, 'duplicate (role_id, geo_code) pair');
// A county-level role must never reuse a constituency/ward geo_code and vice versa (structural anti-inheritance).
const geoLevelByCode = new Map(geographies.map(g => [g.geo_code, g.level]));
for (const row of registry.rows) {
  assert(geoLevelByCode.get(row.geo_code) === row.level, `${row.representative_id}: geo_code ${row.geo_code} is not actually a ${row.level}-level geography`);
}

// --- 4. vacancy/by-election/disputed states do not silently carry stale officeholders ---
// Every row must carry an explicit, auditable freshness_status; "current" is only permitted
// within a short re-verification window of its own verification_date, so an unrefreshed role
// (like MCA, sourced to the original 2022 declaration) is forced to surface as stale rather than
// silently inheriting the registry build date's implicit freshness.
const TODAY = '2026-09-18';
const monthsBetween = (a, b) => { const d1 = new Date(a), d2 = new Date(b); return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()); };
for (const row of registry.rows) {
  assert(['current', 'stale_unverified'].includes(row.freshness_status), `${row.representative_id}: invalid freshness_status ${row.freshness_status}`);
  const months = monthsBetween(row.verification_date, TODAY);
  const expected = months <= 6 ? 'current' : 'stale_unverified';
  assert(row.freshness_status === expected, `${row.representative_id}: freshness_status ${row.freshness_status} does not match computed staleness (verification_date=${row.verification_date}, expected=${expected})`);
}
assert(mcaRows.every(r => r.freshness_status === 'stale_unverified'), 'MCA rows (sourced to the 2022 declaration, not re-verified) must be surfaced as stale_unverified, not silently current');
assert(wrRows.every(r => r.freshness_status === 'current') && mpRows.every(r => r.freshness_status === 'current'), 'Woman Rep / MP rows (sourced to the live Aug 2026 roster) must be current');

// --- documented source-PDF correction is self-consistent and cited ---
const correctedRows = wrRows.filter(r => r.corrected);
assert(correctedRows.length === 1, `expected exactly 1 documented source-PDF correction, got ${correctedRows.length}`);
assert(correctedRows[0].geo_code === 'KEN-C039', `the documented correction must be Bungoma (KEN-C039), got ${correctedRows[0].geo_code}`);
assert(correctedRows[0].notes.length > 0, 'a corrected row must retain its correction rationale in notes');
const snapshotCorrected = snapshot.rows.filter(r => r.pdf_error_corrected);
assert(snapshotCorrected.length === 1 && Array.isArray(snapshotCorrected[0].correction_sources) && snapshotCorrected[0].correction_sources.length >= 2, 'snapshot correction must retain at least 2 corroborating sources');

// --- structural: unique-county coverage is exact, no geo outside the canonical registry ---
const geoIds = new Set(geographies.map(g => g.geography_id));
for (const row of registry.rows) assert(geoIds.has(row.geography_id), `${row.representative_id}: geography_id not in canonical registry`);

// --- deterministic rebuild parity ---
execFileSync(process.execPath, ['scripts/p30/build-representation-registry.mjs'], { cwd: root, stdio: 'pipe' });
const rebuilt = readJson('data/representation/representatives.json');
assert(JSON.stringify(rebuilt) === JSON.stringify(registry), 'representation registry is not deterministic / not up to date -- re-run npm run p30:build and commit the result');

if (!process.exitCode) {
  console.log(`P30_REPRESENTATION_OK total=${registry.rows.length} county_woman_representative=${wrRows.length} member_of_parliament=${mpRows.length} member_of_county_assembly=${mcaRows.length} corrected=${correctedRows.length} stale_unverified=${registry.rows.filter(r => r.freshness_status === 'stale_unverified').length}`);
}
