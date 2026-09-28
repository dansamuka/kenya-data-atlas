import fs from 'node:fs';
const p='data/p42/kphc-constituency-candidates.json';
if (!fs.existsSync(p)) {
  console.log('SKIP: candidate artifact not materialized yet.');
  process.exit(0);
}
const o=JSON.parse(fs.readFileSync(p,'utf8'));
const failures=[];
if ((o.summary?.publication_eligible_rows ?? -1)!==0) failures.push('candidate stage must publish zero rows');
for (const r of o.rows??[]) {
  if (r.promotion_candidate) {
    if (!r.geometry_gate?.passes) failures.push(`candidate lacks geometry pass: ${r.matched_geo_code}`);
    if (!r.county_reconciliation_pass) failures.push(`candidate lacks county reconciliation: ${r.matched_geo_code}`);
  }
  if (r.publication_eligible!==false) failures.push(`row incorrectly marked publication eligible: ${r.matched_geo_code}`);
}
for (const x of o.reconciliation??[]) {
  if (x.passes && (!x.exhaustive_geometry_pass_set || x.absolute_percentage_point_difference>0.15)) {
    failures.push(`invalid passing reconciliation: ${x.key}`);
  }
}
if (failures.length) {
 console.error('FAIL: P42 KPHC candidate gate\n - '+failures.join('\n - ')); process.exit(1);
}
console.log('PASS: KPHC promotion candidates require geometry + exhaustive county reconciliation and remain unpublished.');
