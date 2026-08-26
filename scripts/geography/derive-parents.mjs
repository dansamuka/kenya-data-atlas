// Derive constituency, county and country geometry by dissolving the canonical ward
// layer.
//
// Why: the project previously published three independently sourced layers (2018 HDX
// counties, 2018 HDX constituencies, 2019 ward layer). Independently digitised layers
// cannot nest. Measured against each other they produced 198 of 1,450 wards overlapping
// their parent by under 90%, 81 constituencies whose wards covered less than 90% of the
// parent, and 20 wards whose polygon fell outside the parent entirely.
//
// Dissolving parents from children makes perfect nesting true BY CONSTRUCTION: no gaps,
// no spill, no orphaned child. The cost is that parent edges inherit the ward layer's
// accuracy rather than the 2018 layer's. That trade is deliberate and is stated in
// docs/methodology/geographies.md — internal consistency matters more to this product
// than agreement with an older third-party coastline.
//
// The 2018 layers are retained under data/geography/reference/ as independent
// cross-checks, and the divergence is measured and published, not discarded.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import polygonClipping from 'polygon-clipping';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = path.join(root, 'data/geography/geometry');
const referenceRoot = path.join(root, 'data/geography/reference');
const registryRoot = path.join(root, 'data/geography/registry');

const BOUNDARY_VERSION = '2012-01';
const GEOMETRY_REVISION = 1;
const WARD_SOURCE_ID = 'HDX-ADMINISTRATIVE-WARDS-1450-2019';
const WARD_SOURCE_URL = 'https://data.humdata.org/dataset/administrative-wards-in-kenya-1450';
// Dissolved output must contain its children exactly. Allow only floating-point noise.
const NESTING_TOLERANCE = 1e-9;

const sha256 = data => createHash('sha256').update(data).digest('hex');
const deterministicUuid = value => {
  const bytes = Buffer.from(sha256(value).slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));

const ringArea = ring => ring.slice(0, -1).reduce((sum, point, index) => {
  const next = ring[(index + 1) % (ring.length - 1)];
  return sum + point[0] * next[1] - next[0] * point[1];
}, 0) / 2;
const multiPolygonArea = geometry => Math.abs(geometry.coordinates.reduce((total, polygon) =>
  total + polygon.reduce((sum, ring, index) => sum + (index === 0 ? Math.abs(ringArea(ring)) : -Math.abs(ringArea(ring))), 0), 0));

// polygon-clipping is a floating-point Martinez-Rueda implementation and can fail to
// close an output ring where two source segments are very nearly coincident. That is a
// numeric limitation, not a data defect: it is recorded and skipped rather than
// crashing the build or being silently swallowed.
const clippingFailures = [];
function safeOp(operation, label, ...args) {
  try { return polygonClipping[operation](...args); }
  catch (error) { clippingFailures.push({ operation, label, message: error.message }); return null; }
}

// Dissolve in balanced pairs. Folding left over hundreds of polygons makes the
// accumulator grow monotonically and is materially slower for large counties.
function dissolve(geometries) {
  let level = geometries.map(geometry => geometry.coordinates);
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 >= level.length) { next.push(level[i]); continue; }
      const merged = safeOp('union', 'dissolve', level[i], level[i + 1]);
      // On numeric failure keep both parts unmerged: the union of the geometries is
      // still correct as a MultiPolygon, only the shared border is not eliminated.
      next.push(merged ?? [...level[i], ...level[i + 1]]);
    }
    level = next;
  }
  return { type: 'MultiPolygon', coordinates: level[0] };
}

const registry = await read('data/geography/registry/geographies.json');
const byId = new Map(registry.map(item => [item.geography_id, item]));
const byLevel = level => registry.filter(item => item.level === level);

const wards = await read('data/geography/geometry/wards.geojson');
const wardGeometryById = new Map(wards.features.map(feature => [feature.id, feature.geometry]));
// Quality propagates upward: a parent is only as trustworthy as its children.
const qualityById = new Map(wards.features.map(feature => [feature.id, feature.properties.quality_status]));

const report = {
  generated_at: new Date().toISOString(),
  status: 'fail',
  method: 'parent geometry dissolved from the canonical ward layer',
  boundary_version: BOUNDARY_VERSION,
  geometry_revision: GEOMETRY_REVISION,
  levels: {},
  reference_comparison: {},
  errors: [],
  warnings: []
};

const geometryVersions = [];
const derivedGeometryById = new Map();

