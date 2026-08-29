import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readText = file => readFile(path.join(root, file), 'utf8');
const readJson = async file => JSON.parse(await readText(file));

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  return lines.filter(Boolean).map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}
function num(v) { return v === '' || v === null || v === undefined ? null : Number(v); }
function assert(condition, message) { if (!condition) throw new Error(message); }

const [areaRowsRaw, factRowsRaw, facilities, derivedArea, geographies] = await Promise.all([
  readText('data/geography/source/official-county-area-2019.csv').then(parseCsv),
  readText('data/place-facts/source/county-key-facts.csv').then(parseCsv),
  readJson('data/p04/health-facility-census-2023.json'),
  readJson('data/indicators/seed/derived/area-computed.json'),
  readJson('data/geography/registry/geographies.json')
]);

const countyGeos = geographies.filter(g => g.level === 'county').sort((a,b) => Number(a.county_code)-Number(b.county_code));
assert(countyGeos.length === 47, `expected 47 county geographies, got ${countyGeos.length}`);
assert(areaRowsRaw.length === 47, `expected 47 official area rows, got ${areaRowsRaw.length}`);
assert(factRowsRaw.length === 47, `expected 47 place-fact rows, got ${factRowsRaw.length}`);

const areaByCode = new Map(areaRowsRaw.map(r => [r.geo_code, {...r, land_area_km2:num(r.land_area_km2)}]));
const factByCode = new Map(factRowsRaw.map(r => [r.geo_code, r]));
const facilityByCode = new Map(facilities.counties.map(r => [r.geo_code, r]));
const derivedByCode = new Map(derivedArea.results.map(r => [r.geo_code, r]));

for (let i=0;i<47;i+=1) {
  const expected = String(i+1).padStart(3,'0');
  const geo = countyGeos[i];
  assert(String(geo.county_code).padStart(3,'0') === expected, `county order mismatch at ${expected}: ${geo.name}`);
  const a=areaByCode.get(geo.geo_code), f=factByCode.get(geo.geo_code), hf=facilityByCode.get(geo.geo_code);
  assert(a && f && hf, `missing place fact source for ${geo.geo_code}`);
  assert(a.name === geo.name, `official area name mismatch ${geo.geo_code}: ${a.name} vs ${geo.name}`);
  assert(f.name === geo.name, `place fact name mismatch ${geo.geo_code}: ${f.name} vs ${geo.name}`);
}

const total = (field) => factRowsRaw.reduce((sum,r)=>sum+(num(r[field])||0),0);
assert(total('public_primary_schools') === 23274, 'TSC primary-school total must reconcile to 23,274');
assert(total('primary_classroom_teachers') === 183929, 'TSC primary classroom-teacher total must reconcile to 183,929');
assert(total('public_secondary_schools') === 9246, 'TSC secondary-school total must reconcile to 9,246');
assert(total('secondary_teachers') === 108569, 'TSC secondary-teacher total must reconcile to 108,569');
assert(total('level4_hospitals_2017') === 349, 'MoH 2017 Level 4 total must reconcile to 349');
assert(total('level5_hospitals_2017') === 13, 'MoH 2017 Level 5 total must reconcile to 13');
assert(facilities.counties.reduce((sum,r)=>sum+Number(r.value||0),0) === 14883, 'MoH 2023 assessed-facility total must reconcile to 14,883');

const counties = countyGeos.map(geo => {
  const source = factByCode.get(geo.geo_code), area = areaByCode.get(geo.geo_code), facility=facilityByCode.get(geo.geo_code), derived=derivedByCode.get(geo.geo_code);
  const officialArea = area.land_area_km2, geometryArea = num(derived?.area_km2);
  return {
    county_number: String(geo.county_code).padStart(3,'0'),
    geo_code: geo.geo_code,
    geography_id: geo.geography_id,
    name: geo.name,
    land_area: {
      value: officialArea, unit: 'km²', period: '2019', status: 'official_direct',
      source: 'KNBS 2019 Kenya Population and Housing Census',
      source_url: 'https://www.knbs.or.ke/2019-kenya-population-and-housing-census-results/',
      source_table: 'Table 2.4 — Distribution of Population, Land Area and Population Density by County',
      geometry_cross_check_km2: geometryArea,
      geometry_delta_pct: geometryArea ? Math.round(((geometryArea-officialArea)/officialArea)*10000)/100 : null,
      rcmrd_cross_check: 'RCMRD Geoportal recorded as an independent boundary cross-check; KNBS is the numeric area authority.'
    },
    health: {
      facilities_assessed_2023: Number(facility.value),
      facilities_definition: facilities.counting_rule,
      facilities_source_url: facilities.source_url,
      level4_hospitals_2017: num(source.level4_hospitals_2017),
      level5_hospitals_2017: num(source.level5_hospitals_2017),
      level4_5_hospitals_2017: (num(source.level4_hospitals_2017)||0)+(num(source.level5_hospitals_2017)||0),
      hospitals_definition: 'Historical MoH 2017 infrastructure baseline: actual Level 4 primary-referral + Level 5 secondary-referral facilities.',
      hospitals_source_url: 'https://api.kmhfr.health.go.ke/media/Health_Infrastructure_Norms_and_Standards_2017.pdf',
      approximate_doctors_cra2011: num(source.approx_doctors_cra2011),
      doctors_definition: 'Historical approximate doctor count from CRA 2011, published by KIPPRA in 2013; not a current doctor count.',
      doctors_source_url: 'https://kippra.or.ke/wp-content/uploads/2021/02/ker2013.pdf'
    },
    education: {
      public_primary_schools_2023: num(source.public_primary_schools),
      primary_classroom_teachers_2023: num(source.primary_classroom_teachers),
      public_secondary_schools_2023: num(source.public_secondary_schools),
      secondary_teachers_2023: num(source.secondary_teachers),
      definition: 'TSC 2023 public-school establishments and teacher establishments from the Presidential Working Party report appendices; excludes private schools.',
      source_url: 'https://www.education.go.ke/sites/default/files/2023-08/B5%20REPORT%20OF%20THE%20PRESIDENTIAL%20WORKING%20PARTY%20ON%20EDUCATION%20REFORM%207th%20JULY%202023%20.pdf'
    }
  };
});

