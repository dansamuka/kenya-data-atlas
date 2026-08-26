import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CODED_URL = 'https://raw.githubusercontent.com/samy-migwi/kenya_2022_voters_dashboard_app/29b269a6562262a77faf6d22ba5837f46d35df75/data/voters.csv';
const CROSSCHECK_URL = 'https://raw.githubusercontent.com/AllanGachomo/Kenya-Voters-Registration-Analysis-and-Prediction/03eeb949416ef7e28e6a4a4725a0de3a756fa7f5/Data/Clean/Registered%20Voters%20per%20CAW%202022.csv';
const HOLDS = new Set([43, 44]);

function assert(ok, message) { if (!ok) throw new Error(message); }
function norm(value) {
  return String(value || '').toUpperCase().normalize('NFKD')
    .replace(/[’‘]/g, "'").replace(/\bCITY\b/g, '').replace(/[^A-Z0-9]+/g, '');
}
function parseCoded(raw) {
  const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const header = lines.shift();
  assert(header?.includes('Registered Voters'), 'coded source header changed');
  return lines.filter(Boolean).map((line, i) => {
    const c = line.split(',');
    assert(c.length >= 8, `coded source row ${i + 2} malformed`);
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
    assert(c.length === headers.length, `independent source row ${i + 2} malformed`);
    return Object.fromEntries(headers.map((h, j) => [h, c[j]]));
  });
}
function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}
async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Kenya-Data-Atlas-release-validation' } });
  assert(response.ok, `failed to fetch pinned source ${response.status}: ${url}`);
  return response.text();
}

