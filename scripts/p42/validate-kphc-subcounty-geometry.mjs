import fs from 'node:fs';

const contract = JSON.parse(fs.readFileSync('data/p42/kphc-subcounty-equivalence-sources.json','utf8'));
const path = 'data/p42/kphc-subcounty-geometry-equivalence.json';
const failures = [];

const g=contract.equivalence_gate;
if (g.iou_min < 0.98) failures.push('IoU threshold weakened below 0.98');
if (g.source_area_coverage_min < 0.99) failures.push('source coverage threshold weakened below 0.99');
if (g.kda_comparator_area_coverage_min < 0.99) failures.push('constituency coverage threshold weakened below 0.99');
if (g.one_to_one_required !== true) failures.push('one-to-one gate must remain required');
if (!String(contract.publication_rule||'').includes('does not publish')) failures.push('geometry alone must not publish values');

if (fs.existsSync(path)) {
  const o=JSON.parse(fs.readFileSync(path,'utf8'));
  for (const r of o.rows||[]) {
    if (r.passes) {
      if (r.candidate_count !== 1) failures.push(`passing row is not unique: ${r.source_county}/${r.source_subcounty}`);
      if (r.iou < g.iou_min || r.source_area_coverage < g.source_area_coverage_min || r.constituency_area_coverage < g.kda_comparator_area_coverage_min) {
        failures.push(`passing row violates frozen thresholds: ${r.source_county}/${r.source_subcounty}`);
      }
    }
  }
}
if (failures.length) {
  console.error('FAIL: P42 KPHC geometry-equivalence gate\n - '+failures.join('\n - '));
  process.exit(1);
}
console.log('PASS: P42 KPHC geometry-equivalence thresholds are frozen and enforced.');
