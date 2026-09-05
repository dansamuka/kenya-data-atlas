#!/usr/bin/env node
import fs from 'node:fs';

const path = process.argv[2];
if (!path) throw new Error('Usage: validate-form34b-grid-smoke.mjs <artifact.json>');
const doc = JSON.parse(fs.readFileSync(path, 'utf8'));
const assert = (ok, msg) => { if (!ok) throw new Error(`P23 Form 34B grid smoke validation: ${msg}`); };

assert(doc.schema_version === 'kda.p23.form34b.grid-smoke.v1', 'schema version');
assert(doc.rows_processed === 10, `expected 10 rows, got ${doc.rows_processed}`);
assert(doc.source_verified_values === 0, 'source_verified_values must remain zero');
assert(doc.promotion_authorized === false, 'promotion must remain blocked');
assert(Array.isArray(doc.rows) && doc.rows.length === 10, 'rows must contain exactly 10 records');

for (const row of doc.rows) {
  assert(Number.isInteger(row.constituency_code) && row.constituency_code >= 1 && row.constituency_code <= 290, 'invalid constituency code');
  assert(row.source_verified_values === 0, `row ${row.constituency_code} source verification leaked`);
  assert(row.promotion_authorized === false, `row ${row.constituency_code} promotion leaked`);
  assert(typeof row.source_pdf_sha256 === 'string' && /^[0-9a-f]{64}$/.test(row.source_pdf_sha256), `row ${row.constituency_code} PDF digest`);
  assert(Number.isInteger(row.page_count) && row.page_count > 0, `row ${row.constituency_code} page count`);
  assert(Array.isArray(row.page_diagnostics) && row.page_diagnostics.length === row.page_count, `row ${row.constituency_code} page diagnostics`);
}

const changamwe = doc.rows.find((row) => row.constituency_code === 1 && row.constituency_name === 'Changamwe');
assert(changamwe, 'Changamwe anchor missing');
assert(changamwe.final_rows_found === 1, 'Changamwe must retain exactly one denominator-matched final row');
assert(changamwe.total_row_page === 2, `Changamwe final row must remain on page 2, got ${changamwe.total_row_page}`);
assert(changamwe.denominator_match === true, 'Changamwe denominator match must remain true');
assert(changamwe.arithmetic_ok === true, 'Changamwe arithmetic reconciliation must remain true');
assert(changamwe.turnout_range_ok === true, 'Changamwe turnout range must remain true');
assert(changamwe.verification_state === 'strong_machine_candidate', 'Changamwe must remain a strong machine candidate');

const promoted = doc.rows.filter((row) => row.source_verified_values !== 0 || row.promotion_authorized !== false);
assert(promoted.length === 0, 'no smoke row may become promotable');
console.log(`P23_FORM34B_GRID_SMOKE_VALID rows=${doc.rows.length} strong_machine_candidates=${doc.strong_machine_candidates} source_verified_values=0 promotion_authorized=false`);
