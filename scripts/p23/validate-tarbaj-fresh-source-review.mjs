import fs from 'node:fs';

const file = process.argv[2] || 'data/p23/form34b-tarbaj-fresh-source-review.json';
const review = JSON.parse(fs.readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(`P23 Tarbaj fresh source review: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(review.schema_version === 'kda.p23.form34b-fresh-source-review.v1', 'schema changed');
assert(review.geo_code === 'KEN-C008-CON035' && review.constituency_code === 35 && review.constituency_name === 'Tarbaj', 'identity changed');
assert(review.fresh_source?.form_id === 277663, 'form id changed');
assert(review.fresh_source?.source_url === 'https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id=277663', 'source URL changed');
assert(review.fresh_source?.source_pdf_sha256 === 'd05ae295d746393077e8a3466392bee154a9db1f19a2ccbed81c01a4d08605f1', 'fresh PDF hash changed');
assert(review.fresh_source?.review_context_image_sha256 === '15e12a9a8a52cc8ee2d80ce9a380d1efb926fde524fabfdd8ecdcbb05b232738', '250-DPI page hash changed');
assert(review.fresh_source?.page_number === 1 && review.fresh_source?.render_dpi === 250, 'review context must remain page 1 at exactly 250 DPI');
assert(review.fresh_source?.workflow_run_id === 34756901800, 'workflow run id changed');
assert(review.fresh_source?.workflow_head_sha === 'c43819c9ad2ac5de12cc8fcc17cd85020080cf4e', 'workflow head SHA changed');
assert(review.fresh_source?.artifact_id === 10317568226, 'artifact id changed');
assert(review.fresh_source?.artifact_sha256 === 'f821b096dd7b781ede18f0fe73082d7bf10f415ffb1808253df240dcee26804e' && sha(review.fresh_source?.artifact_sha256), 'artifact digest changed');

const fields = review.field_evidence || {};
assert(fields.registered_voters?.verified_value === 25267 && fields.registered_voters?.verification_state === 'source_verified', 'registered-voter evidence changed');
assert(fields.total_valid_votes?.verified_value === 18794 && fields.total_valid_votes?.verification_state === 'source_verified', 'valid-vote evidence changed');
assert(fields.rejected_ballots?.verified_value === 97 && fields.rejected_ballots?.verification_state === 'source_verified', 'rejected-ballot evidence changed');
for (const name of ['registered_voters','total_valid_votes','rejected_ballots']) assert(fields[name]?.source_image_sha256 === review.fresh_source.review_context_image_sha256, `${name} source-image hash drifted`);

const recon = review.same_row_valid_vote_reconciliation || {};
assert(JSON.stringify(recon.candidate_vote_totals_in_source_column_order) === JSON.stringify([8912,9735,51,96]), 'candidate cells changed');
assert(recon.candidate_vote_sum === 18794 && recon.reconciles_total_valid_votes === true, 'candidate sum must reconcile exactly');

const denom = review.governed_denominator_reconciliation || {};
assert(JSON.stringify(denom.ward_registered_voters) === JSON.stringify([3562,7416,9869,4420]), 'pinned ward inputs changed');
assert(denom.ward_registered_voters.reduce((a,b)=>a+b,0) === 25267, 'ward sum must equal 25267');
assert(denom.governed_registered_voters === 25267 && denom.form_printed_registered_voters === 25267, 'denominator values changed');
assert(denom.registered_voters_delta === 0 && denom.registered_voters_reconciles === true, 'denominator must remain reconciled');

assert(review.verification_state === 'verified', 'row must remain verified');
assert(review.promotion_eligible === false, 'review artifact must not itself grant promotion eligibility');
assert(review.promotion_state === 'verified_pending_separate_promotion_review', 'promotion state changed');
assert(review.promotion_authorized_by_this_file === false, 'file must not authorize promotion');
assert(review.canonical_turnout_value_written === false, 'canonical turnout must not be written');
assert(!Object.hasOwn(review, 'turnout_pct') && !Object.hasOwn(review, 'ballots_cast'), 'turnout result values must not be materialized');
console.log('P23_TARBAJ_FRESH_SOURCE_REVIEW_OK denominator_delta=0 arithmetic_ok=true dpi=250 no_promotion=true');
