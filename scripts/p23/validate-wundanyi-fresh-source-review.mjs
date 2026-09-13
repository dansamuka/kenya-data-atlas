import fs from 'node:fs';

const file = process.argv[2] || 'data/p23/form34b-wundanyi-fresh-source-review.json';
const review = JSON.parse(fs.readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(`P23 Wundanyi fresh source review: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(review.schema_version === 'kda.p23.form34b-fresh-source-review.v1', 'schema changed');
assert(review.geo_code === 'KEN-C006-CON024' && review.constituency_code === 24 && review.constituency_name === 'Wundanyi', 'identity changed');
assert(review.fresh_source?.form_id === 277652, 'form id changed');
assert(review.fresh_source?.source_url === 'https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id=277652', 'source URL changed');
assert(review.fresh_source?.source_pdf_sha256 === '7f44697b4c712c7f6595d189a128c72409162733fe66d9473ddcdf2d5cb40e7f', 'fresh PDF hash changed');
assert(review.fresh_source?.review_context_image_sha256 === 'd931eca65a375a30e145e7ce18b4e12ba0c7b84570b1fab76b5e8bc75d15e1e9', '250-DPI page hash changed');
assert(review.fresh_source?.page_number === 1 && review.fresh_source?.render_dpi === 250, 'review context must remain page 1 at exactly 250 DPI');
assert(review.fresh_source?.workflow_run_id === 34747991023, 'fresh workflow run id changed');
assert(review.fresh_source?.workflow_head_sha === '59ec9a4f1f0f2ce5d40f5cd08c8a0cf507649ef6', 'fresh workflow head SHA changed');
assert(review.fresh_source?.artifact_id === 10315105932, 'fresh artifact id changed');
assert(review.fresh_source?.artifact_sha256 === '1bb43299d51f30587480efd6cb83d59f3c38f0d3b94483de9482a40b3ec21d5c' && sha(review.fresh_source?.artifact_sha256), 'artifact digest changed');

const fields = review.field_evidence || {};
assert(fields.registered_voters?.verified_value === 35047, 'fresh visual registered-voter read changed');
assert(fields.total_valid_votes?.verified_value === 21469, 'fresh visual valid-vote read changed');
assert(fields.rejected_ballots?.verified_value === 209, 'fresh visual rejected-ballot read changed');
for (const name of ['registered_voters','total_valid_votes','rejected_ballots']) {
  assert(fields[name]?.verification_state === 'source_verified', `${name} field-level fresh visual state changed`);
  assert(fields[name]?.source_image_sha256 === review.fresh_source.review_context_image_sha256, `${name} source-image hash drifted`);
}
const recon = review.same_row_valid_vote_reconciliation || {};
assert(JSON.stringify(recon.candidate_vote_totals_in_source_column_order) === JSON.stringify([16847,4309,75,238]), 'candidate cells changed');
assert(recon.candidate_vote_sum === 21469 && recon.reconciles_total_valid_votes === true, 'candidate sum must reconcile exactly');

const denom = review.governed_denominator_reconciliation || {};
assert(JSON.stringify(denom.ward_registered_voters) === JSON.stringify([12988,6085,8007,7928]), 'pinned ward inputs changed');
assert(denom.ward_registered_voters.reduce((a,b)=>a+b,0) === 35008, 'ward sum must equal 35008');
assert(denom.governed_registered_voters === 35008 && denom.form_printed_registered_voters === 35047, 'denominator values changed');
assert(denom.registered_voters_delta === 39 && denom.registered_voters_reconciles === false, 'denominator mismatch must remain 39');
assert(Array.isArray(denom.special_facility_rows) && denom.special_facility_rows.length === 1, 'one special-facility row required');
assert(denom.special_facility_rows[0]?.polling_station_code === '049292145101501' && denom.special_facility_rows[0]?.registered_voters === 39, 'Wundanyi special-facility row changed');
assert(denom.special_facility_registered_voters_sum === 39 && denom.special_facility_exactly_explains_delta === true, 'special-facility reconciliation changed');

assert(review.verification_state === 'denominator_mismatch', 'row must remain denominator_mismatch');
assert(review.promotion_eligible === false, 'row must remain non-promotable');
assert(review.promotion_authorized_by_this_file === false, 'file must not authorize promotion');
assert(review.canonical_turnout_value_written === false, 'canonical turnout must not be written');
assert(!Object.hasOwn(review, 'turnout_pct') && !Object.hasOwn(review, 'ballots_cast'), 'turnout result values must not be materialized');
console.log('P23_WUNDANYI_FRESH_SOURCE_REVIEW_OK denominator_delta=39 dpi=250 no_promotion=true');
