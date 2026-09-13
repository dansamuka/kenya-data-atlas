import fs from 'node:fs';

const file = process.argv[2] || 'data/p23/form34b-magarini-fresh-source-review.json';
const review = JSON.parse(fs.readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(`P23 Magarini fresh source review: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(review.schema_version === 'kda.p23.form34b-fresh-source-review.v1', 'schema changed');
assert(review.geo_code === 'KEN-C003-CON017' && review.constituency_code === 17 && review.constituency_name === 'Magarini', 'identity changed');
assert(review.fresh_source?.form_id === 277645, 'form id changed');
assert(review.fresh_source?.source_url === 'https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id=277645', 'source URL changed');
assert(review.fresh_source?.source_pdf_sha256 === '4eacf3ac1ae7dcd03ad11daac1e7b841e71f555df14a369c8cb9dac5a85c70ba', 'fresh PDF hash changed');
assert(review.fresh_source?.review_context_image_sha256 === '6cb26cb7fc6957bf1e2d33ffd460f9ae94ab1ea0eaf5cd9e596c2f0335fd9edc', '250-DPI page hash changed');
assert(review.fresh_source?.page_number === 3 && review.fresh_source?.render_dpi === 250, 'review context must remain page 3 at exactly 250 DPI');
assert(review.fresh_source?.workflow_run_id === 34747991023, 'fresh workflow run id changed');
assert(review.fresh_source?.workflow_head_sha === '59ec9a4f1f0f2ce5d40f5cd08c8a0cf507649ef6', 'fresh workflow head SHA changed');
assert(review.fresh_source?.artifact_id === 10315105932, 'fresh artifact id changed');
assert(review.fresh_source?.artifact_sha256 === '1bb43299d51f30587480efd6cb83d59f3c38f0d3b94483de9482a40b3ec21d5c' && sha(review.fresh_source?.artifact_sha256), 'artifact digest changed');

const fields = review.field_evidence || {};
assert(fields.registered_voters?.verified_value === 80295, 'fresh visual registered-voter read changed');
assert(fields.total_valid_votes?.verified_value === 42240, 'fresh visual valid-vote read changed');
assert(fields.rejected_ballots?.verified_value === 382, 'fresh visual rejected-ballot read changed');
for (const name of ['registered_voters','total_valid_votes','rejected_ballots']) {
  assert(fields[name]?.verification_state === 'source_verified', `${name} field-level fresh visual state changed`);
  assert(fields[name]?.source_image_sha256 === review.fresh_source.review_context_image_sha256, `${name} source-image hash drifted`);
}
const recon = review.same_row_valid_vote_reconciliation || {};
assert(JSON.stringify(recon.candidate_vote_totals_in_source_column_order) === JSON.stringify([30568,11049,220,403]), 'candidate cells changed');
assert(recon.candidate_vote_sum === 42240 && recon.reconciles_total_valid_votes === true, 'candidate sum must reconcile exactly');

const denom = review.governed_denominator_reconciliation || {};
assert(JSON.stringify(denom.ward_registered_voters) === JSON.stringify([9026,17099,17685,16263,10466,9589]), 'pinned ward inputs changed');
assert(denom.ward_registered_voters.reduce((a,b)=>a+b,0) === 80128, 'ward sum must equal 80128');
assert(denom.governed_registered_voters === 80128 && denom.form_printed_registered_voters === 80295, 'denominator values changed');
assert(denom.registered_voters_delta === 167 && denom.registered_voters_reconciles === false, 'denominator mismatch must remain 167');
assert(Array.isArray(denom.special_facility_rows) && denom.special_facility_rows.length === 2, 'two special-facility rows required');
assert(denom.special_facility_rows[0]?.polling_station_code === '049292145101001' && denom.special_facility_rows[0]?.registered_voters === 154, 'Malindi Prison row changed');
assert(denom.special_facility_rows[1]?.polling_station_code === '049292145101101' && denom.special_facility_rows[1]?.registered_voters === 13, 'Malindi Women row changed');
assert(denom.special_facility_registered_voters_sum === 167 && denom.special_facility_exactly_explains_delta === true, 'special-facility reconciliation changed');

assert(review.verification_state === 'denominator_mismatch', 'row must remain denominator_mismatch');
assert(review.promotion_eligible === false, 'row must remain non-promotable');
assert(review.promotion_authorized_by_this_file === false, 'file must not authorize promotion');
assert(review.canonical_turnout_value_written === false, 'canonical turnout must not be written');
assert(!Object.hasOwn(review, 'turnout_pct') && !Object.hasOwn(review, 'ballots_cast'), 'turnout result values must not be materialized');
console.log('P23_MAGARINI_FRESH_SOURCE_REVIEW_OK denominator_delta=167 dpi=250 no_promotion=true');