const areaAudit = {
  schema_version: 'kda.prep05.area-validation.v1',
  numeric_authority: {
    agency: 'Kenya National Bureau of Statistics (KNBS)',
    publication: '2019 Kenya Population and Housing Census',
    table: 'Table 2.4 — Distribution of Population, Land Area and Population Density by County',
    source_url: 'https://www.knbs.or.ke/2019-kenya-population-and-housing-census-results/',
    national_land_area_km2: 580876.3
  },
  spatial_cross_checks: [
    { agency:'Regional Centre for Mapping of Resources for Development (RCMRD)', resource:'RCMRD Geoportal', url:'https://geoportal.rcmrd.org/', role:'independent county-boundary cross-check; not used as numeric area authority' },
    { agency:'Kenya Ministry of Lands / Survey of Kenya', role:'official national mapping/boundary authority; retained as a second spatial authority where an accessible boundary service is available' }
  ],
  derived_geometry_method: derivedArea.method,
  derived_geometry_error_band_pct: derivedArea.estimated_error_band_pct,
  interpretation: 'Differences are reported rather than forced to zero. KNBS land area is the county headline. Geometry-derived area remains an estimate and is retained for constituency/ward spatial context.',
  counties: counties.map(c=>({county_number:c.county_number,geo_code:c.geo_code,name:c.name,official_knbs_land_area_km2:c.land_area.value,geometry_area_km2:c.land_area.geometry_cross_check_km2,delta_pct:c.land_area.geometry_delta_pct}))
};

const output = {
  schema_version: 'kda.prep05.place-facts.v1',
  generated_from: ['data/place-facts/source/county-key-facts.csv','data/geography/source/official-county-area-2019.csv','data/p04/health-facility-census-2023.json','data/indicators/seed/derived/area-computed.json'],
  purpose: 'Pre-P05 contextual place facts. These values do not count toward the P05 indicator-breadth acceptance gate.',
  small_area_rule: 'County facts are never inherited to constituencies or wards. At constituency/ward level the UI may show only directly published local facts or explicitly labelled geometry-derived area.',
  county_sort_rule: 'Formal county number, 001 Mombasa through 047 Nairobi City.',
  validation: {
    counties: 47,
    public_primary_schools_2023: total('public_primary_schools'),
    primary_classroom_teachers_2023: total('primary_classroom_teachers'),
    public_secondary_schools_2023: total('public_secondary_schools'),
    secondary_teachers_2023: total('secondary_teachers'),
    level4_hospitals_2017: total('level4_hospitals_2017'),
    level5_hospitals_2017: total('level5_hospitals_2017'),
    facilities_assessed_2023: facilities.national_total_assessed
  },
  counties
};

await mkdir(path.join(root,'data/place-facts'),{recursive:true});
await writeFile(path.join(root,'data/place-facts/county-key-facts.json'),JSON.stringify(output,null,2)+'\n');
await writeFile(path.join(root,'data/geography/county-area-validation.json'),JSON.stringify(areaAudit,null,2)+'\n');
console.log(`PREP05_PLACE_FACTS_OK counties=${counties.length} facilities=${facilities.national_total_assessed}`);
console.log('PREP05_EDUCATION_RECONCILIATION_OK primary=23274 secondary=9246');
console.log('PREP05_HOSPITAL_BASELINE_RECONCILIATION_OK level4=349 level5=13');
console.log('PREP05_AREA_AUDIT_OK authority=KNBS crosscheck=RCMRD');
