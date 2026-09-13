import fs from 'node:fs';

const file = process.argv[2] || 'data/p23/form34b-mandera-east-fresh-source-review.json';
const review = JSON.parse(fs.readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(`P23 Mandera East fresh source review: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(review.schema_version === 'kda.p23.form34b-fresh-source-review.v1', 'schema changed');
assert(review.geo_code === 'KEN-C009-CON043' && review.constituency_code === 43 && review.constituency_name === 'Mandera East', 'identity changed');
assert(review.fresh_source?.form_id === 277671, 'form id changed');
assert(review.fresh_source?.source_url === 'https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id=277671', 'source URL changed');
assert(review.fresh_source?.source_pdf_sha256 === 'bb933b157f4f6372522fa3fd090a3b0da606aa746d687add498478b0384de824', 'fresh PDF hash changed');
assert(review.fresh_source?.review_context_image_sha256 === '44c066e59dbe1076f4e13e150e9b7fd7d7d1e2d211a067a401d3974d65aba29c', '250-DPI page hash changed');
assert(review.fresh_source?.page_number === 2 && review.fresh_source?.render_dpi === 250, 'review context must remain page 2 at exactly 250 DPI');
assert(review.fresh_source?.workflow_run_id === 34756901800, 'workflow run id changed');
assert(review.fresh_source?.workflow_head_sha === 'c43819c9ad2ac5de12cc8fcc17cd85020080cf4e', 'workflow head SHA changed');
assert(review.fresh_source?.artifact_id === 10317568226, 'artifact id changed');
assert(review.fresh_source?.artifact_sha256 === 'f821b096dd7b781ede18f0fe73082d7bf10f415ffb1808253df240dcee26804e' && sha(review.fresh_source?.artifact_sha256), 'artifact digest changed');

const fields = review.field_evidence || {};
assert(fields.registered_voters?.verified_value === 48223 && fields.registered_voters?.verification_state === 'source_verified', 'registered-voter evidence changed');
assert(fields.total_valid_votes?.verified_value === 25801 && fields.total_valid_votes?.verification_state === 'source_verified', 'valid-vote evidence changed');
assert(fields.rejected_ballots?.verified_value === 296 && fields.rejected_ballots?.verification_state === 'source_verified', 'rejected-ballot evidence changed');
for (const name of ['registered_voters','total_valid_votes','rejected_ballots']) assert(fields[name]?.source_image_sha256 === review.fresh_source.review_context_image_sha256, `${name} source-image hash drifted`);

const recon = review.same_row_valid_vote_reconciliation || {};
assert(JSON.stringify(recon.candidate_vote_totals_in_source_column_order) === JSON.stringify([18304,7315,41,141]), 'candidate cells changed');
assert(recon.candidate_vote_sum === 25801 && recon.reconciles_total_valid_votes === true, 'candidate sum must reconcile exactly');

const denom = review.governed_denominator_reconciliation || {};
assert(JSON.stringify(denom.ward_registered_voters) === JSON.stringify([4187,14790,11840,11106]), 'pinned ward inputs changed');
assert(denom.ward_registered_voters.reduce((a,b)=>a+b,0) === 41923, 'ward sum must equal 41923');
assert(denom.governed_registered_voters === 41923 && denom.form_printed_registered_voters === 48223, 'denominator values changed');
assert(denom.registered_voters_delta === 6300 && denom.registered_voters_reconciles === false, 'denominator mismatch must remain 6300');
assert(denom.residual_delta_after_visible_special_facility_review === 6300 && denom.residual_delta_explained === false, 'unresolved denominator residual must remain explicit');

assert(review.verification_state === 'denominator_mismatch', 'row must remain denominator_mismatch');
assert(review.promotion_eligible === false, 'row must remain non-promotable');
assert(review.promotion_authorized_by_this_file === false, 'file must not authorize promotion');
assert(review.canonical_turnout_value_written === false, 'canonical turnout must not be written');
assert(!Object.hasOwn(review, 'turnout_pct') && !Object.hasOwn(review, 'ballots_cast'), 'turnout result values must not be materialized');
console.log('P23_MANDERA_EAST_FRESH_SOURCE_REVIEW_OK denominator_delta=6300 unresolved=true dpi=250 no_promotion=true');
