// Computes approximate land area directly from the Atlas's canonical boundary
// geometry for Kenya, all counties, constituencies and wards.
//
// Method: equirectangular planar projection (x = lon * cos(mean_lat), y = lat),
// scaled to kilometres via the mean Earth radius, then the standard shoelace
// polygon-area formula. This is a deliberate approximation, not a geodesic or
// ellipsoidal calculation — appropriate to disclose, not to hide.
//
// Error budget: at Kenya's latitude range (~4.7S to 5.2N), the projection's
// distortion is small — within the ~2% band recorded in the dataset's
// known_limitations (data/catalogue/seed/datasets.json, DS-KDA-DERIVED-AREA).
// Values are statistical_status='estimated', never 'final'.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EARTH_RADIUS_KM = 6371.0088;
const GENERATED_AT = '2026-08-26T00:00:00.000Z';

const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));

function ringAreaKm2(ring, meanLatRad) {
  const toXY = ([lon, lat]) => [
    (lon * Math.PI / 180) * Math.cos(meanLatRad) * EARTH_RADIUS_KM,
    (lat * Math.PI / 180) * EARTH_RADIUS_KM
  ];
  const pts = ring.map(toXY);
  let sum = 0;
  const limit = pts.length > 1 ? pts.length - 1 : 0;
  for (let i = 0; i < limit; i += 1) {
    sum += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  }
  // Some GeoJSON rings are not explicitly closed. Close them for the area
  // computation without mutating the canonical geometry.
  if (pts.length > 2 && (pts[0][0] !== pts.at(-1)[0] || pts[0][1] !== pts.at(-1)[1])) {
    sum += pts.at(-1)[0] * pts[0][1] - pts[0][0] * pts.at(-1)[1];
  }
  return Math.abs(sum) / 2;
}

function polygonsFor(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  throw new Error(`Unsupported area geometry type: ${geometry.type}`);
}

function geometryAreaKm2(geometry) {
  const polygons = polygonsFor(geometry);
  const outerPoints = polygons.flatMap(polygon => polygon[0] || []);
  if (!outerPoints.length) return 0;
  const meanLatRad = (outerPoints.reduce((sum, [, lat]) => sum + lat, 0) / outerPoints.length) * Math.PI / 180;
  return polygons.reduce((total, polygon) =>
    total + polygon.reduce((sum, ring, index) =>
      sum + (index === 0 ? ringAreaKm2(ring, meanLatRad) : -ringAreaKm2(ring, meanLatRad)), 0), 0);
}

const layers = [
  ['data/geography/geometry/country.geojson', 'country'],
  ['data/geography/geometry/counties.geojson', 'county'],
  ['data/geography/geometry/constituencies.geojson', 'constituency'],
  ['data/geography/geometry/wards.geojson', 'ward']
];

const results = [];
// Read one geometry layer at a time. Wards/constituencies are large files; not
// retaining all four parsed GeoJSON documents materially lowers CI memory use.
for (const [file, level] of layers) {
  const fc = await read(file);
  for (const feature of fc.features || []) {
    const geoCode = feature.properties?.geo_code;
    const name = feature.properties?.name;
    if (!geoCode || !name) throw new Error(`${file}: feature missing geo_code/name`);
    const area = geometryAreaKm2(feature.geometry);
    if (!(area > 0)) throw new Error(`${geoCode}: computed non-positive area ${area}`);
    results.push({
      geo_code: geoCode,
      name,
      level,
      area_km2: Math.round(area * 10) / 10,
      quality_status: feature.properties?.quality_status || 'derived_provisional'
    });
  }
}

const counts = Object.fromEntries(['country','county','constituency','ward'].map(level => [level, results.filter(r => r.level === level).length]));
if (counts.country !== 1 || counts.county !== 47 || counts.constituency !== 290 || counts.ward !== 1450) {
  throw new Error(`Area coverage mismatch: ${JSON.stringify(counts)}; expected 1/47/290/1450`);
}
if (new Set(results.map(r => r.geo_code)).size !== results.length) throw new Error('Area computation produced duplicate geo_code rows');

const output = {
  generated_at: GENERATED_AT,
  method: 'equirectangular planar projection, mean-latitude reference per feature, shoelace formula',
  boundary_version: '2012-01',
  geometry_source: 'data/geography/geometry canonical country/county/constituency/ward layers derived from the validated ward geometry',
  estimated_error_band_pct: 2,
  note: 'Approximate. Not a surveyed or IEBC-issued figure. See data/catalogue/seed/datasets.json DS-KDA-DERIVED-AREA and docs/methodology/indicators.md.',
  coverage: counts,
  results
};
await mkdir(path.join(root, 'data/indicators/seed/derived'), { recursive: true });
await writeFile(path.join(root, 'data/indicators/seed/derived/area-computed.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ computed: results.length, coverage: counts, kenya_km2: results.find(r => r.level === 'country')?.area_km2, nakuru_km2: results.find(r => r.name === 'Nakuru' && r.level === 'county')?.area_km2 }, null, 2));
