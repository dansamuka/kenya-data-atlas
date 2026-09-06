#!/usr/bin/env node
import fs from 'node:fs';

const path = process.argv[2];
if (!path) throw new Error('Usage: validate-form34b-adaptive-grid-batch.mjs <artifact.json>');
const doc = JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = (message) => { throw new Error(`P23 adaptive Form 34B batch validation: ${message}`); };

if (doc.schema_version !== 'kda.p23.form34b.adaptive-grid-batch.v1') fail('unexpected schema version');
if (!Number.isInteger(doc.batch_offset) || doc.batch_offset < 0 || doc.batch_offset >= 290) fail('invalid batch_offset');
if (!Number.isInteger(doc.rows_processed) || doc.rows_processed < 1 || doc.rows_processed > 25) fail('rows_processed outside governed 1..25 cap');
if (doc.batch_offset + doc.rows_processed > 290) fail('batch exceeds governed 290-row manifest');
if (!Array.isArray(doc.rows) || doc.rows.length !== doc.rows_processed) fail('rows array does not match rows_processed');
if (doc.source_verified_values !== 0 || doc.promotion_authorized !== false) fail('top-level no-promotion boundary changed');

for (const key of ['strong_machine_candidates', 'machine_candidates_needing_review', 'unresolved_rows']) {
  if (!Number.isInteger(doc[key]) || doc[key] < 0) fail(`invalid summary count ${key}`);
}
if (doc.strong_machine_candidates + doc.machine_candidates_needing_review + doc.unresolved_rows !== doc.rows_processed) {
  fail('summary counts do not reconcile to rows_processed');
}

const allowedStates = new Set(['strong_machine_candidate', 'machine_candidate_needs_review', 'unresolved']);
const requiredFields = ['registered_voters', 'total_valid_votes', 'rejected_ballots'];
const seenCodes = new Set();
let strong = 0;
let review = 0;
let unresolved = 0;

for (let index = 0; index < doc.rows.length; index += 1) {
  const row = doc.rows[index];
  const expectedCode = doc.batch_offset + index + 1;
  if (row.constituency_code !== expectedCode) fail(`non-deterministic constituency ordering at row ${index}: expected ${expectedCode}, got ${row.constituency_code}`);
  if (seenCodes.has(row.constituency_code)) fail(`duplicate constituency_code ${row.constituency_code}`);
  seenCodes.add(row.constituency_code);
  if (!allowedStates.has(row.verification_state)) fail(`invalid verification_state for ${row.geo_code}`);
  if (row.source_verified_values !== 0 || row.promotion_authorized !== false) fail(`row ${row.constituency_code} changed no-promotion boundary`);
  if (typeof row.source_url !== 'string' || !row.source_url.startsWith('https://forms.iebc.or.ke/')) fail(`row ${row.constituency_code} source URL is not official IEBC portal`);
  if (typeof row.source_pdf_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(row.source_pdf_sha256)) fail(`row ${row.constituency_code} missing source digest`);
  if (!Number.isInteger(row.page_count) || row.page_count < 1) fail(`row ${row.constituency_code} invalid page_count`);
  if (!Array.isArray(row.page_diagnostics) || row.page_diagnostics.length !== row.page_count) fail(`row ${row.constituency_code} page diagnostics mismatch`);
  if (!Number.isInteger(row.final_rows_found) || row.final_rows_found < 0) fail(`row ${row.constituency_code} invalid final_rows_found`);
  if (Object.prototype.hasOwnProperty.call(row, 'turnout_pct')) fail(`row ${row.constituency_code} leaked promotable turnout_pct`);

  if (row.verification_state === 'strong_machine_candidate') {
    strong += 1;
    if (row.final_rows_found !== 1) fail(`strong row ${row.constituency_code} must have exactly one final row`);
    if (row.denominator_match !== true || row.arithmetic_ok !== true || row.turnout_range_ok !== true) fail(`strong row ${row.constituency_code} failed candidate reconciliation`);
    if (!Number.isInteger(row.total_row_page) || row.total_row_page < 1 || row.total_row_page > row.page_count) fail(`strong row ${row.constituency_code} invalid total_row_page`);
    if (!row.field_evidence || typeof row.field_evidence !== 'object') fail(`strong row ${row.constituency_code} missing field evidence`);
    for (const field of requiredFields) {
      const evidence = row.field_evidence[field];
      if (!evidence || evidence.verification_state !== 'machine_candidate') fail(`strong row ${row.constituency_code} ${field} is not machine_candidate`);
      if (!Number.isInteger(evidence.machine_transcription) || evidence.machine_transcription < 0) fail(`strong row ${row.constituency_code} ${field} missing integer machine transcription`);
      if (evidence.verified_value !== null || evidence.verification_method !== null) fail(`strong row ${row.constituency_code} ${field} leaked source verification`);
    }
  } else if (row.verification_state === 'machine_candidate_needs_review') {
    review += 1;
    if (row.final_rows_found !== 1) fail(`review row ${row.constituency_code} must have exactly one located final row`);
    if (!row.field_evidence || typeof row.field_evidence !== 'object') fail(`review row ${row.constituency_code} missing field evidence`);
    for (const field of requiredFields) {
      const evidence = row.field_evidence[field];
      if (!evidence) fail(`review row ${row.constituency_code} missing ${field} evidence`);
      if (!['machine_candidate', 'source_unreadable'].includes(evidence.verification_state)) fail(`review row ${row.constituency_code} invalid ${field} state`);
      if (evidence.verified_value !== null || evidence.verification_method !== null) fail(`review row ${row.constituency_code} ${field} leaked source verification`);
    }
  } else {
    unresolved += 1;
    if (typeof row.unresolved_reason !== 'string' || !row.unresolved_reason) fail(`unresolved row ${row.constituency_code} missing reason`);
  }
}

if (strong !== doc.strong_machine_candidates) fail('strong_machine_candidates summary mismatch');
if (review !== doc.machine_candidates_needing_review) fail('machine_candidates_needing_review summary mismatch');
if (unresolved !== doc.unresolved_rows) fail('unresolved_rows summary mismatch');

console.log(
  `P23_FORM34B_ADAPTIVE_GRID_BATCH_VALID offset=${doc.batch_offset} rows=${doc.rows_processed} ` +
  `strong=${strong} review=${review} unresolved=${unresolved} source_verified_values=0 promotion_authorized=false`
);
