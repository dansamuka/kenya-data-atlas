import fs from 'node:fs';

const file = process.argv[2] || 'data/p23/form34b-wajir-west-fresh-source-review.json';
const review = JSON.parse(fs.readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(`P23 Wajir West fresh source review: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(review.schema_version === 'kda.p23.form34b-fresh-source-review.v1', 'schema changed');
assert(review.geo_code === 'KEN-C008-CON036' && review.constituency_code === 36 && review.constituency_name === 'Wajir West', 'identity changed');
assert(review.fresh_source?.form_id === 277664, 'form id changed');
assert(review.fresh_source?.source_url === 'https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id=277664', 'source URL changed');
assert(review.fresh_source?.source_pdf_sha256 === '75b6686d25ddf23cc246aff03b7e0736312eec1a70a89951e68b7d78d450e6cd', 'fresh PDF hash changed');
assert(review.fresh_source?.review_context_image_sha256 === '30a81c9b5fea69e15b79b1865051f29d0961fa0cf27cf5fba41d7726ab23278a', '250-DPI page hash changed');
assert(review.fresh_source?.page_number === 2 && review.fresh_source?.render_dpi === 250, 'review context must remain page 2 at exactly 250 DPI');
assert(review.fresh_source?.workflow_run_id === 34756901800, 'workflow run id changed');
assert(review.fresh_source?.workflow_head_sha === 'c43819c9ad2ac5de12cc8fcc17cd85020080cf4e', 'workflow head SHA changed');
assert(review.fresh_source?.artifact_id === 10317568226, 'artifact id changed');
assert(review.fresh_source?.artifact_sha256 === 'f821b096dd7b781ede18f0fe73082d7bf10f415ffb1808253df240dcee26804e' && sha(review.fresh_source?.artifact_sha256), 'artifact digest changed');

const fields = review.field_evidence || {};
assert(fields.registered_voters?.verified_value === 31334 && fields.registered_voters?.verification_state === 'source_verified', 'registered-voter evidence changed');
assert(fields.total_valid_votes?.verified_value === 21224 && fields.total_valid_votes?.verification_state === 'source_verified', 'valid-vote evidence changed');
assert(fields.rejected_ballots?.verified_value === 81 && fields.rejected_ballots?.verification_state === 'source_verified', 'rejected-ballot evidence changed');
for (const name of ['registered_voters','total_valid_votes','rejected_ballots']) assert(fields[name]?.source_image_sha256 === review.fresh_source.review_context_image_sha256, `${name} source-image hash drifted`);

const recon = review.same_row_valid_vote_reconciliation || {};
assert(JSON.stringify(recon.candidate_vote_totals_in_source_column_order) === JSON.stringify([14845,6305,16,58]), 'candidate cells changed');
assert(recon.candidate_vote_sum === 21224 && recon.reconciles_total_valid_votes === true, 'candidate sum must reconcile exactly');

const denom = review.governed_denominator_reconciliation || {};
assert(JSON.stringify(denom.ward_registered_voters) === JSON.stringify([8593,7818,6541,8382]), 'pinned ward inputs changed');
assert(denom.ward_registered_voters.reduce((a,b)=>a+b,0) === 31334, 'ward sum must equal 31334');
assert(denom.governed_registered_voters === 31334 && denom.form_printed_registered_voters === 31334, 'denominator values changed');
assert(denom.registered_voters_delta === 0 && denom.registered_voters_reconciles === true, 'denominator must remain reconciled');

assert(review.verification_state === 'verified', 'row must remain verified');
assert(review.promotion_eligible === false, 'review artifact must not itself grant promotion eligibility');
assert(review.promotion_state === 'verified_pending_separate_promotion_review', 'promotion state changed');
assert(review.promotion_authorized_by_this_file === false, 'file must not authorize promotion');
assert(review.canonical_turnout_value_written === false, 'canonical turnout must not be written');
assert(!Object.hasOwn(review, 'turnout_pct') && !Object.hasOwn(review, 'ballots_cast'), 'turnout result values must not be materialized');
console.log('P23_WAJIR_WEST_FRESH_SOURCE_REVIEW_OK denominator_delta=0 arithmetic_ok=true dpi=250 no_promotion=true');
