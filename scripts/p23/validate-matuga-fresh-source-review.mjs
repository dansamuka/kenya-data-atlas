import fs from 'node:fs';

const path = process.argv[2] || 'data/p23/form34b-matuga-fresh-source-review.json';
const review = JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = message => { throw new Error(`P23 Matuga fresh source review: ${message}`); };
const assert = (ok, message) => { if (!ok) fail(message); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(review.schema_version === 'kda.p23.form34b-fresh-source-review.v1', 'schema changed');
assert(review.geo_code === 'KEN-C002-CON009' && review.constituency_code === 9 && review.constituency_name === 'Matuga', 'identity changed');
assert(review.fresh_source?.form_id === 277637, 'form id changed');
assert(review.fresh_source?.source_url === 'https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id=277637', 'source URL changed');
assert(review.fresh_source?.source_pdf_sha256 === 'bc902f92afcd6fcac25db35d1f79aab8d4a15a0d7e8690b1958d18d1393418db', 'fresh PDF hash changed');
assert(review.fresh_source?.review_context_image_sha256 === '03bd3495accd7f1d1d5277aa117245efa17a80bd4c0959d57a69187a0e83544b', '250-DPI page hash changed');
assert(review.fresh_source?.page_number === 3 && review.fresh_source?.render_dpi === 250, 'review context must remain page 3 at exactly 250 DPI');
assert(review.fresh_source?.workflow_run_id === 34747991023, 'fresh workflow run id changed');
assert(review.fresh_source?.workflow_head_sha === '59ec9a4f1f0f2ce5d40f5cd08c8a0cf507649ef6', 'fresh workflow head SHA changed');
assert(review.fresh_source?.artifact_id === 10315105932, 'fresh artifact id changed');
assert(sha(review.fresh_source?.artifact_sha256), 'artifact digest missing');

const fields = review.field_evidence || {};
assert(fields.registered_voters?.verified_value === 83078, 'fresh visual registered-voter read changed');
assert(fields.total_valid_votes?.verified_value === 45083, 'fresh visual valid-vote read changed');
assert(fields.rejected_ballots?.verified_value === 344, 'fresh visual rejected-ballot read changed');
for (const name of ['registered_voters','total_valid_votes','rejected_ballots']) {
  assert(fields[name]?.verification_state === 'source_verified', `${name} field-level fresh visual state changed`);
  assert(fields[name]?.source_image_sha256 === review.fresh_source.review_context_image_sha256, `${name} source-image hash drifted`);
}
const recon = review.same_row_valid_vote_reconciliation || {};
assert(JSON.stringify(recon.candidate_vote_totals_in_source_column_order) === JSON.stringify([32722,11901,95,365]), 'candidate cells changed');
assert(recon.candidate_vote_sum === 45083 && recon.reconciles_total_valid_votes === true, 'candidate sum must reconcile exactly');

const denom = review.governed_denominator_reconciliation || {};
assert(JSON.stringify(denom.ward_registered_voters) === JSON.stringify([20453,20681,11016,12087,18778]), 'pinned ward inputs changed');
assert(denom.ward_registered_voters.reduce((a,b)=>a+b,0) === 83015, 'ward sum must equal 83015');
assert(denom.governed_registered_voters === 83015 && denom.form_printed_registered_voters === 83078, 'denominator values changed');
assert(denom.registered_voters_delta === 63 && denom.registered_voters_reconciles === false, 'denominator mismatch must remain 63');
assert(Array.isArray(denom.special_facility_rows) && denom.special_facility_rows.length === 2, 'two special-facility rows required');
assert(denom.special_facility_rows[0]?.polling_station_code === '049292145100601' && denom.special_facility_rows[0]?.registered_voters === 59, 'Kwale Main Prison row changed');
assert(denom.special_facility_rows[1]?.polling_station_code === '049292145100701' && denom.special_facility_rows[1]?.registered_voters === 4, 'Kwale Women row changed');
assert(denom.special_facility_registered_voters_sum === 63 && denom.special_facility_exactly_explains_delta === true, 'special-facility reconciliation changed');

assert(review.verification_state === 'denominator_mismatch', 'row must remain denominator_mismatch');
assert(review.promotion_eligible === false, 'row must remain non-promotable');
assert(review.promotion_authorized_by_this_file === false, 'file must not authorize promotion');
assert(review.canonical_turnout_value_written === false, 'canonical turnout must not be written');
assert(!Object.hasOwn(review, 'turnout_pct') && !Object.hasOwn(review, 'ballots_cast'), 'turnout result values must not be materialized');
console.log('P23_MATUGA_FRESH_SOURCE_REVIEW_OK denominator_delta=63 dpi=250 no_promotion=true');
