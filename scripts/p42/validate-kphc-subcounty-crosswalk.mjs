import fs from 'node:fs';

const contract = JSON.parse(fs.readFileSync('data/p42/kphc-subcounty-crosswalk-contract.json','utf8'));
const probePath = 'data/p42/kphc-subcounty-crosswalk-probe.json';
const failures = [];

if (contract.phase !== 'P42') failures.push('contract phase must be P42');
if (contract.gates?.name_match_is_geometry_proof !== false) failures.push('name match must never be treated as geometry proof');
if (contract.gates?.geometry_or_official_crosswalk_equivalence !== 'required before publication') failures.push('equivalence gate must be required');
if (contract.publication_decision !== 'blocked_until_equivalence_gate') failures.push('publication must remain blocked at probe stage');

if (fs.existsSync(probePath)) {
  const p = JSON.parse(fs.readFileSync(probePath,'utf8'));
  if ((p.publication_eligible_rows ?? -1) !== 0) failures.push('probe must publish zero rows before equivalence gate');
  for (const row of p.rows ?? []) {
    if (row.publication_eligible !== false) failures.push(`row incorrectly publication eligible: ${row.dataset}/${row.source_subcounty}`);
    if (row.match_status === 'unique_name_candidate_geometry_gate_required' && !row.matched_geo_code) {
      failures.push(`unique candidate missing geo code: ${row.dataset}/${row.source_subcounty}`);
    }
  }
}

if (failures.length) {
  console.error('FAIL: P42 KPHC subcounty crosswalk gate\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('PASS: KPHC subcounty crosswalk probe remains candidate-only; no name-only publication is possible.');
