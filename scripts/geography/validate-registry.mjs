import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const registry = await read('data/geography/registry/geographies.json');
const aliases = await read('data/geography/registry/aliases.json');
const geometryVersions = await read('data/geography/registry/geometry-versions.json');
const expected = { country: 1, county: 47, constituency: 290, ward: 1450 };
const errors = [];
const ids = new Set(registry.map(g => g.geography_id));
const codes = new Set(registry.map(g => g.geo_code));

if (ids.size !== registry.length) errors.push('Duplicate geography_id');
if (codes.size !== registry.length) errors.push('Duplicate geo_code');
for (const [level, count] of Object.entries(expected)) if (registry.filter(g => g.level === level).length !== count) errors.push(`${level}: expected ${count}`);
for (const geo of registry) {
  if (geo.level === 'country' ? geo.parent_id !== null : !ids.has(geo.parent_id)) errors.push(`${geo.geo_code}: invalid parent`);
  if (!geo.name || !geo.slug || !geo.source_id || !geo.registry_status) errors.push(`${geo.geo_code}: missing required metadata`);
}
for (const level of ['county','constituency','ward']) {
  const seen = new Set();
  for (const geo of registry.filter(g => g.level === level)) {
    const key = `${geo.parent_id}:${geo.slug}`;
    if (seen.has(key)) errors.push(`${geo.geo_code}: duplicate sibling slug ${geo.slug}`);
    seen.add(key);
  }
}
const constituencyCodes = new Set(registry.filter(g => g.level === 'constituency').map(g => g.constituency_code));
for (const ward of registry.filter(g => g.level === 'ward')) if (!constituencyCodes.has(ward.constituency_code)) errors.push(`${ward.geo_code}: invalid constituency code`);
const aliasKeys = new Set();
for (const alias of aliases) {
  if (!ids.has(alias.geography_id)) errors.push(`${alias.alias_id}: orphan alias`);
  const key = `${alias.geography_id}:${alias.normalized_alias}`;
  if (aliasKeys.has(key)) errors.push(`${alias.alias_id}: duplicate normalized alias`);
  aliasKeys.add(key);
}
if (!aliases.some(a => a.normalized_alias === 'muranga')) errors.push('Muranga search alias missing');
if (geometryVersions.length !== registry.length) errors.push('Every geography must have a boundary-version tracking record');
for (const geometry of geometryVersions) {
  if (!ids.has(geometry.geography_id)) errors.push(`${geometry.geometry_id}: orphan geometry version`);
  if (!geometry.boundary_version || !geometry.source_id || !geometry.source_url) errors.push(`${geometry.geometry_id}: incomplete boundary lineage`);
  if (geometry.quality_status !== 'pending') errors.push(`${geometry.geometry_id}: geometry cannot be marked validated before spatial QA`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`PASS: ${registry.length} geographies (${Object.entries(expected).map(([k,v]) => `${v} ${k}`).join(', ')}), ${aliases.length} aliases, ${geometryVersions.length} boundary-version records pending geometry QA; all parents/codes/slugs valid.`);

