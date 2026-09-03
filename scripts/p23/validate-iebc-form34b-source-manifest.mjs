import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const manifestPath=process.argv[2]||'data/p23/source/iebc-2022-form34b-source-manifest.json';
const abs=p=>path.isAbsolute(p)?p:path.join(root,p);
const json=p=>JSON.parse(fs.readFileSync(abs(p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 Form 34B source manifest validation: ${msg}`);};

const manifest=json(manifestPath);
const geographies=json('data/geography/registry/geographies.json');
const contract=json('data/p23/constituency-turnout-readiness-contract.json');
const sourceIndex=json('data/p23/form34b-source-index-contract.json');
const constituencies=geographies.filter(g=>g.level==='constituency');
const geoByCode=new Map(constituencies.map(g=>[g.geo_code,g]));

assert(manifest.schema_version==='kda.p23.iebc-form34b-source-manifest.v1','unexpected manifest schema');
assert(sourceIndex.schema_version==='kda.p23.iebc-form34b-source-index.v1','unexpected source-index contract schema');
assert(manifest.promotion_state==='source_reference_manifest_complete','manifest must be source-reference complete before promotion');
assert(manifest.portal_reported_items===291,'official Form 34B portal item count must remain 291');
assert(manifest.portal_rows_discovered===291,'discovered Form 34B portal row count must remain 291');
assert(manifest.canonical_constituencies===290,'canonical constituency denominator must remain 290');
assert(manifest.canonical_matches===290,'manifest must map all 290 canonical constituencies');
assert(manifest.governed_alias_matches===3,'manifest must contain exactly three governed source-name aliases');
assert((manifest.unmatched_portal_rows||[]).length===0,'unmatched IEBC portal rows remain');
assert((manifest.missing_canonical_constituencies||[]).length===0,'canonical constituencies remain missing');
assert(manifest.canonical_rows_with_single_download_ref===290,'every canonical constituency must have exactly one official download reference');
assert(manifest.canonical_rows_with_single_view_ref===290,'every canonical constituency must have exactly one official view reference');

const verified=sourceIndex.verified_source_manifest||{};
assert(verified.portal_reported_items===291&&verified.portal_rows_discovered===291,'pinned source-index portal counts changed');
assert(verified.canonical_constituencies===290&&verified.canonical_matches===290,'pinned source-index canonical counts changed');
assert(verified.governed_alias_matches===3&&verified.excluded_noncanonical_rows===1,'pinned source-index alias/exclusion counts changed');
assert(verified.canonical_rows_with_single_download_ref===290&&verified.canonical_rows_with_single_view_ref===290,'pinned source-index reference coverage changed');

const indexRule=sourceIndex.source_index_relation||{};
assert(indexRule.verified_rows===290,'source-index relation must remain verified across 290 rows');
assert(indexRule.portal_row_id_offset===50,'portal row id offset changed');
assert(indexRule.form_id_offset===277628,'form id offset changed');
assert(indexRule.form_minus_portal_offset===277578,'form-minus-portal offset changed');
assert(indexRule.first_form_id===277629&&indexRule.last_form_id===277918,'pinned Form 34B id range changed');

const excluded=manifest.excluded_noncanonical_portal_rows||[];
assert(excluded.length===1,'expected exactly one non-canonical IEBC portal row');
assert(String(excluded[0].portal_name||'').toUpperCase()==='DIASPORA','the sole non-canonical portal row must be DIASPORA');
assert(Number(excluded[0].portal_row_id)===341,'diaspora portal row id changed unexpectedly');
assert(sourceIndex.noncanonical_portal_row?.portal_row_id===341&&sourceIndex.noncanonical_portal_row?.portal_name==='DIASPORA','source-index diaspora rule diverged');

const rows=manifest.rows||[];
assert(rows.length===290,`expected 290 manifest rows, got ${rows.length}`);
assert(new Set(rows.map(r=>r.geo_code)).size===290,'manifest geo_codes must be unique');
assert(new Set(rows.map(r=>r.geography_id)).size===290,'manifest geography_ids must be unique');
assert(new Set(rows.map(r=>r.portal_row_id)).size===290,'manifest portal row ids must be unique');
const formIds=[];

const expectedAliases=new Map((contract.source_name_reconciliation?.aliases||[]).map(a=>[a.portal_name,a.geo_code]));
const seenAliases=new Map();
const forbiddenValueFields=['registered_voters','total_valid_votes','rejected_ballots','turnout_pct','turnout_percentage','value'];

for(const row of rows){
  const geo=geoByCode.get(row.geo_code);
  assert(geo,`${row.geo_code}: not present in canonical constituency registry`);
  assert(geo.geography_id===row.geography_id,`${row.geo_code}: geography_id mismatch`);
  const constituencyCode=Number(row.constituency_code);
  assert(Number(geo.constituency_code)===constituencyCode,`${row.geo_code}: constituency code mismatch`);
  assert(geo.name===row.constituency_name,`${row.geo_code}: canonical constituency name mismatch`);
  assert(row.portal_reported==='1 of 1 (100%)',`${row.geo_code}: portal row is not fully reported`);
  assert(row.form_status==='reported',`${row.geo_code}: form status is not reported`);
  assert(Array.isArray(row.form_download_ids)&&row.form_download_ids.length===1,`${row.geo_code}: expected one download id`);
  assert(Array.isArray(row.form_view_ids)&&row.form_view_ids.length===1,`${row.geo_code}: expected one view id`);
  assert(row.form_download_ids[0]===row.form_view_ids[0],`${row.geo_code}: download/view form ids diverge`);
  formIds.push(row.form_download_ids[0]);
  assert(row.portal_row_id===constituencyCode+indexRule.portal_row_id_offset,`${row.geo_code}: portal row id no longer follows the 290/290 verified source-index relation`);
  assert(row.form_download_ids[0]===constituencyCode+indexRule.form_id_offset,`${row.geo_code}: form id no longer follows the 290/290 verified source-index relation`);
  assert(row.form_download_ids[0]-row.portal_row_id===indexRule.form_minus_portal_offset,`${row.geo_code}: form/portal id relation changed`);
  assert(Array.isArray(row.download_urls)&&row.download_urls.length===1,`${row.geo_code}: expected one download URL`);
  assert(Array.isArray(row.view_urls)&&row.view_urls.length===1,`${row.geo_code}: expected one view URL`);
  assert(new URL(row.detail_url).hostname==='forms.iebc.or.ke',`${row.geo_code}: detail URL is not on official IEBC forms host`);
  assert(new URL(row.download_urls[0]).hostname==='forms.iebc.or.ke',`${row.geo_code}: download URL is not on official IEBC forms host`);
  assert(new URL(row.view_urls[0]).hostname==='forms.iebc.or.ke',`${row.geo_code}: view URL is not on official IEBC forms host`);
  for(const field of forbiddenValueFields) assert(!Object.hasOwn(row,field),`${row.geo_code}: source-reference manifest must not contain ${field}`);

  if(row.match_method==='governed_source_name_alias'){
    assert(expectedAliases.get(row.portal_name)===row.geo_code,`${row.geo_code}: alias is not governed by turnout readiness contract`);
    seenAliases.set(row.portal_name,row.geo_code);
  } else {
    assert(row.match_method==='exact_normalized_name',`${row.geo_code}: unsupported match method ${row.match_method}`);
  }
}

assert(new Set(formIds).size===290,'official Form 34B ids must be unique across the 290 canonical constituencies');
assert(Math.min(...formIds)===indexRule.first_form_id&&Math.max(...formIds)===indexRule.last_form_id,'observed Form 34B id range diverges from pinned source-index contract');
assert(seenAliases.size===expectedAliases.size&&[...expectedAliases].every(([name,code])=>seenAliases.get(name)===code),'governed alias set diverges from contract');
assert(String(manifest.promotion_note||'').toLowerCase().includes('no turnout values'),'promotion note must explicitly state that the manifest contains no turnout values');

console.log(`P23_FORM34B_SOURCE_MANIFEST_OK canonical=${rows.length} aliases=${seenAliases.size} excluded=${excluded.length} form_refs=${formIds.length} source_index=290/290 values_promoted=0`);
