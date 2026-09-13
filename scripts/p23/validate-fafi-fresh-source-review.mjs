import fs from 'node:fs';

const file = process.argv[2] || 'data/p23/form34b-fafi-fresh-source-review.json';
const review = JSON.parse(fs.readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(`P23 Fafi fresh source review: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(review.schema_version === 'kda.p23.form34b-fresh-source-review.v1', 'schema changed');
assert(review.geo_code === 'KEN-C007-CON031' && review.constituency_code === 31 && review.constituency_name === 'Fafi', 'identity changed');
assert(review.fresh_source?.form_id === 277659, 'form id changed');
assert(review.fresh_source?.source_url === 'https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id=277659', 'source URL changed');
assert(review.fresh_source?.source_pdf_sha256 === '141442b4e63035f60ce3b304927824b579bd183e2b84c2f4097d4b54a76f63c8', 'fresh PDF hash changed');
assert(review.fresh_source?.review_context_image_sha256 === '856d867a1dd50652f520d833f01c6feffb70aa548d817e01696ee00b5faa49c4', '250-DPI page hash changed');
assert(review.fresh_source?.page_number === 2 && review.fresh_source?.render_dpi === 250, 'review context must remain page 2 at exactly 250 DPI');
assert(review.fresh_source?.workflow_run_id === 34756901800, 'workflow run id changed');
assert(review.fresh_source?.workflow_head_sha === 'c43819c9ad2ac5de12cc8fcc17cd85020080cf4e', 'workflow head SHA changed');
assert(review.fresh_source?.artifact_id === 10317568226, 'artifact id changed');
assert(review.fresh_source?.artifact_sha256 === 'f821b096dd7b781ede18f0fe73082d7bf10f415ffb1808253df240dcee26804e' && sha(review.fresh_source?.artifact_sha256), 'artifact digest changed');

const fields = review.field_evidence || {};
assert(fields.registered_voters?.verified_value === 27335 && fields.registered_voters?.verification_state === 'source_verified', 'registered-voter evidence changed');
assert(fields.total_valid_votes?.verified_value === 13662 && fields.total_valid_votes?.verification_state === 'source_mismatch', 'valid-vote mismatch evidence changed');
assert(fields.rejected_ballots?.verified_value === 48 && fields.rejected_ballots?.verification_state === 'source_verified', 'rejected-ballot evidence changed');
for (const name of ['registered_voters','total_valid_votes','rejected_ballots']) {
  assert(fields[name]?.source_image_sha256 === review.fresh_source.review_context_image_sha256, `${name} source-image hash drifted`);
}

const recon = review.same_row_valid_vote_reconciliation || {};
assert(JSON.stringify(recon.candidate_vote_totals_in_source_column_order) === JSON.stringify([5403,8377,18,49]), 'candidate cells changed');
assert(recon.candidate_vote_sum === 13847, 'candidate sum changed');
assert(recon.form_printed_total_valid_votes === 13662, 'printed valid-vote total changed');
assert(recon.candidate_sum_minus_printed_total_valid_votes === 185 && recon.reconciles_total_valid_votes === false, 'arithmetic mismatch must remain 185');

const denom = review.governed_denominator_reconciliation || {};
assert(JSON.stringify(denom.ward_registered_voters) === JSON.stringify([5272,4740,3123,7050,7150]), 'pinned ward inputs changed');
assert(denom.ward_registered_voters.reduce((a,b)=>a+b,0) === 27335, 'ward sum must equal 27335');
assert(denom.governed_registered_voters === 27335 && denom.form_printed_registered_voters === 27335, 'denominator values changed');
assert(denom.registered_voters_delta === 0 && denom.registered_voters_reconciles === true, 'denominator must remain reconciled');

assert(review.verification_state === 'arithmetic_mismatch', 'row must remain arithmetic_mismatch');
assert(review.promotion_eligible === false, 'row must remain non-promotable');
assert(review.promotion_authorized_by_this_file === false, 'file must not authorize promotion');
assert(review.canonical_turnout_value_written === false, 'canonical turnout must not be written');
assert(!Object.hasOwn(review, 'turnout_pct') && !Object.hasOwn(review, 'ballots_cast'), 'turnout result values must not be materialized');
console.log('P23_FAFI_FRESH_SOURCE_REVIEW_OK arithmetic_delta=185 denominator_delta=0 dpi=250 no_promotion=true');
