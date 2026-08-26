import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = path.join(root, 'data/sprint1');

function parseCsv(raw, file) {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error(`${file}: empty CSV`);
  const headers = lines.shift().split(',');
  return lines.map((line, index) => {
    const cells = line.split(',');
    if (cells.length !== headers.length) throw new Error(`${file}:${index + 2}: expected ${headers.length} columns, found ${cells.length}`);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
  });
}

async function csv(name) { return parseCsv(await readFile(path.join(dataDir, name), 'utf8'), name); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function number(value, context) {
  const n = Number(value);
  assert(Number.isFinite(n), `${context}: expected a finite number, got ${JSON.stringify(value)}`);
  return n;
}
function normName(value) {
  return String(value || '').toLowerCase().replace(/[/'’.-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function validateCountyRows(rows, name, geoByCode, labelField = 'name') {
  assert(rows.length === 47, `${name}: expected 47 county rows, found ${rows.length}`);
  const codes = new Set();
  for (const [i, row] of rows.entries()) {
    assert(/^KEN-C\d{3}$/.test(row.geo_code), `${name}:${i + 2}: malformed geo_code ${row.geo_code}`);
    assert(!codes.has(row.geo_code), `${name}:${i + 2}: duplicate geo_code ${row.geo_code}`);
    codes.add(row.geo_code);
    const geo = geoByCode.get(row.geo_code);
    assert(geo, `${name}:${i + 2}: ${row.geo_code} does not resolve in canonical geography registry`);
    assert(geo.level === 'county', `${name}:${i + 2}: ${row.geo_code} resolves to ${geo.level}, expected county`);
    if (row[labelField]) {
      assert(normName(row[labelField]) === normName(geo.name), `${name}:${i + 2}: label ${JSON.stringify(row[labelField])} does not match canonical county ${JSON.stringify(geo.name)}`);
    }
  }
  return codes;
}

function checkAnchor(rows, code, field, expected, file) {
  const row = rows.find(r => r.geo_code === code);
  assert(row, `${file}: missing anchor county ${code}`);
  const actual = number(row[field], `${file}:${code}:${field}`);
  assert(actual === expected, `${file}:${code}:${field}: expected source-audited ${expected}, got ${actual}`);
}

const geography = JSON.parse(await readFile(path.join(root, 'data/geography/registry/geographies.json'), 'utf8'));
const geoByCode = new Map(geography.map(g => [g.geo_code, g]));
const canonicalCountyCodes = new Set(geography.filter(g => g.level === 'county').map(g => g.geo_code));
assert(canonicalCountyCodes.size === 47, `canonical geography registry: expected 47 counties, found ${canonicalCountyCodes.size}`);

const [population, voters, gcp, budget, fuel, fuelAudit] = await Promise.all([
  csv('population-2009.csv'), csv('voters-2022.csv'), csv('gcp-2020-2024.csv'),
  csv('county-budget-fy2024-25.csv'), csv('fuel-super-petrol-2026-08.csv'),
  csv('fuel-super-petrol-2026-08-audit.csv')
]);

for (const [name, rows] of [
  ['population-2009.csv', population], ['voters-2022.csv', voters],
  ['gcp-2020-2024.csv', gcp], ['county-budget-fy2024-25.csv', budget]
]) {
  const codes = validateCountyRows(rows, name, geoByCode);
  for (const code of canonicalCountyCodes) assert(codes.has(code), `${name}: missing canonical county ${code}`);
}

const populationTotal = population.reduce((sum, r, i) => sum + number(r.value, `population-2009.csv:${i + 2}:value`), 0);
assert(populationTotal === 38610097, `population-2009.csv: expected published Kenya total 38,610,097, got ${populationTotal.toLocaleString()}`);
checkAnchor(population, 'KEN-C047', 'value', 3138369, 'population-2009.csv');
checkAnchor(population, 'KEN-C037', 'value', 1660651, 'population-2009.csv');
checkAnchor(population, 'KEN-C039', 'value', 1375063, 'population-2009.csv');

const votersTotal = voters.reduce((sum, r, i) => sum + number(r.value, `voters-2022.csv:${i + 2}:value`), 0);
assert(votersTotal === 22102532, `voters-2022.csv: expected Gazette county-schedule total 22,102,532, got ${votersTotal.toLocaleString()}`);
assert(votersTotal !== 22120458, 'voters-2022.csv: county rows must preserve the Gazette release and must not be scaled to the later audited national topline');
checkAnchor(voters, 'KEN-C047', 'value', 2415310, 'voters-2022.csv');
checkAnchor(voters, 'KEN-C022', 'value', 1275008, 'voters-2022.csv');
checkAnchor(voters, 'KEN-C032', 'value', 1054856, 'voters-2022.csv');

for (const [i, row] of gcp.entries()) {
  for (const year of ['2020', '2021', '2022', '2023', '2024']) {
    const value = number(row[year], `gcp-2020-2024.csv:${i + 2}:${year}`);
    assert(value > 0, `gcp-2020-2024.csv:${i + 2}:${year}: GCP must be positive`);
  }
}
checkAnchor(gcp, 'KEN-C047', '2024', 4105576, 'gcp-2020-2024.csv');
checkAnchor(gcp, 'KEN-C032', '2024', 771775, 'gcp-2020-2024.csv');
checkAnchor(gcp, 'KEN-C023', '2024', 178441, 'gcp-2020-2024.csv');
checkAnchor(gcp, 'KEN-C022', '2024', 819834, 'gcp-2020-2024.csv');

for (const [i, row] of budget.entries()) {
  const b = number(row.budget_total_ksh_mn, `county-budget-fy2024-25.csv:${i + 2}:budget_total_ksh_mn`);
  const e = number(row.expenditure_total_ksh_mn, `county-budget-fy2024-25.csv:${i + 2}:expenditure_total_ksh_mn`);
  const dev = number(row.development_absorption_pct, `county-budget-fy2024-25.csv:${i + 2}:development_absorption_pct`);
  const overall = number(row.overall_absorption_pct, `county-budget-fy2024-25.csv:${i + 2}:overall_absorption_pct`);
  assert(b > 0 && e >= 0, `county-budget-fy2024-25.csv:${i + 2}: invalid budget/expenditure`);
  assert(e <= b * 1.01, `county-budget-fy2024-25.csv:${i + 2}: expenditure materially exceeds budget`);
  assert(dev >= 0 && dev <= 100 && overall >= 0 && overall <= 100, `county-budget-fy2024-25.csv:${i + 2}: absorption must be within 0..100`);
  const computed = (e / b) * 100;
  assert(Math.abs(computed - overall) <= 1.0, `county-budget-fy2024-25.csv:${i + 2}: overall absorption ${overall}% inconsistent with expenditure/budget ${computed.toFixed(2)}%`);
}
checkAnchor(budget, 'KEN-C047', 'budget_total_ksh_mn', 43564.27, 'county-budget-fy2024-25.csv');
checkAnchor(budget, 'KEN-C032', 'budget_total_ksh_mn', 23980.4, 'county-budget-fy2024-25.csv');
checkAnchor(budget, 'KEN-C045', 'budget_total_ksh_mn', 15155.35, 'county-budget-fy2024-25.csv');
checkAnchor(budget, 'KEN-C029', 'overall_absorption_pct', 98, 'county-budget-fy2024-25.csv');
checkAnchor(budget, 'KEN-C042', 'development_absorption_pct', 29, 'county-budget-fy2024-25.csv');

const fuelCodes = validateCountyRows(fuel, 'fuel-super-petrol-2026-08.csv', geoByCode, 'county');
for (const code of canonicalCountyCodes) assert(fuelCodes.has(code), `fuel-super-petrol-2026-08.csv: missing ${code}`);
assert(fuelAudit.length === 47, `fuel-super-petrol-2026-08-audit.csv: expected 47 audited mappings, found ${fuelAudit.length}`);
const auditByCode = new Map(fuelAudit.map(r => [r.geo_code, r]));
for (const [i, row] of fuel.entries()) {
  const price = number(row.super_petrol_kes_per_litre, `fuel-super-petrol-2026-08.csv:${i + 2}:price`);
  assert(price > 200 && price < 250, `fuel-super-petrol-2026-08.csv:${i + 2}: implausible Super Petrol price ${price}`);
  assert(row.pricing_town, `fuel-super-petrol-2026-08.csv:${i + 2}: pricing_town is required`);
  const audited = auditByCode.get(row.geo_code);
  assert(audited, `fuel-super-petrol-2026-08-audit.csv: missing audit mapping for ${row.geo_code}`);
  assert(normName(audited.county) === normName(row.county), `fuel audit county mismatch for ${row.geo_code}`);
  assert(audited.pricing_town === row.pricing_town, `fuel audit pricing-town mismatch for ${row.geo_code}`);
  assert(number(audited.super_petrol_kes_per_litre, `fuel audit ${row.geo_code}`) === price, `fuel audit price mismatch for ${row.geo_code}`);
  if (row.geo_code === 'KEN-C018') assert(audited.mapping_method === 'nearest_published_pricing_town', 'Nyandarua must remain explicitly flagged as nearest published pricing town');
  else assert(audited.mapping_method === 'direct_same_county', `${row.geo_code}: expected direct_same_county mapping`);
}
checkAnchor(fuel, 'KEN-C001', 'super_petrol_kes_per_litre', 210.87, 'fuel-super-petrol-2026-08.csv');
checkAnchor(fuel, 'KEN-C027', 'super_petrol_kes_per_litre', 213.69, 'fuel-super-petrol-2026-08.csv');
checkAnchor(fuel, 'KEN-C032', 'super_petrol_kes_per_litre', 212.92, 'fuel-super-petrol-2026-08.csv');
checkAnchor(fuel, 'KEN-C042', 'super_petrol_kes_per_litre', 213.69, 'fuel-super-petrol-2026-08.csv');
checkAnchor(fuel, 'KEN-C047', 'super_petrol_kes_per_litre', 214.03, 'fuel-super-petrol-2026-08.csv');

const sources = JSON.parse(await readFile(path.join(dataDir, 'sources.json'), 'utf8'));
for (const key of ['population_2009', 'registered_voters_2022', 'gcp_2020_2024', 'county_budget_fy2024_25', 'fuel_aug_sep_2026']) assert(sources.sources?.[key], `sources.json: missing ${key}`);
assert(sources.schema_version === '1.1', `sources.json: expected schema_version 1.1, got ${sources.schema_version}`);
assert(sources.sources.fuel_aug_sep_2026.note.includes('not a county average'), 'sources.json: fuel methodology must state that representative town values are not county averages');
assert(sources.sources.fuel_aug_sep_2026.note.includes('Nyandarua'), 'sources.json: Nyandarua proxy caveat must be explicit');

const ui = await readFile(path.join(root, 'assets/sprint1-ui.js'), 'utf8');
assert(ui.includes('function syncChoroplethFills()'), 'choropleth regression: missing fill synchronisation repair');
assert(ui.includes('path.style.fill = computedFill'), 'choropleth regression: computed D3 fill is not promoted to inline style');
assert(ui.includes('available: 47'), 'Sprint 1 UI: fuel coverage disclosure is not updated to 47 counties');

console.log(JSON.stringify({
  status: 'PASS', canonical_counties: canonicalCountyCodes.size,
  population_2009: { rows: population.length, total: populationTotal, source_anchors_checked: 3 },
  voters_2022: { rows: voters.length, gazette_county_schedule_total: votersTotal, later_audited_national_topline: 22120458, source_anchors_checked: 3 },
  gcp_2020_2024: { counties: gcp.length, annual_observations: gcp.length * 5, source_anchors_checked: 4 },
  county_budget_fy2024_25: { counties: budget.length, fields_validated: 4, source_anchors_checked: 5 },
  fuel_aug_sep_2026: { representative_counties: fuel.length, same_county_mappings: 46, nearest_town_proxies: 1, source_anchors_checked: 5 },
  choropleth_fill_regression_guard: 'PASS', lower_level_inheritance: 'none'
}, null, 2));
