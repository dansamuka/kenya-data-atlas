import fs from 'node:fs';

const file = process.argv[2] || 'data/p23/form34b-isiolo-north-fresh-source-review.json';
const review = JSON.parse(fs.readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(`P23 Isiolo North fresh source review: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(review.schema_version === 'kda.p23.form34b-fresh-source-review.v1', 'schema changed');
assert(review.geo_code === 'KEN-C011-CON049' && review.constituency_code === 49 && review.constituency_name === 'Isiolo North', 'identity changed');
assert(review.fresh_source?.form_id === 277677, 'form id changed');
assert(review.fresh_source?.source_pdf_sha256 === '5f72e2609c58716b8fb515df1feea3e7fb84a146cf1e902d1eb1dc3bcd620123', 'fresh PDF hash changed');
assert(review.fresh_source?.page_number === 2 && review.fresh_source?.page_count === 3 && review.fresh_source?.render_dpi === 250, 'review context changed');
assert(review.fresh_source?.review_context_image_sha256 === '45a53067143db97e53d3aa633b6a440f688e1de703e98dc386f23aec9a2cf7cb', 'result-page image hash changed');
assert(review.fresh_source?.identity_page_number === 1 && review.fresh_source?.identity_page_image_sha256 === 'cb32990457d3c4af3f11f517c8c5e12f68816e584144b6bf8a5896b58f1eecfb', 'identity-page evidence changed');
assert(review.fresh_source?.workflow_run_id === 34777290075 && review.fresh_source?.artifact_id === 10324187529, 'fresh provenance changed');
assert(review.fresh_source?.artifact_sha256 === 'e1b839e5ab67cec1d7b8683909b0c44efaec6a5f44eeb2c951c2927f8397f8bd' && sha(review.fresh_source?.artifact_sha256), 'artifact digest changed');

const fields = review.field_evidence || {};
assert(fields.registered_voters?.verified_value === 67354 && fields.registered_voters?.verification_state === 'source_verified', 'registered-voter read changed');
assert(fields.total_valid_votes?.verified_value === 42765 && fields.total_valid_votes?.verification_state === 'source_verified', 'Total Valid Votes read changed');
assert(fields.rejected_ballots?.verified_value === 343 && fields.rejected_ballots?.verification_state === 'source_verified', 'rejected-ballot read changed');
for (const name of ['registered_voters','total_valid_votes','rejected_ballots']) assert(fields[name]?.source_image_sha256 === review.fresh_source.review_context_image_sha256, `${name} source-image hash changed`);

const recon = review.same_row_valid_vote_reconciliation || {};
assert(JSON.stringify(recon.candidate_vote_totals_in_source_column_order) === JSON.stringify([19740,22845,40,140]), 'candidate aggregates changed');
assert(recon.candidate_vote_sum === 42765 && recon.reconciles_total_valid_votes === true, 'candidate arithmetic must reconcile exactly');

const denom = review.governed_denominator_reconciliation || {};
assert(JSON.stringify(denom.ward_registered_voters) === JSON.stringify([15034,15125,4486,8065,5434,13195,5984]), 'pinned ward inputs changed');
assert(denom.ward_registered_voters.reduce((a,b)=>a+b,0) === 67323, 'ward denominator sum changed');
assert(denom.governed_registered_voters === 67323 && denom.form_printed_registered_voters === 67354, 'denominator values changed');
assert(denom.registered_voters_delta === 31 && denom.registered_voters_reconciles === false, 'denominator mismatch changed');
assert(Array.isArray(denom.special_facility_rows) && denom.special_facility_rows.length === 1 && denom.special_facility_rows[0]?.polling_station_name === 'ISIOLO PRISON - 01' && denom.special_facility_rows[0]?.registered_voters === 31, 'special-facility evidence changed');
assert(denom.special_facility_registered_voters_sum === 31 && denom.special_facility_exactly_explains_delta === true, 'special-facility reconciliation changed');

assert(review.verification_state === 'denominator_mismatch', 'row must remain denominator_mismatch');
assert(review.promotion_eligible === false && review.promotion_authorized_by_this_file === false && review.canonical_turnout_value_written === false, 'no-promotion state changed');
for (const key of ['turnout_pct','ballots_cast']) assert(!Object.hasOwn(review, key), `${key} must not be materialized`);
console.log('P23_ISIOLO_NORTH_FRESH_SOURCE_REVIEW_OK dpi=250 denominator_delta=31 no_promotion=true');
