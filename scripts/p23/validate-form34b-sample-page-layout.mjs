import fs from 'node:fs';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const layout = readJson('data/p23/form34b-sample-page-layout-contract.json');
const ocr = readJson('data/p23/form34b-ocr-feasibility-contract.json');
const extraction = readJson('data/p23/form34b-extraction-contract.json');

const fail = message => { throw new Error(message); };
const sample = ocr.sample || {};
const governed = layout.sample || {};

if (layout.schema_version !== 'kda.p23.form34b-sample-page-layout.v1') fail('Unexpected sample page-layout schema');
if (layout.source_contract !== 'data/p23/form34b-ocr-feasibility-contract.json') fail('Sample layout must point to OCR contract');
if (layout.extraction_contract !== 'data/p23/form34b-extraction-contract.json') fail('Sample layout must point to extraction contract');
if (Number(governed.constituency_code) !== Number(sample.constituency_code)) fail('Sample constituency code drift');
if (governed.geo_code !== sample.geo_code) fail('Sample geo_code drift');
if (Number(governed.form_id) !== Number(sample.form_id)) fail('Sample Form 34B ID drift');
if (Number(governed.page_count) !== Number(sample.expected_pages)) fail('Sample page-count drift');

const pages = Array.isArray(layout.page_roles) ? layout.page_roles : [];
if (pages.length !== Number(sample.expected_pages)) fail(`Expected ${sample.expected_pages} governed page roles, got ${pages.length}`);
const numbers = pages.map(page => Number(page.page_number)).sort((a,b)=>a-b);
if (numbers.join(',') !== '1,2,3') fail(`Unexpected governed page identities: ${numbers.join(',')}`);
const totals = pages.filter(page => page.contains_final_total_row === true);
if (totals.length !== 1 || Number(totals[0].page_number) !== 2) fail('Exactly page 2 must be governed as the sample final TOTAL-row page');
if (pages.find(page => Number(page.page_number) === 1)?.contains_final_total_row !== false) fail('Page 1 must remain non-final');
if (pages.find(page => Number(page.page_number) === 3)?.contains_final_total_row !== false) fail('Page 3 must remain non-result administrative evidence');

const route = layout.extraction_route || {};
if (route.preferred !== 'direct_final_total_row') fail('Sample extraction route must prefer direct final TOTAL row');
if (Number(route.target_page_for_sample) !== 2) fail('Sample target page must remain page 2');
const required = Object.keys(extraction.numeric_fields || {}).sort();
const target = [...(route.target_fields || [])].sort();
if (required.join(',') !== target.join(',')) fail(`Sample target fields do not match extraction contract: ${target.join(',')}`);
if (route.polling_station_aggregation !== 'reconciliation_only') fail('Polling-station aggregation must remain reconciliation-only');

const governance = layout.governance || {};
if (governance.values_recorded_in_this_contract !== false) fail('Page-layout contract must not record result values');
if (Number(governance.source_verified_values) !== 0) fail('Page-layout contract cannot source-verify values');
if (governance.promotion_authorized !== false) fail('Page-layout contract cannot authorize promotion');
if (governance.no_inheritance !== true) fail('No-inheritance guard must remain true');
if (governance.no_page_subtotal_promotion !== true) fail('Page-subtotal promotion guard must remain true');

console.log('P23_FORM34B_SAMPLE_PAGE_LAYOUT_VALID pages=3 total_row_page=2 direct_total_route=true values_recorded=0 source_verified=0 promotion_authorized=false');
