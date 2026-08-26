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
    if (cells.length !== headers.length) {
      throw new Error(`${file}:${index + 2}: expected ${headers.length} columns, found ${cells.length}`);
    }
    return Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
  });
}

async function csv(name) {
  return parseCsv(await readFile(path.join(dataDir, name), 'utf8'), name);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function number(value, context) {
  const n = Number(value);
  assert(Number.isFinite(n), `${context}: expected a finite number, got ${JSON.stringify(value)}`);
  return n;
}

function validateCountyRows(rows, name, geoByCode) {
  assert(rows.length === 47, `${name}: expected 47 county rows, found ${rows.length}`);
  const codes = new Set();
  for (const [i, row] of rows.entries()) {
    assert(/^KEN-C\d{3}$/.test(row.geo_code), `${name}:${i + 2}: malformed geo_code ${row.geo_code}`);
    assert(!codes.has(row.geo_code), `${name}:${i + 2}: duplicate geo_code ${row.geo_code}`);
    codes.add(row.geo_code);
    const geo = geoByCode.get(row.geo_code);
    assert(geo, `${name}:${i + 2}: ${row.geo_code} does not resolve in canonical geography registry`);
    assert(geo.level === 'county', `${name}:${i + 2}: ${row.geo_code} resolves to ${geo.level}, expected county`);
  }
  return codes;
}

const geography = JSON.parse(await readFile(path.join(root, 'data/geography/registry/geographies.json'), 'utf8'));
const geoByCode = new Map(geography.map(g => [g.geo_code, g]));
const canonicalCountyCodes = new Set(geography.filter(g => g.level === 'county').map(g => g.geo_code));
assert(canonicalCountyCodes.size === 47, `canonical geography registry: expected 47 counties, found ${canonicalCountyCodes.size}`);

const [population, voters, gcp, budget, fuel] = await Promise.all([
  csv('population-2009.csv'),
  csv('voters-2022.csv'),
  csv('gcp-2020-2024.csv'),
  csv('county-budget-fy2024-25.csv'),
  csv('fuel-super-petrol-2026-08.csv')
]);

for (const [name, rows] of [
  ['population-2009.csv', population],
  ['voters-2022.csv', voters],
  ['gcp-2020-2024.csv', gcp],
  ['county-budget-fy2024-25.csv', budget]
]) {
  const codes = validateCountyRows(rows, name, geoByCode);
  for (const code of canonicalCountyCodes) assert(codes.has(code), `${name}: missing canonical county ${code}`);
}

const populationTotal = population.reduce((sum, r, i) => sum + number(r.value, `population-2009.csv:${i + 2}:value`), 0);
assert(populationTotal === 38610097, `population-2009.csv: expected published Kenya total 38,610,097, got ${populationTotal.toLocaleString()}`);

const votersTotal = voters.reduce((sum, r, i) => sum + number(r.value, `voters-2022.csv:${i + 2}:value`), 0);
assert(votersTotal === 22102532, `voters-2022.csv: expected Gazette county-schedule total 22,102,532, got ${votersTotal.toLocaleString()}`);
assert(votersTotal !== 22120458, 'voters-2022.csv: county rows must preserve the Gazette release and must not be scaled to the later audited national topline');

for (const [i, row] of gcp.entries()) {
  for (const year of ['2020', '2021', '2022', '2023', '2024']) {
    const value = number(row[year], `gcp-2020-2024.csv:${i + 2}:${year}`);
    assert(value > 0, `gcp-2020-2024.csv:${i + 2}:${year}: GCP must be positive`);
  }
}

for (const [i, row] of budget.entries()) {
  const b = number(row.budget_total_ksh_mn, `county-budget-fy2024-25.csv:${i + 2}:budget_total_ksh_mn`);
  const e = number(row.expenditure_total_ksh_mn, `county-budget-fy2024-25.csv:${i + 2}:expenditure_total_ksh_mn`);
  const dev = number(row.development_absorption_pct, `county-budget-fy2024-25.csv:${i + 2}:development_absorption_pct`);
  const overall = number(row.overall_absorption_pct, `county-budget-fy2024-25.csv:${i + 2}:overall_absorption_pct`);
  assert(b > 0 && e >= 0, `county-budget-fy2024-25.csv:${i + 2}: invalid budget/expenditure`);
  assert(dev >= 0 && dev <= 100 && overall >= 0 && overall <= 100, `county-budget-fy2024-25.csv:${i + 2}: absorption must be within 0..100`);
  const computed = (e / b) * 100;
  assert(Math.abs(computed - overall) <= 1.0, `county-budget-fy2024-25.csv:${i + 2}: overall absorption ${overall}% inconsistent with expenditure/budget ${computed.toFixed(2)}%`);
}

assert(fuel.length === 5, `fuel-super-petrol-2026-08.csv: expected 5 pricing-town rows, found ${fuel.length}`);
const expectedFuelCodes = new Set(['KEN-C001', 'KEN-C027', 'KEN-C032', 'KEN-C042', 'KEN-C047']);
const fuelCodes = new Set();
for (const [i, row] of fuel.entries()) {
  assert(!fuelCodes.has(row.geo_code), `fuel-super-petrol-2026-08.csv:${i + 2}: duplicate ${row.geo_code}`);
  fuelCodes.add(row.geo_code);
  assert(expectedFuelCodes.has(row.geo_code), `fuel-super-petrol-2026-08.csv:${i + 2}: unexpected county link ${row.geo_code}`);
  const geo = geoByCode.get(row.geo_code);
  assert(geo?.level === 'county', `fuel-super-petrol-2026-08.csv:${i + 2}: ${row.geo_code} is not a canonical county`);
  assert(number(row.super_petrol_kes_per_litre, `fuel-super-petrol-2026-08.csv:${i + 2}:price`) > 0, `fuel-super-petrol-2026-08.csv:${i + 2}: price must be positive`);
  assert(row.pricing_town, `fuel-super-petrol-2026-08.csv:${i + 2}: pricing_town is required`);
}
for (const code of expectedFuelCodes) assert(fuelCodes.has(code), `fuel-super-petrol-2026-08.csv: missing ${code}`);

const sources = JSON.parse(await readFile(path.join(dataDir, 'sources.json'), 'utf8'));
for (const key of ['population_2009', 'registered_voters_2022', 'gcp_2020_2024', 'county_budget_fy2024_25', 'fuel_aug_sep_2026']) {
  assert(sources.sources?.[key], `sources.json: missing ${key}`);
}

console.log(JSON.stringify({
  status: 'PASS',
  canonical_counties: canonicalCountyCodes.size,
  population_2009: { rows: population.length, total: populationTotal },
  voters_2022: { rows: voters.length, gazette_county_schedule_total: votersTotal, later_audited_national_topline: 22120458 },
  gcp_2020_2024: { counties: gcp.length, annual_observations: gcp.length * 5 },
  county_budget_fy2024_25: { counties: budget.length, fields_validated: 4 },
  fuel_aug_sep_2026: { pricing_towns: fuel.length, county_links: [...fuelCodes].sort() },
  lower_level_inheritance: 'none'
}, null, 2));
