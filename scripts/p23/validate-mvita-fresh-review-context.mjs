import fs from 'node:fs';
import crypto from 'node:crypto';

const manifestPath = process.argv[2];
const pagePath = process.argv[3];
const cropPath = process.argv[4];
if (!manifestPath || !pagePath || !cropPath) {
  throw new Error('usage: node validate-mvita-fresh-review-context.mjs <manifest> <page.png> <crop.png>');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const digest = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assert = (ok, message) => { if (!ok) throw new Error(`P23 Mvita fresh review context: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(manifest.schema_version === 'kda.p23.form34b.machine-review-contexts.v1', 'schema changed');
assert(manifest.geo_code === 'KEN-C001-CON006', 'geo code changed');
assert(manifest.constituency_code === 6 && manifest.constituency_name === 'Mvita', 'constituency identity changed');
assert(manifest.form_id === 277634, 'form id changed');
assert(manifest.source_url === 'https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id=277634', 'source URL changed');
assert(manifest.fresh_download_state === 'fresh_official_source_downloaded_unreviewed', 'source was not freshly downloaded');
assert(sha(manifest.source_pdf_sha256), 'fresh source PDF hash missing');
assert(manifest.page_number === 3, 'review page changed');
assert(manifest.render_dpi === 250, 'review render must remain exactly 250 DPI');
assert(Array.isArray(manifest.crop_box_250dpi_pixels) && manifest.crop_box_250dpi_pixels.join(',') === '180,1550,2740,1800', 'review crop changed');
assert(Number.isInteger(manifest.workflow_run_id) && manifest.workflow_run_id > 0, 'workflow run id missing');
assert(typeof manifest.workflow_head_sha === 'string' && /^[0-9a-f]{40}$/.test(manifest.workflow_head_sha), 'workflow head SHA invalid');
assert(manifest.governance?.fresh_official_download_required === true, 'fresh download requirement weakened');
assert(manifest.governance?.fresh_hashes_only === true, 'fresh hash requirement weakened');
assert(manifest.governance?.no_inheritance === true, 'no-inheritance rule weakened');
assert(manifest.governance?.no_result_value_extraction === true, 'result extraction must remain forbidden');
assert(manifest.governance?.no_ocr_result_promotion === true, 'OCR promotion must remain forbidden');
assert(manifest.governance?.promotion_authorized === false, 'review context must not authorize promotion');
assert(manifest.governance?.review_context_is_evidence_locator_only_until_independent_visual_review === true, 'review-context status changed');
assert(sha(manifest.full_page_image_sha256) && manifest.full_page_image_sha256 === digest(pagePath), 'full-page image hash mismatch');
assert(sha(manifest.review_context_sha256) && manifest.review_context_sha256 === digest(cropPath), 'review crop hash mismatch');

const forbidden = new Set([
  'registered_voters', 'total_valid_votes', 'rejected_ballots', 'turnout_pct', 'ballots_cast',
  'candidate_vote_sum', 'verified_value', 'verification_state', 'promotion_eligible', 'promotion_state'
]);
const scan = (value, where = 'manifest') => {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) return value.forEach((item, i) => scan(item, `${where}[${i}]`));
  for (const [key, nested] of Object.entries(value)) {
    if (forbidden.has(key)) throw new Error(`P23 Mvita fresh review context: forbidden result/promotion field at ${where}.${key}`);
    scan(nested, `${where}.${key}`);
  }
};
scan(manifest);

console.log(`P23_MVITA_FRESH_REVIEW_CONTEXT_VALID page=3 dpi=250 source_pdf_sha256=${manifest.source_pdf_sha256} review_context_sha256=${manifest.review_context_sha256} no_values=true no_promotion=true`);
