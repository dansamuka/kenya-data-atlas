#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const [docPath, denominatorPath] = process.argv.slice(2);
if (!docPath || !denominatorPath) {
  throw new Error('Usage: validate-form34b-text-anchor-recovery.mjs <text-recovery.json> <denominator-shard.json>');
}

const doc = JSON.parse(fs.readFileSync(docPath, 'utf8'));
const prior = JSON.parse(fs.readFileSync(denominatorPath, 'utf8'));
const OFFICIAL_PREFIX = 'https://forms.iebc.or.ke/';
const SHA256 = /^[0-9a-f]{64}$/;
const allowedPriorStates = new Set([
  'unique_exact_denominator_anchor',
  'ambiguous_exact_denominator_anchors',
  'no_exact_denominator_anchor',
]);
const allowedTextStates = new Set([
  'skipped_source_reviewed',
  'skipped_unique_denominator_anchor',
  'label_anchor_candidate',
  'no_label_anchor_candidate',
]);
const labelKeys = new Set([
  'voter_turn_out',
  'aggregate_results',
  'total_registered_voters',
  'total_voters_turned_out',
  'percentage_voter_turnout',
]);
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

function fail(message) {
  throw new Error(message);
}

function reviewedCodes() {
  const dir = path.join(process.cwd(), 'data/p23');
  const out = new Set();
  for (const name of fs.readdirSync(dir).filter((name) => /^form34b-.*-source-verification\.json$/.test(name)).sort()) {
    const evidence = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    if (!new Set(['verified', 'arithmetic_mismatch']).has(evidence.verification_state)) continue;
    const fields = evidence.field_evidence || {};
    for (const field of ['registered_voters', 'total_valid_votes', 'rejected_ballots']) {
      if ((fields[field] || {}).verification_state !== 'source_verified') {
        fail(`Committed source-review evidence is incomplete: ${name}`);
      }
    }
    const code = Number((evidence.sample || {}).constituency_code || 0);
    if (!Number.isInteger(code) || code < 1 || code > 290) fail(`Invalid source-reviewed constituency code in ${name}`);
    out.add(code);
  }
  return out;
}

function walk(value, callback) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, callback);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    callback(key, child);
    walk(child, callback);
  }
}

if (doc.schema_version !== 'kda.p23.form34b.text-anchor-recovery.v1') fail('Unexpected text-anchor recovery schema');
if (prior.schema_version !== 'kda.p23.form34b.denominator-anchor-smoke.v1') fail('Unexpected denominator-anchor shard schema');
if (doc.source_verified_values !== 0 || doc.promotion_authorized !== false || doc.turnout_values_extracted !== 0) {
  fail('Text-anchor recovery leaked source verification, promotion, or turnout values');
}
walk(doc, (key) => {
  if (forbiddenKeys.has(key)) fail(`Text-anchor recovery payload contains forbidden value-bearing key: ${key}`);
});

const offset = Number(doc.batch_offset);
const priorOffset = Number(prior.batch_offset);
const rows = doc.rows || [];
const priorRows = prior.rows || [];
if (!Number.isInteger(offset) || offset < 0 || offset >= 290 || offset !== priorOffset) fail('Text-anchor batch offset mismatch');
if (!Number.isInteger(doc.rows_processed) || doc.rows_processed < 1 || doc.rows_processed > 25) fail('Text-anchor rows_processed out of bounds');
if (rows.length !== doc.rows_processed || priorRows.length !== rows.length) fail('Text-anchor shard row count mismatch');
if (!Number.isInteger(doc.rows_scanned) || doc.rows_scanned < 0 || doc.rows_scanned > rows.length) fail('Text-anchor rows_scanned invalid');

