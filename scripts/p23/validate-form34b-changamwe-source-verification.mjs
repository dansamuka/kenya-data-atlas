import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const evidence = read('data/p23/form34b-changamwe-source-verification.json');
const extraction = read('data/p23/form34b-extraction-contract.json');
const ocr = read('data/p23/form34b-ocr-feasibility-contract.json');
const layout = read('data/p23/form34b-sample-page-layout-contract.json');
const assert = (ok, msg) => { if (!ok) throw new Error(`P23 Form 34B Changamwe verification: ${msg}`); };

const sample = evidence.sample || {};
const governed = ocr.sample || {};
assert(evidence.schema_version === 'kda.p23.form34b-source-verification.v1', 'schema version changed');
assert(evidence.verification_state === 'verified', 'row is not verified');
assert(evidence.promotion_eligible === true, 'verified sample is not marked promotion eligible');
assert(evidence.promotion_authorized_by_this_file === false, 'verification file must not self-promote');
assert(Number(sample.constituency_code) === Number(governed.constituency_code), 'constituency code mismatch');
assert(sample.geo_code === governed.geo_code, 'geo code mismatch');
assert(Number(sample.form_id) === Number(governed.form_id), 'form id mismatch');
assert(sample.source_url === governed.download_url, 'source URL mismatch');
assert(sample.source_pdf_sha256 === layout.sample.source_pdf_sha256, 'source PDF digest mismatch');
assert(Number(sample.page_number) === Number(layout.extraction_route.target_page_for_sample), 'verified page is not the governed final-total page');
assert(layout.extraction_route.preferred === 'direct_final_total_row', 'layout contract no longer prefers the direct final total row');
assert(evidence.review?.reviewer_class === 'independent_visual_source_image_review', 'review class is not independent visual review');
assert(Boolean(evidence.review?.reviewed_by), 'reviewer identity missing');
assert(evidence.review?.source_image_legibility === 'clear', 'source image not recorded as clear');
assert(evidence.review?.total_row_label_visually_confirmed === true, 'TOTAL row label was not visually confirmed');

const required = ['registered_voters', 'total_valid_votes', 'rejected_ballots'];
const values = {};
for (const field of required) {
  const row = evidence.field_evidence?.[field];
  assert(row, `${field} evidence missing`);
  assert(row.verification_state === extraction.field_evidence.promotion_state_required, `${field} is not source_verified`);
  assert(row.verification_method === 'direct_visual_read_of_official_form34b_total_row', `${field} verification method changed`);
  assert(Number(row.page_number) === Number(sample.page_number), `${field} page mismatch`);
  assert(Number.isInteger(row.verified_value) && row.verified_value >= 0, `${field} verified value is not a non-negative integer`);
  assert(Number.isInteger(row.machine_transcription) && row.machine_transcription >= 0, `${field} machine transcription missing`);
  assert(row.machine_transcription === row.verified_value, `${field} machine candidate disagrees with independent visual reading`);
  values[field] = row.verified_value;
}

assert(values.registered_voters > 0, 'registered voters must be positive');
assert(values.registered_voters === Number(governed.canonical_registered_voters), 'registered voters do not reconcile to governed denominator');
assert(values.total_valid_votes + values.rejected_ballots <= values.registered_voters, 'ballots cast exceed registered voters');
const candidateTotals = evidence.same_row_valid_vote_reconciliation?.candidate_vote_totals_in_source_column_order || [];
assert(candidateTotals.length === 4 && candidateTotals.every(Number.isInteger), 'candidate total reconciliation is incomplete');
assert(candidateTotals.reduce((sum, value) => sum + value, 0) === values.total_valid_votes, 'candidate total cells do not reconcile to total valid votes');
assert(evidence.same_row_valid_vote_reconciliation?.reconciles_total_valid_votes === true, 'valid-vote reconciliation flag false');

const ballotsCast = values.total_valid_votes + values.rejected_ballots;
const turnout = 100 * ballotsCast / values.registered_voters;
assert(evidence.row_reconciliation?.ballots_cast === ballotsCast, 'stored ballots_cast is not derived from verified source integers');
assert(evidence.row_reconciliation?.registered_voters_reconciles === true, 'registered-voter reconciliation flag false');
assert(evidence.row_reconciliation?.ballots_cast_lte_registered_voters === true, 'ballots-cast bound flag false');
assert(Math.abs(Number(evidence.row_reconciliation?.turnout_pct) - turnout) < 1e-12, 'stored turnout is not exact verified-integer derivation');
assert(turnout >= 0 && turnout <= 100 && evidence.row_reconciliation?.turnout_range_valid === true, 'turnout range gate failed');
assert(extraction.promotion_policy?.permitted_row_state === 'verified', 'extraction contract promotion row state changed');
assert(extraction.promotion_policy?.denominator_invariant === 20115, 'governed denominator changed');

console.log('P23_FORM34B_CHANGAMWE_SOURCE_VERIFIED fields=3 row_state=verified denominator_match=true candidate_sum_match=true arithmetic_ok=true promotion_eligible=true promotion_authorized=false values_logged=0');
