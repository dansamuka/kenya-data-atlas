#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [manifestPath, queuePath, contextDir] = process.argv.slice(2);
if (!manifestPath || !queuePath || !contextDir) {
  throw new Error('Usage: validate-form34b-verification-contexts.mjs <manifest.json> <queue.json> <context-dir>');
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const fail = message => { throw new Error(`P23 Form 34B verification-context validation: ${message}`); };
const fields = ['registered_voters', 'total_valid_votes', 'rejected_ballots'];
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

if (queue.schema_version !== 'kda.p23.form34b.source-verification-queue.v1') fail('unexpected queue schema');
if (queue.source_verified_values !== 0 || queue.promotion_authorized !== false) fail('queue promotion boundary changed');
if (!Array.isArray(queue.rows) || queue.queue_rows !== queue.rows.length) fail('queue rows mismatch');

if (manifest.schema_version !== 'kda.p23.form34b.verification-contexts.v1') fail('unexpected context schema');
if (manifest.queue_schema !== queue.schema_version) fail('queue schema linkage changed');
if (manifest.queue_rows !== queue.queue_rows || manifest.contexts_rendered !== queue.queue_rows) fail('context count does not match queue');
if (manifest.source_verified_values !== 0 || manifest.promotion_authorized !== false) fail('context manifest promotion boundary changed');
if (!Array.isArray(manifest.rows) || manifest.rows.length !== queue.queue_rows) fail('context rows mismatch');

const queueByCode = new Map(queue.rows.map(row => [row.constituency_code, row]));
const manifestCodes = manifest.rows.map(row => row.constituency_code);
const queueCodes = queue.rows.map(row => row.constituency_code);
if (JSON.stringify(manifestCodes) !== JSON.stringify(queueCodes)) fail('context rows do not preserve queue ordering');

for (const row of manifest.rows) {
  const code = row.constituency_code;
  const queued = queueByCode.get(code);
  if (!queued) fail(`unexpected context constituency ${code}`);
  if (row.verification_state !== 'source_context_only') fail(`row ${code} verification state`);
  if (row.source_verified_values !== 0 || row.promotion_authorized !== false) fail(`row ${code} promotion boundary changed`);
  if (row.source_url !== queued.source_url || row.source_pdf_sha256 !== queued.source_pdf_sha256) fail(`row ${code} source linkage changed`);
  if (!Number.isInteger(row.page_count) || row.page_count < 1) fail(`row ${code} page count`);
  if (!Number.isInteger(row.total_row_page) || row.total_row_page < 1 || row.total_row_page > row.page_count) fail(`row ${code} total row page`);
  if (row.total_row_page !== queued.total_row_page) fail(`row ${code} queued page changed`);
  if (row.render_dpi !== 250) fail(`row ${code} render DPI changed`);
  if (row.machine_reconciliation?.denominator_match !== true || row.machine_reconciliation?.arithmetic_ok !== true || row.machine_reconciliation?.turnout_range_ok !== true) fail(`row ${code} machine reconciliation`);
  if (row.review_requirement?.reviewer_class !== 'independent_visual_source_image_review') fail(`row ${code} reviewer class`);
  if (row.review_requirement?.total_row_label_must_be_visually_confirmed !== true) fail(`row ${code} TOTAL label review requirement`);
  if (row.review_requirement?.verified_values_must_come_from_visual_source_read !== true) fail(`row ${code} visual read requirement`);
  if (JSON.stringify(row.review_requirement?.required_fields) !== JSON.stringify(fields)) fail(`row ${code} required review fields`);

  for (const field of fields) {
    const actual = row.candidate_evidence?.[field];
    const expected = queued.candidate_evidence?.[field];
    if (!actual || !expected) fail(`row ${code} ${field} candidate evidence missing`);
    if (actual.verification_state !== 'machine_candidate') fail(`row ${code} ${field} is not machine_candidate`);
    if (!Number.isInteger(actual.machine_transcription)) fail(`row ${code} ${field} machine transcription`);
    if (actual.machine_transcription !== expected.machine_transcription) fail(`row ${code} ${field} candidate changed`);
    if (actual.verified_value !== null || actual.verification_method !== null) fail(`row ${code} ${field} verification leaked`);
  }

  const crop = row.total_row_context_crop_250;
  if (!crop || !Number.isInteger(crop.x0) || !Number.isInteger(crop.y0) || !Number.isInteger(crop.x1) || !Number.isInteger(crop.y1) || crop.x1 <= crop.x0 || crop.y1 <= crop.y0) fail(`row ${code} crop geometry`);
  for (const [fileKey, digestKey] of [
    ['full_page_context_file', 'full_page_context_sha256'],
    ['total_row_context_file', 'total_row_context_sha256'],
  ]) {
    const name = row[fileKey];
    const digest = row[digestKey];
    if (typeof name !== 'string' || !name.endsWith('.png') || path.basename(name) !== name) fail(`row ${code} ${fileKey}`);
    if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) fail(`row ${code} ${digestKey}`);
    const file = path.join(contextDir, name);
    if (!fs.existsSync(file) || fs.statSync(file).size <= 0) fail(`row ${code} missing context file ${name}`);
    if (sha256(file) !== digest) fail(`row ${code} context digest mismatch for ${name}`);
  }
}

console.log(`P23_FORM34B_VERIFICATION_CONTEXTS_VALID rows=${manifest.rows.length} source_verified_values=0 promotion_authorized=false review_required=true`);
