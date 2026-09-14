import fs from 'node:fs';

const file = process.argv[2] || 'data/p23/form34b-isiolo-south-fresh-source-review.json';
const review = JSON.parse(fs.readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(`P23 Isiolo South fresh source review: ${message}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(review.schema_version === 'kda.p23.form34b-fresh-source-review.v1', 'schema changed');
assert(review.geo_code === 'KEN-C011-CON050' && review.constituency_code === 50 && review.constituency_name === 'Isiolo South', 'identity changed');
assert(review.fresh_source?.form_id === 277678, 'form id changed');
assert(review.fresh_source?.source_url === 'https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id=277678', 'source URL changed');
assert(review.fresh_source?.source_pdf_sha256 === 'b2836be6440dd1814cdabc9c0916f9fb296f30eaa1450a95fdf73248aed8229b' && sha(review.fresh_source?.source_pdf_sha256), 'fresh PDF hash changed');
assert(review.fresh_source?.review_context_image_sha256 === 'c02dfc3061ba124872f6b4ecd008f0d9d369cef7fb6321ca54b7c61bc6566208' && sha(review.fresh_source?.review_context_image_sha256), '250-DPI page hash changed');
assert(review.fresh_source?.page_number === 1 && review.fresh_source?.render_dpi === 250 && review.fresh_source?.page_count === 1, 'review context must remain the single source page at exactly 250 DPI');
assert(review.fresh_source?.workflow_run_id === 34792161983, 'workflow run id changed');
assert(review.fresh_source?.workflow_head_sha === 'cf54feb839c273121d8b88a82f9927a3da031952', 'workflow head SHA changed');
assert(review.fresh_source?.artifact_id === 10328273815, 'artifact id changed');
assert(review.fresh_source?.artifact_sha256 === '6b1381a785715d2cdc7ea405bcb13838ab121f31b40f62eac0bee9e33e630617' && sha(review.fresh_source?.artifact_sha256), 'artifact digest changed');

const fields = review.field_evidence || {};
assert(fields.registered_voters?.verified_value === 22181 && fields.registered_voters?.verification_state === 'source_verified', 'registered-voter evidence changed');
assert(fields.total_valid_votes?.verified_value === 16198 && fields.total_valid_votes?.verification_state === 'source_mismatch', 'valid-vote mismatch evidence changed');
assert(fields.rejected_ballots?.verified_value === 192 && fields.rejected_ballots?.verification_state === 'source_verified', 'rejected-ballot evidence changed');
for (const name of ['registered_voters','total_valid_votes','rejected_ballots']) {
  assert(fields[name]?.source_image_sha256 === review.fresh_source.review_context_image_sha256, `${name} source-image hash drifted`);
}

const recon = review.same_row_valid_vote_reconciliation || {};
assert(JSON.stringify(recon.candidate_vote_totals_in_source_column_order) === JSON.stringify([6696,9455,12,33]), 'candidate cells changed');
assert(recon.candidate_vote_sum === 16196, 'candidate sum changed');
assert(recon.form_printed_total_valid_votes === 16198, 'printed valid-vote total changed');
assert(recon.candidate_sum_minus_printed_total_valid_votes === -2 && recon.reconciles_total_valid_votes === false, 'arithmetic mismatch must remain negative two');

const denom = review.governed_denominator_reconciliation || {};
assert(JSON.stringify(denom.ward_registered_voters) === JSON.stringify([7238,8885,6058]), 'pinned ward inputs changed');
assert(denom.ward_registered_voters.reduce((a,b)=>a+b,0) === 22181, 'ward sum must equal 22181');
assert(denom.governed_registered_voters === 22181 && denom.form_printed_registered_voters === 22181, 'denominator values changed');
assert(denom.registered_voters_delta === 0 && denom.registered_voters_reconciles === true, 'denominator must remain exactly reconciled');

assert(review.verification_state === 'arithmetic_mismatch', 'row must remain arithmetic_mismatch');
assert(review.promotion_eligible === false, 'row must remain non-promotable');
assert(review.promotion_authorized_by_this_file === false, 'file must not authorize promotion');
assert(review.canonical_turnout_value_written === false, 'canonical turnout must not be written');
assert(!Object.hasOwn(review, 'turnout_pct') && !Object.hasOwn(review, 'ballots_cast'), 'turnout result values must not be materialized');
console.log('P23_ISIOLO_SOUTH_FRESH_SOURCE_REVIEW_OK arithmetic_delta=-2 denominator_delta=0 dpi=250 no_promotion=true');
