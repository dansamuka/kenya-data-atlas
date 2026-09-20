// P34 -- Public-product exposure: per-geography local-54 profile subsets.
//
// Builds data/local-54-profiles/<geo_code>.json -- one small, client-fetchable file per
// county/constituency/ward (47 + 290 + 1,450 = 1,787 files) exposing all 54 governed local
// indicators for that exact geography, plus its representation record. This exists because
// data/completeness/local-54-slot-ledger.json (the full 96,498-row cross-product) is ~65MB and
// cannot be fetched client-side for a single page view; each subset here is the ~54 rows relevant
// to one geography, with closure reasons resolved from the shared reason catalogue rather than
// duplicated inline.
//
// Deliberately NOT under data/distribution/: scripts/distribution/build-distribution.mjs does a
// full fs.rmSync of that whole directory before rebuilding only the subfolders it manages
// (subsets/counties, subsets/indicators) -- placing this output there would make it collateral
// damage of an unrelated rebuild every time npm run build:data runs.
//
// Every row keeps its status visible (unavailable/not_applicable are never omitted) and maps to
// the public badge vocabulary docs/governance/data-quality-framework.md requires: Official;
// Derived from official data; Secondary -- verified; Secondary -- corroborated; Probable value --
// sources conflict; Estimated/modelled; Data unavailable; Not applicable.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const outDir = path.join(root, 'data/local-54-profiles');

const ledger = readJson('data/completeness/local-54-slot-ledger.json');
const reasonCatalogue = readJson('data/completeness/local-54-reason-catalogue.json');
const candidateObservations = readJson('data/evidence/candidate-observations.json');
const conflictDecisions = readJson('data/evidence/conflict-decisions.json');
const representatives = readJson('data/representation/representatives.json');
const geographies = readJson('data/geography/registry/geographies.json');

const reasonById = new Map(reasonCatalogue.reasons.map(r => [r.reason_id, r]));
const repsByGeoCode = new Map();
for (const rep of representatives.rows) {
  if (!repsByGeoCode.has(rep.geo_code)) repsByGeoCode.set(rep.geo_code, []);
  repsByGeoCode.get(rep.geo_code).push(rep);
}

// Cross-reference: for any (indicator_code, geo_code) that has a conflict decision, expose an
// inspectable conflict-history note even though today's published value is not itself S4 -- the
// one seeded case (IND-CLASS-C-RURAL-ROAD-LENGTH) recorded a candidate that was investigated and
// rejected, not one that was published as a probable value.
const conflictNoteByCell = new Map();
const candidateGroupById = new Map(candidateObservations.candidate_groups.map(g => [g.group_id, g]));
for (const decision of conflictDecisions.decisions) {
  for (const groupId of decision.group_ids) {
    const group = candidateGroupById.get(groupId);
    if (!group) continue;
    const key = `${group.level}|${group.geo_code}|${group.indicator_code}`;
    const rejected = group.candidates.find(c => c.status !== 'published');
    conflictNoteByCell.set(key, {
      decision_id: decision.decision_id,
      conflict_type: decision.conflict_type,
      confidence: decision.confidence,
      summary: `A competing candidate value was investigated and rejected: ${rejected?.source_label || 'a secondary source'} suggested ${rejected?.value ?? '(no value)'} ${rejected?.unit || ''}, but failed the required reconciliation check against the official value. The official value published here was retained; the rejected candidate was not published as a probable value.`,
      rationale: decision.rationale,
      source_contract: decision.source_contract
    });
  }
}

function badgeLabelFor(status) {
  switch (status) {
    case 'published_direct': return 'Official';
    case 'published_derived': return 'Derived from official data';
    case 'published_modelled': return 'Estimated/modelled';
    case 'external_verified': return 'Secondary — verified';
    case 'not_applicable': return 'Not applicable';
    case 'official_unavailable':
    case 'governed_unavailable':
    case 'boundary_unresolved':
    default:
      return 'Data unavailable';
  }
}
function confidenceFor(status, conflictNote) {
  if (conflictNote) return conflictNote.confidence;
  switch (status) {
    case 'published_direct': return 'high';
    case 'published_derived': return 'high';
    case 'published_modelled': return 'medium';
    case 'external_verified': return 'medium';
    default: return 'n/a';
  }
}

