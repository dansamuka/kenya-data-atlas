import fs from 'node:fs';

const probe = JSON.parse(fs.readFileSync('data/p42/kphc-subcounty-crosswalk-probe.json','utf8'));
const geom = JSON.parse(fs.readFileSync('data/p42/kphc-subcounty-geometry-equivalence.json','utf8'));

const norm = s => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/&/g,' and ').replace(/\b(sub[ -]?county|constituency)\b/g,' ').replace(/[^a-z0-9]+/g,'');

const passed = new Map();
for (const r of geom.rows ?? []) {
  if (!r.passes) continue;
  passed.set(`${norm(r.source_county)}|${norm(r.source_subcounty)}`, r);
}

const controls = new Map();
for (const c of probe.county_controls ?? []) {
  controls.set(`${c.dataset}|${c.indicator_id}|${c.normalized_county}`, c);
}

const prelim = [];
for (const r of probe.rows ?? []) {
  const g = passed.get(`${r.normalized_county}|${r.normalized_subcounty}`);
  if (!g) continue;
  prelim.push({...r, geometry_gate:g, publication_eligible:false});
}

const groups = new Map();
for (const r of prelim) {
  const k=`${r.dataset}|${r.indicator_id}|${r.normalized_county}`;
  if (!groups.has(k)) groups.set(k,[]);
  groups.get(k).push(r);
}

const reconciliation = [];
for (const [key, rows] of groups) {
  const c=controls.get(key);
  if (!c) {
    reconciliation.push({key,status:'blocked_missing_county_control',row_count:rows.length,passes:false});
    continue;
  }
  const denom=rows.reduce((s,r)=>s+Number(r.source_weight||0),0);
  const weighted=denom ? rows.reduce((s,r)=>s+Number(r.source_value)*Number(r.source_weight||0),0)/denom : NaN;
  const absDiff=Math.abs(weighted-Number(c.county_value));
  // The aggregate only uses geometry-passing rows. It can reconcile to the county control
  // only when the passing set exhausts the county source rows, so missing rows must block.
  const allCountyRows=(probe.rows??[]).filter(r=>r.dataset===rows[0].dataset && r.indicator_id===rows[0].indicator_id && r.normalized_county===rows[0].normalized_county);
  const exhaustive=rows.length===allCountyRows.length;
  const passes=exhaustive && Number.isFinite(weighted) && absDiff<=0.15;
  reconciliation.push({
    key,status:passes?'pass':'fail',passes,row_count:rows.length,county_source_row_count:allCountyRows.length,
    exhaustive_geometry_pass_set:exhaustive,weighted_subcounty_value:Number.isFinite(weighted)?Number(weighted.toFixed(4)):null,
    county_control_value:Number(c.county_value),absolute_percentage_point_difference:Number.isFinite(absDiff)?Number(absDiff.toFixed(4)):null,
    tolerance_percentage_points:0.15
  });
}

const passKeys=new Set(reconciliation.filter(x=>x.passes).map(x=>x.key));
const rows=prelim.map(r=>{
  const key=`${r.dataset}|${r.indicator_id}|${r.normalized_county}`;
  return {...r,
    county_reconciliation_pass:passKeys.has(key),
    promotion_candidate:passKeys.has(key),
    publication_eligible:false,
    next_gate:passKeys.has(key)?'canonical_registry_and_local54_validation':'blocked'
  };
});

const out={
  schema_version:'kda.p42.kphc-constituency-candidates.v1',
  rule:'Geometry-equivalent rows advance only if their complete county set back-aggregates to the published county control within 0.15 percentage points. Candidate status is not publication.',
  summary:{
    geometry_passing_source_rows:prelim.length,
    county_groups_evaluated:reconciliation.length,
    county_groups_reconciled:reconciliation.filter(x=>x.passes).length,
    promotion_candidate_rows:rows.filter(x=>x.promotion_candidate).length,
    publication_eligible_rows:0
  },
  reconciliation,
  rows
};
fs.writeFileSync('data/p42/kphc-constituency-candidates.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out.summary,null,2));
