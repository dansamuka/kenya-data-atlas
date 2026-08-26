import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CODED_URL = 'https://raw.githubusercontent.com/samy-migwi/kenya_2022_voters_dashboard_app/29b269a6562262a77faf6d22ba5837f46d35df75/data/voters.csv';
const CROSSCHECK_URL = 'https://raw.githubusercontent.com/AllanGachomo/Kenya-Voters-Registration-Analysis-and-Prediction/03eeb949416ef7e28e6a4a4725a0de3a756fa7f5/Data/Clean/Registered%20Voters%20per%20CAW%202022.csv';

function assert(condition, message) { if (!condition) throw new Error(message); }
function norm(value) {
  return String(value || '').toUpperCase().normalize('NFKD')
    .replace(/[’‘]/g, "'")
    .replace(/\bCITY\b/g, '')
    .replace(/[^A-Z0-9]+/g, '');
}
function parseCoded(raw) {
  const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const header = lines.shift();
  assert(header.includes('Registered Voters'), 'coded source: unexpected header');
  return lines.filter(Boolean).map((line, i) => {
    const c = line.split(',');
    assert(c.length >= 8, `coded source:${i + 2}: malformed row`);
    return {
      county_code: Number(c[1]), county_name: c[2].trim(),
      constituency_code: Number(c[3]), constituency_name: c[4].trim(),
      ward_code: Number(c[5]), ward_name: c[6].trim(), voters: Number(c[7])
    };
  });
}
function parseCsv(raw) {
  const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split(',');
  return lines.map((line, i) => {
    const c = line.split(',');
    assert(c.length === headers.length, `cross-check source:${i + 2}: malformed row`);
    return Object.fromEntries(headers.map((h, j) => [h, c[j]]));
  });
}
async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Kenya-Data-Atlas-validation' } });
  assert(response.ok, `failed to fetch pinned source ${url}: ${response.status}`);
  return response.text();
}
function groupMultiset(rows, keyFn, valFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(valFn(row));
  }
  for (const values of groups.values()) values.sort((a, b) => a - b);
  return groups;
}
function sameArray(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }

const [codedRaw, independentRaw, geographiesRaw, countyRaw, loader, ui, index, sprint1Validation, manifestRaw] = await Promise.all([
  fetchText(CODED_URL),
  fetchText(CROSSCHECK_URL),
  readFile(path.join(root, 'data/geography/registry/geographies.json'), 'utf8'),
  readFile(path.join(root, 'data/sprint1/voters-2022.csv'), 'utf8'),
  readFile(path.join(root, 'assets/sprint2-data.js'), 'utf8'),
  readFile(path.join(root, 'assets/sprint2-ui.js'), 'utf8'),
  readFile(path.join(root, 'index.html'), 'utf8'),
  readFile(path.join(root, 'data/sprint1/VALIDATION.md'), 'utf8'),
  readFile(path.join(root, 'data/sprint2/sources.json'), 'utf8')
]);

// Sprint 1 gate: Sprint 2 is not allowed to publish on top of a knowingly incomplete County Core.
assert(/\*\*PASS with one disclosed modelling caveat\.\*\*/.test(sprint1Validation), 'Sprint 1 validation report is not in PASS state');
assert(/47\/47/.test(sprint1Validation), 'Sprint 1 validation report no longer records complete county coverage');

const coded = parseCoded(codedRaw);
assert(coded.length === 1450, `coded IEBC transcription: expected 1,450 wards, found ${coded.length}`);
assert(coded.every(r => Number.isInteger(r.voters) && r.voters > 0), 'coded source contains invalid voter counts');
assert(coded.reduce((s, r) => s + r.voters, 0) === 22102532, 'First Schedule total does not equal 22,102,532');

