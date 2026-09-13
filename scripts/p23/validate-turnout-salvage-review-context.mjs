#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('usage: validate-turnout-salvage-review-context.mjs <manifest>');
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = message => { throw new Error(`P23 salvage review-context validation: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const forbiddenKeys = new Set([
  'registered_voters', 'total_valid_votes', 'rejected_ballots', 'turnout_pct',
  'candidate_vote_sum', 'verified_value', 'source_verified', 'promotion_eligible',
  'promotion_state', 'explicit_materialization_authorized', 'ballots_cast',
]);

const scan = (value, where = 'manifest') => {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, `${where}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) fail(`forbidden result/promotion field at ${where}.${key}`);
    scan(nested, `${where}.${key}`);
  }
};
scan(manifest);

if (manifest.schema_version !== 'kda.p23.turnout-salvage-review-context.v1') fail('schema version changed');
if (manifest.tranche !== 'salvage-a') fail('only salvage-a is governed by this review-context manifest');
const governance = manifest.governance || {};
if (governance.no_inheritance !== true) fail('no_inheritance must remain true');
if (governance.no_promotion !== true) fail('no_promotion must remain true');
if (governance.result_values_forbidden !== true) fail('result_values_forbidden must remain true');
if (governance.ocr_forbidden !== true) fail('OCR must remain forbidden');
if (governance.visual_transcription_not_performed !== true) fail('visual transcription must remain unperformed');
if (governance.source_verification_not_granted !== true) fail('source verification must not be granted');
if (governance.review_pending !== true) fail('review must remain pending');
if (governance.render_dpi !== 250) fail('render DPI must be exactly 250');

const rows = manifest.rows;
if (!Array.isArray(rows) || rows.length !== 8) fail(`expected exactly 8 rows; saw ${Array.isArray(rows) ? rows.length : 'non-array'}`);
const seen = new Set();
let pages = 0;
for (const [index, row] of rows.entries()) {
  if (typeof row.geo_code !== 'string' || !/^KEN-C\d{3}-CON\d{3}$/.test(row.geo_code)) fail(`row ${index + 1}: invalid geo_code`);
  if (seen.has(row.geo_code)) fail(`row ${index + 1}: duplicate geo_code ${row.geo_code}`);
  seen.add(row.geo_code);
  if (!Number.isInteger(row.constituency_code) || row.constituency_code < 1 || row.constituency_code > 290) fail(`row ${index + 1}: invalid constituency code`);
  if (!sha(row.source_pdf_sha256)) fail(`row ${index + 1}: source PDF hash missing`);
  if (row.render_dpi !== 250) fail(`row ${index + 1}: render DPI must be exactly 250`);
  if (row.state !== 'fresh_official_source_rendered_250dpi_unreviewed') fail(`row ${index + 1}: row must remain unreviewed`);
  if (row.promotion_authorized_by_this_record !== false) fail(`row ${index + 1}: record must not authorize promotion`);
  if (!Array.isArray(row.pages) || row.pages.length < 1) fail(`row ${index + 1}: rendered pages missing`);
  if (row.page_count !== row.pages.length) fail(`row ${index + 1}: page_count mismatch`);
  row.pages.forEach((page, pageIndex) => {
    if (page.page_number !== pageIndex + 1) fail(`row ${index + 1}: page numbering must be contiguous from 1`);
    if (!sha(page.page_image_sha256)) fail(`row ${index + 1} page ${pageIndex + 1}: image hash missing`);
    if (!Number.isInteger(page.width_px) || page.width_px < 1 || !Number.isInteger(page.height_px) || page.height_px < 1) fail(`row ${index + 1} page ${pageIndex + 1}: image dimensions invalid`);
    if (typeof page.image_file !== 'string' || !page.image_file.endsWith('.png')) fail(`row ${index + 1} page ${pageIndex + 1}: image file missing`);
    pages += 1;
  });
}
console.log(`P23_SALVAGE_REVIEW_CONTEXT_OK rows=${rows.length} pages=${pages} dpi=250 reviewed=0 promotion_authorized=0 values_logged=0`);
