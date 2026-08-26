// Canonical geography validator.
//
// Design note: the previous version checked that codes were UNIQUE and that parent
// relationships resolved. Both held true for a constituency whose code was the string
// "NaN", so the defect passed. Uniqueness is not well-formedness, and a complete
// hierarchy is not a complete SEQUENCE. Every assertion below exists because its
// absence let a real defect through.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const readOptional = async file => read(file).catch(() => null);

const registry = await read('data/geography/registry/geographies.json');
const aliases = await read('data/geography/registry/aliases.json');
const geometryVersions = await read('data/geography/registry/geometry-versions.json');
const geometryReport = await read('data/geography/geometry-validation-report.json');
const derivedReport = await read('data/geography/derived-geometry-report.json');

const expected = { country: 1, county: 47, constituency: 290, ward: 1450 };
const BOUNDARY_VERSION = '2012-01';
const errors = [];
const notes = [];

const ids = new Set(registry.map(g => g.geography_id));
const codes = new Set(registry.map(g => g.geo_code));

// ---------------------------------------------------------------- identity
if (ids.size !== registry.length) errors.push('Duplicate geography_id');
if (codes.size !== registry.length) errors.push('Duplicate geo_code');
for (const [level, count] of Object.entries(expected)) {
  if (registry.filter(g => g.level === level).length !== count) errors.push(`${level}: expected ${count}`);
}

// ------------------------------------------------------- code well-formedness
// A code must be structurally valid, not merely unique. "KEN-C030-CONNaN" was unique.
const codePattern = {
  country: /^KEN$/,
  county: /^KEN-C\d{3}$/,
  constituency: /^KEN-C\d{3}-CON\d{3}$/,
  ward: /^KEN-C\d{3}-CON\d{3}-W\d{4}$/
};
for (const geo of registry) {
  if (!codePattern[geo.level].test(geo.geo_code)) errors.push(`${geo.geo_code}: malformed geo_code for level ${geo.level}`);
}

// Identifier columns must be positive integers, and the code embedded in geo_code must
// agree with the numeric column. A mismatch means the code was built from stale input.
const order = ['county', 'constituency', 'ward'];
for (const geo of registry) {
  for (const [field, level] of [['county_code', 'county'], ['constituency_code', 'constituency'], ['ward_code', 'ward']]) {
    if (order.indexOf(geo.level) < order.indexOf(level) || geo.level === 'country') continue;
    const value = geo[field];
    if (!Number.isInteger(value) || value <= 0) errors.push(`${geo.geo_code}: ${field} must be a positive integer, found ${JSON.stringify(value)}`);
  }
  const parts = geo.geo_code.match(/^KEN(?:-C(\d{3}))?(?:-CON(\d{3}))?(?:-W(\d{4}))?$/);
  if (parts) {
    if (parts[1] && Number(parts[1]) !== geo.county_code) errors.push(`${geo.geo_code}: county_code ${geo.county_code} disagrees with geo_code`);
    if (parts[2] && Number(parts[2]) !== geo.constituency_code) errors.push(`${geo.geo_code}: constituency_code ${geo.constituency_code} disagrees with geo_code`);
    if (parts[3] && Number(parts[3]) !== geo.ward_code) errors.push(`${geo.geo_code}: ward_code ${geo.ward_code} disagrees with geo_code`);
  }
}

// ------------------------------------------------------- sequence completeness
// The set of identifiers must be exactly 1..N with no gaps. A gap means a record was
// dropped or its identifier failed to parse.
for (const [level, field, count] of [['county', 'county_code', 47], ['constituency', 'constituency_code', 290], ['ward', 'ward_code', 1450]]) {
  const values = new Set(registry.filter(g => g.level === level).map(g => g[field]).filter(Number.isInteger));
  const missing = [];
  for (let i = 1; i <= count; i += 1) if (!values.has(i)) missing.push(i);
  if (missing.length) errors.push(`${level}: ${field} is not a complete 1..${count} sequence; missing ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', …' : ''}`);
  if (values.size !== registry.filter(g => g.level === level).length) errors.push(`${level}: ${field} contains duplicates`);
}

// ------------------------------------------------------------- name hygiene
// Double-spaced names break normalised matching and propagate into slugs and aliases.
for (const geo of registry) {
  if (/\s{2,}/.test(geo.name) || geo.name !== geo.name.trim()) errors.push(`${geo.geo_code}: name has irregular whitespace: ${JSON.stringify(geo.name)}`);
  if (!geo.name.trim()) errors.push(`${geo.geo_code}: empty name`);
}

