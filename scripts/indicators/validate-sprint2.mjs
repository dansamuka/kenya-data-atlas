import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CODED_URL = 'https://raw.githubusercontent.com/samy-migwi/kenya_2022_voters_dashboard_app/29b269a6562262a77faf6d22ba5837f46d35df75/data/voters.csv';
const CROSSCHECK_URL = 'https://raw.githubusercontent.com/AllanGachomo/Kenya-Voters-Registration-Analysis-and-Prediction/03eeb949416ef7e28e6a4a4725a0de3a756fa7f5/Data/Clean/Registered%20Voters%20per%20CAW%202022.csv';
const HOLD_CONSTITUENCIES = new Set([43, 44]); // Mandera East, Lafey

function assert(condition, message) { if (!condition) throw new Error(message); }
function norm(value) {
  return String(value || '').toUpperCase().normalize('NFKD')
    .replace(/[’‘]/g, "'").replace(/\bCITY\b/g, '').replace(/[^A-Z0-9]+/g, '');
}
function parseCoded(raw) {
  const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const header = lines.shift();
  assert(header?.includes('Registered Voters'), 'coded source: unexpected header');
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
function groupBy(items, keyFn) {
  const out = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}
function multiset(rows, keyFn, valueFn) {
  const out = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(valueFn(row));
  }
  for (const values of out.values()) values.sort((a, b) => a - b);
  return out;
}
function arraysEqual(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }

function resolveSafeConstituency(sourceRows, canonicalRows) {
  const available = new Map(canonicalRows.map(g => [Number(g.ward_code), g]));
  const mapped = new Map();
  const methods = new Map();

  for (const row of sourceRows) {
    const candidates = [...available.values()].filter(g => norm(g.name) === norm(row.ward_name));
    if (candidates.length === 1) {
      const ward = candidates[0];
      mapped.set(row.ward_code, ward);
      methods.set(row.ward_code, Number(ward.ward_code) === row.ward_code ? 'code_and_name' : 'name_crosswalk');
      available.delete(Number(ward.ward_code));
    }
  }
  for (const row of sourceRows) {
    if (mapped.has(row.ward_code)) continue;
    const direct = available.get(row.ward_code);
    if (direct) {
      mapped.set(row.ward_code, direct);
      methods.set(row.ward_code, 'code_label_variant');
      available.delete(row.ward_code);
    }
  }
  const remainingSource = sourceRows.filter(r => !mapped.has(r.ward_code)).sort((a, b) => a.ward_code - b.ward_code);
  const remainingCanonical = [...available.values()].sort((a, b) => Number(a.ward_code) - Number(b.ward_code));
  assert(remainingSource.length === remainingCanonical.length, `residual imbalance in constituency ${sourceRows[0]?.constituency_code}`);
  remainingSource.forEach((row, i) => {
    mapped.set(row.ward_code, remainingCanonical[i]);
    methods.set(row.ward_code, 'residual_one_to_one');
  });
  assert(mapped.size === sourceRows.length, `incomplete crosswalk in constituency ${sourceRows[0]?.constituency_code}`);
  return { mapped, methods };
}

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

// Sprint 1 must remain green beneath Local Kenya.
assert(/\*\*PASS with one disclosed modelling caveat\.\*\*/.test(sprint1Validation), 'Sprint 1 validation report is not in PASS state');
assert(/47\/47/.test(sprint1Validation), 'Sprint 1 no longer records 47/47 county coverage');

const coded = parseCoded(codedRaw);
assert(coded.length === 1450, `expected 1,450 domestic IEBC ward rows, found ${coded.length}`);
assert(coded.every(r => Number.isInteger(r.voters) && r.voters > 0), 'source contains invalid voter counts');
assert(coded.reduce((sum, r) => sum + r.voters, 0) === 22102532, 'IEBC ward schedule total != 22,102,532');

const wardCodes = new Set(coded.map(r => r.ward_code));
const constituencyCodes = new Set(coded.map(r => r.constituency_code));
const countyCodes = new Set(coded.map(r => r.county_code));
assert(wardCodes.size === 1450 && constituencyCodes.size === 290 && countyCodes.size === 47, 'source code coverage is not 47/290/1,450');
for (let i = 1; i <= 1450; i += 1) assert(wardCodes.has(i), `missing source ward code ${i}`);
for (let i = 1; i <= 290; i += 1) assert(constituencyCodes.has(i), `missing constituency code ${i}`);
for (let i = 1; i <= 47; i += 1) assert(countyCodes.has(i), `missing county code ${i}`);

const geographies = JSON.parse(geographiesRaw);
const counties = geographies.filter(g => g.level === 'county');
const constituencies = geographies.filter(g => g.level === 'constituency');
const wards = geographies.filter(g => g.level === 'ward');
assert(counties.length === 47 && constituencies.length === 290 && wards.length === 1450, 'canonical geography registry is not 47/290/1,450');

