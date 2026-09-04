import fs from 'node:fs';

const file=process.argv[2]||'/tmp/p23-form34b-bulk-total-row-candidates.json';
const doc=JSON.parse(fs.readFileSync(file,'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 bulk TOTAL-row candidate validation: ${msg}`);};

assert(doc.schema_version==='kda.p23.form34b.bulk-total-row-candidates.v1','unexpected schema');
assert(doc.source_manifest_schema==='kda.p23.iebc-form34b-source-manifest.v1','source manifest schema changed');
assert(doc.requested_rows===10&&doc.rows_processed===10,'smoke batch must remain exactly 10 rows');
assert(Array.isArray(doc.rows)&&doc.rows.length===10,'row count mismatch');
assert(doc.source_verified_values===0,'smoke artifact must contain zero source-verified values');
assert(doc.promotion_authorized===false,'smoke artifact must never authorize promotion');

const codes=doc.rows.map(r=>Number(r.constituency_code));
assert(new Set(codes).size===10,'constituency codes must be unique');
assert(codes.every((code,i)=>code===i+1),'smoke batch must remain canonical constituency codes 1-10');
assert(doc.rows.every(r=>/^KEN-C\d{3}-CON\d{3}$/.test(String(r.geo_code||''))),'canonical geo_code missing');
assert(doc.rows.every(r=>Number.isInteger(r.form_download_id)&&r.form_download_id>0),'official form download id missing');
assert(doc.rows.every(r=>/^https:\/\/forms\.iebc\.or\.ke\//.test(String(r.source_url||''))),'official IEBC source URL missing');
assert(doc.rows.every(r=>/^[0-9a-f]{64}$/.test(String(r.source_pdf_sha256||''))),'source PDF fingerprint missing');
assert(doc.rows.every(r=>Number.isInteger(r.page_count)&&r.page_count>0),'page count missing');
assert(doc.rows.every(r=>r.source_verified_values===0&&r.promotion_authorized===false),'row-level promotion boundary changed');

const allowed=new Set(['strong_machine_candidate','machine_candidate_needs_review','unresolved']);
assert(doc.rows.every(r=>allowed.has(r.verification_state)),'unexpected verification state');
assert(doc.unique_total_rows===doc.rows.filter(r=>r.total_row_candidates_found===1).length,'unique TOTAL-row summary mismatch');
assert(doc.strong_machine_candidates===doc.rows.filter(r=>r.verification_state==='strong_machine_candidate').length,'strong candidate summary mismatch');

const anchor=doc.rows.find(r=>r.constituency_code===1);
assert(anchor,'Changamwe anchor missing');
assert(anchor.total_row_candidates_found===1,'Changamwe must retain one final TOTAL row');
assert(anchor.verification_state==='strong_machine_candidate','Changamwe anchor must remain a strong machine candidate');
assert(anchor.denominator_match===true&&anchor.arithmetic_ok===true&&anchor.turnout_range_ok===true,'Changamwe anchor reconciliation changed');
assert(anchor.source_verified_values===0&&anchor.promotion_authorized===false,'Changamwe smoke row must remain non-promotable');

console.log(`P23_FORM34B_BULK_TOTAL_ROW_SMOKE_VALID rows=10 unique_total_rows=${doc.unique_total_rows} strong_machine_candidates=${doc.strong_machine_candidates} source_verified_values=0 promotion_authorized=false values_logged=0`);
