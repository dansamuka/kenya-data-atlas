import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = 'https://raw.githubusercontent.com/samy-migwi/kenya_2022_voters_dashboard_app/29b269a6562262a77faf6d22ba5837f46d35df75/data/voters.csv';

function norm(value) {
  return String(value || '').toUpperCase().normalize('NFKD')
    .replace(/[’‘]/g, "'")
    .replace(/\bCITY\b/g, '')
    .replace(/[^A-Z0-9]+/g, '');
}
function parse(raw) {
  const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  lines.shift();
  return lines.filter(Boolean).map(line => {
    const c = line.split(',');
    return {
      county_code: Number(c[1]), county_name: c[2].trim(),
      constituency_code: Number(c[3]), constituency_name: c[4].trim(),
      ward_code: Number(c[5]), ward_name: c[6].trim(), voters: Number(c[7])
    };
  });
}

const [sourceResponse, geographiesRaw] = await Promise.all([
  fetch(SOURCE, { headers: { 'User-Agent': 'Kenya-Data-Atlas-diagnostic' } }),
  readFile(path.join(root, 'data/geography/registry/geographies.json'), 'utf8')
]);
if (!sourceResponse.ok) throw new Error(`source fetch ${sourceResponse.status}`);
const source = parse(await sourceResponse.text());
const geographies = JSON.parse(geographiesRaw);
const canonicalWards = geographies.filter(g => g.level === 'ward');
const byCode = new Map(canonicalWards.map(g => [Number(g.ward_code), g]));
const byParentName = new Map(canonicalWards.map(g => [`${Number(g.constituency_code)}|${norm(g.name)}`, g]));
const sourceByParentName = new Map(source.map(r => [`${r.constituency_code}|${norm(r.ward_name)}`, r]));

const codeMismatch = [];
const noCanonicalNameInParent = [];
const canonicalMissingFromSourceParent = [];
const sameNameDifferentParent = [];
const canonicalByName = new Map();
for (const g of canonicalWards) {
  const k = norm(g.name);
  if (!canonicalByName.has(k)) canonicalByName.set(k, []);
  canonicalByName.get(k).push(g);
}

for (const row of source) {
  const code = byCode.get(row.ward_code);
  if (!code || Number(code.constituency_code) !== row.constituency_code || norm(code.name) !== norm(row.ward_name)) {
    codeMismatch.push({
      source_code: row.ward_code,
      source_constituency: row.constituency_code,
      source_name: row.ward_name,
      canonical_at_code: code ? { code: Number(code.ward_code), constituency: Number(code.constituency_code), name: code.name } : null
    });
  }
  if (!byParentName.has(`${row.constituency_code}|${norm(row.ward_name)}`)) {
    const elsewhere = (canonicalByName.get(norm(row.ward_name)) || []).map(g => ({ code: Number(g.ward_code), constituency: Number(g.constituency_code), name: g.name }));
    noCanonicalNameInParent.push({
      source_code: row.ward_code,
      source_constituency: row.constituency_code,
      source_name: row.ward_name,
      same_name_elsewhere: elsewhere
    });
    if (elsewhere.length) sameNameDifferentParent.push({ source: row, elsewhere });
  }
}

for (const g of canonicalWards) {
  if (!sourceByParentName.has(`${Number(g.constituency_code)}|${norm(g.name)}`)) {
    canonicalMissingFromSourceParent.push({
      canonical_code: Number(g.ward_code),
      canonical_constituency: Number(g.constituency_code),
      canonical_name: g.name
    });
  }
}

console.log('SPRINT2_GEOGRAPHY_DIAGNOSTIC');
console.log(JSON.stringify({
  counts: {
    source_rows: source.length,
    canonical_wards: canonicalWards.length,
    code_mismatch_rows: codeMismatch.length,
    source_names_missing_in_canonical_parent: noCanonicalNameInParent.length,
    canonical_names_missing_in_source_parent: canonicalMissingFromSourceParent.length,
    same_name_found_in_different_parent: sameNameDifferentParent.length
  },
  noCanonicalNameInParent,
  canonicalMissingFromSourceParent,
  codeMismatch
}, null, 2));
