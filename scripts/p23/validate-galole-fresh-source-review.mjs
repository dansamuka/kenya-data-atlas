import fs from 'node:fs';

const file = process.argv[2] || 'data/p23/form34b-galole-fresh-source-review.json';
const review = JSON.parse(fs.readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(`P23 Galole fresh source review: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(review.schema_version === 'kda.p23.form34b-fresh-source-review.v1', 'schema changed');
assert(review.geo_code === 'KEN-C004-CON019' && review.constituency_code === 19 && review.constituency_name === 'Galole', 'identity changed');
assert(review.fresh_source?.form_id === 277647, 'form id changed');
assert(review.fresh_source?.source_url === 'https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id=277647', 'source URL changed');
assert(review.fresh_source?.source_pdf_sha256 === '275afe53f387b9784f69981038ec551a6b4426438f3aadc7deaa9610a5551458', 'fresh PDF hash changed');
assert(review.fresh_source?.review_context_image_sha256 === '1d3c416cc5f184b29d9856c47681775e1ae416b8da7de239ee80078743207e26', '250-DPI page hash changed');
assert(review.fresh_source?.page_number === 2 && review.fresh_source?.render_dpi === 250, 'review context must remain page 2 at exactly 250 DPI');
assert(review.fresh_source?.workflow_run_id === 34747991023, 'fresh workflow run id changed');
assert(review.fresh_source?.workflow_head_sha === '59ec9a4f1f0f2ce5d40f5cd08c8a0cf507649ef6', 'fresh workflow head SHA changed');
assert(review.fresh_source?.artifact_id === 10315105932, 'fresh artifact id changed');
assert(review.fresh_source?.artifact_sha256 === '1bb43299d51f30587480efd6cb83d59f3c38f0d3b94483de9482a40b3ec21d5c' && sha(review.fresh_source?.artifact_sha256), 'artifact digest changed');

const fields = review.field_evidence || {};
assert(fields.registered_voters?.verified_value === 39979, 'fresh visual registered-voter read changed');
assert(fields.total_valid_votes?.verified_value === 28597, 'fresh visual valid-vote read changed');
assert(fields.rejected_ballots?.verified_value === 434, 'fresh visual rejected-ballot read changed');
for (const name of ['registered_voters','total_valid_votes','rejected_ballots']) {
  assert(fields[name]?.verification_state === 'source_verified', `${name} field-level fresh visual state changed`);
  assert(fields[name]?.source_image_sha256 === review.fresh_source.review_context_image_sha256, `${name} source-image hash drifted`);
}
const recon = review.same_row_valid_vote_reconciliation || {};
assert(JSON.stringify(recon.candidate_vote_totals_in_source_column_order) === JSON.stringify([16744,11566,109,178]), 'candidate cells changed');
assert(recon.candidate_vote_sum === 28597 && recon.reconciles_total_valid_votes === true, 'candidate sum must reconcile exactly');

const denom = review.governed_denominator_reconciliation || {};
assert(JSON.stringify(denom.ward_registered_voters) === JSON.stringify([8318,7570,14333,9744]), 'pinned ward inputs changed');
assert(denom.ward_registered_voters.reduce((a,b)=>a+b,0) === 39965, 'ward sum must equal 39965');
assert(denom.governed_registered_voters === 39965 && denom.form_printed_registered_voters === 39979, 'denominator values changed');
assert(denom.registered_voters_delta === 14 && denom.registered_voters_reconciles === false, 'denominator mismatch must remain 14');
assert(Array.isArray(denom.special_facility_rows) && denom.special_facility_rows.length === 1, 'one special-facility row required');
assert(denom.special_facility_rows[0]?.polling_station_code === '049292145101201' && denom.special_facility_rows[0]?.registered_voters === 14, 'Hola Prison row changed');
assert(denom.special_facility_registered_voters_sum === 14 && denom.special_facility_exactly_explains_delta === true, 'special-facility reconciliation changed');

assert(review.verification_state === 'denominator_mismatch', 'row must remain denominator_mismatch');
assert(review.promotion_eligible === false, 'row must remain non-promotable');
assert(review.promotion_authorized_by_this_file === false, 'file must not authorize promotion');
assert(review.canonical_turnout_value_written === false, 'canonical turnout must not be written');
assert(!Object.hasOwn(review, 'turnout_pct') && !Object.hasOwn(review, 'ballots_cast'), 'turnout result values must not be materialized');
console.log('P23_GALOLE_FRESH_SOURCE_REVIEW_OK denominator_delta=14 dpi=250 no_promotion=true');
