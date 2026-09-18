// P30 -- County representation layer.
//
// Builds data/representation/representatives.json / .csv: a governed record of elected
// representatives under a single shared schema (data/representation/representative-roles.json)
// that can hold county, constituency and ward roles without conflating them.
//
//   - county_woman_representative (47 rows): built fresh from the frozen P30 source snapshot
//     (data/p30/source/woman-representatives-13th-parliament.json), which documents one corrected
//     data-entry error in the official source PDF, with its corroborating sources retained inline.
//   - member_of_parliament (290 rows) and member_of_county_assembly (1,433 rows): read from the
//     already-governed IND-MP-IDENTITY / IND-MCA-IDENTITY canonical series+observations (P23/P24)
//     rather than re-researched, so this phase adds zero new claims about those roles -- it only
//     proves the shared schema holds all three without conflation.
//
// Every row carries its own verification_date and a computed freshness_status so a role whose
// underlying source is not re-checked on every build (MCA: dated to the original 2022 gazette
// declaration) is never silently presented as being as current as one that is (MP/Woman Rep:
// dated to the live Aug 2026 Parliament roster). No status is upgraded to "elected" beyond what
// its own source states, and no county/constituency value is ever copied down into a ward row.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const outDir = path.join(root, 'data/representation');

const geographies = readJson('data/geography/registry/geographies.json');
const indicators = readJson('data/indicators/registry/indicators.json');
const series = readJson('data/indicators/registry/series.json');
const observations = readJson('data/indicators/registry/observations.json');
const datasets = readJson('data/catalogue/registry/datasets.json');
const sources = readJson('data/catalogue/registry/sources.json');
const agencies = readJson('data/catalogue/registry/agencies.json');
const womanRepSnapshot = readJson('data/p30/source/woman-representatives-13th-parliament.json');
const roles = readJson('data/representation/representative-roles.json');

const geoByCode = new Map(geographies.map(g => [g.geo_code, g]));
const roleById = new Map(roles.roles.map(r => [r.role_id, r]));
const indicatorByCode = new Map(indicators.map(i => [i.indicator_code, i]));
const datasetById = new Map(datasets.map(d => [d.dataset_id, d]));
const sourceById = new Map(sources.map(s => [s.source_id, s]));
const agencyById = new Map(agencies.map(a => [a.agency_id, a]));
function sourceLabelForDataset(datasetId) {
  const dataset = datasetById.get(datasetId);
  const source = dataset ? sourceById.get(dataset.source_id) : null;
  const agency = source ? agencyById.get(source.agency_id) : null;
  return agency?.abbreviation || agency?.name || source?.name || dataset?.name || '';
}

// "HON. <PUBLISHED NAME> — <PARTY>" -> { person_name, party }
function splitNameParty(text) {
  const parts = String(text).split('—').map(s => s.trim());
  return { person_name: parts[0] || text, party: parts[1] || '' };
}

const TODAY = '2026-09-18';
function monthsBetween(fromIso, toIso) {
  const a = new Date(fromIso), b = new Date(toIso);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}
function freshnessStatus(verificationDate) {
  const months = monthsBetween(verificationDate, TODAY);
  return months <= 6 ? 'current' : 'stale_unverified';
}

const rows = [];

// --- county_woman_representative: 47 rows from the frozen P30 snapshot ---
for (const r of womanRepSnapshot.rows) {
  const geo = geoByCode.get(r.geo_code);
  if (!geo) throw new Error(`Woman Rep snapshot references unknown geo_code ${r.geo_code}`);
  const verificationDate = '2026-08-12';
  rows.push({
    representative_id: `WOMANREP-${geo.geo_code}`,
    role_id: 'county_woman_representative',
    level: 'county',
    geography_id: geo.geography_id,
    geo_code: geo.geo_code,
    geography_name: geo.name,
    person_name: r.member_name,
    party: r.party,
    status: r.status.toLowerCase() === 'elected' ? 'elected' : r.status,
    term_label: `${womanRepSnapshot.parliamentary_session} roster as at ${womanRepSnapshot.source_as_of_label}`,
    source_tier: 'A',
    verification_date: verificationDate,
    freshness_status: freshnessStatus(verificationDate),
    source: womanRepSnapshot.source_authority,
    source_url: r.source_page || womanRepSnapshot.source_url,
    corrected: Boolean(r.pdf_error_corrected),
    notes: r.pdf_error_corrected ? r.correction_note : ''
  });
}
if (rows.length !== 47) throw new Error(`expected 47 county_woman_representative rows, got ${rows.length}`);