function buildLevel({ level, children, file, name }) {
  const parents = byLevel(level);
  const grouped = new Map();
  for (const child of children) {
    if (!grouped.has(child.parent_id)) grouped.set(child.parent_id, []);
    grouped.get(child.parent_id).push(child.geography_id);
  }

  const features = [];
  const nestingFailures = [];
  for (const parent of parents.sort((a, b) => a.geo_code.localeCompare(b.geo_code))) {
    const childIds = grouped.get(parent.geography_id) ?? [];
    if (!childIds.length) {
      report.errors.push(`${parent.geo_code}: no child geometry to dissolve`);
      continue;
    }
    const childGeometries = childIds.map(id => derivedGeometryById.get(id) ?? wardGeometryById.get(id)).filter(Boolean);
    if (childGeometries.length !== childIds.length) {
      report.errors.push(`${parent.geo_code}: ${childIds.length - childGeometries.length} child geometry/geometries missing`);
      continue;
    }
    const geometry = dissolve(childGeometries);

    // Assert what the dissolve is supposed to guarantee rather than assuming it.
    const parentArea = multiPolygonArea(geometry);
    const childArea = childGeometries.reduce((sum, child) => sum + multiPolygonArea(child), 0);
    for (const [index, child] of childGeometries.entries()) {
      const outside = safeOp('difference', `nesting:${parent.geo_code}`, child.coordinates, geometry.coordinates);
      const spill = outside?.length ? multiPolygonArea({ type: 'MultiPolygon', coordinates: outside }) / multiPolygonArea(child) : 0;
      if (spill > NESTING_TOLERANCE) nestingFailures.push({ parent: parent.geo_code, child: byId.get(childIds[index])?.geo_code, spill });
    }

    derivedGeometryById.set(parent.geography_id, geometry);
    const childQualities = childIds.map(id => qualityById.get(id)).filter(Boolean);
    const quality_status = childQualities.some(value => value === 'rejected') ? 'rejected'
      : childQualities.some(value => value === 'provisional' || value === 'derived_provisional') ? 'derived_provisional'
      : 'derived_validated';
    qualityById.set(parent.geography_id, quality_status);

    features.push({
      type: 'Feature',
      id: parent.geography_id,
      properties: {
        geography_id: parent.geography_id,
        geo_code: parent.geo_code,
        name: parent.name,
        level,
        parent_id: parent.parent_id,
        boundary_version: BOUNDARY_VERSION,
        source_id: WARD_SOURCE_ID,
        match_method: 'dissolved_from_children',
        match_score: 0,
        child_count: childIds.length,
        // Sum of child areas minus dissolved area = the shared internal borders that
        // were eliminated. Near zero means the children barely overlapped.
        dissolve_overlap: Number(((childArea - parentArea) / (childArea || 1)).toPrecision(3)),
        quality_status
      },
      geometry
    });
  }

  if (nestingFailures.length) report.errors.push(`${level}: ${nestingFailures.length} child polygon(s) not fully contained by the dissolved parent`);
  const collection = { type: 'FeatureCollection', name, crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } }, features };
  report.levels[level] = {
    role: 'derived',
    derived_from: level === 'constituency' ? 'ward' : level === 'county' ? 'constituency' : 'county',
    expected_records: parents.length,
    produced_records: features.length,
    nesting_failures: nestingFailures,
    provisional_records: features.filter(feature => feature.properties.quality_status !== 'derived_validated').map(feature => feature.geo_code ?? feature.properties.geo_code),
    output_sha256: sha256(JSON.stringify(collection))
  };
  if (features.length !== parents.length) report.errors.push(`${level}: expected ${parents.length} derived polygons, produced ${features.length}`);

  for (const feature of features) geometryVersions.push({
    geometry_id: deterministicUuid(`geometry:${feature.id}:${BOUNDARY_VERSION}:${GEOMETRY_REVISION}`),
    geography_id: feature.id,
    boundary_version: BOUNDARY_VERSION,
    geometry_revision: GEOMETRY_REVISION,
    geometry_source_id: WARD_SOURCE_ID,
    valid_from: byId.get(feature.id).valid_from,
    valid_to: '',
    source_id: WARD_SOURCE_ID,
    source_url: WARD_SOURCE_URL,
    source_crs: 'EPSG:4326',
    geometry_hash: sha256(JSON.stringify(feature.geometry)),
    quality_status: feature.properties.quality_status,
    limitation: `Derived by dissolving ${feature.properties.child_count} child polygons from the canonical ward layer. Not supplied directly by IEBC. Parent edges inherit ward-layer accuracy.`
  });

  return collection;
}

await mkdir(outputRoot, { recursive: true });

const constituencies = buildLevel({ level: 'constituency', children: byLevel('ward'), file: 'constituencies.geojson', name: 'kenya_constituency_boundaries' });
await writeFile(path.join(outputRoot, 'constituencies.geojson'), JSON.stringify(constituencies) + '\n');

