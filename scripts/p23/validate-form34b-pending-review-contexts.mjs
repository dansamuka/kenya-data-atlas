#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const contextPath = process.argv[2] || '/tmp/p23-form34b-pending-review-contexts.json';
const queuePath = process.argv[3] || '/tmp/p23-form34b-source-row-recovery-queue.json';
const imageDir = process.argv[4] || '/tmp/p23-form34b-pending-review-contexts';
const doc = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const fail = (message) => { throw new Error(message); };
const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sha256TextFile = (file) => sha256File(file);
const shaRe = /^[0-9a-f]{64}$/;

if (doc.schema_version !== 'kda.p23.form34b.pending-source-review-contexts.v1') fail('Unexpected pending-review context schema');
if (queue.schema_version !== 'kda.p23.form34b.source-row-recovery-queue.v1') fail('Unexpected recovery queue schema');
if (doc.source_verified_values !== 0 || doc.promotion_authorized !== false || doc.turnout_values_extracted !== 0) {
  fail('Pending-review renderer crossed the no-verification/no-promotion boundary');
}
if (queue.source_verified_values !== 0 || queue.promotion_authorized !== false) fail('Input recovery queue is not non-promoting');
if (!Array.isArray(doc.rows) || !Array.isArray(queue.queue)) fail('Pending-review rows or recovery queue missing');
if (doc.rows_rendered !== doc.rows.length || queue.rows !== queue.queue.length || doc.rows.length !== queue.queue.length) {
  fail('Pending-review renderer must cover the exact current recovery queue');
}
if (doc.queue_sha256 !== sha256TextFile(queuePath)) fail('Pending-review queue digest mismatch');
if (doc.render_dpi !== 250 || !Number.isInteger(doc.vertical_padding_pixels) || doc.vertical_padding_pixels < 200) {
  fail('Pending-review render geometry is weaker than the governed wider-context contract');
}

const prohibitedKeys = new Set([
  'total_valid_votes',
  'rejected_ballots',
  'turnout_pct',
  'candidate_vote_totals',
  'candidate_votes',
  'verified_value',
  'field_evidence',
  'verification_method',
  'promotion_eligible',
]);
const scanKeys = (value, trail = 'root') => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanKeys(item, `${trail}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (prohibitedKeys.has(key)) fail(`Pending-review context leaked prohibited field ${key} at ${trail}`);
    scanKeys(child, `${trail}.${key}`);
  }
};
scanKeys(doc);

const cleanImageName = (name) => typeof name === 'string' && name.length > 0 && !name.includes('/') && !name.includes('\\');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const seen = new Set();
for (let index = 0; index < doc.rows.length; index += 1) {
  const row = doc.rows[index];
  const queued = queue.queue[index];
  const code = row.constituency_code;
  if (!Number.isInteger(code) || code < 1 || code > 290 || seen.has(code)) fail(`Invalid or duplicate constituency code ${code}`);
  seen.add(code);
  if (code !== queued.constituency_code) fail(`Pending-review ordering changed at row ${index}`);
  for (const key of ['geo_code', 'constituency_name', 'source_url', 'source_pdf_sha256', 'canonical_registered_voters']) {
    if (row[key] !== queued[key]) fail(`Constituency ${code}: queued ${key} changed during rendering`);
  }
  if (!same(row.denominator_anchor, queued.denominator_anchor)) fail(`Constituency ${code}: denominator anchor changed during rendering`);
  if (row.prior_review_context_file !== queued.review_context_file || row.prior_review_context_sha256 !== queued.review_context_sha256) {
    fail(`Constituency ${code}: prior governed review-context linkage changed`);
  }
  if (row.verification_state !== 'pending_independent_visual_source_image_review') fail(`Constituency ${code}: renderer changed review state`);
  if (row.source_verified_values !== 0 || row.promotion_authorized !== false) fail(`Constituency ${code}: renderer crossed promotion boundary`);
  if (!String(row.source_url || '').startsWith('https://forms.iebc.or.ke/')) fail(`Constituency ${code}: non-official source URL`);
  if (!shaRe.test(String(row.source_pdf_sha256 || ''))) fail(`Constituency ${code}: invalid source PDF digest`);

  const bbox = row.denominator_anchor?.bbox_250;
  const crop = row.wide_review_context_crop_250;
  if (!bbox || !crop || crop.x0 !== 0 || crop.x1 <= bbox.x1 || crop.y0 > bbox.y0 || crop.y1 < bbox.y1) {
    fail(`Constituency ${code}: wider context does not fully contain the governed denominator anchor`);
  }
  if (!cleanImageName(row.wide_review_context_file) || !cleanImageName(row.full_page_review_context_file)) {
    fail(`Constituency ${code}: invalid pending-review image filename`);
  }
  for (const [fileKey, hashKey] of [
    ['wide_review_context_file', 'wide_review_context_sha256'],
    ['full_page_review_context_file', 'full_page_review_context_sha256'],
  ]) {
    const file = path.join(imageDir, row[fileKey]);
    if (!fs.existsSync(file)) fail(`Constituency ${code}: missing rendered image ${row[fileKey]}`);
    if (!shaRe.test(String(row[hashKey] || '')) || sha256File(file) !== row[hashKey]) {
      fail(`Constituency ${code}: rendered image digest mismatch for ${row[fileKey]}`);
    }
  }
}

console.log(`P23_FORM34B_PENDING_REVIEW_CONTEXTS_VALID rows=${doc.rows.length} source_verified_values=0 promotion_authorized=false turnout_values_extracted=0`);
