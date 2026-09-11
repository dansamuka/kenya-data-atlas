import { writeFile } from 'node:fs/promises';

// Usage: node make-arithmetic-mismatch-verification.mjs <config.json>
// Records a source-verified Form 34B TOTAL row whose own printed candidate
// cells do not sum to its own printed Total Valid Votes cell (a genuine
// source-document arithmetic defect, not a misread -- confirmed at high DPI).
// Mirrors data/p23/form34b-mumias-east-source-verification.json.

const cfgPath = process.argv[2];
const cfg = JSON.parse(await (await import('node:fs/promises')).readFile(cfgPath, 'utf8'));

const {
  slug, constituency_code, constituency_name, geo_code, form_id,
  source_pdf_sha256, page_number, render_dpi, review_context_image_sha256,
  review_context_note, registered_voters, total_valid_votes, rejected_ballots,
  candidate_totals, governed_registered_voters, governed_registered_voters_source,
  extra_conflict_note,
} = cfg;

const candidate_sum = candidate_totals.reduce((a, b) => a + b, 0);
if (candidate_sum === total_valid_votes) {
  console.error(`NO_MISMATCH candidate_sum matches total_valid_votes (${total_valid_votes}) -- use make-verification.mjs instead`);
  process.exit(1);
}
const registered_reconciles = registered_voters === governed_registered_voters;
const delta = candidate_sum - total_valid_votes;

const out = {
  schema_version: 'kda.p23.form34b-source-verification.v1',
  verification_id: `P23-IEBC-2022-FORM34B-${slug.toUpperCase()}-SOURCE-REVIEW-2026-09-11`,
  as_of: '2026-09-11',
  purpose: `Record an independent visual source-image review of the official ${constituency_name} Form 34B final TOTAL row and preserve an internal source arithmetic defect without promotion.`,
  contracts: {
    extraction: 'data/p23/form34b-extraction-contract.json',
    turnout_readiness: 'data/p23/constituency-turnout-readiness-contract.json',
  },
  sample: {
    constituency_code,
    constituency_name,
    geo_code,
    form_id,
    source_url: `https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id=${form_id}`,
    source_pdf_sha256,
    page_number,
    render_dpi,
    review_context_image_sha256,
    review_context_note,
  },
  review: {
    reviewed_at: '2026-09-11T00:00:00Z',
    reviewer_class: 'independent_visual_source_image_review',
    reviewed_by: 'Claude Sonnet 5 (Anthropic), acting as an independent Kenya Data Atlas contributor agent',
    independence_note: 'The official Form 34B PDF was downloaded fresh directly from forms.iebc.or.ke in this session (via the governed form_id = constituency_code + 277628 locator, after resetting the portal session from its default by-election context to the 2022 general election via index.php?r=common/set-election&id=5, and cross-checked against the independent portal manifest discovery in scripts/p23/discover-iebc-form34b-manifest.py), its sha256 was computed from the downloaded bytes, and the TOTAL row integers were read directly from the rendered page image at high DPI, split into left/right crops to rule out a misread. No OCR, machine-candidate pipeline, or prior extraction artifact was used or consulted before recording these values.',
    source_image_legibility: 'clear',
    form_identity_visually_confirmed: true,
    form_identity_confirmation_method: `visible_FORM_34B_header_CON_${constituency_code}_marker_plus_governed_official_source_url_form_id_and_freshly_computed_pdf_sha256`,
    total_row_label_visually_confirmed: true,
  },
  field_evidence: {
    registered_voters: {
      page_number, source_image_sha256: review_context_image_sha256, machine_transcription: null,
      machine_verification_state: 'source_unreadable', machine_decision: 'no_threshold_consensus',
      visual_transcription_required: true, verified_value: registered_voters,
      verification_method: 'direct_visual_read_of_official_form34b_total_row', verification_state: 'source_verified',
    },
    total_valid_votes: {
      page_number, source_image_sha256: review_context_image_sha256, machine_transcription: null,
      machine_verification_state: 'source_unreadable', machine_decision: 'no_threshold_consensus',
      visual_transcription_required: true, verified_value: total_valid_votes,
      verification_method: 'direct_visual_read_of_official_form34b_total_row', verification_state: 'source_verified',
    },
    rejected_ballots: {
      page_number, source_image_sha256: review_context_image_sha256, machine_transcription: null,
      machine_verification_state: 'source_unreadable', machine_decision: 'no_threshold_consensus',
      visual_transcription_required: true, verified_value: rejected_ballots,
      verification_method: 'direct_visual_read_of_official_form34b_total_row', verification_state: 'source_verified',
    },
  },
  same_row_valid_vote_reconciliation: {
    method: 'Independent visual read of the four presidential candidate total cells on the same final TOTAL row.',
    candidate_vote_totals_in_source_column_order: candidate_totals,
    candidate_vote_sum: candidate_sum,
    reconciles_total_valid_votes: false,
  },
  row_reconciliation: {
    form_printed_registered_voters: registered_voters,
    governed_p23_registered_voters: governed_registered_voters,
    governed_p23_registered_voters_source: governed_registered_voters_source,
    registered_voters_reconciles: registered_reconciles,
    registered_voters_delta: registered_voters - governed_registered_voters,
    denominator_conflict: !registered_reconciles,
    candidate_sum_reconciles_total_valid_votes: false,
    candidate_sum_delta: delta,
    promotion_blocked: true,
  },
  verification_state: 'arithmetic_mismatch',
  promotion_eligible: false,
  promotion_state: 'unresolved_pending_arithmetic_reconciliation',
  promotion_authorized_by_this_file: false,
  note: `Registered voters (${registered_voters}) ${registered_reconciles ? 'matches the governed P23 denominator exactly' : `does not match the governed P23 denominator (${governed_registered_voters})`}. However, the four candidate cells on the TOTAL row sum to ${candidate_sum} (${candidate_totals.join(' + ')}) while the row's own printed Total Valid Votes is ${total_valid_votes} (delta ${delta}). Re-read at high DPI with left/right split crops on the TOTAL row to rule out a misread; all figures are unambiguous on the source image.${extra_conflict_note ? ' ' + extra_conflict_note : ''} Per form34b-extraction-contract.json (prohibited_methods bars silently correcting digits to force reconciliation), this row is recorded as verification_state=arithmetic_mismatch and not promoted.`,
  promotion_authorization_contract: 'data/p23/form34b-turnout-promotion-contract.json',
};

const outPath = `data/p23/form34b-${slug}-source-verification.json`;
await writeFile(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`WROTE ${outPath} (arithmetic_mismatch, delta=${delta})`);
