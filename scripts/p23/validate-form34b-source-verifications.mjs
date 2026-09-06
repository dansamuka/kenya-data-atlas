#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const assert = (ok, msg) => { if (!ok) throw new Error(`P23 Form 34B source verification: ${msg}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const fields = ['registered_voters', 'total_valid_votes', 'rejected_ballots'];

const extraction = readJson('data/p23/form34b-extraction-contract.json');
const readiness = readJson('data/p23/constituency-turnout-readiness-contract.json');
const geographies = readJson('data/geography/registry/geographies.json');
const series = readJson('data/indicators/registry/series.json');
const observations = readJson('data/indicators/registry/observations.json');

assert(extraction.schema_version === 'kda.p23.form34b-extraction.v1', 'extraction contract schema changed');
assert(extraction.promotion_policy?.permitted_row_state === 'verified', 'verified promotion state changed');
assert(extraction.promotion_policy?.denominator_invariant === 20115, 'governed completeness denominator changed');
assert(readiness.measure?.formula === '100 * (total_valid_votes + rejected_ballots) / registered_voters', 'governed turnout formula changed');

const geoByCode = new Map(geographies.filter(g => g.level === 'constituency').map(g => [Number(g.constituency_code), g]));
assert(geoByCode.size === 290, 'canonical constituency registry must contain 290 rows');
const seriesByCode = new Map(series.map(s => [s.series_code, s]));
const observationById = new Map(observations.map(o => [o.observation_id, o]));
const canonicalRegistered = code => {
  const seriesCode = `KDA-VOTERS-CON-${String(code).padStart(3, '0')}-2022`;
  const s = seriesByCode.get(seriesCode);
  assert(s, `registered-voter series missing for constituency ${code}`);
  const o = observationById.get(s.latest_observation_id);
  assert(o && Number.isInteger(o.value) && o.value > 0, `registered-voter observation missing for constituency ${code}`);
  return o.value;
};

const p23Dir = path.join(root, 'data/p23');
const names = fs.readdirSync(p23Dir).filter(name => /^form34b-.+-source-verification\.json$/.test(name)).sort();
assert(names.length > 0, 'no committed Form 34B source-verification evidence');

