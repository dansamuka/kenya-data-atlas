import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const queue = JSON.parse(fs.readFileSync(path.join(root, 'data/p23/never-attempted-constituencies.json'), 'utf8'));
const triage = JSON.parse(fs.readFileSync(path.join(root, 'data/p23/turnout-followup-triage.json'), 'utf8'));
const reviewOutcomes = JSON.parse(fs.readFileSync(path.join(root, 'data/p23/turnout-salvage-review-outcomes.json'), 'utf8'));

const fail = (message) => {
  console.error(`P23 turnout salvage tranche validation failed: ${message}`);
  process.exitCode = 1;
};
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const commitSha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);

const untouched = triage?.genuinely_untouched?.constituencies;
const sourceRows = queue?.constituencies;
if (!Array.isArray(untouched)) fail('triage genuinely_untouched.constituencies is missing');
if (!Array.isArray(sourceRows)) fail('source queue constituencies is missing');

const untouchedCodes = new Set(Array.isArray(untouched) ? untouched.map((row) => row.geo_code) : []);
const salvageQueue = Array.isArray(sourceRows) ? sourceRows.filter((row) => !untouchedCodes.has(row.geo_code)) : [];
const governedSalvageCount = triage?.prior_nonpromotable_attempts?.count_within_current_109_row_queue;

if (governedSalvageCount !== 85) fail(`triage governed salvage count must remain 85; saw ${governedSalvageCount}`);
if (salvageQueue.length !== governedSalvageCount) fail(`derived salvage queue must contain ${governedSalvageCount} rows; saw ${salvageQueue.length}`);

const specs = [
  { id: 'salvage-a', path: 'data/p23/turnout-salvage-tranche-a.json', start: 0, count: 8 },
  { id: 'salvage-b', path: 'data/p23/turnout-salvage-tranche-b.json', start: 8, count: 8 },
  { id: 'salvage-c', path: 'data/p23/turnout-salvage-tranche-c.json', start: 16, count: 8 },
  { id: 'salvage-d', path: 'data/p23/turnout-salvage-tranche-d.json', start: 24, count: 8 },
  { id: 'salvage-e', path: 'data/p23/turnout-salvage-tranche-e.json', start: 32, count: 8 },
  { id: 'salvage-f', path: 'data/p23/turnout-salvage-tranche-f.json', start: 40, count: 8 },
  { id: 'salvage-g', path: 'data/p23/turnout-salvage-tranche-g.json', start: 48, count: 8 },
  { id: 'salvage-h', path: 'data/p23/turnout-salvage-tranche-h.json', start: 56, count: 8 },
  { id: 'salvage-i', path: 'data/p23/turnout-salvage-tranche-i.json', start: 64, count: 8 },
  { id: 'salvage-j', path: 'data/p23/turnout-salvage-tranche-j.json', start: 72, count: 8 },
  { id: 'salvage-k', path: 'data/p23/turnout-salvage-tranche-k.json', start: 80, count: 5 },
];

const allowedPriorPrs = new Set([143, 144, 145]);
const forbiddenKeys = new Set(['source_url','form_id','source_pdf_sha256','review_context_image_sha256','verified_value','source_verified','promotion_eligible','promotion_state','turnout_pct','ballots_cast','total_valid_votes','rejected_ballots','registered_voters','candidate_vote_sum']);
const outcomeForbiddenKeys = new Set(['verified_value','source_verified','promotion_eligible','promotion_state','turnout_pct','ballots_cast','total_valid_votes','rejected_ballots','registered_voters','candidate_vote_sum','candidate_vote_totals_in_source_column_order']);

const findForbiddenKeys = (value, forbidden, location, found = []) => {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, forbidden, `${location}[${index}]`, found));
    return found;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (forbidden.has(key)) found.push(`${location}.${key}`);
    findForbiddenKeys(nested, forbidden, `${location}.${key}`, found);
  }
  return found;
};

if (reviewOutcomes?.schema_version !== 'kda.p23.turnout-salvage-review-outcomes.v1') fail('fresh review-outcomes schema changed');
const reviewGovernance = reviewOutcomes?.governance || {};
if (reviewGovernance.no_inheritance !== true) fail('fresh review outcomes must preserve no_inheritance');
if (reviewGovernance.no_promotion !== true) fail('fresh review outcomes must preserve no_promotion');
if (reviewGovernance.result_values_forbidden !== true) fail('fresh review outcomes must forbid result values');
if (reviewGovernance.fresh_official_source_required !== true) fail('fresh review outcomes must require a fresh official source');
if (reviewGovernance.fresh_hashes_required !== true) fail('fresh review outcomes must require fresh hashes');
if (reviewGovernance.required_render_dpi !== 250) fail('fresh review outcomes must require exactly 250 DPI');
if (reviewGovernance.canonical_turnout_values_must_not_be_written !== true) fail('fresh review outcomes must forbid canonical turnout writes');

