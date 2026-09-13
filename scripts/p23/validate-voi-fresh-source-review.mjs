import fs from 'node:fs';

const file = process.argv[2] || 'data/p23/form34b-voi-fresh-source-review.json';
const review = JSON.parse(fs.readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(`P23 Voi fresh source review: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(review.schema_version === 'kda.p23.form34b-fresh-source-review.v1', 'schema changed');
assert(review.geo_code === 'KEN-C006-CON026' && review.constituency_code === 26 && review.constituency_name === 'Voi', 'identity changed');
assert(review.fresh_source?.form_id === 277654, 'form id changed');
assert(review.fresh_source?.source_url === 'https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id=277654', 'source URL changed');
assert(review.fresh_source?.source_pdf_sha256 === 'a53586ebc185ac620b3a3109f7fd4086501f622c6a77674e7c0f58b2bfd51df7', 'fresh PDF hash changed');
assert(review.fresh_source?.review_context_image_sha256 === '43cbbe9455cbf69c3f2967dc15c791da4fdf3e65b62e2c9cc3bc90e6eaa4e579', '250-DPI page hash changed');
assert(review.fresh_source?.page_number === 2 && review.fresh_source?.render_dpi === 250, 'review context must remain page 2 at exactly 250 DPI');
assert(review.fresh_source?.workflow_run_id === 34756901800, 'workflow run id changed');
assert(review.fresh_source?.workflow_head_sha === 'c43819c9ad2ac5de12cc8fcc17cd85020080cf4e', 'workflow head SHA changed');
assert(review.fresh_source?.artifact_id === 10317568226, 'artifact id changed');
assert(review.fresh_source?.artifact_sha256 === 'f821b096dd7b781ede18f0fe73082d7bf10f415ffb1808253df240dcee26804e' && sha(review.fresh_source?.artifact_sha256), 'artifact digest changed');

const fields = review.field_evidence || {};
assert(fields.registered_voters?.verified_value === 61806, 'registered-voter read changed');
assert(fields.total_valid_votes?.verified_value === 33389, 'valid-vote read changed');
assert(fields.rejected_ballots?.verified_value === 357, 'rejected-ballot read changed');
for (const name of ['registered_voters','total_valid_votes','rejected_ballots']) {
  assert(fields[name]?.verification_state === 'source_verified', `${name} field-level state changed`);
  assert(fields[name]?.source_image_sha256 === review.fresh_source.review_context_image_sha256, `${name} source-image hash drifted`);
}
const recon = review.same_row_valid_vote_reconciliation || {};
assert(JSON.stringify(recon.candidate_vote_totals_in_source_column_order) === JSON.stringify([21014,12040,78,257]), 'candidate cells changed');
assert(recon.candidate_vote_sum === 33389 && recon.reconciles_total_valid_votes === true, 'candidate sum must reconcile exactly');

const denom = review.governed_denominator_reconciliation || {};
assert(JSON.stringify(denom.ward_registered_voters) === JSON.stringify([15880,7067,17547,6681,7829,6373]), 'pinned ward inputs changed');
assert(denom.ward_registered_voters.reduce((a,b)=>a+b,0) === 61377, 'ward sum must equal 61377');
assert(denom.governed_registered_voters === 61377 && denom.form_printed_registered_voters === 61806, 'denominator values changed');
assert(denom.registered_voters_delta === 429 && denom.registered_voters_reconciles === false, 'denominator mismatch must remain 429');
assert(Array.isArray(denom.visible_special_facility_rows) && denom.visible_special_facility_rows.length === 2, 'two visible special-facility rows required');
assert(denom.visible_special_facility_registered_voters_sum === 229, 'visible special-facility subtotal changed');
assert(denom.visible_special_facilities_fully_explain_delta === false && denom.unexplained_registered_voter_residual === 200, 'unresolved residual must remain explicit');

assert(review.verification_state === 'denominator_mismatch', 'row must remain denominator_mismatch');
assert(review.promotion_eligible === false, 'row must remain non-promotable');
assert(review.promotion_authorized_by_this_file === false, 'file must not authorize promotion');
assert(review.canonical_turnout_value_written === false, 'canonical turnout must not be written');
assert(!Object.hasOwn(review, 'turnout_pct') && !Object.hasOwn(review, 'ballots_cast'), 'turnout result values must not be materialized');
console.log('P23_VOI_FRESH_SOURCE_REVIEW_OK denominator_delta=429 unresolved_residual=200 dpi=250 no_promotion=true');