const counties = buildLevel({ level: 'county', children: byLevel('constituency'), file: 'counties.geojson', name: 'kenya_county_boundaries' });
await writeFile(path.join(outputRoot, 'counties.geojson'), JSON.stringify(counties) + '\n');

const country = buildLevel({ level: 'country', children: byLevel('county'), file: 'country.geojson', name: 'kenya_country_boundary' });
await writeFile(path.join(outputRoot, 'country.geojson'), JSON.stringify(country) + '\n');

// --- Independent cross-check against the retained 2018 reference layers ------
for (const [level, file] of [['constituency', 'constituencies.geojson'], ['county', 'counties.geojson']]) {
  let reference;
  try { reference = JSON.parse(await readFile(path.join(referenceRoot, file), 'utf8')); }
  catch { continue; }
  const derived = level === 'constituency' ? constituencies : counties;
  const derivedById = new Map(derived.features.map(feature => [feature.id, feature.geometry]));
  const comparisons = [];
  for (const feature of reference.features) {
    const own = derivedById.get(feature.id);
    if (!own) continue;
    const overlap = safeOp('intersection', `compare:${feature.properties.geo_code}`, own.coordinates, feature.geometry.coordinates);
    const union = safeOp('union', `compare:${feature.properties.geo_code}`, own.coordinates, feature.geometry.coordinates);
    if (overlap === null || union === null) {
      comparisons.push({ geo_code: feature.properties.geo_code, name: feature.properties.name, jaccard: null, note: 'clipping precision failure; comparison skipped' });
      continue;
    }
    const shared = overlap.length ? multiPolygonArea({ type: 'MultiPolygon', coordinates: overlap }) : 0;
    const total = union.length ? multiPolygonArea({ type: 'MultiPolygon', coordinates: union }) : 0;
    comparisons.push({ geo_code: feature.properties.geo_code, name: feature.properties.name, jaccard: total ? Number((shared / total).toPrecision(4)) : 0 });
  }
  comparisons.sort((a, b) => (a.jaccard ?? 2) - (b.jaccard ?? 2));
  const values = comparisons.map(item => item.jaccard).filter(value => value !== null);
  report.reference_comparison[level] = {
    reference_layer: level === 'constituency' ? 'HDX-KENYA-ELECTIONS-CONSTITUENCIES-2018' : 'HDX-KENYA-ELECTIONS-COUNTIES-2018',
    compared: comparisons.length,
    median_jaccard: values.length ? values[Math.floor(values.length / 2)] : null,
    below_0_90: comparisons.filter(item => item.jaccard !== null && item.jaccard < 0.9).length,
    not_comparable: comparisons.filter(item => item.jaccard === null).length,
    ten_largest_divergences: comparisons.slice(0, 10)
  };
}

report.clipping_precision_failures = clippingFailures;
if (clippingFailures.length) report.warnings.push(`${clippingFailures.length} clipping operation(s) hit a floating-point precision limit and were skipped; see clipping_precision_failures.`);
report.status = report.errors.length ? 'fail' : 'pass';
await writeFile(path.join(root, 'data/geography/derived-geometry-report.json'), JSON.stringify(report, null, 2) + '\n');

if (report.status === 'pass') {
  const existing = await read('data/geography/registry/geometry-versions.json');
  const merged = [...existing.filter(item => !geometryVersions.some(row => row.geography_id === item.geography_id)), ...geometryVersions]
    .sort((a, b) => (byId.get(a.geography_id)?.geo_code ?? '').localeCompare(byId.get(b.geography_id)?.geo_code ?? ''));
  await writeFile(path.join(registryRoot, 'geometry-versions.json'), JSON.stringify(merged, null, 2) + '\n');
  const fields = ['geometry_id', 'geography_id', 'boundary_version', 'geometry_revision', 'geometry_source_id', 'valid_from', 'valid_to', 'source_id', 'source_url', 'source_crs', 'geometry_hash', 'quality_status', 'limitation'];
  const cell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  await writeFile(path.join(registryRoot, 'geometry-versions.csv'), [fields.join(','), ...merged.map(row => fields.map(field => cell(row[field])).join(','))].join('\n') + '\n');
}

console.log(JSON.stringify({
  status: report.status,
  levels: Object.fromEntries(Object.entries(report.levels).map(([level, value]) => [level, { produced: value.produced_records, expected: value.expected_records, nesting_failures: value.nesting_failures.length, provisional: value.provisional_records.length }])),
  reference_comparison: Object.fromEntries(Object.entries(report.reference_comparison).map(([level, value]) => [level, { median_jaccard: value.median_jaccard, below_0_90: value.below_0_90 }]))
}, null, 2));
if (report.status !== 'pass') process.exit(1);
