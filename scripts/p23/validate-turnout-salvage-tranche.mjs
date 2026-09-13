import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const queue = read('data/p23/never-attempted-constituencies.json');
const triage = read('data/p23/turnout-followup-triage.json');
const fail = (message) => { console.error(`P23 turnout salvage tranche validation failed: ${message}`); process.exitCode = 1; };

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
  ['salvage-a',0,8],['salvage-b',8,8],['salvage-c',16,8],['salvage-d',24,8],
  ['salvage-e',32,8],['salvage-f',40,8],['salvage-g',48,8],['salvage-h',56,8],
  ['salvage-i',64,8],['salvage-j',72,8],['salvage-k',80,5],
].map(([id,start,count]) => ({id,start,count,path:`data/p23/turnout-salvage-tranche-${id.slice(-1)}.json`}));

const allowedPriorPrs = new Set([143,144,145]);
const forbiddenKeys = new Set(['source_url','form_id','source_pdf_sha256','review_context_image_sha256','verified_value','source_verified','promotion_eligible','promotion_state','turnout_pct','ballots_cast','total_valid_votes','rejected_ballots','registered_voters','candidate_vote_sum']);
const findForbiddenKeys = (value, location, found = []) => {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) { value.forEach((item,index) => findForbiddenKeys(item,`${location}[${index}]`,found)); return found; }
  for (const [key,nested] of Object.entries(value)) { if (forbiddenKeys.has(key)) found.push(`${location}.${key}`); findForbiddenKeys(nested,`${location}.${key}`,found); }
  return found;
};

const seenCodes = new Set();
for (const spec of specs) {
  const filePath = path.join(root,spec.path);
  if (!fs.existsSync(filePath)) { fail(`${spec.id} file is missing: ${spec.path}`); continue; }
  const tranche = read(spec.path);
  const governance = tranche?.governance;
  if (tranche?.tranche?.id !== spec.id) fail(`${spec.id}: tranche.id must equal ${spec.id}`);
  const requiredGovernance = {
    promotion_authorized_by_this_file:false,no_promotion:true,no_inheritance:true,locator_recovery_only:true,
    prior_pr_evidence_is_noncanonical:true,prior_pr_values_must_not_be_copied:true,prior_pr_hashes_must_not_be_copied:true,
    fresh_official_download_required_before_review:true,fresh_hashes_required_before_review:true,
    required_render_dpi_for_any_new_source_verification:250,canonical_turnout_values_must_not_be_written_by_this_tranche:true,
  };
  for (const [key,expected] of Object.entries(requiredGovernance)) if (governance?.[key] !== expected) fail(`${spec.id}: governance.${key} must remain ${expected}`);
  const rows = tranche?.tranche?.rows;
  if (!Array.isArray(rows)) { fail(`${spec.id}: tranche.rows must be an array`); continue; }
  if (tranche?.tranche?.count !== rows.length) fail(`${spec.id}: tranche.count must equal rows.length`);
  if (rows.length !== spec.count) fail(`${spec.id}: tranche must contain exactly ${spec.count} rows`);
  const expected = salvageQueue.slice(spec.start,spec.start+spec.count);
  for (let i=0;i<rows.length;i+=1) {
    const row=rows[i], exp=expected[i];
    if (!exp || row.geo_code !== exp.geo_code || row.name !== exp.name) fail(`${spec.id}: row ${i+1} must match canonical salvage queue positions ${spec.start+1}-${spec.start+spec.count}`);
    if (row.state !== 'locator_recovered_pending_fresh_review') fail(`${spec.id}: row ${i+1} must remain locator_recovered_pending_fresh_review before a fresh source review`);
    if (seenCodes.has(row.geo_code)) fail(`${spec.id}: duplicate geo_code across salvage tranches: ${row.geo_code}`); seenCodes.add(row.geo_code);
    const locator=row.prior_locator;
    if (!locator || !Array.isArray(locator.pull_requests) || locator.pull_requests.length<1) fail(`${spec.id}: row ${i+1} must preserve at least one closed-PR locator`);
    else for (const pr of locator.pull_requests) if (!allowedPriorPrs.has(pr)) fail(`${spec.id}: row ${i+1} references non-governed prior PR ${pr}`);
    if (!locator || !Array.isArray(locator.files) || locator.files.length<1) fail(`${spec.id}: row ${i+1} must preserve at least one prior evidence-file locator`);
    else for (const file of locator.files) if (typeof file !== 'string' || !/^data\/p23\/form34b-.+-source-verification\.json$/.test(file)) fail(`${spec.id}: row ${i+1} has invalid prior evidence-file locator ${file}`);
    if (typeof locator?.prior_disposition !== 'string' || locator.prior_disposition.length===0) fail(`${spec.id}: row ${i+1} must preserve a non-authoritative prior disposition label`);
    for (const location of findForbiddenKeys(row,`${spec.id}.rows[${i}]`)) fail(`${spec.id}: prior locator row contains forbidden inherited source/value field at ${location}`);
  }
  const forbiddenStates=tranche?.forbidden_until_fresh_source_review;
  for (const required of ['source_verified','promotion_eligible','explicit_materialization_authorized']) if (!Array.isArray(forbiddenStates) || !forbiddenStates.includes(required)) fail(`${spec.id}: forbidden_until_fresh_source_review must include ${required}`);
}
if (seenCodes.size !== 85) fail(`all salvage tranches must cover exactly 85 unique canonical rows; saw ${seenCodes.size}`);
if (!process.exitCode) console.log('P23 turnout salvage tranche validation passed: all 85 canonical salvage rows are covered by salvage-a through salvage-k as locator-only; fresh download + fresh hashes + exactly 250-DPI review required; no promotion.');
