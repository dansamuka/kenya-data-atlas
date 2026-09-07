#!/usr/bin/env node
import fs from 'node:fs';

const [auditPath, queuePath] = process.argv.slice(2);
if (!auditPath || !queuePath) throw new Error('usage: validate-form34b-source-row-recovery.mjs <audit> <queue>');
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const assert = (ok, msg) => { if (!ok) throw new Error(`P23 Form 34B source-row recovery: ${msg}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const official = value => typeof value === 'string' && value.startsWith('https://forms.iebc.or.ke/');
const forbiddenKeys = new Set(['total_valid_votes', 'rejected_ballots', 'turnout_pct', 'verified_value']);

const scanForbidden = (value, trail = 'root') => {
  if (Array.isArray(value)) return value.forEach((item, i) => scanForbidden(item, `${trail}[${i}]`));
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert(!forbiddenKeys.has(key), `${trail}: forbidden source-value key ${key} leaked into recovery artifacts`);
    scanForbidden(child, `${trail}.${key}`);
  }
};

assert(audit.schema_version === 'kda.p23.form34b.source-row-recovery-audit.v1', 'audit schema changed');
assert(queue.schema_version === 'kda.p23.form34b.source-row-recovery-queue.v1', 'queue schema changed');
assert(audit.rows_processed === 290 && Array.isArray(audit.rows) && audit.rows.length === 290, 'audit must contain exact 290 rows');
assert(audit.source_verified_values === 0 && audit.promotion_authorized === false, 'audit promotion boundary changed');
assert(queue.source_verified_values === 0 && queue.promotion_authorized === false, 'queue promotion boundary changed');
scanForbidden(audit);
scanForbidden(queue);

const codes = audit.rows.map(row => Number(row.constituency_code));
assert(codes.every((code, i) => code === i + 1), 'audit constituency ordering must be exact 1-290');
const states = new Set(['unique_exact_denominator_anchor', 'ambiguous_exact_denominator_anchors', 'no_exact_denominator_anchor']);
const expectedQueueCodes = [];
let unique = 0, ambiguous = 0, noAnchor = 0, reviewedUnique = 0;
for (const row of audit.rows) {
  const code = Number(row.constituency_code);
  assert(official(row.source_url), `CON${String(code).padStart(3, '0')}: source URL is not official IEBC`);
  assert(sha(row.source_pdf_sha256), `CON${String(code).padStart(3, '0')}: source PDF digest invalid`);
  assert(Number.isInteger(row.canonical_registered_voters) && row.canonical_registered_voters > 0, `CON${String(code).padStart(3, '0')}: governed denominator missing`);
  assert(states.has(row.anchor_state), `CON${String(code).padStart(3, '0')}: anchor state invalid`);
  assert(row.source_verified_values === 0 && row.promotion_authorized === false, `CON${String(code).padStart(3, '0')}: row leaked promotion`);
  assert(typeof row.already_source_reviewed === 'boolean', `CON${String(code).padStart(3, '0')}: source-reviewed flag missing`);
  if (row.anchor_state === 'unique_exact_denominator_anchor') {
    unique += 1;
    assert(row.exact_denominator_anchor_count === 1, `CON${String(code).padStart(3, '0')}: unique state count changed`);
    assert(sha(row.review_context_sha256), `CON${String(code).padStart(3, '0')}: context digest missing`);
    assert(Number(row.denominator_anchor?.page_number) >= 1, `CON${String(code).padStart(3, '0')}: anchor page missing`);
    if (row.already_source_reviewed) reviewedUnique += 1;
    else expectedQueueCodes.push(code);
  } else if (row.anchor_state === 'ambiguous_exact_denominator_anchors') {
    ambiguous += 1;
    assert(row.exact_denominator_anchor_count >= 2, `CON${String(code).padStart(3, '0')}: ambiguous count changed`);
  } else {
    noAnchor += 1;
    assert(row.exact_denominator_anchor_count === 0, `CON${String(code).padStart(3, '0')}: no-anchor count changed`);
  }
}

assert(Array.isArray(queue.queue) && queue.rows === queue.queue.length, 'queue row count mismatch');
const queueCodes = queue.queue.map(row => Number(row.constituency_code));
assert(JSON.stringify(queueCodes) === JSON.stringify(expectedQueueCodes), 'queue must equal unique unreviewed anchor set in canonical order');
for (const row of queue.queue) {
  const code = Number(row.constituency_code);
  assert(row.verification_state === 'pending_independent_visual_source_image_review', `CON${String(code).padStart(3, '0')}: review state changed`);
  assert(row.source_verified_values === 0 && row.promotion_authorized === false, `CON${String(code).padStart(3, '0')}: queue row leaked promotion`);
  assert(official(row.source_url) && sha(row.source_pdf_sha256) && sha(row.review_context_sha256), `CON${String(code).padStart(3, '0')}: queue provenance invalid`);
  const req = row.review_requirement || {};
  assert(req.reviewer_class === 'independent_visual_source_image_review', `CON${String(code).padStart(3, '0')}: reviewer class changed`);
  assert(req.denominator_anchor_is_locator_only === true, `CON${String(code).padStart(3, '0')}: locator-only boundary missing`);
  assert(req.total_row_label_must_be_visually_confirmed === true, `CON${String(code).padStart(3, '0')}: TOTAL-row visual confirmation missing`);
  assert(req.verified_values_must_come_from_visual_source_read === true, `CON${String(code).padStart(3, '0')}: visual-source requirement missing`);
  assert(Array.isArray(req.required_visual_transcriptions) && req.required_visual_transcriptions.length === 4, `CON${String(code).padStart(3, '0')}: required visual transcription set changed`);
}

const s = audit.summary || {};
assert(s.unique_exact_denominator_anchors === unique, 'summary unique count changed');
assert(s.ambiguous_exact_denominator_anchors === ambiguous, 'summary ambiguous count changed');
assert(s.no_exact_denominator_anchor === noAnchor, 'summary no-anchor count changed');
assert(s.unique_already_source_reviewed === reviewedUnique, 'summary reviewed-unique count changed');
assert(s.pending_visual_source_review === queue.queue.length, 'summary pending-review count changed');
assert(unique + ambiguous + noAnchor === 290, 'anchor-state total must remain 290');

console.log(`P23_FORM34B_SOURCE_ROW_RECOVERY_VALID rows=290 unique=${unique} ambiguous=${ambiguous} no_anchor=${noAnchor} reviewed_unique=${reviewedUnique} pending_visual_review=${queue.queue.length} source_verified_values=0 promotion_authorized=false turnout_values_extracted=0`);