const reviewed = reviewedCodes();
let scanned = 0;
let candidateRows = 0;
for (let i = 0; i < rows.length; i += 1) {
  const row = rows[i];
  const base = priorRows[i];
  const code = Number(row.constituency_code || 0);
  const baseCode = Number(base.constituency_code || 0);
  const expectedCode = offset + i + 1;
  if (code !== expectedCode || baseCode !== expectedCode) fail(`Constituency ordering changed at offset ${offset}, index ${i}`);
  if (row.geo_code !== base.geo_code || row.constituency_name !== base.constituency_name) fail(`Constituency identity drift for code ${code}`);
  if (row.source_url !== base.source_url || !String(row.source_url || '').startsWith(OFFICIAL_PREFIX)) fail(`Official source URL drift for code ${code}`);
  if (row.source_pdf_sha256 !== base.source_pdf_sha256 || !SHA256.test(String(row.source_pdf_sha256 || ''))) fail(`Source PDF digest drift for code ${code}`);
  if (Number(row.page_count || 0) !== Number(base.page_count || 0) || Number(row.page_count || 0) < 1) fail(`Page-count drift for code ${code}`);
  if (!allowedPriorStates.has(row.denominator_anchor_state) || row.denominator_anchor_state !== base.anchor_state) fail(`Denominator-anchor state drift for code ${code}`);
  if (row.source_verified_values !== 0 || row.promotion_authorized !== false || row.turnout_values_extracted !== 0) fail(`Row ${code} leaked verification/promotion/value state`);
  if (!allowedTextStates.has(row.text_recovery_state)) fail(`Unsupported text-recovery state for code ${code}`);
  if (row.already_source_reviewed !== reviewed.has(code)) fail(`Source-reviewed status mismatch for code ${code}`);

  const candidates = row.review_page_candidates || [];
  if (!Array.isArray(candidates) || candidates.length > 2) fail(`Review-page candidate count invalid for code ${code}`);

  if (reviewed.has(code)) {
    if (row.text_recovery_state !== 'skipped_source_reviewed' || candidates.length !== 0) fail(`Reviewed code ${code} must be skipped without candidates`);
    continue;
  }
  if (row.denominator_anchor_state === 'unique_exact_denominator_anchor') {
    if (row.text_recovery_state !== 'skipped_unique_denominator_anchor' || candidates.length !== 0) fail(`Unique-anchor code ${code} must be skipped by the second lane`);
    continue;
  }

  scanned += 1;
  if (!new Set(['label_anchor_candidate', 'no_label_anchor_candidate']).has(row.text_recovery_state)) fail(`Targeted code ${code} did not run text recovery`);
  if (row.text_recovery_state === 'label_anchor_candidate') {
    candidateRows += 1;
    if (candidates.length < 1) fail(`Candidate code ${code} has no review pages`);
  } else if (candidates.length !== 0) {
    fail(`No-candidate code ${code} unexpectedly contains review pages`);
  }

  const seenPages = new Set();
  for (const candidate of candidates) {
    const page = Number(candidate.page_number || 0);
    if (!Number.isInteger(page) || page < 1 || page > Number(row.page_count)) fail(`Invalid candidate page for code ${code}`);
    if (seenPages.has(page)) fail(`Duplicate candidate page ${page} for code ${code}`);
    seenPages.add(page);
    if (![6, 11].includes(Number(candidate.psm))) fail(`Unsupported OCR PSM for code ${code}`);
    if (candidate.candidate !== true || typeof candidate.exact_total_token !== 'boolean') fail(`Candidate evidence shape invalid for code ${code}`);
    if (typeof candidate.weighted_label_score !== 'number' || !Number.isFinite(candidate.weighted_label_score) || candidate.weighted_label_score < 0) fail(`Candidate score invalid for code ${code}`);
    const scores = candidate.label_scores || {};
    if (Object.keys(scores).length !== labelKeys.size || !Object.keys(scores).every((key) => labelKeys.has(key))) fail(`Candidate label-score key set changed for code ${code}`);
    for (const score of Object.values(scores)) {
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) fail(`Candidate label similarity out of range for code ${code}`);
    }
  }
}

if (scanned !== doc.rows_scanned) fail(`rows_scanned summary mismatch: expected ${scanned}, got ${doc.rows_scanned}`);
if (candidateRows !== doc.label_anchor_candidates) fail(`label_anchor_candidates summary mismatch: expected ${candidateRows}, got ${doc.label_anchor_candidates}`);
console.log(`P23_FORM34B_TEXT_ANCHOR_RECOVERY_OK offset=${offset} rows=${rows.length} scanned=${scanned} candidates=${candidateRows} source_verified_values=0 promotion_authorized=false turnout_values_extracted=0`);
