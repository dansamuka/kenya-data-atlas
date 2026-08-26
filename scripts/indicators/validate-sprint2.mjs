import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CODED_URL = 'https://raw.githubusercontent.com/samy-migwi/kenya_2022_voters_dashboard_app/29b269a6562262a77faf6d22ba5837f46d35df75/data/voters.csv';
const CROSSCHECK_URL = 'https://raw.githubusercontent.com/AllanGachomo/Kenya-Voters-Registration-Analysis-and-Prediction/03eeb949416ef7e28e6a4a4725a0de3a756fa7f5/Data/Clean/Registered%20Voters%20per%20CAW%202022.csv';
const SPATIAL_HOLD_CONSTITUENCIES = new Set([43, 44]);

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
      county_code: Number(c[1]), county_name: c[2].trim(), constituency_code: Number(c[3]),
      constituency_name: c[4].trim(), ward_code: Number(c[5]), ward_name: c[6].trim(), voters: Number(c[7])
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
  const out = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(valFn(row));
  }
  for (const values of out.values()) values.sort((a, b) => a - b);
  return out;
}
function sameArray(a, b) { return a.length === b.length && a.every((value, i) => value === b[i]); }

function resolveSafeConstituency(sourceRows, canonicalRows) {
  const available = new Map(canonicalRows.map(g => [Number(g.ward_code), g]));
  const mapped = new Map();
  const method = new Map();

  for (const row of sourceRows) {
    const candidates = [...available.values()].filter(g => norm(g.name) === norm(row.ward_name));
    if (candidates.length === 1) {
      const ward = candidates[0];
      mapped.set(row.ward_code, ward);
      method.set(row.ward_code, Number(ward.ward_code) === row.ward_code ? 'code_and_name' : 'name_crosswalk');
      available.delete(Number(ward.ward_code));
    }
  }
  for (const row of sourceRows) {
    if (mapped.has(row.ward_code)) continue;
    const direct = available.get(row.ward_code);
    if (direct) {
      mapped.set(row.ward_code, direct);
      method.set(row.ward_code, 'code_label_variant');
      available.delete(row.ward_code);
    }
  }
  const remainingSource = sourceRows.filter(row => !mapped.has(row.ward_code)).sort((a, b) => a.ward_code - b.ward_code);
  const remainingCanonical = [...available.values()].sort((a, b) => Number(a.ward_code) - Number(b.ward_code));
  assert(remainingSource.length === remainingCanonical.length, `constituency ${sourceRows[0].constituency_code}: residual imbalance`);
  remainingSource.forEach((row, i) => {
    mapped.set(row.ward_code, remainingCanonical[i]);
    method.set(row.ward_code, 'residual_one_to_one');
  });
  assert(mapped.size === sourceRows.length, `constituency ${sourceRows[0].constituency_code}: incomplete mapping`);
  return { mapped, method };
}

