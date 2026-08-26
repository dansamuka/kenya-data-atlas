import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sourceDir = path.join(root, 'data/geography/source/legal-order-transcription');
const outputDir = path.join(root, 'data/geography/registry');
const SOURCE_ID = 'KDA-TRANSCRIPTION-LN14-2012';
const NAMESPACE = 'f292a2f4-5260-4f96-b552-ae728ba73f83';

const parseCsv = async name => {
  const source = (await readFile(path.join(sourceDir, name), 'utf8')).replace(/^\uFEFF/, '').trim();
  const [header, ...lines] = source.split(/\r?\n/);
  const fields = header.split(',').map(x => x.trim());
  return lines.filter(Boolean).map(line => Object.fromEntries(line.split(',').map((value, i) => [fields[i], value.trim()])));
};
const slugify = value => value.toLowerCase().normalize('NFKD').replace(/[’']/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normalizeAlias = value => value.toLowerCase().normalize('NFKD').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const uuid = name => {
  const ns = Buffer.from(NAMESPACE.replaceAll('-', ''), 'hex');
  const hash = createHash('sha1').update(ns).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
const titleCase = value => value.toLowerCase().replace(/(^|[\s/-])\p{L}/gu, m => m.toUpperCase());
const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const toCsv = (rows, fields) => [fields.join(','), ...rows.map(row => fields.map(field => csvCell(row[field])).join(','))].join('\n') + '\n';

const seed = await parseCsv('geographies.csv');
const uniqueBy = (rows, key) => [...new Map(rows.map(row => [row[key], row])).values()];
const counties = uniqueBy(seed, 'COUNTY ID').map(row => ({ code: row['COUNTY ID'], name: row['COUNTY NAME'] }));
const constituencies = uniqueBy(seed, 'CONSTITUENCY ID').map(row => ({ code: row['CONSTITUENCY ID'], name: row['CONSTITUENCY NAME'], county: row['COUNTY NAME'] }));
const wards = seed.map(row => ({ code: row['WARD ID'], name: row['WARD NAME'], constituency: row['CONSTITUENCY NAME'] }));
const registry = [];
const aliases = [];

function addGeo({ geo_code, name, level, parent_id = null, county_code = null, constituency_code = null, ward_code = null, official = false }) {
  const geography_id = uuid(`geography:${geo_code}`);
  const display = name === 'KENYA' ? 'Kenya' : titleCase(name);
  registry.push({ geography_id, geo_code, name: display, slug: slugify(display), level, geography_system: 'electoral', parent_id, county_code, constituency_code, ward_code, valid_from: level === 'country' || level === 'county' ? '2010-08-27' : '2012-03-09', valid_to: '', source_id: SOURCE_ID, official, registry_status: level === 'country' ? 'verified' : 'provisional' });
  const candidates = new Map([[normalizeAlias(display), ['canonical', display]], [normalizeAlias(`${display} ${level}`), ['common', `${display} ${level}`]]]);
  for (const [normalized_alias, [alias_type, alias]] of candidates) aliases.push({ alias_id: uuid(`alias:${geo_code}:${normalized_alias}`), geography_id, alias, normalized_alias, alias_type, language: 'en', source_id: SOURCE_ID });
  return geography_id;
}

const countryId = addGeo({ geo_code: 'KEN', name: 'KENYA', level: 'country', official: true });
const countyIds = new Map();
for (const c of counties.sort((a,b) => Number(a.code) - Number(b.code))) {
  const countyCode = Number(c.code);
  const code = `KEN-C${String(countyCode).padStart(3,'0')}`;
  countyIds.set(c.name.toLowerCase(), { id: addGeo({ geo_code: code, name: c.name, level: 'county', parent_id: countryId, county_code: countyCode }), code: countyCode });
}
const constituencyIds = new Map();
for (const c of constituencies.sort((a,b) => Number(a.code) - Number(b.code))) {
  const constituencyCode = Number(c.code);
  const county = countyIds.get(c.county.toLowerCase());
  if (!county) throw new Error(`Unknown county for constituency ${c.name}: ${c.county}`);
  const code = `KEN-C${String(county.code).padStart(3,'0')}-CON${String(constituencyCode).padStart(3,'0')}`;
  constituencyIds.set(c.name.toLowerCase(), { id: addGeo({ geo_code: code, name: c.name, level: 'constituency', parent_id: county.id, county_code: county.code, constituency_code: constituencyCode }), code: constituencyCode, countyCode: county.code });
}
for (const w of wards.sort((a,b) => Number(a.code) - Number(b.code))) {
  const constituency = constituencyIds.get(w.constituency.toLowerCase());
  if (!constituency) throw new Error(`Unknown constituency for ward ${w.name}: ${w.constituency}`);
  const wardCode = Number(w.code);
  const code = `KEN-C${String(constituency.countyCode).padStart(3,'0')}-CON${String(constituency.code).padStart(3,'0')}-W${String(wardCode).padStart(4,'0')}`;
  addGeo({ geo_code: code, name: w.name, level: 'ward', parent_id: constituency.id, county_code: constituency.countyCode, constituency_code: constituency.code, ward_code: wardCode });
}

// Known punctuation/search variants are lookup conveniences, not alternate official names.
for (const geo of registry.filter(g => normalizeAlias(g.name) === 'muranga')) {
  for (const alias of ["Murang'a", 'Murang’a', 'Muranga']) {
    const normalized_alias = normalizeAlias(alias);
    if (!aliases.some(a => a.geography_id === geo.geography_id && a.normalized_alias === normalized_alias)) aliases.push({ alias_id: uuid(`alias:${geo.geo_code}:${normalized_alias}`), geography_id: geo.geography_id, alias, normalized_alias, alias_type: 'punctuation', language: 'en', source_id: SOURCE_ID });
  }
}

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, 'geographies.json'), JSON.stringify(registry, null, 2) + '\n');
await writeFile(path.join(outputDir, 'geographies.csv'), toCsv(registry, ['geography_id','geo_code','name','slug','level','geography_system','parent_id','county_code','constituency_code','ward_code','valid_from','valid_to','source_id','official','registry_status']));
await writeFile(path.join(outputDir, 'aliases.json'), JSON.stringify(aliases, null, 2) + '\n');
await writeFile(path.join(outputDir, 'aliases.csv'), toCsv(aliases, ['alias_id','geography_id','alias','normalized_alias','alias_type','language','source_id']));
const geometryVersions = registry.map(geo => ({ geometry_id: uuid(`geometry:${geo.geo_code}:LN14-2012-v1`), geography_id: geo.geography_id, boundary_version: 'LN14-2012-v1', valid_from: geo.valid_from, valid_to: '', source_id: 'KENYA-LAW-LN14-2012', source_url: 'https://new.kenyalaw.org/akn/ke/act/ln/2012/14/eng@2022-12-31', source_crs: '', geometry_hash: '', quality_status: 'pending', limitation: 'Boundary description is legally referenced; machine-readable geometry has not yet passed CRS and topology validation.' }));
await writeFile(path.join(outputDir, 'geometry-versions.json'), JSON.stringify(geometryVersions, null, 2) + '\n');
await writeFile(path.join(outputDir, 'geometry-versions.csv'), toCsv(geometryVersions, ['geometry_id','geography_id','boundary_version','valid_from','valid_to','source_id','source_url','source_crs','geometry_hash','quality_status','limitation']));
console.log(JSON.stringify({ geographies: registry.length, country: 1, counties: counties.length, constituencies: constituencies.length, wards: wards.length, aliases: aliases.length, geometry_versions: geometryVersions.length, validated_geometries: 0 }, null, 2));