const wardCodes = new Set(coded.map(r => r.ward_code));
const constituencyCodes = new Set(coded.map(r => r.constituency_code));
const countyCodes = new Set(coded.map(r => r.county_code));
assert(wardCodes.size === 1450, `expected 1,450 unique ward codes, found ${wardCodes.size}`);
assert(constituencyCodes.size === 290, `expected 290 unique constituency codes, found ${constituencyCodes.size}`);
assert(countyCodes.size === 47, `expected 47 county codes, found ${countyCodes.size}`);
for (let i = 1; i <= 1450; i++) assert(wardCodes.has(i), `missing IEBC ward code ${i}`);
for (let i = 1; i <= 290; i++) assert(constituencyCodes.has(i), `missing IEBC constituency code ${i}`);
for (let i = 1; i <= 47; i++) assert(countyCodes.has(i), `missing IEBC county code ${i}`);

const geographies = JSON.parse(geographiesRaw);
const countyByCode = new Map(geographies.filter(g => g.level === 'county').map(g => [Number(g.county_code), g]));
const constituencyByCode = new Map(geographies.filter(g => g.level === 'constituency').map(g => [Number(g.constituency_code), g]));
const wardByCode = new Map(geographies.filter(g => g.level === 'ward').map(g => [Number(g.ward_code), g]));
assert(countyByCode.size === 47 && constituencyByCode.size === 290 && wardByCode.size === 1450, 'canonical geography registry is not 47/290/1450');

let wardNameMismatches = 0;
const constituencyTotals = new Map();
const countyTotals = new Map();
for (const row of coded) {
  const county = countyByCode.get(row.county_code);
  const constituency = constituencyByCode.get(row.constituency_code);
  const ward = wardByCode.get(row.ward_code);
  assert(county && constituency && ward, `unresolved IEBC hierarchy at ward ${row.ward_code}`);
  assert(constituency.parent_id === county.geography_id, `constituency ${row.constituency_code} parent mismatch`);
  assert(ward.parent_id === constituency.geography_id, `ward ${row.ward_code} parent mismatch`);
  assert(Number(ward.county_code) === row.county_code, `ward ${row.ward_code} county-code mismatch`);
  assert(Number(ward.constituency_code) === row.constituency_code, `ward ${row.ward_code} constituency-code mismatch`);
  assert(norm(county.name) === norm(row.county_name), `ward ${row.ward_code}: source county ${row.county_name} != canonical ${county.name}`);
  assert(norm(constituency.name) === norm(row.constituency_name), `ward ${row.ward_code}: source constituency ${row.constituency_name} != canonical ${constituency.name}`);
  if (norm(ward.name) !== norm(row.ward_name)) wardNameMismatches++;
  constituencyTotals.set(row.constituency_code, (constituencyTotals.get(row.constituency_code) || 0) + row.voters);
  countyTotals.set(row.county_code, (countyTotals.get(row.county_code) || 0) + row.voters);
}
assert(constituencyTotals.size === 290, `derived constituency coverage ${constituencyTotals.size}/290`);

// Full reconciliation to the already-audited official Third Schedule county layer.
const countyLines = countyRaw.trim().split(/\r?\n/);
const countyHeaders = countyLines.shift().split(',');
const countyRows = countyLines.map(line => Object.fromEntries(countyHeaders.map((h, i) => [h, line.split(',')[i]])));
assert(countyRows.length === 47, `Sprint 1 county schedule has ${countyRows.length} rows`);
for (const row of countyRows) {
  const code = Number(row.geo_code.replace('KEN-C', ''));
  assert(countyTotals.get(code) === Number(row.value), `county ${code}: ward sum ${countyTotals.get(code)} != official county ${row.value}`);
}

// Independent full-file transcription cross-check. Diaspora rows are outside the Atlas local hierarchy.
const independent = parseCsv(independentRaw).filter(r => norm(r['County Name']) !== 'DIASPORA');
assert(independent.length === 1450, `independent transcription: expected 1,450 domestic wards, found ${independent.length}`);
const codedGroups = groupMultiset(coded, r => `${norm(r.county_name)}|${norm(r.constituency_name)}`, r => r.voters);
const independentGroups = groupMultiset(independent, r => `${norm(r['County Name'])}|${norm(r['Constituency Name'])}`, r => Number(r['Number of Registered Voters']));
assert(codedGroups.size === 290 && independentGroups.size === 290, 'cross-check does not contain 290 constituency groups');
for (const [key, values] of codedGroups) {
  const other = independentGroups.get(key);
  assert(other, `independent transcription missing constituency group ${key}`);
  assert(sameArray(values, other), `independent transcription voter values disagree in ${key}`);
}