const rowsByGeoCode = new Map();
for (const row of ledger.rows) {
  if (!rowsByGeoCode.has(row.geo_code)) rowsByGeoCode.set(row.geo_code, []);
  rowsByGeoCode.get(row.geo_code).push(row);
}

const geoByCode = new Map(geographies.map(g => [g.geo_code, g]));

fs.mkdirSync(outDir, { recursive: true });
let fileCount = 0;
const manifestEntries = [];

for (const [geoCode, rows] of rowsByGeoCode) {
  const geo = geoByCode.get(geoCode);
  if (!geo || !['county', 'constituency', 'ward'].includes(geo.level)) continue;

  // Closure rows (official_unavailable/governed_unavailable/not_applicable/boundary_unresolved)
  // carry only reason_id, not the full reason/source/source_url/period_label text: those fields
  // are shared verbatim across most geographies for a given indicator (the same national-source
  // limitation applies everywhere it applies), so inlining them per geography would reproduce the
  // exact duplication problem data/completeness/local-54-reason-catalogue.json already exists to
  // avoid (see kenya-data-atlas-anti-fabrication-patterns memory point 3). The client fetches the
  // ~340KB shared catalogue once and resolves reason_id locally.
  const indicators = rows.map(row => {
    const conflictNote = conflictNoteByCell.get(`${row.level}|${row.geo_code}|${row.indicator_code}`) || null;
    const badgeLabel = badgeLabelFor(row.status);
    const isClosure = !['published_direct', 'published_derived', 'published_modelled', 'external_verified'].includes(row.status);
    if (isClosure && row.reason_id && !reasonById.has(row.reason_id)) throw new Error(`${row.geo_code}/${row.indicator_code}: reason_id ${row.reason_id} not found in the reason catalogue`);
    return {
      indicator_code: row.indicator_code,
      indicator_name: row.indicator_name,
      treatment_class: row.treatment_class,
      status: row.status,
      badge_label: badgeLabel,
      value: isClosure ? null : row.value,
      period_label: isClosure ? null : (row.period_label || null),
      source: isClosure ? null : (row.source || null),
      source_url: isClosure ? null : (row.source_url || null),
      reason_id: isClosure ? (row.reason_id || null) : null,
      confidence: confidenceFor(row.status, conflictNote),
      conflict_note: conflictNote
    };
  }).sort((a, b) => a.indicator_code.localeCompare(b.indicator_code));

  const representative = (repsByGeoCode.get(geoCode) || []).map(r => ({
    role_id: r.role_id,
    person_name: r.person_name,
    party: r.party,
    status: r.status,
    term_label: r.term_label,
    source_tier: r.source_tier,
    verification_date: r.verification_date,
    freshness_status: r.freshness_status,
    source: r.source,
    source_url: r.source_url
  }));

  const subset = {
    schema_version: 'kda.p34.local-54-profile-subset.v1',
    geography: { geo_code: geo.geo_code, name: geo.name, level: geo.level, parent_id: geo.parent_id || null },
    indicator_count: indicators.length,
    representative,
    indicators
  };
  fs.writeFileSync(path.join(outDir, `${geoCode}.json`), JSON.stringify(subset, null, 2) + '\n');
  fileCount++;
  manifestEntries.push({ geo_code: geoCode, level: geo.level, name: geo.name });
}

manifestEntries.sort((a, b) => a.geo_code.localeCompare(b.geo_code));
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({
  schema_version: 'kda.p34.local-54-profile-subset-manifest.v1',
  file_count: fileCount,
  geographies: manifestEntries
}, null, 2) + '\n');

console.log(`P34_LOCAL54_PROFILE_SUBSETS_BUILD_OK files=${fileCount}`);
