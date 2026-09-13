import fs from 'node:fs';

const file = process.argv[2] || 'data/p23/form34b-saku-fresh-source-review.json';
const review = JSON.parse(fs.readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(`P23 Saku fresh source review: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(review.schema_version === 'kda.p23.form34b-fresh-source-review.v1', 'schema changed');
assert(review.geo_code === 'KEN-C010-CON047' && review.constituency_code === 47 && review.constituency_name === 'Saku', 'identity changed');
assert(review.fresh_source?.form_id === 277675, 'form id changed');
assert(review.fresh_source?.source_pdf_sha256 === '444e96e3dd19cd72ba0f3a53d1e08044844d1006ab23bc11fbc587797509f30c', 'fresh PDF hash changed');
assert(review.fresh_source?.page_number === 1 && review.fresh_source?.page_count === 2 && review.fresh_source?.render_dpi === 250, 'review context changed');
assert(review.fresh_source?.review_context_image_sha256 === 'ab7060ded47491b09f4af8f1e151e485141fd94810e80eaeb31e5b3ac1a29f58', 'page image hash changed');
assert(review.fresh_source?.workflow_run_id === 34777290075 && review.fresh_source?.artifact_id === 10324187529, 'fresh provenance changed');
assert(review.fresh_source?.artifact_sha256 === 'e1b839e5ab67cec1d7b8683909b0c44efaec6a5f44eeb2c951c2927f8397f8bd' && sha(review.fresh_source?.artifact_sha256), 'artifact digest changed');

const fields = review.field_evidence || {};
assert(fields.registered_voters?.verified_value === 30235 && fields.registered_voters?.verification_state === 'source_verified', 'registered-voter read changed');
assert(fields.total_valid_votes?.verified_value === 21032 && fields.total_valid_votes?.verification_state === 'source_verified', 'Total Valid Votes read changed');
assert(fields.rejected_ballots?.verified_value === null && fields.rejected_ballots?.verification_state === 'source_unreadable', 'rejected ballots must remain unreadable with no accepted integer');
for (const name of ['registered_voters','total_valid_votes','rejected_ballots']) assert(fields[name]?.source_image_sha256 === review.fresh_source.review_context_image_sha256, `${name} source-image hash changed`);

const recon = review.same_row_valid_vote_reconciliation || {};
assert(JSON.stringify(recon.candidate_vote_totals_in_source_column_order) === JSON.stringify([7725,13233,11,63]), 'candidate aggregates changed');
assert(recon.candidate_vote_sum === 21032 && recon.reconciles_total_valid_votes === true, 'candidate arithmetic must reconcile exactly');

const denom = review.governed_denominator_reconciliation || {};
assert(JSON.stringify(denom.ward_registered_voters) === JSON.stringify([9027,4723,16459]), 'pinned ward inputs changed');
assert(denom.ward_registered_voters.reduce((a,b)=>a+b,0) === 30209, 'ward denominator sum changed');
assert(denom.governed_registered_voters === 30209 && denom.form_printed_registered_voters === 30235, 'denominator values changed');
assert(denom.registered_voters_delta === 26 && denom.registered_voters_reconciles === false, 'denominator mismatch changed');
assert(Array.isArray(denom.special_facility_rows) && denom.special_facility_rows.length === 1 && denom.special_facility_rows[0]?.registered_voters === 26, 'Marsabit Prison evidence changed');
assert(denom.special_facility_registered_voters_sum === 26 && denom.special_facility_exactly_explains_delta === true, 'special-facility reconciliation changed');

assert(review.verification_state === 'partial_unresolved', 'row must remain partial_unresolved');
assert(review.promotion_eligible === false && review.promotion_authorized_by_this_file === false && review.canonical_turnout_value_written === false, 'no-promotion state changed');
for (const key of ['turnout_pct','ballots_cast']) assert(!Object.hasOwn(review, key), `${key} must not be materialized`);
console.log('P23_SAKU_FRESH_SOURCE_REVIEW_OK dpi=250 partial_unresolved=true denominator_delta=26 no_promotion=true');
