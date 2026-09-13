import fs from 'node:fs';

const file = process.argv[2] || 'data/p23/form34b-garissa-township-fresh-source-review.json';
const review = JSON.parse(fs.readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(`P23 Garissa Township fresh source review: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(review.schema_version === 'kda.p23.form34b-fresh-source-review.v1', 'schema changed');
assert(review.geo_code === 'KEN-C007-CON027' && review.constituency_code === 27 && review.constituency_name === 'Garissa Township', 'identity changed');
assert(review.fresh_source?.form_id === 277655, 'form id changed');
assert(review.fresh_source?.source_url === 'https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id=277655', 'source URL changed');
assert(review.fresh_source?.source_pdf_sha256 === '34a6b2b04f4e945d30f309d9fd19c76a0335906429c1fb62be9612b2761b18d7', 'fresh PDF hash changed');
assert(review.fresh_source?.review_context_image_sha256 === '2f915b4961de6dc225f9a0144530f276762ef23f84d73674db146492c65c96a3', '250-DPI page hash changed');
assert(review.fresh_source?.page_number === 2 && review.fresh_source?.render_dpi === 250, 'review context must remain page 2 at exactly 250 DPI');
assert(review.fresh_source?.workflow_run_id === 34756901800, 'workflow run id changed');
assert(review.fresh_source?.workflow_head_sha === 'c43819c9ad2ac5de12cc8fcc17cd85020080cf4e', 'workflow head SHA changed');
assert(review.fresh_source?.artifact_id === 10317568226, 'artifact id changed');
assert(review.fresh_source?.artifact_sha256 === 'f821b096dd7b781ede18f0fe73082d7bf10f415ffb1808253df240dcee26804e' && sha(review.fresh_source?.artifact_sha256), 'artifact digest changed');

const fields = review.field_evidence || {};
assert(fields.registered_voters?.verified_value === 53293, 'registered-voter read changed');
assert(fields.total_valid_votes?.verified_value === 25086, 'valid-vote read changed');
assert(fields.rejected_ballots?.verified_value === 228, 'rejected-ballot read changed');
for (const name of ['registered_voters','total_valid_votes','rejected_ballots']) {
  assert(fields[name]?.verification_state === 'source_verified', `${name} field-level state changed`);
  assert(fields[name]?.source_image_sha256 === review.fresh_source.review_context_image_sha256, `${name} source-image hash drifted`);
}

const recon = review.same_row_valid_vote_reconciliation || {};
assert(JSON.stringify(recon.candidate_vote_totals_in_source_column_order) === JSON.stringify([16925,8031,18,112]), 'candidate cells changed');
assert(recon.candidate_vote_sum === 25086 && recon.reconciles_total_valid_votes === true, 'candidate sum must reconcile exactly');

const denom = review.governed_denominator_reconciliation || {};
assert(JSON.stringify(denom.ward_registered_voters) === JSON.stringify([11657,16698,13419,11479]), 'pinned ward inputs changed');
assert(denom.ward_registered_voters.reduce((a,b)=>a+b,0) === 53253, 'ward sum must equal 53253');
assert(denom.governed_registered_voters === 53253 && denom.form_printed_registered_voters === 53293, 'denominator values changed');
assert(denom.registered_voters_delta === 40 && denom.registered_voters_reconciles === false, 'denominator mismatch must remain 40');
assert(denom.visible_extra_row?.polling_station_code === '049292145101801', 'Garissa Main row code changed');
assert(denom.visible_extra_row?.polling_station_name === 'GARISSA MAIN - 01' && denom.visible_extra_row?.registered_voters === 40, 'Garissa Main row changed');
assert(denom.visible_extra_row_exactly_explains_delta === true, 'visible extra row must continue to exactly explain delta');

assert(review.verification_state === 'denominator_mismatch', 'row must remain denominator_mismatch');
assert(review.promotion_eligible === false, 'row must remain non-promotable');
assert(review.promotion_authorized_by_this_file === false, 'file must not authorize promotion');
assert(review.canonical_turnout_value_written === false, 'canonical turnout must not be written');
assert(!Object.hasOwn(review, 'turnout_pct') && !Object.hasOwn(review, 'ballots_cast'), 'turnout result values must not be materialized');
console.log('P23_GARISSA_TOWNSHIP_FRESH_SOURCE_REVIEW_OK denominator_delta=40 dpi=250 no_promotion=true');
