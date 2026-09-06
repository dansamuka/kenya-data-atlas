#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const [manifestPath, auditPath, contextsDir] = process.argv.slice(2);
if (!manifestPath || !auditPath || !contextsDir) {
  throw new Error('Usage: validate-form34b-machine-review-contexts.mjs <manifest.json> <audit.json> <contexts-dir>');
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const fail = (message) => { throw new Error(`P23 Form 34B machine-review context validation: ${message}`); };
const fields = ['registered_voters', 'total_valid_votes', 'rejected_ballots'];
const allowedFieldStates = new Set(['machine_candidate', 'source_unreadable']);
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

if (audit.schema_version !== 'kda.p23.form34b.candidate-audit.v1') fail('unexpected candidate-audit schema');
if (audit.expected_rows !== 290 || audit.rows_processed !== 290 || !Array.isArray(audit.rows) || audit.rows.length !== 290) fail('audit must cover exactly 290 rows');
if (audit.source_verified_values !== 0 || audit.promotion_authorized !== false) fail('candidate-audit promotion boundary changed');
const reviewRows = audit.rows.filter(row => row.verification_state === 'machine_candidate_needs_review');
if (audit.summary?.machine_candidates_needing_review !== reviewRows.length) fail('candidate-audit machine-review summary mismatch');
if (reviewRows.length > 25) fail('machine-review context batch exceeds 25 rows');

if (manifest.schema_version !== 'kda.p23.form34b.machine-review-contexts.v1') fail('unexpected context schema');
if (manifest.candidate_audit_schema !== audit.schema_version) fail('candidate-audit schema linkage changed');
if (manifest.review_rows !== reviewRows.length || manifest.contexts_rendered !== reviewRows.length) fail('context row count mismatch');
if (manifest.source_verified_values !== 0 || manifest.promotion_authorized !== false) fail('context promotion boundary changed');
if (!Array.isArray(manifest.rows) || manifest.rows.length !== reviewRows.length) fail('context rows length mismatch');

const expectedCodes = reviewRows.map(row => row.constituency_code);
const contextCodes = manifest.rows.map(row => row.constituency_code);
if (JSON.stringify(contextCodes) !== JSON.stringify(expectedCodes)) fail('contexts do not exactly match deterministic machine-review rows');

for (let i = 0; i < reviewRows.length; i += 1) {
  const expected = reviewRows[i];
  const row = manifest.rows[i];
  const code = expected.constituency_code;
  if (row.verification_state !== 'machine_review_context_only') fail(`row ${code} context state`);
  if (row.source_verified_values !== 0 || row.promotion_authorized !== false) fail(`row ${code} promotion boundary changed`);
  if (row.source_url !== expected.source_url || row.source_pdf_sha256 !== expected.source_pdf_sha256) fail(`row ${code} source identity changed`);
  if (row.total_row_page !== expected.total_row_page) fail(`row ${code} TOTAL-row page changed`);
  if (row.machine_reconciliation?.denominator_match !== true) fail(`row ${code} denominator match changed`);
  if (row.machine_reconciliation?.arithmetic_ok !== expected.arithmetic_ok || row.machine_reconciliation?.turnout_range_ok !== expected.turnout_range_ok) fail(`row ${code} reconciliation state changed`);

  const unreadable = [];
  for (const field of fields) {
    const expectedItem = expected.field_evidence?.[field];
    const item = row.candidate_evidence?.[field];
    if (!expectedItem || !item) fail(`row ${code} missing ${field} evidence`);
    if (!allowedFieldStates.has(item.verification_state)) fail(`row ${code} ${field} unexpected evidence state`);
    if (JSON.stringify(item) !== JSON.stringify(expectedItem)) fail(`row ${code} ${field} candidate evidence changed`);
    if (item.verified_value !== null || item.verification_method !== null) fail(`row ${code} ${field} source verification leaked`);
    if (item.verification_state === 'machine_candidate') {
      if (!Number.isInteger(item.machine_transcription)) fail(`row ${code} ${field} lacks integer machine transcription`);
    } else {
      if (item.machine_transcription !== null) fail(`row ${code} ${field} unreadable state leaked transcription`);
      unreadable.push(field);
    }
  }
  if (unreadable.length === 0) fail(`row ${code} has no unreadable target field`);
  if (JSON.stringify(row.unreadable_fields) !== JSON.stringify(unreadable)) fail(`row ${code} unreadable field list changed`);
  if (JSON.stringify(row.review_requirement?.required_fields) !== JSON.stringify(fields)) fail(`row ${code} required review fields changed`);
  if (JSON.stringify(row.review_requirement?.mandatory_visual_transcription_fields) !== JSON.stringify(unreadable)) fail(`row ${code} mandatory visual transcription list changed`);
  if (row.review_requirement?.reviewer_class !== 'independent_visual_source_image_review') fail(`row ${code} reviewer class changed`);
  if (row.review_requirement?.total_row_label_must_be_visually_confirmed !== true || row.review_requirement?.verified_values_must_come_from_visual_source_read !== true || row.review_requirement?.row_reconciliation_must_be_recomputed_after_source_read !== true) fail(`row ${code} review requirements weakened`);

  for (const [fileKey, hashKey] of [['full_page_context_file', 'full_page_context_sha256'], ['total_row_context_file', 'total_row_context_sha256']]) {
    const fileName = row[fileKey];
    const expectedHash = row[hashKey];
    if (typeof fileName !== 'string' || !fileName.endsWith('.png') || path.basename(fileName) !== fileName) fail(`row ${code} invalid context filename`);
    if (typeof expectedHash !== 'string' || !/^[0-9a-f]{64}$/.test(expectedHash)) fail(`row ${code} invalid context digest`);
    const file = path.join(contextsDir, fileName);
    if (!fs.existsSync(file)) fail(`row ${code} missing rendered context ${fileName}`);
    if (sha256(file) !== expectedHash) fail(`row ${code} rendered context digest mismatch for ${fileName}`);
  }
}

console.log(`P23_FORM34B_MACHINE_REVIEW_CONTEXTS_VALID rows=${reviewRows.length} source_verified_values=0 promotion_authorized=false`);