const [codedRaw, independentRaw, geographiesRaw, countyRaw, loader, ui, index, sprint1Validation, manifestRaw] = await Promise.all([
  fetchText(CODED_URL), fetchText(CROSSCHECK_URL),
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
assert(new Set(coded.map(r => r.ward_code)).size === 1450, 'source ward codes are not unique');
assert(new Set(coded.map(r => r.constituency_code)).size === 290, 'source constituency coverage != 290');
assert(new Set(coded.map(r => r.county_code)).size === 47, 'source county coverage != 47');

const geographies = JSON.parse(geographiesRaw);
const counties = geographies.filter(g => g.level === 'county');
const constituencies = geographies.filter(g => g.level === 'constituency');
const wards = geographies.filter(g => g.level === 'ward');
assert(counties.length === 47 && constituencies.length === 290 && wards.length === 1450, 'canonical geography registry is not 47/290/1,450');
const countyByCode = new Map(counties.map(g => [Number(g.county_code), g]));
const constituencyByCode = new Map(constituencies.map(g => [Number(g.constituency_code), g]));
const sourceByCon = groupBy(coded, r => r.constituency_code);
const canonicalByCon = groupBy(wards, g => Number(g.constituency_code));

for (const row of coded) {
  const county = countyByCode.get(row.county_code);
  const constituency = constituencyByCode.get(row.constituency_code);
  assert(county && constituency, `unresolved hierarchy at source CAW ${row.ward_code}`);
  assert(constituency.parent_id === county.geography_id, `constituency ${row.constituency_code}: parent mismatch`);
  assert(norm(county.name) === norm(row.county_name), `source county ${row.county_name} != canonical ${county.name}`);
  assert(norm(constituency.name) === norm(row.constituency_name), `source constituency ${row.constituency_name} != canonical ${constituency.name}`);
}

// The boundary exception is narrow and explicit: exactly Mandera East + Lafey.
const heldRows = coded.filter(r => SPATIAL_HOLD_CONSTITUENCIES.has(r.constituency_code));
assert(heldRows.length === 10, `expected 10 Mandera boundary-hold rows, found ${heldRows.length}`);
assert(sourceByCon.get(43)?.length === 5 && sourceByCon.get(44)?.length === 5, 'Mandera East/Lafey source ward counts changed');
const source43 = new Set(sourceByCon.get(43).map(r => norm(r.ward_name)));
const canonical43 = new Set(canonicalByCon.get(43).map(g => norm(g.name)));
const source44 = new Set(sourceByCon.get(44).map(r => norm(r.ward_name)));
const canonical44 = new Set(canonicalByCon.get(44).map(g => norm(g.name)));
assert(source43.has('LIBEHIA') && !source43.has('BULLAMPYA'), 'Mandera East source configuration no longer matches documented exception');
assert(canonical43.has('BULLAMPYA') && !canonical43.has('LIBEHIA'), 'Mandera East canonical configuration no longer matches documented exception');
assert(source44.has('SALA') && !canonical44.has('SALA') && canonical44.has('LIBEHIA'), 'Lafey source/canonical exception no longer matches documented state');

// Map every non-held source ward one-to-one inside its constituency.
const mapped = new Map();
const usedCanonical = new Set();
const crosswalks = [];
for (let code = 1; code <= 290; code += 1) {
  if (SPATIAL_HOLD_CONSTITUENCIES.has(code)) continue;
  const sourceRows = sourceByCon.get(code) || [];
  const canonicalRows = canonicalByCon.get(code) || [];
  assert(sourceRows.length === canonicalRows.length, `constituency ${code}: source/canonical ward count mismatch ${sourceRows.length}/${canonicalRows.length}`);
  const result = resolveSafeConstituency(sourceRows, canonicalRows);
  for (const row of sourceRows) {
    const ward = result.mapped.get(row.ward_code);
    assert(ward && !usedCanonical.has(ward.geography_id), `duplicate safe mapping at source CAW ${row.ward_code}`);
    usedCanonical.add(ward.geography_id);
    mapped.set(row.ward_code, ward);
    if (row.ward_code !== Number(ward.ward_code) || norm(row.ward_name) !== norm(ward.name)) {
      crosswalks.push({ source: row, canonical: ward, method: result.method.get(row.ward_code) });
    }
  }
}
assert(mapped.size === 1440, `safe source mapping covers ${mapped.size}/1,440 expected rows`);
assert(usedCanonical.size === 1440, `safe canonical mapping covers ${usedCanonical.size}/1,440 expected wards`);
assert(![...mapped.values()].some(g => [43, 44].includes(Number(g.constituency_code))), 'held Mandera polygons leaked into safe ward publication');

// Locked safe crosswalk examples.
const kibirichia = mapped.get(289);
assert(kibirichia?.name === 'Kibirichia' && Number(kibirichia.ward_code) === 285, 'Kibirichia crosswalk regression');
const nzambani = mapped.get(360);
assert(nzambani?.name === 'Nzambani' && Number(nzambani.ward_code) === 361, 'Nzambani crosswalk regression');

// Constituency/county arithmetic always uses all 1,450 IEBC rows, including holds.
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

// Independent full-file transcription cross-check, constituency by constituency.
const independent = parseCsv(independentRaw).filter(r => norm(r['County Name']) !== 'DIASPORA');
assert(independent.length === 1450, `independent transcription has ${independent.length} domestic wards`);
const codedGroups = groupMultiset(coded, r => `${norm(r.county_name)}|${norm(r.constituency_name)}`, r => r.voters);
const independentGroups = groupMultiset(independent, r => `${norm(r['County Name'])}|${norm(r['Constituency Name'])}`, r => Number(r['Number of Registered Voters']));
assert(codedGroups.size === 290 && independentGroups.size === 290, 'independent cross-check does not contain 290 constituency groups');
for (const [key, values] of codedGroups) {
  const other = independentGroups.get(key);
  assert(other && sameArray(values, other), `independent voter values disagree in ${key}`);
}

// Gazette anchors.
const voterAtWard = code => coded.find(r => r.ward_code === code)?.voters;
assert(constituencyTotals.get(1) === 93561 && constituencyTotals.get(2) === 75085 && constituencyTotals.get(3) === 135276, 'Mombasa anchors failed');
assert(constituencyTotals.get(91) === 72997, 'Ol Kalou constituency anchor failed');
assert(voterAtWard(453) === 13594 && voterAtWard(454) === 15596 && voterAtWard(455) === 14695 && voterAtWard(456) === 13540 && voterAtWard(457) === 15572, 'Ol Kalou ward anchors failed');
assert(constituencyTotals.get(290) === 123163 && voterAtWard(1450) === 19193, 'Mathare/Kiamaiko anchors failed');

// Runtime, UI and provenance publication guards.
assert(loader.includes('SPATIAL_HOLD_CONSTITUENCIES') && loader.includes('new Set([43, 44])'), 'runtime Mandera spatial hold missing');
assert(loader.includes('usedCanonical.size === 1440'), 'runtime 1,440 mapped-ward guard missing');
assert(loader.includes('S2.spatialHolds.length === 10'), 'runtime 10-row hold guard missing');
assert(loader.includes('series.length === 1730'), 'runtime published series-count guard missing');
assert(loader.toLowerCase().includes('no parent value inherited'), 'anti-inheritance disclosure missing');
assert(ui.includes('1,440/1,450') && ui.toLowerCase().includes('boundary hold'), 'UI does not disclose mapped/held ward coverage');
assert(index.indexOf('assets/sprint1-data.js') < index.indexOf('assets/sprint2-data.js'), 'Sprint 2 must wrap Sprint 1 data overlay');
assert(index.indexOf('assets/sprint2-data.js') < index.indexOf('assets/geo-explorer.js'), 'Sprint 2 data overlay must load before Geo Explorer');
assert(index.indexOf('assets/geo-explorer.js') < index.indexOf('assets/sprint2-ui.js'), 'Sprint 2 UI must load after Geo Explorer');

const manifest = JSON.parse(manifestRaw);
assert(manifest.sources.iebc_gazette_2022.quality === 'A', 'official IEBC source must remain quality A');
assert(manifest.sources.coded_transcription.commit === '29b269a6562262a77faf6d22ba5837f46d35df75', 'coded transcription is not commit-pinned');
assert(manifest.sources.independent_transcription.commit === '03eeb949416ef7e28e6a4a4725a0de3a756fa7f5', 'independent transcription is not commit-pinned');
assert(manifest.boundary_exception?.held_ward_rows === 10, 'Mandera boundary exception is not documented as 10 held rows');
assert(manifest.boundary_exception?.court_of_appeal_url?.includes('kenyalaw.org'), 'Court of Appeal authority missing from boundary exception');

console.log('PASS: Data Sprint 2 Local Kenya');
console.log('      47/47 counties reconciled; 290/290 constituency totals; all 1,450 IEBC domestic ward rows ingested.');
console.log(`      Ward spatial publication: 1,440 mapped, 10 held (Mandera East/Lafey); safe explicit crosswalks: ${crosswalks.length}.`);
console.log('      National domestic ward total: 22,102,532; independent transcription and Gazette anchors pass; lower-level inheritance: none.');
