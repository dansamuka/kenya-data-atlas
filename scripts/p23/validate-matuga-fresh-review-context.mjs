import fs from 'node:fs';
import crypto from 'node:crypto';

const manifestPath = process.argv[2];
const pagePath = process.argv[3];
if (!manifestPath || !pagePath) {
  throw new Error('usage: node validate-matuga-fresh-review-context.mjs <manifest> <page.png>');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const digest = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assert = (ok, message) => { if (!ok) throw new Error(`P23 Matuga fresh review context: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(manifest.schema_version === 'kda.p23.form34b.machine-review-contexts.v1', 'schema changed');
assert(manifest.geo_code === 'KEN-C002-CON009', 'geo code changed');
assert(manifest.constituency_code === 9 && manifest.constituency_name === 'Matuga', 'constituency identity changed');
assert(manifest.form_id === 277637, 'form id changed');
assert(manifest.source_url === 'https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id=277637', 'source URL changed');
assert(manifest.fresh_download_state === 'fresh_official_source_downloaded_unreviewed', 'source was not freshly downloaded');
assert(sha(manifest.source_pdf_sha256), 'fresh source PDF hash missing');
assert(manifest.page_number === 3, 'review page changed');
assert(manifest.render_dpi === 250, 'review render must remain exactly 250 DPI');
assert(manifest.review_context_mode === 'full_page', 'review context must remain full-page');
assert(Number.isInteger(manifest.page_width_px) && manifest.page_width_px >= 1000, 'page width invalid');
assert(Number.isInteger(manifest.page_height_px) && manifest.page_height_px >= 1000, 'page height invalid');
assert(Number.isInteger(manifest.workflow_run_id) && manifest.workflow_run_id > 0, 'workflow run id missing');
assert(typeof manifest.workflow_head_sha === 'string' && /^[0-9a-f]{40}$/.test(manifest.workflow_head_sha), 'workflow head SHA invalid');
assert(manifest.governance?.fresh_official_download_required === true, 'fresh download requirement weakened');
assert(manifest.governance?.fresh_hashes_only === true, 'fresh hash requirement weakened');
assert(manifest.governance?.no_inheritance === true, 'no-inheritance rule weakened');
assert(manifest.governance?.historical_evidence_used_for_page_locator_only === true, 'historical evidence scope changed');
assert(manifest.governance?.no_result_value_extraction === true, 'result extraction must remain forbidden');
assert(manifest.governance?.no_ocr_result_promotion === true, 'OCR promotion must remain forbidden');
assert(manifest.governance?.promotion_authorized === false, 'review context must not authorize promotion');
assert(manifest.governance?.review_context_is_evidence_locator_only_until_independent_visual_review === true, 'review-context status changed');
assert(sha(manifest.full_page_image_sha256) && manifest.full_page_image_sha256 === digest(pagePath), 'full-page image hash mismatch');
assert(sha(manifest.review_context_sha256) && manifest.review_context_sha256 === digest(pagePath), 'review-context hash mismatch');
assert(manifest.full_page_image_sha256 === manifest.review_context_sha256, 'full-page review context hashes must match');

const forbidden = new Set([
  'registered_voters', 'total_valid_votes', 'rejected_ballots', 'turnout_pct', 'ballots_cast',
  'candidate_vote_sum', 'candidate_vote_totals_in_source_column_order', 'verified_value',
  'verification_state', 'promotion_eligible', 'promotion_state'
]);
const scan = (value, where = 'manifest') => {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) return value.forEach((item, i) => scan(item, `${where}[${i}]`));
  for (const [key, nested] of Object.entries(value)) {
    if (forbidden.has(key)) throw new Error(`P23 Matuga fresh review context: forbidden result/promotion field at ${where}.${key}`);
    scan(nested, `${where}.${key}`);
  }
};
scan(manifest);

console.log(`P23_MATUGA_FRESH_REVIEW_CONTEXT_VALID page=3 dpi=250 source_pdf_sha256=${manifest.source_pdf_sha256} review_context_sha256=${manifest.review_context_sha256} no_values=true no_promotion=true`);