const countyByCode = new Map(counties.map(g => [Number(g.county_code), g]));
const constituencyByCode = new Map(constituencies.map(g => [Number(g.constituency_code), g]));
const sourceByConstituency = groupBy(coded, r => r.constituency_code);
const canonicalByConstituency = groupBy(wards, g => Number(g.constituency_code));

// County/constituency numeric codes and canonical parent IDs are authoritative.
// Labels may differ by punctuation, spelling or truncation across source vintages.
for (const row of coded) {
  const county = countyByCode.get(row.county_code);
  const constituency = constituencyByCode.get(row.constituency_code);
  assert(county && constituency, `unresolved hierarchy at source CAW ${row.ward_code}`);
  assert(constituency.parent_id === county.geography_id, `constituency ${row.constituency_code}: canonical parent mismatch`);
}

// Statistical aggregates use every source row, including the spatial holds.
const constituencyTotals = new Map();
const countyTotals = new Map();
for (const row of coded) {
  constituencyTotals.set(row.constituency_code, (constituencyTotals.get(row.constituency_code) || 0) + row.voters);
  countyTotals.set(row.county_code, (countyTotals.get(row.county_code) || 0) + row.voters);
}
assert(constituencyTotals.size === 290 && countyTotals.size === 47, 'aggregate coverage incomplete');

const countyLines = countyRaw.trim().split(/\r?\n/);
const countyHeaders = countyLines.shift().split(',');
const countyRows = countyLines.map(line => Object.fromEntries(countyHeaders.map((h, i) => [h, line.split(',')[i]])));
assert(countyRows.length === 47, `Sprint 1 county schedule has ${countyRows.length} rows`);
for (const row of countyRows) {
  const code = Number(row.geo_code.replace('KEN-C', ''));
  assert(countyTotals.get(code) === Number(row.value), `county ${code}: ward sum ${countyTotals.get(code)} != official county ${row.value}`);
}

// Independent transcription check, constituency by constituency.
const independent = parseCsv(independentRaw).filter(r => norm(r['County Name']) !== 'DIASPORA');
assert(independent.length === 1450, `independent transcription has ${independent.length} domestic ward rows`);
const codedGroups = multiset(coded, r => `${norm(r.county_name)}|${norm(r.constituency_name)}`, r => r.voters);
const independentGroups = multiset(independent, r => `${norm(r['County Name'])}|${norm(r['Constituency Name'])}`, r => Number(r['Number of Registered Voters']));
assert(codedGroups.size === 290 && independentGroups.size === 290, 'independent cross-check does not contain 290 constituency groups');
for (const [key, values] of codedGroups) {
  const other = independentGroups.get(key);
  assert(other, `independent transcription missing ${key}`);
  assert(arraysEqual(values, other), `independent voter values disagree in ${key}`);
}

// Spatial publication: hold exactly Mandera East + Lafey, map everything else one-to-one.
const usedCanonical = new Set();
const publishedCrosswalks = [];
const holds = [];
for (let code = 1; code <= 290; code += 1) {
  const sourceRows = sourceByConstituency.get(code) || [];
  const canonicalRows = canonicalByConstituency.get(code) || [];
  assert(sourceRows.length > 0, `constituency ${code}: no source ward rows`);
  assert(canonicalRows.length === sourceRows.length, `constituency ${code}: source/canonical ward count mismatch ${sourceRows.length}/${canonicalRows.length}`);

  if (HOLD_CONSTITUENCIES.has(code)) {
    sourceRows.forEach(row => holds.push(row));
    continue;
  }

  const { mapped, methods } = resolveSafeConstituency(sourceRows, canonicalRows);
  for (const row of sourceRows) {
    const ward = mapped.get(row.ward_code);
    assert(ward, `source CAW ${row.ward_code}: unresolved safe mapping`);
    assert(!usedCanonical.has(ward.geography_id), `canonical ward ${ward.geo_code} assigned twice`);
    assert(Number(ward.constituency_code) === row.constituency_code, `source CAW ${row.ward_code}: mapping left constituency`);
    assert(Number(ward.county_code) === row.county_code, `source CAW ${row.ward_code}: mapping left county`);
    usedCanonical.add(ward.geography_id);
    if (Number(ward.ward_code) !== row.ward_code || norm(ward.name) !== norm(row.ward_name)) {
      publishedCrosswalks.push({ row, ward, method: methods.get(row.ward_code) });
    }
  }
}
assert(holds.length === 10, `expected 10 spatial holds, found ${holds.length}`);
assert(holds.every(r => r.county_code === 9 && HOLD_CONSTITUENCIES.has(r.constituency_code)), 'spatial hold escaped Mandera East/Lafey');
assert(sourceByConstituency.get(43)?.length === 5 && sourceByConstituency.get(44)?.length === 5, 'Mandera East/Lafey hold should contain five source wards each');
assert(usedCanonical.size === 1440, `expected 1,440 safely mapped canonical wards, found ${usedCanonical.size}`);
assert(publishedCrosswalks.length === 54, `expected 54 published source→canonical crosswalks outside holds, found ${publishedCrosswalks.length}`);

