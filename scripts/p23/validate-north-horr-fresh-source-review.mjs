import fs from 'node:fs';

const file = process.argv[2] || 'data/p23/form34b-north-horr-fresh-source-review.json';
const review = JSON.parse(fs.readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(`P23 North Horr fresh source review: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(review.schema_version === 'kda.p23.form34b-fresh-source-review.v1', 'schema changed');
assert(review.geo_code === 'KEN-C010-CON046' && review.constituency_code === 46 && review.constituency_name === 'North Horr', 'identity changed');
assert(review.fresh_source?.form_id === 277674, 'form id changed');
assert(review.fresh_source?.source_pdf_sha256 === '9908ff15d4dd570625468316b8389e82b42cc339f2485d8d5abd39835f53c04f', 'fresh PDF hash changed');
assert(review.fresh_source?.page_number === 1 && review.fresh_source?.identity_page_number === 2 && review.fresh_source?.page_count === 2, 'review pages changed');
assert(review.fresh_source?.render_dpi === 250, 'review must remain exactly 250 DPI');
assert(review.fresh_source?.review_context_image_sha256 === '32748fc24280b1927ee92eaadd1bc669bf23def2b2da959f8cd05e7c6423aaf1', 'TOTAL-row page hash changed');
assert(review.fresh_source?.identity_page_image_sha256 === '7ab85a69b9aed383cf89d6b7cf2691bbebd5f84ff6f621b77ad09a01f8fb968b', 'identity page hash changed');
assert(review.fresh_source?.workflow_run_id === 34777290075 && review.fresh_source?.artifact_id === 10324187529, 'fresh artifact provenance changed');
assert(review.fresh_source?.artifact_sha256 === 'e1b839e5ab67cec1d7b8683909b0c44efaec6a5f44eeb2c951c2927f8397f8bd' && sha(review.fresh_source?.artifact_sha256), 'artifact digest changed');

const fields = review.field_evidence || {};
assert(fields.registered_voters?.verified_value === 36855 && fields.registered_voters?.verification_state === 'source_verified', 'registered-voter read changed');
for (const name of ['total_valid_votes','rejected_ballots']) {
  const field = fields[name];
  assert(field?.verified_value === null && field?.verification_state === 'source_unreadable', `${name} must remain unreadable with no accepted integer`);
  assert(field?.source_image_sha256 === review.fresh_source.review_context_image_sha256, `${name} source-image hash changed`);
}

const candidates = review.same_row_candidate_evidence || {};
assert(JSON.stringify(candidates.candidate_vote_totals_in_source_column_order) === JSON.stringify([23160,3040,29,66]), 'candidate aggregates changed');
assert(candidates.candidate_vote_sum === 26295, 'candidate aggregate sum changed');
assert(candidates.total_valid_votes_reconciliation_performed === false, 'must not reconcile against an unreadable/unpopulated Total Valid Votes cell');

const denom = review.governed_denominator_reconciliation || {};
assert(JSON.stringify(denom.ward_registered_voters) === JSON.stringify([8075,9865,6677,8547]), 'pinned ward inputs changed');
assert(denom.ward_registered_voters.reduce((a,b)=>a+b,0) === 33164, 'ward denominator sum changed');
assert(denom.governed_registered_voters === 33164 && denom.form_printed_registered_voters === 36855, 'denominator values changed');
assert(denom.registered_voters_delta === 3691 && denom.registered_voters_reconciles === false, 'denominator mismatch changed');

assert(review.verification_state === 'partial_unresolved', 'row must remain partial_unresolved');
assert(review.promotion_eligible === false && review.promotion_authorized_by_this_file === false && review.canonical_turnout_value_written === false, 'no-promotion state changed');
for (const key of ['turnout_pct','ballots_cast']) assert(!Object.hasOwn(review, key), `${key} must not be materialized`);
console.log('P23_NORTH_HORR_FRESH_SOURCE_REVIEW_OK dpi=250 partial_unresolved=true denominator_delta=3691 no_promotion=true');