const seenCodes = new Set();
let verifiedRows = 0;
let blockedRows = 0;
for (const name of names) {
  const evidence = JSON.parse(fs.readFileSync(path.join(p23Dir, name), 'utf8'));
  const sample = evidence.sample || {};
  const code = Number(sample.constituency_code);
  assert(evidence.schema_version === 'kda.p23.form34b-source-verification.v1', `${name}: schema version changed`);
  assert(Number.isInteger(code) && code >= 1 && code <= 290, `${name}: invalid constituency code`);
  assert(!seenCodes.has(code), `${name}: duplicate constituency code ${code}`);
  seenCodes.add(code);
  const geo = geoByCode.get(code);
  assert(geo && geo.geo_code === sample.geo_code, `${name}: canonical geo_code mismatch`);
  assert(Number.isInteger(sample.form_id) && sample.form_id > 0, `${name}: form id missing`);
  assert(typeof sample.source_url === 'string' && sample.source_url.startsWith('https://forms.iebc.or.ke/'), `${name}: source URL is not official IEBC`);
  assert(sha(sample.source_pdf_sha256), `${name}: source PDF digest invalid`);
  assert(Number.isInteger(sample.page_number) && sample.page_number >= 1, `${name}: source page missing`);
  assert(sample.render_dpi === 250, `${name}: review render DPI changed`);
  assert(sha(sample.review_context_image_sha256), `${name}: review context digest missing`);

  const review = evidence.review || {};
  assert(review.reviewer_class === 'independent_visual_source_image_review', `${name}: reviewer class changed`);
  assert(Boolean(review.reviewed_by), `${name}: reviewer identity missing`);
  assert(review.source_image_legibility === 'clear', `${name}: source image not recorded as clear`);
  assert(review.total_row_label_visually_confirmed === true, `${name}: TOTAL row label not visually confirmed`);
  assert(evidence.promotion_authorized_by_this_file === false, `${name}: evidence file must never self-promote`);

  const values = {};
  for (const field of fields) {
    const row = evidence.field_evidence?.[field];
    assert(row, `${name}: ${field} evidence missing`);
    assert(row.verification_state === 'source_verified', `${name}: ${field} is not source_verified`);
    assert(row.verification_method === 'direct_visual_read_of_official_form34b_total_row', `${name}: ${field} verification method changed`);
    assert(Number(row.page_number) === Number(sample.page_number), `${name}: ${field} page mismatch`);
    assert(sha(row.source_image_sha256), `${name}: ${field} source-image digest missing`);
    assert(row.source_image_sha256 === sample.review_context_image_sha256, `${name}: ${field} does not link to governed review crop`);
    assert(Number.isInteger(row.machine_transcription) && row.machine_transcription >= 0, `${name}: ${field} machine candidate missing`);
    assert(Number.isInteger(row.verified_value) && row.verified_value >= 0, `${name}: ${field} verified value missing`);
    assert(row.machine_transcription === row.verified_value, `${name}: ${field} machine/visual disagreement must remain unresolved under this tranche`);
    values[field] = row.verified_value;
  }

  const canonical = canonicalRegistered(code);
  assert(values.registered_voters === canonical, `${name}: registered-voter value does not reconcile to canonical 2022 denominator`);
  assert(Number(evidence.row_reconciliation?.governed_registered_voters) === canonical, `${name}: governed denominator record mismatch`);
  assert(evidence.row_reconciliation?.registered_voters_reconciles === true, `${name}: denominator reconciliation flag false`);

  const candidateTotals = evidence.same_row_valid_vote_reconciliation?.candidate_vote_totals_in_source_column_order || [];
  assert(candidateTotals.length === 4 && candidateTotals.every(Number.isInteger), `${name}: four candidate totals required`);
  const candidateSum = candidateTotals.reduce((sum, value) => sum + value, 0);
  assert(candidateSum === values.total_valid_votes, `${name}: candidate totals do not reconcile to total valid votes`);
  assert(evidence.same_row_valid_vote_reconciliation?.candidate_vote_sum === candidateSum, `${name}: stored candidate sum changed`);
  assert(evidence.same_row_valid_vote_reconciliation?.reconciles_total_valid_votes === true, `${name}: valid-vote reconciliation flag false`);

  const ballotsCast = values.total_valid_votes + values.rejected_ballots;
  assert(ballotsCast <= values.registered_voters, `${name}: ballots cast exceed registered voters`);
  const turnout = 100 * ballotsCast / values.registered_voters;
  assert(turnout >= 0 && turnout <= 100, `${name}: governed turnout formula outside range`);

  if (evidence.verification_state === 'verified') {
    verifiedRows += 1;
    assert(evidence.promotion_eligible === true, `${name}: verified row must be marked promotion eligible`);
    assert(evidence.row_reconciliation?.ballots_cast === ballotsCast, `${name}: stored ballots_cast changed`);
    assert(evidence.row_reconciliation?.ballots_cast_lte_registered_voters === true, `${name}: ballots-cast bound flag false`);
    assert(Math.abs(Number(evidence.row_reconciliation?.turnout_pct) - turnout) < 1e-12, `${name}: stored turnout is not exact governed derivation`);
    assert(evidence.row_reconciliation?.turnout_range_valid === true, `${name}: turnout range flag false`);
  } else if (evidence.verification_state === 'arithmetic_mismatch') {
    blockedRows += 1;
    assert(evidence.promotion_eligible === false, `${name}: arithmetic mismatch must not be promotion eligible`);
    assert(evidence.row_reconciliation?.arithmetic_conflict === true, `${name}: arithmetic conflict flag missing`);
    assert(evidence.row_reconciliation?.promotion_blocked === true, `${name}: arithmetic mismatch must explicitly block promotion`);
    assert(Number(evidence.row_reconciliation?.contract_ballots_cast_candidate) === ballotsCast, `${name}: governed candidate ballots-cast calculation changed`);
    assert(Math.abs(Number(evidence.row_reconciliation?.contract_formula_candidate_pct) - turnout) < 1e-12, `${name}: governed candidate turnout calculation changed`);
    const printed = evidence.row_reconciliation?.source_reported_turnout_box || {};
    assert(Number(printed.registered_voters) === values.registered_voters, `${name}: printed turnout-box denominator changed`);
    assert(Number.isInteger(printed.voters_turned_out), `${name}: printed voters-turned-out missing`);
    const printedPct = 100 * printed.voters_turned_out / printed.registered_voters;
    assert(Math.abs(Number(printed.turnout_pct_printed) - printedPct) < 1e-7, `${name}: printed turnout percentage does not reconcile to printed turnout count`);
    assert(evidence.row_reconciliation?.source_reported_turnout_reconciles_to_printed_voters_turned_out === true, `${name}: printed turnout reconciliation flag false`);
    assert(evidence.row_reconciliation?.source_reported_turnout_matches_contract_formula === false, `${name}: arithmetic conflict unexpectedly resolved`);
    assert(printed.voters_turned_out !== ballotsCast, `${name}: arithmetic mismatch no longer exists`);
  } else {
    assert(false, `${name}: unsupported committed row state ${evidence.verification_state}`);
  }
}

assert(verifiedRows >= 1, 'at least one verified source row required');
console.log(`P23_FORM34B_SOURCE_VERIFICATIONS_OK evidence=${names.length} verified=${verifiedRows} blocked=${blockedRows} denominator=20115 promotion_self_authorized=0 values_logged=0`);
