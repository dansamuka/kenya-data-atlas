// Computes an approximate land area for the country and each county directly
// from the Atlas's own dissolved boundary geometry (docs/methodology/geographies.md).
//
// Method: equirectangular planar projection (x = lon * cos(mean_lat), y = lat),
// scaled to kilometres via the mean Earth radius, then the standard shoelace
// polygon-area formula. This is a deliberate approximation, not a geodesic or
// ellipsoidal calculation — appropriate to disclose, not to hide.
//
// Error budget: at Kenya's latitude range (~4.7S to 5.2N), the projection's
// distortion is small — well under the ~2% band recorded in the dataset's
// known_limitations (data/catalogue/seed/datasets.json, DS-KDA-DERIVED-AREA).
// This script does not claim more precision than that, and the output is
// recorded with statistical_status = 'estimated', never 'final'.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EARTH_RADIUS_KM = 6371.0088; // mean radius (IUGG)
// Reproducible builds require a stable observation vintage. This is the date on
// which the current boundary-derived area release was first produced, not the
// wall-clock time of whichever CI runner happens to rebuild it.
const GENERATED_AT = '2026-08-26T00:00:00.000Z';

const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));

function ringAreaKm2(ring, meanLatRad) {
  const toXY = ([lon, lat]) => [
    (lon * Math.PI / 180) * Math.cos(meanLatRad) * EARTH_RADIUS_KM,
    (lat * Math.PI / 180) * EARTH_RADIUS_KM
  ];
  const pts = ring.map(toXY);
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    sum += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  }
  return Math.abs(sum) / 2;
}

function multiPolygonAreaKm2(geometry) {
  // Mean latitude across all outer rings, used as a single projection reference
  // for the whole feature. Adequate for county-sized features; would need a
  // per-ring reference for anything spanning a much larger latitude range.
  const allLats = geometry.coordinates.flatMap(polygon => polygon[0].map(([, lat]) => lat));
  const meanLatRad = (allLats.reduce((a, b) => a + b, 0) / allLats.length) * Math.PI / 180;
  return geometry.coordinates.reduce((total, polygon) =>
    total + polygon.reduce((sum, ring, index) =>
      sum + (index === 0 ? ringAreaKm2(ring, meanLatRad) : -ringAreaKm2(ring, meanLatRad)), 0), 0);
}

const counties = await read('data/geography/geometry/counties.geojson');
const country = await read('data/geography/geometry/country.geojson');

const results = [];
for (const feature of country.features) {
  results.push({ geo_code: feature.properties.geo_code, name: feature.properties.name, level: 'country', area_km2: Math.round(multiPolygonAreaKm2(feature.geometry) * 10) / 10, quality_status: feature.properties.quality_status });
}
for (const feature of counties.features) {
  results.push({ geo_code: feature.properties.geo_code, name: feature.properties.name, level: 'county', area_km2: Math.round(multiPolygonAreaKm2(feature.geometry) * 10) / 10, quality_status: feature.properties.quality_status });
}

const output = {
  generated_at: GENERATED_AT,
  method: 'equirectangular planar projection, mean-latitude reference per feature, shoelace formula',
  boundary_version: '2012-01',
  geometry_source: 'data/geography/geometry (canonical ward layer, dissolved to county and country)',
  estimated_error_band_pct: 2,
  note: 'Approximate. Not a surveyed or IEBC-issued figure. See data/catalogue/seed/datasets.json DS-KDA-DERIVED-AREA and docs/methodology/indicators.md.',
  results
};
await mkdir(path.join(root, 'data/indicators/seed/derived'), { recursive: true });
await writeFile(path.join(root, 'data/indicators/seed/derived/area-computed.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ computed: results.length, kenya_km2: results.find(r => r.level === 'country')?.area_km2, nakuru_km2: results.find(r => r.name === 'Nakuru')?.area_km2 }, null, 2));
