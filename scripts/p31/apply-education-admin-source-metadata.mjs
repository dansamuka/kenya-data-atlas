// P31 -- records the source investigation for the four TSC/NEMIS-derived education
// establishment indicators (Primary classroom teachers, Public primary schools, Public
// secondary schools, Secondary teachers) on the canonical indicator registry.
//
// These four indicators previously carried an empty expected_source / expected_source_url,
// unlike most of the registry. P31 investigated NEMIS, opendata.go.ke, the Ministry of
// Education's Basic Education Statistical Booklet, KNBS's Economic Survey, the TSC website
// and KNBS's 2024 National School Census (pilot report) as candidate constituency-level
// sources; none publish these four indicators below county today (see the P31 evidence-state
// entries in data/completeness/local-54-education-admin-evidence-states.json for the full, cited
// investigation). This
// script records that finding directly on the registry so expected_source is never blank for
// an active, published indicator, matching the convention set by scripts/p23/build-
// constituency-mps.mjs.
//
// Run as part of `npm run indicators:build`, after build-registry.mjs regenerates
// data/indicators/registry/indicators.json from its seed, so the patch survives every rebuild.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const idir = 'data/indicators/registry';
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const csvCell = v => `"${String(Array.isArray(v) ? v.join('|') : v ?? '').replaceAll('"', '""')}"`;
const unionFields = rows => [...new Set(rows.flatMap(r => Object.keys(r)))];
const csv = rows => { const f = unionFields(rows); return [f.join(','), ...rows.map(r => f.map(k => csvCell(r[k])).join(','))].join('\n') + '\n'; };

const PWPER_URL = 'https://www.education.go.ke/sites/default/files/2023-08/B5%20REPORT%20OF%20THE%20PRESIDENTIAL%20WORKING%20PARTY%20ON%20EDUCATION%20REFORM%207th%20JULY%202023%20.pdf';
const EXPECTED_SOURCE = "Teachers Service Commission (TSC) 2023 establishment data, as tabulated by county in the Ministry of Education's Presidential Working Party on Education Reform (PWPER) report; investigated but not found published below county at NEMIS, opendata.go.ke, the Basic Education Statistical Booklet, the KNBS Economic Survey or the TSC website -- see data/completeness/local-54-education-admin-evidence-states.json (contract_id P31-EDUCATION-ADMIN-CONSTITUENCY-CLOSURE-2026-09-18) for the full cited investigation.";

const patches = [
  {
    code: 'IND-PUBLIC-PRIMARY-SCHOOLS',
    expected_availability_note: "County-level only (Appendix 4.5 of the PWPER July 2023 report, 'TSC 2023'). P31 (2026-09-18) checked NEMIS (login-gated, HTTPS unreachable), opendata.go.ke (dataset-search API returns HTTP 401), the Basic Education Statistical Booklet (county is its finest published tier in every edition located), the KNBS Economic Survey (national time series only) and the TSC website (no sub-county staffing dataset); none publish this indicator below county. KNBS's 2024 National School Census questionnaire captures constituency/ward per institution, but only an 8-county pilot report has been published -- the main national results are not yet released. P32 (2026-09-19) re-checked ward level: NEMIS and opendata.go.ke are now unreachable outright (not just login/401-gated); the 2026 Economic Survey's Chapter 15 tables remain national-only; and the pilot report's only results table (674 institutions, 8 counties) tabulates by County/Sub-County/Zone with all school types and ownership combined -- no ward-tagged, public-only figure exists even for the pilot counties."
  },
  {
    code: 'IND-PRIMARY-CLASSROOM-TEACHERS',
    expected_availability_note: "County-level only (Appendix 4.5 of the PWPER July 2023 report, 'TSC 2023'). P31 (2026-09-18) checked NEMIS (login-gated, HTTPS unreachable), opendata.go.ke (dataset-search API returns HTTP 401), the Basic Education Statistical Booklet (county is its finest published tier in every edition located), the KNBS Economic Survey (national time series only) and the TSC website (no sub-county staffing dataset); none publish this indicator below county. KNBS's 2024 National School Census questionnaire captures constituency/ward per institution, but only an 8-county pilot report has been published -- the main national results are not yet released. P32 (2026-09-19) re-checked ward level: NEMIS and opendata.go.ke are now unreachable outright (not just login/401-gated); the 2026 Economic Survey's Chapter 15 tables (incl. Table 15.7, teachers by qualification/sex) remain national-only; and the pilot report publishes zero teacher counts at any geography, let alone ward."
  },
  {
    code: 'IND-PUBLIC-SECONDARY-SCHOOLS',
    expected_availability_note: "County-level only (Appendix 4.6 of the PWPER July 2023 report, 'TSC 2023'). P31 (2026-09-18) checked NEMIS (login-gated, HTTPS unreachable), opendata.go.ke (dataset-search API returns HTTP 401), the Basic Education Statistical Booklet (county is its finest published tier in every edition located), the KNBS Economic Survey (national time series only) and the TSC website (no sub-county staffing dataset); none publish this indicator below county. KNBS's 2024 National School Census questionnaire captures constituency/ward per institution, but only an 8-county pilot report has been published -- the main national results are not yet released. P32 (2026-09-19) re-checked ward level: NEMIS and opendata.go.ke are now unreachable outright (not just login/401-gated); the 2026 Economic Survey's Chapter 15 tables remain national-only; and the pilot report's only results table (674 institutions, 8 counties) tabulates by County/Sub-County/Zone with all school types and ownership combined -- no ward-tagged, public-only figure exists even for the pilot counties."
  },
  {
    code: 'IND-SECONDARY-TEACHERS',
    expected_availability_note: "County-level only (Appendix 4.6 of the PWPER July 2023 report, 'TSC 2023'). P31 (2026-09-18) checked NEMIS (login-gated, HTTPS unreachable), opendata.go.ke (dataset-search API returns HTTP 401), the Basic Education Statistical Booklet (county is its finest published tier in every edition located), the KNBS Economic Survey (national time series only) and the TSC website (no sub-county staffing dataset); none publish this indicator below county. KNBS's 2024 National School Census questionnaire captures constituency/ward per institution, but only an 8-county pilot report has been published -- the main national results are not yet released. P32 (2026-09-19) re-checked ward level: NEMIS and opendata.go.ke are now unreachable outright (not just login/401-gated); the 2026 Economic Survey's Chapter 15 tables (incl. Table 15.11, secondary teachers by qualification/sex) remain national-only; and the pilot report publishes zero teacher counts at any geography, let alone ward. TSC's continued non-disclosure of sub-county teacher deployment data is corroborated by a September 2026 news report describing lawyers formally demanding TSC release its 2022-2026 recruitment data by county/sub-county."
  }
];

const indicators = await readJson(`${idir}/indicators.json`);
const byCode = new Map(indicators.map(i => [i.indicator_code, i]));

for (const patch of patches) {
  const indicator = byCode.get(patch.code);
  if (!indicator) throw new Error(`P31 education admin metadata: unknown indicator_code ${patch.code}`);
  Object.assign(indicator, {
    expected_source: EXPECTED_SOURCE,
    expected_source_url: PWPER_URL,
    expected_availability_note: patch.expected_availability_note,
    methodology_url: indicator.methodology_url || PWPER_URL
  });
}

await writeFile(path.join(root, `${idir}/indicators.json`), JSON.stringify(indicators, null, 2) + '\n');
await writeFile(path.join(root, `${idir}/indicators.csv`), csv(indicators));

console.log(`P31_EDUCATION_ADMIN_METADATA_OK patched=${patches.length}`);
