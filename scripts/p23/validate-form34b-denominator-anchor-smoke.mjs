#!/usr/bin/env node
import fs from 'node:fs';

const path = process.argv[2] || '/tmp/p23-form34b-denominator-anchor-smoke.json';
const doc = JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = (message) => { throw new Error(message); };

if (doc.schema_version !== 'kda.p23.form34b.denominator-anchor-smoke.v1') fail('Unexpected denominator-anchor smoke schema');
if (!Number.isInteger(doc.rows_processed) || doc.rows_processed < 1 || doc.rows_processed > 25) fail('rows_processed outside governed smoke range');
if (!Array.isArray(doc.rows) || doc.rows.length !== doc.rows_processed) fail('rows array does not match rows_processed');
if (doc.source_verified_values !== 0 || doc.promotion_authorized !== false) fail('Diagnostic must preserve source_verified_values=0 and promotion_authorized=false');
if (!Number.isInteger(doc.unique_exact_denominator_anchors) || !Number.isInteger(doc.ambiguous_exact_denominator_anchors)) fail('Missing anchor summary counts');

const allowedStates = new Set([
  'unique_exact_denominator_anchor',
  'ambiguous_exact_denominator_anchors',
  'no_exact_denominator_anchor',
]);
let unique = 0;
let ambiguous = 0;
let changamwe = false;
for (const row of doc.rows) {
  if (!Number.isInteger(row.constituency_code) || row.constituency_code < 1 || row.constituency_code > 290) fail('Invalid constituency_code');
  if (row.geo_code === 'KEN-C001-CON001') changamwe = true;
  if (!Number.isInteger(row.canonical_registered_voters) || row.canonical_registered_voters <= 0) fail(`Missing canonical denominator for ${row.geo_code}`);
  if (!allowedStates.has(row.anchor_state)) fail(`Invalid anchor_state for ${row.geo_code}`);
  if (!Number.isInteger(row.exact_denominator_anchor_count) || row.exact_denominator_anchor_count < 0) fail(`Invalid exact anchor count for ${row.geo_code}`);
  if (!Array.isArray(row.psm_attempts) || row.psm_attempts.length < row.page_count) fail(`Missing OCR attempt audit for ${row.geo_code}`);
  if (row.source_verified_values !== 0 || row.promotion_authorized !== false) fail(`Promotion boundary changed for ${row.geo_code}`);

  // This locator is intentionally denominator-only. Numerator/turnout fields are prohibited.
  for (const prohibited of ['total_valid_votes', 'rejected_ballots', 'turnout_pct', 'field_evidence']) {
    if (Object.prototype.hasOwnProperty.call(row, prohibited)) fail(`Denominator locator leaked prohibited result field ${prohibited} for ${row.geo_code}`);
  }

  if (row.anchor_state === 'unique_exact_denominator_anchor') {
    unique += 1;
    if (row.exact_denominator_anchor_count !== 1 || !row.denominator_anchor) fail(`Unique anchor structure invalid for ${row.geo_code}`);
    if (!row.review_context_file || !row.review_context_sha256) fail(`Unique anchor missing review context for ${row.geo_code}`);
  }
  if (row.anchor_state === 'ambiguous_exact_denominator_anchors') {
    ambiguous += 1;
    if (row.exact_denominator_anchor_count < 2 || !Array.isArray(row.denominator_anchor_candidates)) fail(`Ambiguous anchor structure invalid for ${row.geo_code}`);
  }
}
if (!changamwe) fail('Governed Changamwe row missing from capped diagnostic');
if (unique !== doc.unique_exact_denominator_anchors) fail('Unique-anchor summary mismatch');
if (ambiguous !== doc.ambiguous_exact_denominator_anchors) fail('Ambiguous-anchor summary mismatch');

console.log(`P23_FORM34B_DENOMINATOR_ANCHOR_VALID rows=${doc.rows_processed} unique=${unique} ambiguous=${ambiguous} source_verified_values=0 promotion_authorized=false`);