// ------------------------------------------------------------- hierarchy
const byId = new Map(registry.map(g => [g.geography_id, g]));
for (const geo of registry) {
  if (geo.level === 'country' ? geo.parent_id !== null : !ids.has(geo.parent_id)) errors.push(`${geo.geo_code}: invalid parent`);
  if (!geo.name || !geo.slug || !geo.source_id || !geo.registry_status) errors.push(`${geo.geo_code}: missing required metadata`);
  const parent = byId.get(geo.parent_id);
  if (parent && (geo.level === 'constituency' || geo.level === 'ward') && parent.county_code !== geo.county_code) {
    errors.push(`${geo.geo_code}: county_code disagrees with parent ${parent.geo_code}`);
  }
}
for (const level of ['county', 'constituency', 'ward']) {
  const seen = new Set();
  for (const geo of registry.filter(g => g.level === level)) {
    const key = `${geo.parent_id}:${geo.slug}`;
    if (seen.has(key)) errors.push(`${geo.geo_code}: duplicate sibling slug ${geo.slug}`);
    seen.add(key);
  }
}
const constituencyCodes = new Set(registry.filter(g => g.level === 'constituency').map(g => g.constituency_code));
for (const ward of registry.filter(g => g.level === 'ward')) {
  if (!constituencyCodes.has(ward.constituency_code)) errors.push(`${ward.geo_code}: invalid constituency code`);
}

// ------------------------------------------------------------- aliases
const aliasKeys = new Set();
for (const alias of aliases) {
  if (!ids.has(alias.geography_id)) errors.push(`${alias.alias_id}: orphan alias`);
  const key = `${alias.geography_id}:${alias.normalized_alias}`;
  if (aliasKeys.has(key)) errors.push(`${alias.alias_id}: duplicate normalized alias`);
  if (/\s{2,}/.test(alias.normalized_alias)) errors.push(`${alias.alias_id}: normalized alias has irregular whitespace`);
  aliasKeys.add(key);
}
if (!aliases.some(a => a.normalized_alias === 'muranga')) errors.push('Muranga search alias missing');

// --------------------------------------------------------- boundary versions
if (geometryVersions.length !== registry.length) errors.push('Every geography must have a boundary-version tracking record');
const validQuality = new Set(['validated_external', 'validated_external_with_review', 'provisional', 'derived_validated', 'derived_provisional']);
for (const geometry of geometryVersions) {
  if (!ids.has(geometry.geography_id)) errors.push(`${geometry.geometry_id}: orphan geometry version`);
  if (!geometry.source_id || !geometry.source_url) errors.push(`${geometry.geometry_id}: incomplete boundary lineage`);
  // boundary_version records the legal delimitation ERA, never the source file.
  // Provenance lives in geometry_source_id + geometry_revision so that improving the
  // coordinates does not falsely imply the boundaries changed.
  if (geometry.boundary_version !== BOUNDARY_VERSION) errors.push(`${geometry.geometry_id}: boundary_version must be the delimitation era ${BOUNDARY_VERSION}, found ${JSON.stringify(geometry.boundary_version)}`);
  if (!geometry.geometry_source_id) errors.push(`${geometry.geometry_id}: geometry_source_id is required to separate provenance from boundary era`);
  if (!Number.isInteger(geometry.geometry_revision)) errors.push(`${geometry.geometry_id}: geometry_revision must be an integer`);
  if (!validQuality.has(geometry.quality_status)) errors.push(`${geometry.geometry_id}: unexpected quality_status ${JSON.stringify(geometry.quality_status)}`);
  if (geometry.source_crs !== 'EPSG:4326' || !/^[a-f0-9]{64}$/.test(geometry.geometry_hash)) errors.push(`${geometry.geometry_id}: invalid CRS or geometry hash`);
}
// A flat quality label across every record means the label is decorative.
if (new Set(geometryVersions.map(g => g.quality_status)).size < 2) {
  errors.push('quality_status is identical across all geometry versions; it must be derived from match method and measured containment');
}

