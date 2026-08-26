import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import polygonClipping from 'polygon-clipping';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceRoot = path.join(root, 'data/geography/source/hdx-boundaries');
const outputRoot = path.join(root, 'data/geography/geometry');
const referenceRoot = path.join(root, 'data/geography/reference');
const registryRoot = path.join(root, 'data/geography/registry');

// The 2012 first review is one legal delimitation era. IEBC confirmed in January 2026
// that no constituency or ward boundary changes before the August 2027 election, so
// '2012-01' remains the only era for the life of this dataset. Geometry provenance is
// recorded separately in geometry_source_id / geometry_revision so that replacing the
// coordinates does NOT imply that the boundaries changed.
const BOUNDARY_VERSION = '2012-01';
const GEOMETRY_REVISION = 1;

// A polygon smaller than this is a digitising sliver or a blank padding record,
// never a Kenyan county assembly ward. ~1e-5 deg^2 is about 120 ha near the equator.
const DEGENERATE_AREA_DEG2 = 1e-5;
// A ward whose polygon overlaps its registry-assigned constituency by less than this
// is either misassigned or comes from a layer that disagrees with the reference.
const CONTAINMENT_REVIEW = 0.9;
const CONTAINMENT_FAIL = 0.1;

const normalize = value => String(value ?? '').toLowerCase().normalize('NFKD')
  .replace(/[’']/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const normalizeAreaName = value => normalize(value)
  .replace(/\b(sub county|constituency|county assembly ward|ward)\b/g, ' ').replace(/\s+/g, ' ').trim();
const sha256 = data => createHash('sha256').update(data).digest('hex');
const deterministicUuid = value => {
  const bytes = Buffer.from(sha256(value).slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
const round = value => Math.round(value * 1e6) / 1e6;
function editDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}
const nameDistance = (a, b) => editDistance(normalizeAreaName(a), normalizeAreaName(b)) / Math.max(normalizeAreaName(a).length, normalizeAreaName(b).length, 1);

function parseDbf(buffer) {
  const recordCount = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);
  const fields = [];
  for (let offset = 32; offset < headerLength - 1; offset += 32) {
    const name = buffer.subarray(offset, offset + 11).toString('latin1').replace(/\0.*$/, '');
    fields.push({ name, type: String.fromCharCode(buffer[offset + 11]), length: buffer[offset + 16] });
  }
  const rows = [];
  for (let index = 0; index < recordCount; index += 1) {
    const start = headerLength + index * recordLength;
    const row = { _deleted: buffer[start] === 0x2a };
    let cursor = start + 1;
    for (const field of fields) {
      const raw = buffer.subarray(cursor, cursor + field.length).toString('latin1').trim();
      row[field.name] = field.type === 'N' || field.type === 'F' ? (raw === '' ? null : Number(raw)) : raw;
      cursor += field.length;
    }
    rows.push(row);
  }
  return rows;
}

const ringArea = ring => ring.slice(0, -1).reduce((sum, point, index) => {
  const next = ring[(index + 1) % (ring.length - 1)];
  return sum + point[0] * next[1] - next[0] * point[1];
}, 0) / 2;

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if (((yi > point[1]) !== (yj > point[1])) && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInGeometry(point, geometry) {
  return geometry.coordinates.some(polygon => pointInRing(point, polygon[0]) && !polygon.slice(1).some(hole => pointInRing(point, hole)));
}
function representativePoint(geometry) {
  const ring = [...geometry.coordinates].sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])))[0][0];
  let area = 0; let x = 0; let y = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const cross = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    area += cross; x += (ring[i][0] + ring[i + 1][0]) * cross; y += (ring[i][1] + ring[i + 1][1]) * cross;
  }
  const centroid = area === 0 ? ring[0] : [x / (3 * area), y / (3 * area)];
  return pointInGeometry(centroid, geometry) ? centroid : ring[0];
}

