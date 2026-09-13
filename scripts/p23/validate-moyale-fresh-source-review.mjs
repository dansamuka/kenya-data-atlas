import fs from 'node:fs';

const file = process.argv[2] || 'data/p23/form34b-moyale-fresh-source-review.json';
const review = JSON.parse(fs.readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(`P23 Moyale fresh source review: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
assert(review.schema_version === 'kda.p23.form34b-fresh-source-review.v1', 'schema changed');
assert(review.geo_code === 'KEN-C010-CON045' && review.constituency_code === 45 && review.constituency_name === 'Moyale', 'identity changed');
assert(review.fresh_source?.form_id === 277673, 'form id changed');
assert(review.fresh_source?.source_pdf_sha256 === 'fc0425851ab85b8471984864b5c282fdd2ccada0bb4c1cc567628457ef61e3aa', 'fresh PDF hash changed');
assert(review.fresh_source?.page_number === 2 && review.fresh_source?.render_dpi === 250 && review.fresh_source?.page_count === 3, 'review context changed');
assert(review.fresh_source?.review_context_image_sha256 === 'bae8dd36aed7ab3a9b138deb08eee610b244151160c9c42e72b728846cfad0ce', 'page-2 image hash changed');
assert(review.fresh_source?.identity_page_image_sha256 === '5cc430f690a7bf35cacde988a08be2b3546aa0ab9b51abf08940b445d065efbc', 'identity-page hash changed');
assert(review.fresh_source?.workflow_run_id === 34756901800 && review.fresh_source?.artifact_id === 10317568226, 'fresh provenance changed');
assert(review.fresh_source?.artifact_sha256 === 'f821b096dd7b781ede18f0fe73082d7bf10f415ffb1808253df240dcee26804e' && sha(review.fresh_source?.artifact_sha256), 'artifact digest changed');
assert(review.review?.form_identity_visually_confirmed === true && review.review?.result_table_present === true && review.review?.total_row_present === true, 'visual source structure changed');
assert(review.review?.total_row_legibility === 'insufficient_for_reliable_independent_transcription', 'unreadable finding changed');
for (const name of ['registered_voters','total_valid_votes','rejected_ballots']) {
  const field = review.field_evidence?.[name];
  assert(field?.page_number === 2, `${name} page changed`);
  assert(field?.source_image_sha256 === review.fresh_source.review_context_image_sha256, `${name} image hash changed`);
  assert(field?.verified_value === null && field?.verification_state === 'source_unreadable', `${name} must remain source_unreadable with no accepted value`);
}
const denom = review.governed_denominator_context || {};
assert(JSON.stringify(denom.ward_registered_voters) === JSON.stringify([9614,8376,10431,15692]), 'pinned ward inputs changed');
assert(denom.ward_registered_voters.reduce((a,b)=>a+b,0) === 44113 && denom.governed_registered_voters === 44113, 'governed denominator changed');
assert(denom.form_denominator_comparison_performed === false, 'must not compare an unreadable form denominator');
assert(review.verification_state === 'source_unreadable', 'row must remain source_unreadable');
assert(review.promotion_eligible === false && review.promotion_authorized_by_this_file === false && review.canonical_turnout_value_written === false, 'no-promotion state changed');
for (const key of ['turnout_pct','ballots_cast','candidate_vote_sum','candidate_vote_totals_in_source_column_order']) assert(!Object.hasOwn(review, key), `${key} must not be materialized`);
console.log('P23_MOYALE_FRESH_SOURCE_REVIEW_OK dpi=250 source_unreadable=true no_promotion=true');
