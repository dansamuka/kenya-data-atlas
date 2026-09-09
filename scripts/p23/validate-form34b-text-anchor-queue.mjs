#!/usr/bin/env node
import fs from 'node:fs';

const [auditPath, queuePath] = process.argv.slice(2);
if (!auditPath || !queuePath) throw new Error('Usage: validate-form34b-text-anchor-queue.mjs <audit.json> <queue.json>');
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));

const forbiddenKeys = new Set([
  'registered_voters',
  'total_valid_votes',
  'rejected_ballots',
  'candidate_vote_totals',
  'candidate_votes',
  'turnout_pct',
  'turnout_percentage',
  'machine_transcription',
  'verified_value',
  'verification_method',
]);
function fail(message) { throw new Error(message); }
function walk(value, cb) {
  if (Array.isArray(value)) { for (const item of value) walk(item, cb); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) { cb(key, child); walk(child, cb); }
}

if (audit.schema_version !== 'kda.p23.form34b.text-anchor-recovery-audit.v1') fail('Unexpected aggregate text-anchor audit schema');
if (queue.schema_version !== 'kda.p23.form34b.text-anchor-review-queue.v1') fail('Unexpected text-anchor review queue schema');
for (const doc of [audit, queue]) {
  if (doc.source_verified_values !== 0 || doc.promotion_authorized !== false || doc.turnout_values_extracted !== 0) {
    fail('Text-anchor aggregate leaked source verification, promotion, or turnout values');
  }
  walk(doc, (key) => { if (forbiddenKeys.has(key)) fail(`Text-anchor aggregate contains forbidden value-bearing key: ${key}`); });
}

const rows = audit.rows || [];
if (audit.rows_processed !== 290 || rows.length !== 290) fail('Text-anchor aggregate must cover exactly 290 constituencies');
const codes = rows.map((row) => Number(row.constituency_code || 0));
if (codes.some((code, index) => code !== index + 1)) fail('Text-anchor aggregate constituency ordering changed');

const summary = audit.summary || {};
const targeted = rows.filter((row) => ['label_anchor_candidate', 'no_label_anchor_candidate'].includes(row.text_recovery_state)).length;
const candidates = rows.filter((row) => row.text_recovery_state === 'label_anchor_candidate').length;
const noCandidate = rows.filter((row) => row.text_recovery_state === 'no_label_anchor_candidate').length;
const skippedReviewed = rows.filter((row) => row.text_recovery_state === 'skipped_source_reviewed').length;
const skippedUnique = rows.filter((row) => row.text_recovery_state === 'skipped_unique_denominator_anchor').length;
if (targeted + skippedReviewed + skippedUnique !== 290) fail('Text-anchor aggregate states do not partition all 290 constituencies');
if (summary.targeted_after_denominator_lane !== targeted) fail('Targeted summary mismatch');
if (summary.label_anchor_candidates !== candidates) fail('Candidate summary mismatch');
if (summary.no_label_anchor_candidate !== noCandidate) fail('No-candidate summary mismatch');
if (summary.skipped_source_reviewed !== skippedReviewed) fail('Reviewed-skip summary mismatch');
if (summary.skipped_unique_denominator_anchor !== skippedUnique) fail('Unique-anchor skip summary mismatch');

const q = queue.queue || [];
if (queue.rows !== q.length || q.length !== candidates) fail('Review queue count must equal aggregate candidate count');
const queuedCodes = q.map((row) => Number(row.constituency_code || 0));
if (new Set(queuedCodes).size !== queuedCodes.length) fail('Review queue contains duplicate constituency codes');
for (const item of q) {
  const code = Number(item.constituency_code || 0);
  const source = rows[code - 1];
  if (!source || source.text_recovery_state !== 'label_anchor_candidate') fail(`Queued code ${code} is not a label-anchor candidate in audit`);
  if (item.geo_code !== source.geo_code || item.constituency_name !== source.constituency_name) fail(`Queued identity drift for code ${code}`);
  if (item.source_url !== source.source_url || item.source_pdf_sha256 !== source.source_pdf_sha256) fail(`Queued source drift for code ${code}`);
  if (item.verification_state !== 'pending_independent_visual_source_image_review') fail(`Queued verification state changed for code ${code}`);
  if (item.source_verified_values !== 0 || item.promotion_authorized !== false || item.turnout_values_extracted !== 0) fail(`Queued code ${code} leaked source verification/promotion/value state`);
  const requirement = item.review_requirement || {};
  if (requirement.reviewer_class !== 'independent_visual_source_image_review' || requirement.text_anchor_is_locator_only !== true || requirement.total_row_label_must_be_visually_confirmed !== true || requirement.verified_values_must_come_from_visual_source_read !== true) {
    fail(`Queued review requirement weakened for code ${code}`);
  }
  if (!item.best_review_page || Number(item.best_review_page.page_number || 0) < 1) fail(`Queued best review page missing for code ${code}`);
}

console.log(`P23_FORM34B_TEXT_ANCHOR_QUEUE_OK rows=290 targeted=${targeted} candidates=${candidates} no_candidate=${noCandidate} source_verified_values=0 promotion_authorized=false turnout_values_extracted=0`);