// Locked examples protect reordering, spelling variants and an ordinary direct row.
const kibirichia = publishedCrosswalks.find(x => x.row.ward_code === 289);
assert(kibirichia?.ward.name === 'Kibirichia' && Number(kibirichia.ward.ward_code) === 285 && kibirichia.method === 'name_crosswalk', 'Kibirichia crosswalk regression');
const hirimani = publishedCrosswalks.find(x => x.row.ward_code === 97);
assert(hirimani?.ward.name === 'Bura' && Number(hirimani.ward.ward_code) === 97 && hirimani.method === 'code_label_variant', 'Hirimani/Bura label-version regression');
assert(holds.some(r => r.constituency_code === 43 && r.ward_name === 'LIBEHIA'), 'Mandera East Libehia must remain on spatial hold');

// Gazette anchors.
const voterAtWard = code => coded.find(r => r.ward_code === code)?.voters;
assert(constituencyTotals.get(1) === 93561, 'Changamwe anchor failed');
assert(constituencyTotals.get(2) === 75085, 'Jomvu anchor failed');
assert(constituencyTotals.get(3) === 135276, 'Kisauni anchor failed');
assert(constituencyTotals.get(91) === 72997, 'Ol Kalou constituency anchor failed');
assert(voterAtWard(453) === 13594 && voterAtWard(454) === 15596 && voterAtWard(455) === 14695 && voterAtWard(456) === 13540 && voterAtWard(457) === 15572, 'Ol Kalou ward anchors failed');
assert(constituencyTotals.get(290) === 123163 && voterAtWard(1450) === 19193, 'Mathare/Kiamaiko anchors failed');

// Runtime/disclosure regression guards.
assert(loader.includes('SPATIAL_HOLD_CONSTITUENCIES = new Set([43, 44])'), 'runtime Mandera spatial-hold guard missing');
assert(loader.includes('usedCanonical.size === 1440'), 'runtime 1,440 mapped-ward guard missing');
assert(loader.includes('S2.spatialHolds.length === 10'), 'runtime 10-row spatial-hold guard missing');
assert(loader.includes("x ? 'B' : 'A'"), 'runtime crosswalk badge downgrade missing');
assert(loader.includes("x ? 'crosswalked_official' : 'direct_official'"), 'runtime crosswalk method downgrade missing');
assert(loader.includes('crosswalk_id'), 'runtime observation crosswalk identifiers missing');
assert(loader.toLowerCase().includes('no parent value inherited'), 'anti-inheritance disclosure missing');
assert(ui.includes('1,440/1,450') && ui.includes('10 ward rows'), 'UI spatial coverage disclosure missing');
assert(index.indexOf('assets/sprint1-data.js') < index.indexOf('assets/sprint2-data.js'), 'Sprint 2 must wrap Sprint 1 data overlay');
assert(index.indexOf('assets/sprint2-data.js') < index.indexOf('assets/geo-explorer.js'), 'Sprint 2 data must load before Geo Explorer');
assert(index.indexOf('assets/geo-explorer.js') < index.indexOf('assets/sprint2-ui.js'), 'Sprint 2 UI must load after Geo Explorer');

const manifest = JSON.parse(manifestRaw);
assert(manifest.sources.iebc_gazette_2022.quality === 'A', 'official IEBC source must remain quality A');
assert(manifest.sources.coded_transcription.commit === '29b269a6562262a77faf6d22ba5837f46d35df75', 'coded transcription not pinned');
assert(manifest.sources.independent_transcription.commit === '03eeb949416ef7e28e6a4a4725a0de3a756fa7f5', 'independent transcription not pinned');

const methods = Object.fromEntries([...new Set(publishedCrosswalks.map(x => x.method))].sort().map(method => [method, publishedCrosswalks.filter(x => x.method === method).length]));
console.log('PASS: Data Sprint 2 Local Kenya — 47/47 counties reconciled; 290/290 constituencies; all 1,450 IEBC ward rows ingested; national total 22,102,532.');
console.log(`      Spatial publication: 1,440/1,450 wards mapped; 10 Mandera East/Lafey rows held rather than guessed; ${publishedCrosswalks.length} published ward crosswalks badged B; methods ${JSON.stringify(methods)}.`);
console.log('      Two pinned transcriptions agree constituency-by-constituency; Gazette anchors pass; lower-level inheritance: none.');
