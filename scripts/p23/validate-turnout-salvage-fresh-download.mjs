import fs from 'node:fs';
import path from 'node:path';

const manifestPath = process.argv[2] || '/tmp/p23-turnout-salvage-a-fresh-download.json';
const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const tranche = JSON.parse(fs.readFileSync(path.join(root, 'data/p23/turnout-salvage-tranche-a.json'), 'utf8'));
const sourceIndex = JSON.parse(fs.readFileSync(path.join(root, 'data/p23/form34b-source-index-contract.json'), 'utf8'));

const fail = (message) => {
  console.error(`P23 salvage fresh-download validation failed: ${message}`);
  process.exitCode = 1;
};

if (manifest?.schema_version !== 'kda.p23.turnout-salvage-fresh-download.v1') fail('unexpected schema_version');
if (manifest?.tranche !== 'salvage-a') fail('manifest must target salvage-a');
if (manifest?.governance?.no_inheritance !== true) fail('no_inheritance must remain true');
if (manifest?.governance?.no_promotion !== true) fail('no_promotion must remain true');
if (manifest?.governance?.result_values_forbidden !== true) fail('result_values_forbidden must remain true');
if (manifest?.governance?.fresh_hashes_only !== true) fail('fresh_hashes_only must remain true');
if (manifest?.governance?.review_context_not_created !== true) fail('review_context_not_created must remain true');
if (manifest?.governance?.required_render_dpi_for_future_review !== 250) fail('future review must remain exactly 250 DPI');

const forbiddenKeys = new Set([
  'registered_voters', 'total_valid_votes', 'rejected_ballots', 'turnout_pct',
  'candidate_vote_sum', 'verified_value', 'source_verified', 'promotion_eligible',
  'promotion_state', 'explicit_materialization_authorized', 'review_context_image_sha256'
]);
const scan = (value, location = 'manifest') => {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, `${location}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) fail(`forbidden result/promotion field at ${location}.${key}`);
    scan(nested, `${location}.${key}`);
  }
};
scan(manifest);

const rows = manifest?.rows;
const expected = tranche?.tranche?.rows;
if (!Array.isArray(rows) || rows.length !== 8) fail(`expected exactly 8 manifest rows; saw ${Array.isArray(rows) ? rows.length : 'missing'}`);
if (!Array.isArray(expected) || expected.length !== 8) fail('governed salvage-a must contain 8 rows');

const offset = sourceIndex?.source_index_relation?.form_id_offset;
const template = sourceIndex?.source_index_relation?.download_url_template;
if (offset !== 277628) fail(`source-index form_id_offset drifted: ${offset}`);
if (template !== 'https://forms.iebc.or.ke/index.php?r=site%2Fdownload&id={form_id}') fail('source-index download template drifted');

const allowedStates = new Set([
  'fresh_official_source_downloaded_unreviewed',
  'fresh_official_source_http_error',
  'fresh_official_source_transport_error',
  'fresh_official_source_transport_nonpdf',
]);
let downloaded = 0;
for (let i = 0; i < (rows || []).length; i += 1) {
  const row = rows[i];
  const exp = expected[i];
  if (row?.geo_code !== exp?.geo_code || row?.name !== exp?.name) fail(`row ${i + 1} does not match canonical salvage-a order`);
  const codeMatch = /^KEN-C\d{3}-CON(\d{3})$/.exec(row?.geo_code || '');
  if (!codeMatch) {
    fail(`row ${i + 1} has invalid geo_code`);
    continue;
  }
  const constituencyCode = Number(codeMatch[1]);
  const formId = constituencyCode + offset;
  const expectedUrl = template.replace('{form_id}', String(formId));
  if (row?.constituency_code !== constituencyCode) fail(`row ${i + 1} constituency_code mismatch`);
  if (row?.locator_basis !== 'governed_source_index_formula') fail(`row ${i + 1} must use governed source-index formula only`);
  if (row?.form_id !== formId) fail(`row ${i + 1} form_id does not match governed formula`);
  if (row?.source_url !== expectedUrl) fail(`row ${i + 1} source_url does not match governed official template`);
  if (row?.fresh_download_attempted !== true) fail(`row ${i + 1} must record a fresh download attempt`);
  if (row?.promotion_authorized_by_this_record !== false) fail(`row ${i + 1} must not authorize promotion`);
  if (!allowedStates.has(row?.state)) fail(`row ${i + 1} has invalid state ${row?.state}`);
  if (row?.state === 'fresh_official_source_downloaded_unreviewed') {
    downloaded += 1;
    if (row?.pdf_magic_confirmed !== true) fail(`row ${i + 1} downloaded state requires PDF magic`);
    if (!Number.isInteger(row?.bytes) || row.bytes <= 0) fail(`row ${i + 1} downloaded state requires positive byte count`);
    if (typeof row?.source_pdf_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.source_pdf_sha256)) fail(`row ${i + 1} downloaded state requires fresh sha256`);
  } else if ('source_pdf_sha256' in row) {
    fail(`row ${i + 1} must not carry a sha256 when no PDF was freshly downloaded`);
  }
}

if (!process.exitCode) {
  console.log(`P23 salvage fresh-download validation passed: rows=8 downloaded_pdf=${downloaded}; locator-only source-index formula; no values; no promotion; 250-DPI review remains future-gated.`);
}
