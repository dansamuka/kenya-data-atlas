import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const outArg=process.argv[2]||'/tmp/p23-form34b-extraction-queue.json';
const outPath=path.isAbsolute(outArg)?outArg:path.join(root,outArg);
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));

const geos=json('data/geography/registry/geographies.json');
const source=json('data/p23/form34b-source-index-contract.json');
const extraction=json('data/p23/form34b-extraction-contract.json');
const turnout=json('data/p23/constituency-turnout-readiness-contract.json');

const constituencies=geos.filter(g=>g.level==='constituency').sort((a,b)=>Number(a.constituency_code)-Number(b.constituency_code));
if(constituencies.length!==290)throw new Error(`Expected 290 constituencies, got ${constituencies.length}`);
const rule=source.source_index_relation||{};
if(rule.verified_rows!==290)throw new Error('Form 34B source-index relation is not verified 290/290');

const rows=constituencies.map(geo=>{
  const code=Number(geo.constituency_code);
  const portalRowId=code+Number(rule.portal_row_id_offset);
  const formId=code+Number(rule.form_id_offset);
  return {
    geo_code:geo.geo_code,
    geography_id:geo.geography_id,
    constituency_code:code,
    constituency_name:geo.name,
    portal_row_id:portalRowId,
    form_id:formId,
    source_url:String(rule.download_url_template).replace('{form_id}',String(formId)),
    source_view_url:String(rule.view_url_template).replace('{form_id}',String(formId)),
    source_sha256:null,
    registered_voters:null,
    total_valid_votes:null,
    rejected_ballots:null,
    turnout_pct:null,
    field_evidence:{
      registered_voters:null,
      total_valid_votes:null,
      rejected_ballots:null
    },
    verification_state:'pending_source_verification',
    resolution_note:'Official Form 34B locator is governed; numeric source-image verification has not yet been completed.'
  };
});

const doc={
  schema_version:'kda.p23.form34b-extraction-queue.v1',
  as_of:'2026-09-03',
  contract_id:extraction.contract_id,
  turnout_contract_id:turnout.contract_id,
  source_index_contract_id:source.contract_id,
  expected_rows:290,
  rows,
  summary:{
    total_rows:rows.length,
    pending_source_verification:rows.filter(r=>r.verification_state==='pending_source_verification').length,
    verified:0,
    partial_unresolved:0,
    values_promoted:0
  },
  note:'This queue contains governed source locators only. Null numeric fields are intentional and remain unresolved until source-image verification satisfies the Form 34B extraction contract.'
};
fs.mkdirSync(path.dirname(outPath),{recursive:true});
fs.writeFileSync(outPath,JSON.stringify(doc,null,2)+'\n');
console.log(`P23_FORM34B_EXTRACTION_QUEUE_BUILT rows=${rows.length} pending=${doc.summary.pending_source_verification} verified=0 values_promoted=0 path=${outPath}`);