const outcomeRows = reviewOutcomes?.outcomes;
if (!Array.isArray(outcomeRows) || outcomeRows.length < 1) fail('at least one governed fresh review outcome is required');
const allowedOutcomeReasons = new Set(['official_pdf_missing_results_pages']);
const outcomeByCode = new Map();
for (const [index, outcome] of Array.isArray(outcomeRows) ? outcomeRows.entries() : []) {
  const where = `review_outcomes[${index}]`;
  if (typeof outcome.geo_code !== 'string' || !/^KEN-C\d{3}-CON\d{3}$/.test(outcome.geo_code)) fail(`${where}: invalid geo_code`);
  if (outcomeByCode.has(outcome.geo_code)) fail(`${where}: duplicate fresh review outcome for ${outcome.geo_code}`);
  if (outcome.state !== 'fresh_source_reviewed_nonpromotable') fail(`${where}: only fresh_source_reviewed_nonpromotable is currently governed`);
  if (!allowedOutcomeReasons.has(outcome.reason)) fail(`${where}: unsupported non-promotable reason ${outcome.reason}`);

  const provenance = outcome.fresh_source_provenance || {};
  if (!Number.isInteger(provenance.workflow_run_id) || provenance.workflow_run_id < 1) fail(`${where}: fresh workflow run id missing`);
  if (!commitSha(provenance.workflow_head_sha)) fail(`${where}: fresh workflow head SHA invalid`);
  if (!Number.isInteger(provenance.artifact_id) || provenance.artifact_id < 1) fail(`${where}: fresh artifact id missing`);
  if (!sha(provenance.artifact_sha256)) fail(`${where}: fresh artifact digest invalid`);
  if (!sha(provenance.source_pdf_sha256)) fail(`${where}: fresh source PDF digest invalid`);

  const context = outcome.review_context || {};
  if (context.render_dpi !== 250) fail(`${where}: review context must be exactly 250 DPI`);
  if (!sha(context.review_context_image_sha256)) fail(`${where}: review-context image digest invalid`);
  if (!Number.isInteger(context.width_px) || context.width_px < 1 || !Number.isInteger(context.height_px) || context.height_px < 1) fail(`${where}: review-context dimensions invalid`);
  if (!Number.isInteger(context.served_pdf_page_count) || context.served_pdf_page_count < 1) fail(`${where}: served PDF page count invalid`);
  if (!Number.isInteger(context.reviewed_pdf_page_number) || context.reviewed_pdf_page_number < 1 || context.reviewed_pdf_page_number > context.served_pdf_page_count) fail(`${where}: reviewed page number invalid`);
  if (typeof context.visible_form_page_label !== 'string' || context.visible_form_page_label.length < 1) fail(`${where}: visible form page label missing`);

  const review = outcome.review || {};
  if (review.reviewer_class !== 'independent_visual_source_image_review') fail(`${where}: reviewer class changed`);
  if (typeof review.reviewed_by !== 'string' || review.reviewed_by.length < 1) fail(`${where}: reviewer identity missing`);
  if (review.source_image_legibility !== 'clear') fail(`${where}: source image not recorded as clear`);
  if (review.form_type_visually_confirmed !== true) fail(`${where}: Form 34B type not visually confirmed`);
  if (review.result_table_present !== false) fail(`${where}: missing-results closure requires result_table_present=false`);
  if (review.total_row_present !== false) fail(`${where}: missing-results closure requires total_row_present=false`);
  if (typeof review.finding !== 'string' || review.finding.length < 40) fail(`${where}: governed visual finding missing`);

  if (outcome.source_verification_granted !== false) fail(`${where}: fresh non-promotable outcome must not grant source verification`);
  if (outcome.promotion_authorized_by_this_record !== false) fail(`${where}: fresh non-promotable outcome must not authorize promotion`);
  if (outcome.canonical_turnout_written !== false) fail(`${where}: fresh non-promotable outcome must not write canonical turnout`);
  for (const location of findForbiddenKeys(outcome, outcomeForbiddenKeys, where)) fail(`${where}: result/promotion value forbidden at ${location}`);
  outcomeByCode.set(outcome.geo_code, outcome);
}

const canonicalSalvageCodes = new Set(salvageQueue.map(row => row.geo_code));
for (const [geoCode, outcome] of outcomeByCode) {
  if (!canonicalSalvageCodes.has(geoCode)) fail(`fresh review outcome is outside canonical salvage queue: ${geoCode}`);
  const canonical = salvageQueue.find(row => row.geo_code === geoCode);
  if (!canonical || canonical.name !== outcome.name) fail(`fresh review outcome canonical name mismatch for ${geoCode}`);
}