// Gazette anchors from the First and Second Schedules.
const voterAtWard = code => coded.find(r => r.ward_code === code)?.voters;
assert(constituencyTotals.get(1) === 93561, 'Changamwe official Second Schedule anchor failed');
assert(constituencyTotals.get(2) === 75085, 'Jomvu official Second Schedule anchor failed');
assert(constituencyTotals.get(3) === 135276, 'Kisauni official Second Schedule anchor failed');
assert(constituencyTotals.get(4) === 124253, 'Nyali official Second Schedule anchor failed');
assert(constituencyTotals.get(5) === 94764, 'Likoni official Second Schedule anchor failed');
assert(constituencyTotals.get(6) === 118974, 'Mvita official Second Schedule anchor failed');
assert(constituencyTotals.get(91) === 72997, 'Ol Kalou constituency anchor failed');
assert(voterAtWard(453) === 13594 && voterAtWard(454) === 15596 && voterAtWard(455) === 14695 && voterAtWard(456) === 13540 && voterAtWard(457) === 15572, 'Ol Kalou five-ward official anchors failed');
assert(constituencyTotals.get(290) === 123163 && voterAtWard(1450) === 19193, 'Mathare/Kiamaiko anchors failed');

// Publication architecture and anti-inheritance regression guards.
assert(loader.includes("method: 'direct_official'"), 'Sprint 2 ward observations are no longer explicitly direct_official');
assert(loader.includes("method: 'derived_official'"), 'Sprint 2 constituency observations are no longer explicitly derived_official');
assert(loader.includes('no parent value inherited'), 'anti-inheritance disclosure missing from runtime overlay');
assert(loader.includes('rows.length === 1450') && loader.includes('constituencyCodes.size === 290'), 'runtime coverage assertions missing');
assert(loader.includes('countyTotals.get(code) === expected'), 'runtime county reconciliation guard missing');
assert(ui.includes('1,450/1,450') && ui.includes('290/290'), 'Local Kenya coverage disclosure missing from UI');
assert(index.indexOf('assets/sprint1-data.js') < index.indexOf('assets/sprint2-data.js'), 'Sprint 2 must wrap Sprint 1 data overlay');
assert(index.indexOf('assets/sprint2-data.js') < index.indexOf('assets/geo-explorer.js'), 'Sprint 2 data overlay must load before Geo Explorer');
assert(index.indexOf('assets/geo-explorer.js') < index.indexOf('assets/sprint2-ui.js'), 'Sprint 2 UI must load after Geo Explorer');

const manifest = JSON.parse(manifestRaw);
assert(manifest.sources.iebc_gazette_2022.quality === 'A', 'official IEBC source must remain quality A');
assert(manifest.sources.coded_transcription.commit === '29b269a6562262a77faf6d22ba5837f46d35df75', 'coded transcription is not commit-pinned');
assert(manifest.sources.independent_transcription.commit === '03eeb949416ef7e28e6a4a4725a0de3a756fa7f5', 'independent transcription is not commit-pinned');

console.log(`PASS: Data Sprint 2 Local Kenya — 47 counties reconciled, 290/290 constituency totals, 1,450/1,450 direct ward observations, national total 22,102,532.`);
console.log('      Two pinned machine-readable transcriptions agree constituency-by-constituency; canonical code hierarchy and official Gazette anchors pass.');
console.log(`      Canonical/source ward-label punctuation or spelling differences recorded: ${wardNameMismatches}; codes, parentage and values govern joins.`);
