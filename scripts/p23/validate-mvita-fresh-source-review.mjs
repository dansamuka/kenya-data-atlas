import fs from 'node:fs';

const path = process.argv[2] || 'data/p23/form34b-mvita-fresh-source-review.json';
const review = JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = message => { throw new Error(`P23 Mvita fresh source review: ${message}`); };
const assert = (ok, message) => { if (!ok) fail(message); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert(review.schema_version === 'kda.p23.form34b-fresh-source-review.v1', 'schema changed');
assert(review.geo_code === 'KEN-C001-CON006' && review.constituency_code === 6 && review.constituency_name === 'Mvita', 'identity changed');
assert(review.fresh_source?.form_id === 277634, 'form id changed');
assert(review.fresh_source?.source_url === 'https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id=277634', 'source URL changed');
assert(sha(review.fresh_source?.source_pdf_sha256), 'fresh PDF hash missing');
assert(sha(review.fresh_source?.full_page_image_sha256), 'full-page hash missing');
assert(sha(review.fresh_source?.review_context_image_sha256), 'review-context hash missing');
assert(review.fresh_source?.page_number === 3, 'review page changed');
assert(review.fresh_source?.render_dpi === 250, 'review must remain exactly 250 DPI');
assert(review.fresh_source?.workflow_run_id === 34747813707, 'fresh workflow run id changed');
assert(review.fresh_source?.workflow_head_sha === '6e1bdffad9d86805e67c33c3872b4ee02fcf3aba', 'fresh workflow head SHA changed');

const fields = review.field_evidence || {};
assert(fields.registered_voters?.verified_value === 119008, 'fresh visual registered-voter read changed');
assert(fields.total_valid_votes?.verified_value === 47216, 'fresh visual valid-vote read changed');
assert(fields.rejected_ballots?.verified_value === 670, 'fresh visual rejected-ballot read changed');
for (const name of ['registered_voters', 'total_valid_votes', 'rejected_ballots']) {
  assert(fields[name]?.verification_state === 'source_verified', `${name} must remain source_verified as a field-level fresh visual read`);
  assert(fields[name]?.source_image_sha256 === review.fresh_source.review_context_image_sha256, `${name} review-context hash drifted`);
}

const recon = review.same_row_valid_vote_reconciliation || {};
assert(JSON.stringify(recon.candidate_vote_totals_in_source_column_order) === JSON.stringify([24497, 22210, 78, 431]), 'candidate cells changed');
assert(recon.candidate_vote_sum === 47216 && recon.reconciles_total_valid_votes === true, 'candidate sum must reconcile exactly');

const denom = review.governed_denominator_reconciliation || {};
assert(JSON.stringify(denom.ward_registered_voters) === JSON.stringify([22341, 22926, 23379, 18556, 31772]), 'governed ward inputs changed');
assert(denom.ward_registered_voters.reduce((a, b) => a + b, 0) === 118974, 'ward sum must equal governed denominator');
assert(denom.governed_registered_voters === 118974, 'governed denominator changed');
assert(denom.form_printed_registered_voters === 119008, 'printed denominator changed');
assert(denom.registered_voters_delta === 34 && denom.registered_voters_reconciles === false, 'denominator mismatch must remain 34');
assert(denom.special_facility_row?.polling_station_code === '049292145100501', 'special-facility code changed');
assert(denom.special_facility_row?.polling_station_name === 'KINGORANI PRISON (B) - 01', 'special-facility name changed');
assert(denom.special_facility_row?.registered_voters === 34, 'special-facility voter count changed');
assert(denom.special_facility_exactly_explains_delta === true, 'special-facility row must exactly explain the 34-voter delta');

assert(review.verification_state === 'denominator_mismatch', 'row must remain denominator_mismatch');
assert(review.promotion_eligible === false, 'row must remain non-promotable');
assert(review.promotion_authorized_by_this_file === false, 'file must not authorize promotion');
assert(review.canonical_turnout_value_written === false, 'canonical turnout must not be written');
assert(!Object.hasOwn(review, 'turnout_pct'), 'turnout_pct must not be materialized in this review');
assert(!Object.hasOwn(review, 'ballots_cast'), 'ballots_cast must not be materialized in this review');

console.log('P23_MVITA_FRESH_SOURCE_REVIEW_OK field_reads=fresh_250dpi denominator=118974 printed=119008 delta=34 state=denominator_mismatch promotion=false');