const seenCodes = new Set();
for (const spec of specs) {
  const filePath = path.join(root, spec.path);
  if (!fs.existsSync(filePath)) {
    fail(`${spec.id} file is missing: ${spec.path}`);
    continue;
  }
  const tranche = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const governance = tranche?.governance;
  if (tranche?.tranche?.id !== spec.id) fail(`${spec.id}: tranche.id must equal ${spec.id}`);
  if (governance?.promotion_authorized_by_this_file !== false) fail(`${spec.id}: promotion_authorized_by_this_file must remain false`);
  if (governance?.no_promotion !== true) fail(`${spec.id}: no_promotion must remain true`);
  if (governance?.no_inheritance !== true) fail(`${spec.id}: no_inheritance must remain true`);
  if (governance?.locator_recovery_only !== true) fail(`${spec.id}: locator_recovery_only must remain true`);
  if (governance?.prior_pr_evidence_is_noncanonical !== true) fail(`${spec.id}: prior PR evidence must remain noncanonical`);
  if (governance?.prior_pr_values_must_not_be_copied !== true) fail(`${spec.id}: prior PR values must not be copied`);
  if (governance?.prior_pr_hashes_must_not_be_copied !== true) fail(`${spec.id}: prior PR hashes must not be copied`);
  if (governance?.fresh_official_download_required_before_review !== true) fail(`${spec.id}: fresh official download must remain required`);
  if (governance?.fresh_hashes_required_before_review !== true) fail(`${spec.id}: fresh hashes must remain required`);
  if (governance?.required_render_dpi_for_any_new_source_verification !== 250) fail(`${spec.id}: new source verification must require exactly 250 DPI`);
  if (governance?.canonical_turnout_values_must_not_be_written_by_this_tranche !== true) fail(`${spec.id}: canonical turnout writes must remain forbidden`);

  const rows = tranche?.tranche?.rows;
  if (!Array.isArray(rows)) {
    fail(`${spec.id}: tranche.rows must be an array`);
    continue;
  }
  if (tranche?.tranche?.count !== rows.length) fail(`${spec.id}: tranche.count must equal rows.length`);
  if (rows.length !== spec.count) fail(`${spec.id}: tranche must contain exactly ${spec.count} rows`);

  const expected = salvageQueue.slice(spec.start, spec.start + spec.count);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const exp = expected[i];
    if (!exp || row.geo_code !== exp.geo_code || row.name !== exp.name) fail(`${spec.id}: row ${i + 1} must match canonical salvage queue positions ${spec.start + 1}-${spec.start + spec.count}`);
    const governedOutcome = outcomeByCode.get(row.geo_code);
    const expectedState = governedOutcome ? governedOutcome.state : 'locator_recovered_pending_fresh_review';
    if (row.state !== expectedState) fail(`${spec.id}: row ${i + 1} state must be ${expectedState}; saw ${row.state}`);
    if (seenCodes.has(row.geo_code)) fail(`${spec.id}: duplicate geo_code across salvage tranches: ${row.geo_code}`);
    seenCodes.add(row.geo_code);

    const locator = row.prior_locator;
    if (!locator || !Array.isArray(locator.pull_requests) || locator.pull_requests.length < 1) fail(`${spec.id}: row ${i + 1} must preserve at least one closed-PR locator`);
    else for (const pr of locator.pull_requests) if (!allowedPriorPrs.has(pr)) fail(`${spec.id}: row ${i + 1} references non-governed prior PR ${pr}`);
    if (!locator || !Array.isArray(locator.files) || locator.files.length < 1) fail(`${spec.id}: row ${i + 1} must preserve at least one prior evidence-file locator`);
    else for (const file of locator.files) if (typeof file !== 'string' || !/^data\/p23\/form34b-.+-source-verification\.json$/.test(file)) fail(`${spec.id}: row ${i + 1} has invalid prior evidence-file locator ${file}`);
    if (typeof locator?.prior_disposition !== 'string' || locator.prior_disposition.length === 0) fail(`${spec.id}: row ${i + 1} must preserve a non-authoritative prior disposition label`);
    for (const location of findForbiddenKeys(row, forbiddenKeys, `${spec.id}.rows[${i}]`)) fail(`${spec.id}: prior locator row contains forbidden inherited source/value field at ${location}`);
  }

  const forbiddenStates = tranche?.forbidden_until_fresh_source_review;
  for (const required of ['source_verified','promotion_eligible','explicit_materialization_authorized']) {
    if (!Array.isArray(forbiddenStates) || !forbiddenStates.includes(required)) fail(`${spec.id}: forbidden_until_fresh_source_review must include ${required}`);
  }
}

if (seenCodes.size !== governedSalvageCount) fail(`salvage tranches must cover all ${governedSalvageCount} unique canonical rows; saw ${seenCodes.size}`);
for (const geoCode of outcomeByCode.keys()) if (!seenCodes.has(geoCode)) fail(`fresh review outcome is not represented in governed tranches: ${geoCode}`);

if (!process.exitCode) {
  const reviewed = outcomeByCode.size;
  console.log(`P23 turnout salvage tranche validation passed: ${salvageQueue.length} canonical salvage rows governed; reviewed_nonpromotable=${reviewed} pending_fresh_review=${governedSalvageCount - reviewed}; fresh hashes + exactly 250-DPI review required; no promotion.`);
}
