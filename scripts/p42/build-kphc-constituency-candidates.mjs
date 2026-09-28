import fs from 'node:fs';

const probe = JSON.parse(fs.readFileSync('data/p42/kphc-subcounty-crosswalk-probe.json','utf8'));
const secondary = JSON.parse(fs.readFileSync('data/p42/kphc-secondary-pcode-crosswalk.json','utf8'));
const geomPath='data/p42/kphc-subcounty-geometry-equivalence.json';
const geom = fs.existsSync(geomPath) ? JSON.parse(fs.readFileSync(geomPath,'utf8')) : {rows:[]};

const norm = s => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/&/g,' and ').replace(/\b(sub[ -]?county|constituency)\b/g,' ').replace(/[^a-z0-9]+/g,'');

const geometryPass = new Map();
for (const r of geom.rows ?? []) {
  if (!r.passes) continue;
  geometryPass.set(`${norm(r.source_county)}|${norm(r.source_subcounty)}`, r);
}
const secondaryPass = new Map();
for(const r of secondary.rows??[]){
  if(!r.passes) continue;
  secondaryPass.set(`${r.dataset}|${r.indicator_id}|${r.source_subcounty_pcode}`,r);
}

const controls = new Map();
for (const c of probe.county_controls ?? []) {
  controls.set(`${c.dataset}|${c.indicator_id}|${c.normalized_county}`, c);
}

const prelim = [];
for (const r of probe.rows ?? []) {
  const g = geometryPass.get(`${r.normalized_county}|${r.normalized_subcounty}`);
  const x = r.source_subcounty_pcode ? secondaryPass.get(`${r.dataset}|${r.indicator_id}|${r.source_subcounty_pcode}`) : null;
  if (!g && !x) continue;
  const targetGeo=g?.matched_geo_code ?? x?.target_geo_code ?? r.matched_geo_code ?? null;
  const targetName=g?.matched_constituency ?? x?.target_constituency ?? r.matched_constituency ?? null;
  if(!targetGeo) continue;
  prelim.push({...r,
    matched_geo_code:targetGeo,
    matched_constituency:targetName,
    geography_gate_route:g&&x?'geometry_and_secondary_pcode':g?'geometry':'secondary_pcode_crosswalk',
    geometry_gate:g??null,
    secondary_crosswalk_gate:x??null,
    publication_eligible:false
  });
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
  const allCountyRows=(probe.rows??[]).filter(r=>r.dataset===rows[0].dataset && r.indicator_id===rows[0].indicator_id && r.normalized_county===rows[0].normalized_county);
  const candidateKeys=new Set(rows.map(r=>r.source_subcounty_pcode||r.normalized_subcounty));
  const allKeys=new Set(allCountyRows.map(r=>r.source_subcounty_pcode||r.normalized_subcounty));
  const exhaustive=rows.length===allCountyRows.length && candidateKeys.size===allKeys.size && [...allKeys].every(k=>candidateKeys.has(k));
  const uniqueTargets=new Set(rows.map(r=>r.matched_geo_code));
  const oneToOne=uniqueTargets.size===rows.length;
  const passes=exhaustive && oneToOne && Number.isFinite(weighted) && absDiff<=0.15;
  reconciliation.push({
    key,status:passes?'pass':'fail',passes,row_count:rows.length,county_source_row_count:allCountyRows.length,
    exhaustive_crosswalk_set:exhaustive,one_to_one_target_set:oneToOne,
    weighted_subcounty_value:Number.isFinite(weighted)?Number(weighted.toFixed(4)):null,
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
  schema_version:'kda.p42.kphc-constituency-candidates.v2',
  rule:'Rows advance through either the frozen geometry-equivalence route or the pinned unique PCode crosswalk route. In both cases the entire county source set must resolve one-to-one and back-aggregate to the published county control within 0.15 percentage points. Candidate status is not publication.',
  summary:{
    geography_passing_source_rows:prelim.length,
    by_route:Object.fromEntries(['geometry','secondary_pcode_crosswalk','geometry_and_secondary_pcode'].map(k=>[k,prelim.filter(r=>r.geography_gate_route===k).length])),
    county_groups_evaluated:reconciliation.length,
    county_groups_reconciled:reconciliation.filter(x=>x.passes).length,
    promotion_candidate_rows:rows.filter(x=>x.promotion_candidate).length,
    promotion_candidate_unique_geographies:new Set(rows.filter(x=>x.promotion_candidate).map(x=>x.matched_geo_code)).size,
    publication_eligible_rows:0
  },
  reconciliation,
  rows
};
fs.writeFileSync('data/p42/kphc-constituency-candidates.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out.summary,null,2));