function resolveSafe(sourceRows, canonicalRows) {
  const available = new Map(canonicalRows.map(g => [Number(g.ward_code), g]));
  const mapped = new Map();
  const methods = new Map();

  for (const row of sourceRows) {
    const matches = [...available.values()].filter(g => norm(g.name) === norm(row.ward_name));
    if (matches.length === 1) {
      const ward = matches[0];
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
  const sourceRest = sourceRows.filter(r => !mapped.has(r.ward_code)).sort((a, b) => a.ward_code - b.ward_code);
  const canonicalRest = [...available.values()].sort((a, b) => Number(a.ward_code) - Number(b.ward_code));
  assert(sourceRest.length === canonicalRest.length, `residual crosswalk imbalance in constituency ${sourceRows[0]?.constituency_code}`);
  sourceRest.forEach((row, i) => {
    mapped.set(row.ward_code, canonicalRest[i]);
    methods.set(row.ward_code, 'residual_one_to_one');
  });
  assert(mapped.size === sourceRows.length, `incomplete crosswalk in constituency ${sourceRows[0]?.constituency_code}`);
  return { mapped, methods };
}

const [codedRaw, independentRaw, geographyRaw, countyRaw, loader, ui, index, sprint1Report, manifestRaw] = await Promise.all([
  fetchText(CODED_URL), fetchText(CROSSCHECK_URL),
  readFile(path.join(root, 'data/geography/registry/geographies.json'), 'utf8'),
  readFile(path.join(root, 'data/sprint1/voters-2022.csv'), 'utf8'),
  readFile(path.join(root, 'assets/sprint2-data.js'), 'utf8'),
  readFile(path.join(root, 'assets/sprint2-ui.js'), 'utf8'),
  readFile(path.join(root, 'index.html'), 'utf8'),
  readFile(path.join(root, 'data/sprint1/VALIDATION.md'), 'utf8'),
  readFile(path.join(root, 'data/sprint2/sources.json'), 'utf8')
]);

assert(/\*\*PASS with one disclosed modelling caveat\.\*\*/.test(sprint1Report), 'Sprint 1 release gate is not PASS');
assert(/47\/47/.test(sprint1Report), 'Sprint 1 no longer reports 47/47 county coverage');

const source = parseCoded(codedRaw);
assert(source.length === 1450, `expected 1,450 domestic source wards, found ${source.length}`);
assert(source.every(r => Number.isInteger(r.voters) && r.voters > 0), 'source has invalid voter values');
assert(new Set(source.map(r => r.ward_code)).size === 1450, 'source ward codes are not unique');
assert(new Set(source.map(r => r.constituency_code)).size === 290, 'source constituency coverage != 290');
assert(new Set(source.map(r => r.county_code)).size === 47, 'source county coverage != 47');
for (let i = 1; i <= 1450; i += 1) assert(source.some(r => r.ward_code === i), `source ward code ${i} missing`);
const nationalTotal = source.reduce((sum, r) => sum + r.voters, 0);
assert(nationalTotal === 22102532, `source domestic total ${nationalTotal} != 22,102,532`);

// The independent extraction is a value-level cross-check, not the geographic
// authority. Exclude diaspora/prisons, then require the same complete multiset
// of 1,450 ward voter counts. Geographic assignment is verified separately
// against the coded IEBC source and official county reconciliation.
const independent = parseCsv(independentRaw).filter(r => !['DIASPORA', 'PRISONS'].includes(norm(r['County Name'])));
assert(independent.length === 1450, `independent domestic row count ${independent.length} != 1,450`);
const independentValues = independent.map(r => Number(r['Number of Registered Voters'])).sort((a, b) => a - b);
const codedValues = source.map(r => r.voters).sort((a, b) => a - b);
assert(independentValues.every((v, i) => v === codedValues[i]), 'independent extraction does not contain the same 1,450 ward voter values');
assert(independentValues.reduce((a, b) => a + b, 0) === nationalTotal, 'independent extraction national total differs');

const geographies = JSON.parse(geographyRaw);
const counties = geographies.filter(g => g.level === 'county');
const constituencies = geographies.filter(g => g.level === 'constituency');
const wards = geographies.filter(g => g.level === 'ward');
assert(counties.length === 47 && constituencies.length === 290 && wards.length === 1450, 'canonical registry is not 47/290/1,450');
const countyByCode = new Map(counties.map(g => [Number(g.county_code), g]));
const constituencyByCode = new Map(constituencies.map(g => [Number(g.constituency_code), g]));
for (const row of source) {
  const county = countyByCode.get(row.county_code);
  const constituency = constituencyByCode.get(row.constituency_code);
  assert(county && constituency, `unresolved higher geography at CAW ${row.ward_code}`);
  assert(constituency.parent_id === county.geography_id, `canonical constituency ${row.constituency_code} parent mismatch`);
}

const constituencyTotals = new Map();
const countyTotals = new Map();
for (const row of source) {
  constituencyTotals.set(row.constituency_code, (constituencyTotals.get(row.constituency_code) || 0) + row.voters);
  countyTotals.set(row.county_code, (countyTotals.get(row.county_code) || 0) + row.voters);
}
assert(constituencyTotals.size === 290 && countyTotals.size === 47, 'aggregate coverage incomplete');

const countyLines = countyRaw.trim().split(/\r?\n/);
const countyHeaders = countyLines.shift().split(',');
const officialCountyRows = countyLines.map(line => Object.fromEntries(countyHeaders.map((h, i) => [h, line.split(',')[i]])));
assert(officialCountyRows.length === 47, 'Sprint 1 official county schedule no longer has 47 rows');
for (const row of officialCountyRows) {
  const code = Number(row.geo_code.replace('KEN-C', ''));
  assert(countyTotals.get(code) === Number(row.value), `county ${code} source ward sum != official Gazette county value`);
}

const sourceByCon = groupBy(source, r => r.constituency_code);
const canonicalByCon = groupBy(wards, g => Number(g.constituency_code));
const usedCanonical = new Set();
const crosswalks = [];
const held = [];
for (let code = 1; code <= 290; code += 1) {
  const sourceRows = sourceByCon.get(code) || [];
  const canonicalRows = canonicalByCon.get(code) || [];
  assert(sourceRows.length && sourceRows.length === canonicalRows.length, `constituency ${code}: source/canonical ward-count mismatch`);
  if (HOLDS.has(code)) {
    sourceRows.forEach(r => held.push(r));
    continue;
  }
  const { mapped, methods } = resolveSafe(sourceRows, canonicalRows);
  for (const row of sourceRows) {
    const ward = mapped.get(row.ward_code);
    assert(ward, `source CAW ${row.ward_code}: unresolved mapping`);
    assert(!usedCanonical.has(ward.geography_id), `canonical ward ${ward.geo_code} assigned twice`);
    assert(Number(ward.constituency_code) === row.constituency_code && Number(ward.county_code) === row.county_code, `source CAW ${row.ward_code}: crosswalk escaped parent geography`);
    usedCanonical.add(ward.geography_id);
    if (Number(ward.ward_code) !== row.ward_code || norm(ward.name) !== norm(row.ward_name)) {
      crosswalks.push({ row, ward, method: methods.get(row.ward_code) });
    }
  }
}
assert(usedCanonical.size === 1440, `safely mapped ward coverage ${usedCanonical.size}/1,440`);
assert(held.length === 10, `spatial hold count ${held.length} != 10`);
assert(held.every(r => r.county_code === 9 && HOLDS.has(r.constituency_code)), 'a spatial hold exists outside Mandera East/Lafey');
assert(sourceByCon.get(43)?.length === 5 && sourceByCon.get(44)?.length === 5, 'Mandera East/Lafey should each hold five source ward rows');
assert(crosswalks.length === 54, `published mapped crosswalk count ${crosswalks.length} != 54`);

const kibirichia = crosswalks.find(x => x.row.ward_code === 289);
assert(kibirichia?.ward.name === 'Kibirichia' && Number(kibirichia.ward.ward_code) === 285, 'Kibirichia crosswalk regression');
assert(held.some(r => r.constituency_code === 43 && r.ward_name === 'LIBEHIA'), 'Mandera East Libehia is no longer held');

const voterAt = code => source.find(r => r.ward_code === code)?.voters;
assert(constituencyTotals.get(1) === 93561 && constituencyTotals.get(2) === 75085 && constituencyTotals.get(3) === 135276, 'Mombasa constituency anchors failed');
assert(constituencyTotals.get(91) === 72997, 'Ol Kalou anchor failed');
assert(voterAt(453) === 13594 && voterAt(454) === 15596 && voterAt(455) === 14695 && voterAt(456) === 13540 && voterAt(457) === 15572, 'Ol Kalou ward anchors failed');
assert(constituencyTotals.get(290) === 123163 && voterAt(1450) === 19193, 'Mathare/Kiamaiko anchors failed');

assert(loader.includes('SPATIAL_HOLD_CONSTITUENCIES = new Set([43, 44])'), 'runtime spatial-hold list missing');
assert(loader.includes('usedCanonical.size === 1440'), 'runtime 1,440 mapped guard missing');
assert(loader.includes('S2.spatialHolds.length === 10'), 'runtime 10-hold guard missing');
assert(loader.includes("x ? 'B' : 'A'"), 'runtime B badge for crosswalks missing');
assert(loader.includes("x ? 'crosswalked_official' : 'direct_official'"), 'runtime crosswalk method downgrade missing');
assert(loader.includes('crosswalk_id'), 'runtime crosswalk provenance missing');
assert(loader.toLowerCase().includes('no parent value inherited'), 'anti-inheritance disclosure missing');
assert(ui.includes('1,440/1,450') && ui.includes('10 ward rows'), 'UI mapped/held disclosure missing');
assert(index.indexOf('assets/sprint1-data.js') < index.indexOf('assets/sprint2-data.js'), 'Sprint 2 must wrap Sprint 1 data overlay');
assert(index.indexOf('assets/sprint2-data.js') < index.indexOf('assets/geo-explorer.js'), 'Sprint 2 data must load before Geo Explorer');
assert(index.indexOf('assets/geo-explorer.js') < index.indexOf('assets/sprint2-ui.js'), 'Sprint 2 UI must load after Geo Explorer');

const manifest = JSON.parse(manifestRaw);
assert(manifest.sources.iebc_gazette_2022.quality === 'A', 'IEBC primary source quality changed');
assert(manifest.sources.coded_transcription.commit === '29b269a6562262a77faf6d22ba5837f46d35df75', 'coded source is not commit-pinned');
assert(manifest.sources.independent_transcription.commit === '03eeb949416ef7e28e6a4a4725a0de3a756fa7f5', 'independent source is not commit-pinned');

const methodCounts = Object.fromEntries([...new Set(crosswalks.map(x => x.method))].sort().map(method => [method, crosswalks.filter(x => x.method === method).length]));
console.log('PASS: Data Sprint 2 — 47/47 counties, 290/290 constituencies, 1,450/1,450 IEBC ward rows ingested; total 22,102,532.');
console.log(`      Spatial: 1,440 mapped, 10 Mandera East/Lafey held, ${crosswalks.length} mapped crosswalks badged B; ${JSON.stringify(methodCounts)}.`);
console.log('      Independent extraction matches the complete domestic ward-value multiset; all county sums reconcile to the Gazette; lower-level inheritance: none.');