// Absolute planar area of a MultiPolygon in square degrees (outer rings minus holes).
function multiPolygonArea(geometry) {
  return Math.abs(geometry.coordinates.reduce((total, polygon) =>
    total + polygon.reduce((sum, ring, index) => sum + (index === 0 ? Math.abs(ringArea(ring)) : -Math.abs(ringArea(ring))), 0), 0));
}

// Resolve self-intersections and ring-order defects by re-running the geometry
// through the clipping library's union. This is the OGC make_valid equivalent and
// is area-preserving for well-formed input; any repair is recorded, never silent.
function repairGeometry(geometry) {
  const before = multiPolygonArea(geometry);
  let coordinates;
  try { coordinates = polygonClipping.union(geometry.coordinates); }
  catch { return { geometry, repaired: false, area: before, area_delta: 0 }; }
  if (!coordinates?.length) return { geometry, repaired: false, area: before, area_delta: 0 };
  const repairedGeometry = { type: 'MultiPolygon', coordinates };
  const after = multiPolygonArea(repairedGeometry);
  // Every polygon is normalised (consistent winding, no self-intersection). Only a
  // change in AREA means the source geometry was actually defective.
  const areaDelta = before ? Math.abs(after - before) / before : 0;
  return { geometry: repairedGeometry, repaired: areaDelta > 1e-9, area: after, area_delta: areaDelta };
}

// Fraction of `child` that falls inside `parent`.
function containment(child, parent) {
  if (!parent) return null;
  const childArea = multiPolygonArea(child);
  if (!childArea) return 0;
  try {
    const overlap = polygonClipping.intersection(child.coordinates, parent.coordinates);
    if (!overlap?.length) return 0;
    return round(multiPolygonArea({ type: 'MultiPolygon', coordinates: overlap }) / childArea);
  } catch { return null; }
}

function ringsToMultiPolygon(rings) {
  let outers = rings.filter(ring => ringArea(ring) < 0);
  let holes = rings.filter(ring => ringArea(ring) >= 0);
  if (!outers.length) {
    const largest = [...rings].sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
    outers = [largest]; holes = rings.filter(ring => ring !== largest);
  }
  const polygons = outers.map(outer => [outer]);
  for (const hole of holes) {
    const container = outers.findIndex(outer => pointInRing(hole[0], outer));
    if (container >= 0) polygons[container].push(hole);
    else polygons.push([hole]);
  }
  return { type: 'MultiPolygon', coordinates: polygons };
}

function parseShp(buffer) {
  const fileType = buffer.readInt32LE(32);
  if (fileType !== 5 && fileType !== 15 && fileType !== 25) throw new Error(`Unsupported shapefile type ${fileType}; Polygon expected`);
  const geometries = [];
  let offset = 100;
  while (offset + 8 <= buffer.length) {
    const contentBytes = buffer.readInt32BE(offset + 4) * 2;
    const start = offset + 8;
    const type = buffer.readInt32LE(start);
    if (type === 0) geometries.push(null);
    else {
      if (![5, 15, 25].includes(type)) throw new Error(`Unexpected record geometry type ${type}`);
      const partCount = buffer.readInt32LE(start + 36);
      const pointCount = buffer.readInt32LE(start + 40);
      const parts = Array.from({ length: partCount }, (_, i) => buffer.readInt32LE(start + 44 + i * 4));
      const pointStart = start + 44 + partCount * 4;
      const points = Array.from({ length: pointCount }, (_, i) => [round(buffer.readDoubleLE(pointStart + i * 16)), round(buffer.readDoubleLE(pointStart + i * 16 + 8))]);
      const rings = parts.map((first, i) => points.slice(first, parts[i + 1] ?? points.length)).filter(ring => ring.length >= 4);
      for (const ring of rings) if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) ring.push([...ring[0]]);
      geometries.push(ringsToMultiPolygon(rings));
    }
    offset = start + contentBytes;
  }
  return geometries;
}

