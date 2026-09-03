import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const input=process.argv[2]||'/tmp/p23-form34b-extraction-queue.json';
const abs=p=>path.isAbsolute(p)?p:path.join(root,p);
const json=p=>JSON.parse(fs.readFileSync(abs(p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 Form34B extraction queue: ${msg}`);};

const q=json(input);
const geos=json('data/geography/registry/geographies.json');
const source=json('data/p23/form34b-source-index-contract.json');
const extraction=json('data/p23/form34b-extraction-contract.json');
const summary=json('data/completeness/summary.json');
const cons=geos.filter(g=>g.level==='constituency');
const byCode=new Map(cons.map(g=>[g.geo_code,g]));
const rule=source.source_index_relation||{};

assert(q.schema_version==='kda.p23.form34b-extraction-queue.v1','unexpected queue schema');
assert(q.contract_id===extraction.contract_id,'queue extraction contract mismatch');
assert(q.expected_rows===290&&q.rows?.length===290,'queue must contain exactly 290 rows');
assert(new Set(q.rows.map(r=>r.geo_code)).size===290,'queue geo_codes must be unique');
assert(new Set(q.rows.map(r=>r.form_id)).size===290,'queue form ids must be unique');
for(const row of q.rows){
  const geo=byCode.get(row.geo_code);
  assert(geo,`${row.geo_code}: missing canonical geography`);
  const code=Number(geo.constituency_code);
  assert(row.geography_id===geo.geography_id,`${row.geo_code}: geography_id mismatch`);
  assert(row.constituency_code===code,`${row.geo_code}: constituency code mismatch`);
  assert(row.constituency_name===geo.name,`${row.geo_code}: constituency name mismatch`);
  assert(row.portal_row_id===code+rule.portal_row_id_offset,`${row.geo_code}: portal locator mismatch`);
  assert(row.form_id===code+rule.form_id_offset,`${row.geo_code}: form locator mismatch`);
  assert(new URL(row.source_url).hostname==='forms.iebc.or.ke',`${row.geo_code}: source host mismatch`);
  assert(row.source_sha256===null,`${row.geo_code}: source digest must remain unset before source verification`);
  for(const f of ['registered_voters','total_valid_votes','rejected_ballots','turnout_pct']) assert(row[f]===null,`${row.geo_code}: ${f} must remain null in the pre-verification queue`);
  assert(row.verification_state==='pending_source_verification',`${row.geo_code}: unexpected pre-verification state`);
  assert(row.field_evidence?.registered_voters===null&&row.field_evidence?.total_valid_votes===null&&row.field_evidence?.rejected_ballots===null,`${row.geo_code}: field evidence must remain null before verification`);
}
assert(q.summary?.total_rows===290&&q.summary?.pending_source_verification===290,'queue summary must report all 290 pending');
assert(q.summary?.verified===0&&q.summary?.values_promoted===0,'pre-verification queue must promote zero values');
assert(Number(summary.by_completion_phase?.P23)===290,'queue generation must not resolve P23');
assert(Number(summary.total_slots)===20115,'governed completeness denominator changed');
console.log(`P23_FORM34B_EXTRACTION_QUEUE_OK rows=290 pending=290 p23_remaining=${summary.by_completion_phase.P23} values_promoted=0`);