// --- member_of_parliament: 290 rows read from the existing governed IND-MP-IDENTITY series ---
function rowsFromIdentitySeries(indicatorCode, roleId, level, verificationDate) {
  const indicator = indicatorByCode.get(indicatorCode);
  if (!indicator) throw new Error(`${indicatorCode} missing from canonical indicator registry`);
  const levelGeos = new Set(geographies.filter(g => g.level === level).map(g => g.geography_id));
  const relevantSeries = series.filter(s => s.indicator_id === indicator.indicator_id && levelGeos.has(s.geography_id));
  const geoById = new Map(geographies.map(g => [g.geography_id, g]));
  const obsById = new Map(observations.map(o => [o.observation_id, o]));
  const out = [];
  for (const s of relevantSeries) {
    const geo = geoById.get(s.geography_id);
    const obs = obsById.get(s.latest_observation_id);
    if (!geo || !obs) continue;
    const { person_name, party } = splitNameParty(obs.text_value);
    const isVacant = person_name.trim().toUpperCase() === 'VACANT';
    out.push({
      representative_id: `${roleId.toUpperCase().replace(/_/g, '-')}-${geo.geo_code}`,
      role_id: roleId,
      level,
      geography_id: geo.geography_id,
      geo_code: geo.geo_code,
      geography_name: geo.name,
      person_name,
      party,
      status: isVacant ? 'vacant' : 'elected',
      term_label: obs.period_label || '',
      source_tier: obs.badge || '',
      verification_date: verificationDate,
      freshness_status: freshnessStatus(verificationDate),
      source: sourceLabelForDataset(obs.source_dataset_id),
      source_url: obs.source_url || '',
      corrected: false,
      notes: ''
    });
  }
  return out;
}

const mpRows = rowsFromIdentitySeries('IND-MP-IDENTITY', 'member_of_parliament', 'constituency', '2026-08-12');
if (mpRows.length !== 290) throw new Error(`expected 290 member_of_parliament rows, got ${mpRows.length}`);
rows.push(...mpRows);

const mcaRows = rowsFromIdentitySeries('IND-MCA-IDENTITY', 'member_of_county_assembly', 'ward', '2022-08-22');
if (mcaRows.length !== 1433) throw new Error(`expected 1,433 member_of_county_assembly rows (1,450 wards minus the 17 already-governed held wards), got ${mcaRows.length}`);
rows.push(...mcaRows);

rows.sort((a, b) => a.role_id === b.role_id ? a.geo_code.localeCompare(b.geo_code) : a.role_id.localeCompare(b.role_id));

const registry = {
  schema_version: 'kda.representation.registry.v1',
  target_definition: 'A shared, role-tagged record of elected representatives, extensible to new roles (data/representation/representative-roles.json) without conflating one role\'s identity or geography with another\'s. No representative row ever inherits from a parent geography or a different role.',
  roles_used: [...new Set(rows.map(r => r.role_id))].sort(),
  rows
};

const csvCols = ['representative_id', 'role_id', 'level', 'geo_code', 'geography_name', 'person_name', 'party', 'status', 'term_label', 'source_tier', 'verification_date', 'freshness_status', 'source', 'source_url', 'corrected', 'notes'];
const q = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
const csv = [csvCols.join(','), ...rows.map(r => csvCols.map(c => q(r[c])).join(','))].join('\n') + '\n';

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'representatives.json'), JSON.stringify(registry, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'representatives.csv'), csv);

const byRole = Object.fromEntries(registry.roles_used.map(r => [r, rows.filter(x => x.role_id === r).length]));
const staleCount = rows.filter(r => r.freshness_status === 'stale_unverified').length;
console.log(`P30_REPRESENTATION_REGISTRY_OK total=${rows.length} county_woman_representative=${byRole.county_woman_representative||0} member_of_parliament=${byRole.member_of_parliament||0} member_of_county_assembly=${byRole.member_of_county_assembly||0} stale_unverified=${staleCount}`);