// ------------------------------------------------------------- reports
if (geometryReport.status !== 'pass' || geometryReport.errors.length) errors.push('Geometry ingest report must pass without errors');
if (derivedReport.status !== 'pass' || derivedReport.errors.length) errors.push('Derived geometry report must pass without errors');
for (const level of Object.values(derivedReport.levels)) {
  if ((level.nesting_failures ?? []).length) errors.push('Derived geometry must contain its children exactly');
}
for (const level of Object.values(geometryReport.levels)) {
  if ((level.unresolved_duplicate_matches ?? []).length) errors.push('Unresolved duplicate source matches must be resolved before publication');
  if ((level.degenerate_polygons ?? []).length) errors.push('Degenerate polygons must not be published');
}

// ------------------------------------------------------------- geometry files
const geometryFiles = { country: 'country.geojson', county: 'counties.geojson', constituency: 'constituencies.geojson', ward: 'wards.geojson' };
const ringArea = ring => ring.slice(0, -1).reduce((sum, point, index) => {
  const next = ring[(index + 1) % (ring.length - 1)];
  return sum + point[0] * next[1] - next[0] * point[1];
}, 0) / 2;
const multiPolygonArea = geometry => Math.abs(geometry.coordinates.reduce((total, polygon) =>
  total + polygon.reduce((sum, ring, index) => sum + (index === 0 ? Math.abs(ringArea(ring)) : -Math.abs(ringArea(ring))), 0), 0));

for (const [level, file] of Object.entries(geometryFiles)) {
  const collection = await read(`data/geography/geometry/${file}`);
  if (collection.type !== 'FeatureCollection' || collection.features.length !== expected[level]) errors.push(`${file}: expected ${expected[level]} features`);
  for (const feature of collection.features) {
    if (!ids.has(feature.properties.geography_id) || feature.geometry.type !== 'MultiPolygon') errors.push(`${file}: invalid feature identity or geometry type`);
    if (feature.properties.boundary_version !== BOUNDARY_VERSION) errors.push(`${file}: ${feature.properties.geo_code} missing boundary_version ${BOUNDARY_VERSION}`);
    if (multiPolygonArea(feature.geometry) < 1e-5) errors.push(`${file}: ${feature.properties.geo_code} is a degenerate polygon`);
    for (const polygon of feature.geometry.coordinates) {
      for (const ring of polygon) {
        if (ring.length < 4) errors.push(`${file}: ${feature.properties.geo_code} has a ring with fewer than 4 points`);
        const [fx, fy] = ring[0]; const [lx, ly] = ring[ring.length - 1];
        if (fx !== lx || fy !== ly) errors.push(`${file}: ${feature.properties.geo_code} has an unclosed ring`);
      }
    }
    const version = geometryVersions.find(item => item.geography_id === feature.properties.geography_id);
    const hash = createHash('sha256').update(JSON.stringify(feature.geometry)).digest('hex');
    if (!version || version.geometry_hash !== hash) errors.push(`${file}: geometry hash mismatch for ${feature.properties.geo_code}`);
  }
  const present = new Set(collection.features.map(f => f.properties.geography_id));
  for (const geo of registry.filter(g => g.level === level)) {
    if (!present.has(geo.geography_id)) errors.push(`${file}: missing geometry for ${geo.geo_code}`);
  }
}

// --------------------------------------------------- corrections are recorded
const corrections = await readOptional('data/geography/registry/applied-corrections.json');
if (corrections?.applied?.length) {
  notes.push(`${new Set(corrections.applied.map(c => c.correction_id)).size} recorded source correction(s) applied: ${[...new Set(corrections.applied.map(c => `${c.correction_id} ${c.name} ${c.field}`))].join('; ')}`);
}
const divergence = await readOptional('data/geography/reference-divergence.json');
if (divergence?.divergences?.length) {
  const conflicts = divergence.divergences.filter(d => d.disposition === 'source_layers_disagree_on_parent');
  notes.push(`${divergence.divergences.length} reference-layer divergence(s) registered, ${conflicts.length} unresolved parent conflicts; registry hierarchy governs.`);
}

if (errors.length) {
  console.error(`FAIL: ${errors.length} error(s)\n` + errors.slice(0, 40).map(e => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`PASS: ${registry.length} geographies (${Object.entries(expected).map(([k, v]) => `${v} ${k}`).join(', ')}), ${aliases.length} aliases, ${geometryVersions.length} boundary versions on delimitation era ${BOUNDARY_VERSION}.`);
console.log('      Codes well-formed and sequentially complete; names hygienic; hierarchy, hashes and geometry lineage valid; parents dissolved from children with zero nesting failures.');
for (const note of notes) console.log(`      note: ${note}`);