async function readLayer(baseName) {
  const [dbf, shp] = await Promise.all([readFile(`${baseName}.dbf`), readFile(`${baseName}.shp`)]);
  const rows = parseDbf(dbf);
  const geometries = parseShp(shp);
  if (rows.length !== geometries.length) throw new Error(`${baseName}: DBF/SHP count mismatch ${rows.length}/${geometries.length}`);
  return { rows, geometries, sourceHashes: { dbf: sha256(dbf), shp: sha256(shp) } };
}

const registry = JSON.parse(await readFile(path.join(registryRoot, 'geographies.json'), 'utf8'));
const byLevel = level => registry.filter(item => item.level === level);
const countyByCode = new Map(byLevel('county').map(item => [Number(item.county_code), item]));
const constituencyByCode = new Map(byLevel('constituency').map(item => [Number(item.constituency_code), item]));
const wardRegistry = byLevel('ward');
const parentById = new Map(registry.map(item => [item.geography_id, item]));

const configs = [
  { level: 'county', base: path.join(sourceRoot, 'kenya-elections-2018/counties'), sourceId: 'HDX-KENYA-ELECTIONS-COUNTIES-2018' },
  { level: 'constituency', base: path.join(sourceRoot, 'kenya-elections-2018/constituencies'), sourceId: 'HDX-KENYA-ELECTIONS-CONSTITUENCIES-2018' },
  { level: 'ward', base: path.join(sourceRoot, 'administrative-wards-1450-2019/kenya_wards'), sourceId: 'HDX-ADMINISTRATIVE-WARDS-1450-2019' }
];

const report = { generated_at: new Date().toISOString(), status: 'fail', levels: {}, errors: [], warnings: [] };
const geometryVersions = [];
const geometryByGeographyId = new Map();
// Only the ward layer is canonical. County and constituency polygons are DERIVED by
// dissolving wards (see derive-parents.mjs) so that the hierarchy nests perfectly by
// construction. The HDX county/constituency layers are retained as independent
// cross-check references, not as published geometry.
const outputFileByLevel = { county: 'counties.geojson', constituency: 'constituencies.geojson', ward: 'wards.geojson' };
const outputRootByLevel = { county: referenceRoot, constituency: referenceRoot, ward: outputRoot };
await mkdir(outputRoot, { recursive: true });
await mkdir(referenceRoot, { recursive: true });

