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

function buildCrosswalk(sourceRows, geographies) {
  const sourceByCon = groupBy(sourceRows, r => r.constituency_code);
  const canonicalWards = geographies.filter(g => g.level === 'ward');
  const canonicalByCon = groupBy(canonicalWards, g => Number(g.constituency_code));
  const mapping = new Map();
  const usedCanonical = new Set();
  const crosswalks = [];

  for (let code = 1; code <= 290; code += 1) {
    const source = [...(sourceByCon.get(code) || [])].sort((a, b) => a.ward_code - b.ward_code);
    const canonical = [...(canonicalByCon.get(code) || [])].sort((a, b) => Number(a.ward_code) - Number(b.ward_code));
    assert(source.length > 0, `constituency ${code}: no source wards`);
    assert(source.length === canonical.length, `constituency ${code}: source/canonical ward count mismatch ${source.length}/${canonical.length}`);

    const unmatchedSource = new Set(source);
    const unmatchedCanonical = new Set(canonical);

    function assign(s, c, method) {
      assert(unmatchedSource.has(s), `source CAW ${s.ward_code} assigned twice`);
      assert(unmatchedCanonical.has(c), `canonical ${c.geo_code} assigned twice`);
      assert(Number(c.constituency_code) === s.constituency_code, `source CAW ${s.ward_code}: crosswalk left constituency`);
      assert(Number(c.county_code) === s.county_code, `source CAW ${s.ward_code}: crosswalk left county`);
      unmatchedSource.delete(s);
      unmatchedCanonical.delete(c);
      usedCanonical.add(c.geography_id);
      const aligned = s.ward_code === Number(c.ward_code) && norm(s.ward_name) === norm(c.name);
      const record = { source: s, canonical: c, method, aligned };
      mapping.set(s.ward_code, record);
      if (!aligned) crosswalks.push(record);
    }

    for (const s of source) {
      if (!unmatchedSource.has(s)) continue;
      const candidates = [...unmatchedCanonical].filter(c => norm(c.name) === norm(s.ward_name));
      if (candidates.length === 1) assign(s, candidates[0], 'name_identity');
    }
    for (const s of source) {
      if (!unmatchedSource.has(s)) continue;
      const candidate = [...unmatchedCanonical].find(c => Number(c.ward_code) === s.ward_code);
      if (candidate) assign(s, candidate, 'code_identity_label_variant');
    }
    const residualSource = [...unmatchedSource].sort((a, b) => a.ward_code - b.ward_code);
    const residualCanonical = [...unmatchedCanonical].sort((a, b) => Number(a.ward_code) - Number(b.ward_code));
    assert(residualSource.length === residualCanonical.length, `constituency ${code}: residual imbalance`);
    residualSource.forEach((s, i) => assign(s, residualCanonical[i], 'constituency_residual'));
    assert(unmatchedSource.size === 0 && unmatchedCanonical.size === 0, `constituency ${code}: incomplete crosswalk`);
  }

  assert(mapping.size === 1450, `crosswalk resolves ${mapping.size}/1,450 source wards`);
  assert(usedCanonical.size === 1450, `crosswalk covers ${usedCanonical.size}/1,450 canonical wards`);
  return { mapping, crosswalks };
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

// Sprint 1 publication gate.
assert(/\*\*PASS with one disclosed modelling caveat\.\*\*/.test(sprint1Validation), 'Sprint 1 validation report is not in PASS state');
assert(/47\/47/.test(sprint1Validation), 'Sprint 1 validation no longer records 47/47 county coverage');

const coded = parseCoded(codedRaw);
assert(coded.length === 1450, `expected 1,450 domestic ward rows, found ${coded.length}`);
assert(coded.every(r => Number.isInteger(r.voters) && r.voters > 0), 'source contains invalid voter counts');
assert(coded.reduce((sum, r) => sum + r.voters, 0) === 22102532, 'First Schedule total != 22,102,532');

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
for (const row of coded) {
  const county = countyByCode.get(row.county_code);
  const constituency = constituencyByCode.get(row.constituency_code);
  assert(county && constituency, `unresolved source hierarchy at CAW ${row.ward_code}`);
  assert(constituency.parent_id === county.geography_id, `constituency ${row.constituency_code}: parent mismatch`);
  assert(norm(county.name) === norm(row.county_name), `source county ${row.county_name} != canonical ${county.name}`);
  assert(norm(constituency.name) === norm(row.constituency_name), `source constituency ${row.constituency_name} != canonical ${constituency.name}`);
}

const { mapping, crosswalks } = buildCrosswalk(coded, geographies);
assert(crosswalks.length === 61, `expected 61 explicit source/canonical ward divergences, found ${crosswalks.length}`);
const alignedCount = 1450 - crosswalks.length;
assert(alignedCount === 1389, `expected 1,389 direct-aligned ward identities, found ${alignedCount}`);

// Locked crosswalk examples catch both ordering and nomenclature changes.
const kibirichia = mapping.get(289);
assert(kibirichia?.canonical.name === 'Kibirichia' && Number(kibirichia.canonical.ward_code) === 285 && kibirichia.method === 'name_identity', 'Kibirichia crosswalk regression');
const manderaTownship = mapping.get(212);
assert(manderaTownship?.canonical.name === 'Township' && Number(manderaTownship.canonical.ward_code) === 215, 'Mandera Township crosswalk regression');
const manderaLibehia = mapping.get(215);
assert(manderaLibehia?.canonical.name === 'Bulla Mpya' && Number(manderaLibehia.canonical.ward_code) === 212 && manderaLibehia.method === 'constituency_residual', 'Mandera Libehia residual crosswalk regression');
const hirimani = mapping.get(97);
assert(hirimani?.canonical.name === 'Bura' && Number(hirimani.canonical.ward_code) === 97 && hirimani.method === 'code_identity_label_variant', 'Hirimani/Bura label-version crosswalk regression');

// All constituency and county arithmetic comes from IEBC source rows, never canonical allocation.
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

// Independent transcription cross-check, constituency by constituency.
const independent = parseCsv(independentRaw).filter(r => norm(r['County Name']) !== 'DIASPORA');
assert(independent.length === 1450, `independent transcription has ${independent.length} domestic wards`);
const codedGroups = groupMultiset(coded, r => `${norm(r.county_name)}|${norm(r.constituency_name)}`, r => r.voters);
const independentGroups = groupMultiset(independent, r => `${norm(r['County Name'])}|${norm(r['Constituency Name'])}`, r => Number(r['Number of Registered Voters']));
assert(codedGroups.size === 290 && independentGroups.size === 290, 'independent cross-check does not contain 290 constituency groups');
for (const [key, values] of codedGroups) {
  const other = independentGroups.get(key);
  assert(other, `independent transcription missing ${key}`);
  assert(sameArray(values, other), `independent voter values disagree in ${key}`);
}

// Gazette anchors.
const voterAtWard = code => coded.find(r => r.ward_code === code)?.voters;
assert(constituencyTotals.get(1) === 93561, 'Changamwe anchor failed');
assert(constituencyTotals.get(2) === 75085, 'Jomvu anchor failed');
assert(constituencyTotals.get(3) === 135276, 'Kisauni anchor failed');
assert(constituencyTotals.get(4) === 124253, 'Nyali anchor failed');
assert(constituencyTotals.get(5) === 94764, 'Likoni anchor failed');
assert(constituencyTotals.get(6) === 118974, 'Mvita anchor failed');
assert(constituencyTotals.get(91) === 72997, 'Ol Kalou constituency anchor failed');
assert(voterAtWard(453) === 13594 && voterAtWard(454) === 15596 && voterAtWard(455) === 14695 && voterAtWard(456) === 13540 && voterAtWard(457) === 15572, 'Ol Kalou ward anchors failed');
assert(constituencyTotals.get(290) === 123163 && voterAtWard(1450) === 19193, 'Mathare/Kiamaiko anchors failed');

// Runtime publication architecture / disclosure guards.
assert(loader.includes('buildWardCrosswalk'), 'runtime ward crosswalk builder missing');
assert(loader.includes("'name_identity'") && loader.includes("'code_identity_label_variant'") && loader.includes("'constituency_residual'"), 'runtime crosswalk methods incomplete');
assert(loader.includes('crosswalks.length === 61'), 'runtime 61-divergence regression guard missing');
assert(loader.includes("aligned ? 'A' : 'B'"), 'runtime A/B ward badge downgrade guard missing');
assert(loader.includes("'crosswalked_official'"), 'runtime crosswalked geographic method missing');
assert(loader.toLowerCase().includes('no parent value inherited'), 'anti-inheritance disclosure missing');
assert(loader.includes('crosswalk_id'), 'observation crosswalk identifiers missing');
assert(loader.includes('countyTotals.get(code) === expected'), 'runtime county reconciliation guard missing');
assert(ui.includes('1,450/1,450') && ui.includes('290/290'), 'Local Kenya UI coverage disclosure missing');
assert(index.indexOf('assets/sprint1-data.js') < index.indexOf('assets/sprint2-data.js'), 'Sprint 2 must wrap Sprint 1 data overlay');
assert(index.indexOf('assets/sprint2-data.js') < index.indexOf('assets/geo-explorer.js'), 'Sprint 2 data must load before Geo Explorer');
assert(index.indexOf('assets/geo-explorer.js') < index.indexOf('assets/sprint2-ui.js'), 'Sprint 2 UI must load after Geo Explorer');

const manifest = JSON.parse(manifestRaw);
assert(manifest.sources.iebc_gazette_2022.quality === 'A', 'IEBC source must remain quality A');
assert(manifest.sources.coded_transcription.commit === '29b269a6562262a77faf6d22ba5837f46d35df75', 'coded transcription not pinned');
assert(manifest.sources.independent_transcription.commit === '03eeb949416ef7e28e6a4a4725a0de3a756fa7f5', 'independent transcription not pinned');

const methods = Object.fromEntries([...new Set(crosswalks.map(x => x.method))].sort().map(method => [method, crosswalks.filter(x => x.method === method).length]));
console.log('PASS: Data Sprint 2 Local Kenya — 47/47 counties reconciled, 290/290 constituency totals, 1,450/1,450 ward observations, national total 22,102,532.');
console.log(`      Ward geography: ${alignedCount} A direct-aligned; ${crosswalks.length} B explicitly crosswalked; one-to-one within constituency; methods ${JSON.stringify(methods)}.`);
console.log('      Two pinned machine-readable transcriptions agree constituency-by-constituency; Gazette anchors pass; lower-level inheritance: none.');
