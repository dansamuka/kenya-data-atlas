import fs from 'node:fs';
import crypto from 'node:crypto';

const [manifestPath, imageDir] = process.argv.slice(2);
if (!manifestPath || !imageDir) throw new Error('usage: node validate-salvage-a-final-review-context.mjs <manifest> <image-dir>');
const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const digest = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assert = (ok, msg) => { if (!ok) throw new Error(`P23 final salvage-A review context: ${msg}`); };
const sha = v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const commitSha = v => typeof v === 'string' && /^[0-9a-f]{40}$/.test(v);
const specs = [
  {geo_code:'KEN-C005-CON022',name:'Lamu West',form_id:277650,page:2,slug:'lamu-west'},
  {geo_code:'KEN-C006-CON023',name:'Taveta',form_id:277651,page:2,slug:'taveta'},
  {geo_code:'KEN-C006-CON024',name:'Wundanyi',form_id:277652,page:1,slug:'wundanyi'},
];
assert(m.schema_version === 'kda.p23.form34b.salvage-a-final-review-contexts.v1', 'schema changed');
assert(m.governance?.fresh_official_download_required === true, 'fresh download requirement weakened');
assert(m.governance?.fresh_hashes_only === true, 'fresh-hash requirement weakened');
assert(m.governance?.no_inheritance === true, 'no-inheritance weakened');
assert(m.governance?.no_result_value_extraction === true, 'result extraction must remain forbidden');
assert(m.governance?.no_ocr_result_promotion === true, 'OCR promotion must remain forbidden');
assert(m.governance?.promotion_authorized === false, 'context must not authorize promotion');
assert(m.governance?.contexts_are_evidence_locators_only_until_independent_visual_review === true, 'context status changed');
assert(Array.isArray(m.rows) && m.rows.length === 3, 'exactly three rows required');
const forbidden = new Set(['registered_voters','total_valid_votes','rejected_ballots','turnout_pct','ballots_cast','candidate_vote_sum','verified_value','verification_state','promotion_eligible','promotion_state']);
const scan = (value, where='manifest') => {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) return value.forEach((item,i)=>scan(item,`${where}[${i}]`));
  for (const [key,nested] of Object.entries(value)) {
    if (forbidden.has(key)) throw new Error(`P23 final salvage-A review context: forbidden result/promotion field at ${where}.${key}`);
    scan(nested, `${where}.${key}`);
  }
};
scan(m);
for (let i=0;i<specs.length;i+=1) {
  const spec=specs[i], row=m.rows[i];
  assert(row.geo_code===spec.geo_code && row.name===spec.name, `${spec.geo_code} identity/order changed`);
  assert(row.form_id===spec.form_id, `${spec.geo_code} form id changed`);
  assert(row.source_url===`https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id=${spec.form_id}`, `${spec.geo_code} source URL changed`);
  assert(row.fresh_download_state==='fresh_official_source_downloaded_unreviewed', `${spec.geo_code} source was not freshly downloaded`);
  assert(sha(row.source_pdf_sha256), `${spec.geo_code} fresh PDF hash missing`);
  assert(row.page_number===spec.page && row.render_dpi===250, `${spec.geo_code} review page/DPI changed`);
  assert(sha(row.full_page_image_sha256), `${spec.geo_code} image hash missing`);
  assert(Number.isInteger(row.width_px)&&row.width_px>0&&Number.isInteger(row.height_px)&&row.height_px>0, `${spec.geo_code} image dimensions invalid`);
  assert(Number.isInteger(row.workflow_run_id)&&row.workflow_run_id>0&&commitSha(row.workflow_head_sha), `${spec.geo_code} workflow provenance invalid`);
  const image=`${imageDir}/${spec.slug}-page${spec.page}-250dpi.png`;
  assert(row.full_page_image_sha256===digest(image), `${spec.geo_code} image hash mismatch`);
}
console.log('P23_SALVAGE_A_FINAL_REVIEW_CONTEXT_VALID rows=3 dpi=250 no_values=true no_promotion=true');