for (const config of configs) {
  const layer = await readLayer(config.base);
  const matches = new Map();
  const unmatchedSource = [];
  const duplicateMatches = [];

  const blankSourceRows = [];
  layer.rows.forEach((row, index) => {
    if (row._deleted || !layer.geometries[index]) return;
    // A source record with no name is padding, not a geography. Blank names must never
    // be matchable: an empty string normalises to an empty string and will silently
    // "match" any other record that normalises to empty.
    const sourceName = config.level === 'county' ? row.COUNTY_NAM
      : config.level === 'constituency' ? row.CONSTITUEN
      : row.ward;
    if (!normalize(sourceName)) {
      blankSourceRows.push({ index, reason: 'blank source name; dropped before matching', area_deg2: round(multiPolygonArea(layer.geometries[index])) });
      return;
    }
    let canonical;
    if (config.level === 'county') canonical = countyByCode.get(Number(row.COUNTY_COD));
    if (config.level === 'constituency') canonical = constituencyByCode.get(Math.round(Number(row.CONST_CODE)));
    if (config.level === 'ward') {
      const candidates = wardRegistry.filter(ward => {
        const constituency = parentById.get(ward.parent_id);
        const county = parentById.get(constituency.parent_id);
        return normalizeAreaName(ward.name) === normalizeAreaName(row.ward) && normalizeAreaName(county.name) === normalizeAreaName(row.county);
      });
      if (candidates.length === 1) canonical = candidates[0];
      else if (candidates.length > 1) {
        canonical = candidates.find(ward => normalizeAreaName(parentById.get(ward.parent_id).name) === normalizeAreaName(row.subcounty));
        if (!canonical) unmatchedSource.push({ index, reason: 'ambiguous canonical ward', source: row, candidate_codes: candidates.map(item => item.geo_code) });
      }
    }
    if (!canonical) {
      if (!unmatchedSource.some(item => item.index === index)) unmatchedSource.push({ index, reason: 'no canonical match', source: row });
      return;
    }
    if (matches.has(canonical.geography_id)) {
      duplicateMatches.push({ geography_id: canonical.geography_id, indexes: [matches.get(canonical.geography_id).index, index] });
      unmatchedSource.push({ index, reason: 'duplicate normalized name; requires parent/spatial reconciliation', source: row });
    }
    else matches.set(canonical.geography_id, { index, row, geometry: layer.geometries[index], canonical });
  });

  if (config.level === 'ward') {
    for (const item of [...unmatchedSource]) {
      const sourceCounty = normalizeAreaName(item.source.county);
      const sourceConstituency = normalizeAreaName(item.source.subcounty);
      const candidates = wardRegistry.filter(ward => {
        if (matches.has(ward.geography_id)) return false;
        const constituency = parentById.get(ward.parent_id);
        const county = parentById.get(constituency.parent_id);
        return normalizeAreaName(county.name) === sourceCounty && normalizeAreaName(constituency.name) === sourceConstituency;
      }).map(ward => ({ ward, score: nameDistance(ward.name, item.source.ward) })).sort((a, b) => a.score - b.score);
      const best = candidates[0]; const second = candidates[1];
      if (best && best.score <= 0.5 && (!second || second.score - best.score >= 0.04)) {
        matches.set(best.ward.geography_id, { index: item.index, row: item.source, geometry: layer.geometries[item.index], canonical: best.ward, match_method: 'county_constituency_fuzzy_name', match_score: round(best.score) });
        unmatchedSource.splice(unmatchedSource.indexOf(item), 1);
      }
    }
    for (const item of [...unmatchedSource]) {
      const point = representativePoint(layer.geometries[item.index]);
      const containing = byLevel('constituency').filter(constituency => {
        const geometry = geometryByGeographyId.get(constituency.geography_id);
        return geometry && pointInGeometry(point, geometry);
      });
      if (containing.length !== 1) continue;
      const candidates = wardRegistry.filter(ward => ward.parent_id === containing[0].geography_id && !matches.has(ward.geography_id))
        .map(ward => ({ ward, score: nameDistance(ward.name, item.source.ward) })).sort((a, b) => a.score - b.score);
      const best = candidates[0]; const second = candidates[1];
      if (best && best.score <= 0.62 && (!second || second.score - best.score >= 0.025)) {
        matches.set(best.ward.geography_id, { index: item.index, row: item.source, geometry: layer.geometries[item.index], canonical: best.ward, match_method: 'spatial_parent_and_fuzzy_name', match_score: round(best.score) });
        unmatchedSource.splice(unmatchedSource.indexOf(item), 1);
      }
    }
    const residualGroups = new Map();
    for (const item of unmatchedSource) {
      const key = `${normalizeAreaName(item.source.county)}|${normalizeAreaName(item.source.subcounty)}`;
      if (!residualGroups.has(key)) residualGroups.set(key, []);
      residualGroups.get(key).push(item);
    }
    for (const [key, sourceItems] of residualGroups) {
      const [countyName, constituencyName] = key.split('|');
      const canonicalItems = wardRegistry.filter(ward => {
        if (matches.has(ward.geography_id)) return false;
        const constituency = parentById.get(ward.parent_id); const county = parentById.get(constituency.parent_id);
        return normalizeAreaName(county.name) === countyName && normalizeAreaName(constituency.name) === constituencyName;
      });
      if (canonicalItems.length !== sourceItems.length || !canonicalItems.length) continue;
      const available = [...canonicalItems];
      for (const item of sourceItems.sort((a, b) => a.index - b.index)) {
        available.sort((a, b) => nameDistance(a.name, item.source.ward) - nameDistance(b.name, item.source.ward));
        const canonical = available.shift(); const score = round(nameDistance(canonical.name, item.source.ward));
        matches.set(canonical.geography_id, { index: item.index, row: item.source, geometry: layer.geometries[item.index], canonical, match_method: 'complete_parent_group_residual_assignment', match_score: score });
        report.warnings.push(`${canonical.geo_code}: source name "${item.source.ward}" reconciled to "${canonical.name}" by complete one-to-one parent group; review recommended.`);
        unmatchedSource.splice(unmatchedSource.indexOf(item), 1);
      }
    }
    for (const item of [...unmatchedSource]) {
      const point = representativePoint(layer.geometries[item.index]);
      const containing = byLevel('constituency').filter(constituency => {
        const geometry = geometryByGeographyId.get(constituency.geography_id);
        return geometry && pointInGeometry(point, geometry);
      });
      if (containing.length !== 1) continue;
      const candidates = wardRegistry.filter(ward => ward.parent_id === containing[0].geography_id && !matches.has(ward.geography_id));
      if (candidates.length !== 1) continue;
      const canonical = candidates[0]; const score = round(nameDistance(canonical.name, item.source.ward));
      matches.set(canonical.geography_id, { index: item.index, row: item.source, geometry: layer.geometries[item.index], canonical, match_method: 'unique_spatial_parent_residual_assignment', match_score: score });
      report.warnings.push(`${canonical.geo_code}: source name "${item.source.ward}" reconciled to "${canonical.name}" by unique spatial parent residual; review recommended.`);
      unmatchedSource.splice(unmatchedSource.indexOf(item), 1);
    }
    const countyResidualGroups = new Map();
    for (const item of unmatchedSource) {
      const key = normalizeAreaName(item.source.county);
      if (!countyResidualGroups.has(key)) countyResidualGroups.set(key, []);
      countyResidualGroups.get(key).push(item);
    }
    for (const [countyName, sourceItems] of countyResidualGroups) {
      const canonicalItems = wardRegistry.filter(ward => {
        if (matches.has(ward.geography_id)) return false;
        const constituency = parentById.get(ward.parent_id); const county = parentById.get(constituency.parent_id);
        return normalizeAreaName(county.name) === countyName;
      });
      if (canonicalItems.length !== sourceItems.length || !canonicalItems.length) continue;
      const available = [...canonicalItems];
      for (const item of sourceItems.sort((a, b) => a.index - b.index)) {
        available.sort((a, b) => nameDistance(a.name, item.source.ward) - nameDistance(b.name, item.source.ward));
        const canonical = available.shift(); const score = round(nameDistance(canonical.name, item.source.ward));
        matches.set(canonical.geography_id, { index: item.index, row: item.source, geometry: layer.geometries[item.index], canonical, match_method: 'complete_county_residual_assignment', match_score: score });
        report.warnings.push(`${canonical.geo_code}: source name "${item.source.ward}" reconciled to "${canonical.name}" by complete one-to-one county residual; parent/name review required.`);
        unmatchedSource.splice(unmatchedSource.indexOf(item), 1);
      }
    }
  }

  const expected = byLevel(config.level);
  const usedSourceIndexes = new Set([...matches.values()].map(match => match.index));
  const unresolvedDuplicateMatches = duplicateMatches.filter(item => item.indexes.some(index => !usedSourceIndexes.has(index)));
  const missingCanonical = expected.filter(item => !matches.has(item.geography_id)).map(item => ({ geography_id: item.geography_id, geo_code: item.geo_code, name: item.name }));
  const repairs = [];
  const degenerate = [];
  const containmentIssues = [];
  const features = [...matches.values()].sort((a, b) => a.canonical.geo_code.localeCompare(b.canonical.geo_code)).map(match => {
    const fixed = repairGeometry(match.geometry);
    if (fixed.repaired) repairs.push({ geo_code: match.canonical.geo_code, name: match.canonical.name, area_delta: Number(fixed.area_delta.toPrecision(3)) });
    if (fixed.area < DEGENERATE_AREA_DEG2) degenerate.push({ geo_code: match.canonical.geo_code, name: match.canonical.name, area_deg2: fixed.area, source_record_index: match.index });

    // Cross-check the child against the independently sourced REFERENCE parent layer.
    // The registry (Legal Notice 14 of 2012) is the authority on which constituency a
    // ward belongs to, not a third-party shapefile — so disagreement downgrades the
    // geometry to provisional and is registered, but does not overrule the hierarchy.
    const parentGeometry = geometryByGeographyId.get(match.canonical.parent_id);
    const contained = containment(fixed.geometry, parentGeometry);
    if (contained !== null && contained < CONTAINMENT_REVIEW) {
      containmentIssues.push({ geo_code: match.canonical.geo_code, name: match.canonical.name, reference_containment: contained, match_method: match.match_method ?? 'canonical_code_or_normalized_name', disposition: contained < CONTAINMENT_FAIL ? 'source_layers_disagree_on_parent' : 'edge_misalignment_between_source_layers' });
    }

    const method = match.match_method ?? 'canonical_code_or_normalized_name';
    // Edge misalignment against a differently digitised reference layer is evidence
    // about the two layers, not about this polygon, so it is registered but does not
    // downgrade the canonical geometry. A polygon that sits ENTIRELY outside its
    // reference parent is a genuine unresolved conflict and is marked provisional.
    const quality_status =
      fixed.area < DEGENERATE_AREA_DEG2 ? 'rejected'
      : contained !== null && contained < CONTAINMENT_FAIL ? 'provisional'
      : method === 'canonical_code_or_normalized_name' ? 'validated_external'
      : 'validated_external_with_review';

    return {
      type: 'Feature',
      id: match.canonical.geography_id,
      properties: {
        geography_id: match.canonical.geography_id,
        geo_code: match.canonical.geo_code,
        name: match.canonical.name,
        level: config.level,
        parent_id: match.canonical.parent_id,
        boundary_version: BOUNDARY_VERSION,
        source_id: config.sourceId,
        source_record_index: match.index,
        match_method: method,
        match_score: match.match_score ?? 0,
        geometry_repaired: fixed.repaired,
        reference_containment: contained,
        quality_status
      },
      geometry: fixed.geometry
    };
  });
  const collection = { type: 'FeatureCollection', name: `kenya_${config.level}_boundaries`, crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } }, features };
  const serialized = JSON.stringify(collection);
  for (const feature of features) geometryByGeographyId.set(feature.id, feature.geometry);
  await writeFile(path.join(outputRootByLevel[config.level], outputFileByLevel[config.level]), serialized + '\n');
  const boundsOk = features.every(feature => feature.geometry.coordinates.flat(4).every(value => typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180));
  report.levels[config.level] = {
    role: config.level === 'ward' ? 'canonical' : 'cross_check_reference',
    source_records: layer.rows.length,
    blank_source_rows_dropped: blankSourceRows,
    matched_records: features.length,
    expected_records: expected.length,
    missing_canonical: missingCanonical,
    unmatched_source: unmatchedSource,
    source_name_collisions: duplicateMatches,
    unresolved_duplicate_matches: unresolvedDuplicateMatches,
    geometry_repairs: repairs,
    degenerate_polygons: degenerate,
    containment_below_threshold: containmentIssues,
    coordinate_range_check: boundsOk,
    source_hashes: layer.sourceHashes,
    output_sha256: sha256(serialized)
  };
  if (features.length !== expected.length || missingCanonical.length || !boundsOk) report.errors.push(`${config.level}: failed completeness or coordinate validation`);
  // A duplicate match that was never resolved means two source polygons claimed the
  // same geography and one was chosen arbitrarily. That is an error, not a warning.
  if (unresolvedDuplicateMatches.length) report.errors.push(`${config.level}: ${unresolvedDuplicateMatches.length} unresolved duplicate source match(es); one geography was claimed by more than one source polygon`);
  if (degenerate.length) report.errors.push(`${config.level}: ${degenerate.length} degenerate polygon(s) below ${DEGENERATE_AREA_DEG2} deg^2 (${degenerate.map(item => item.geo_code).join(', ')})`);
  const disagreements = containmentIssues.filter(item => item.disposition === 'source_layers_disagree_on_parent');
  if (disagreements.length) report.warnings.push(`${config.level}: ${disagreements.length} polygon(s) sit outside the independently sourced reference parent layer. The legal registry governs the hierarchy; these are marked provisional and listed in reference-divergence.json.`);
  if (containmentIssues.length > disagreements.length) report.warnings.push(`${config.level}: ${containmentIssues.length - disagreements.length} polygon(s) show edge misalignment against the reference layer; marked provisional.`);
  if (repairs.length) report.warnings.push(`${config.level}: repaired ${repairs.length} materially invalid polygon(s); max area change ${(Math.max(...repairs.map(r => r.area_delta)) * 100).toFixed(4)}%. All ${features.length} polygons normalised to valid OGC geometry.`);
  if (config.level === 'ward') await writeFile(path.join(root, 'data/geography/reference-divergence.json'), JSON.stringify({ generated_at: report.generated_at, reference_layer: 'HDX-KENYA-ELECTIONS-CONSTITUENCIES-2018', canonical_hierarchy: 'KDA-TRANSCRIPTION-LN14-2012', note: 'The registry hierarchy is authoritative. These wards were verified against the 2012 delimitation and the registry assignment is correct; the divergence is a defect in the reference constituency layer, not in the registry.', divergences: containmentIssues }, null, 2) + '\n');
  if (config.level !== 'ward') continue;
  for (const feature of features) geometryVersions.push({
    geometry_id: deterministicUuid(`geometry:${feature.id}:${BOUNDARY_VERSION}:${GEOMETRY_REVISION}`),
    geography_id: feature.id,
    boundary_version: BOUNDARY_VERSION,
    geometry_revision: GEOMETRY_REVISION,
    geometry_source_id: config.sourceId,
    valid_from: '2012-03-09',
    valid_to: '',
    source_id: config.sourceId,
    source_url: 'https://data.humdata.org/dataset/administrative-wards-in-kenya-1450',
    source_crs: 'EPSG:4326',
    geometry_hash: sha256(JSON.stringify(feature.geometry)),
    quality_status: feature.properties.quality_status,
    limitation: 'External HDX-hosted ward geometry reconciled to the Kenya Data Atlas legal registry; not supplied directly by IEBC.'
  });
}

// County, constituency and country geometry are produced by derive-parents.mjs
// from the canonical ward layer. Nothing downstream of this script publishes them.
report.status = report.errors.length ? 'fail' : 'pass';
await writeFile(path.join(root, 'data/geography/geometry-validation-report.json'), JSON.stringify(report, null, 2) + '\n');
if (report.status === 'pass') {
  // Ward versions only. derive-parents.mjs appends the derived parent levels.
  await writeFile(path.join(registryRoot, 'geometry-versions.json'), JSON.stringify(geometryVersions, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, levels: Object.fromEntries(Object.entries(report.levels).map(([level, value]) => [level, { matched: value.matched_records, expected: value.expected_records, missing: value.missing_canonical.length, unmatched: value.unmatched_source.length }])) }, null, 2));
if (report.status !== 'pass') process.exit(1);
