// P31 -- Build data/completeness/local-54-gcp-census-evidence-states.json
//
// Genuinely-investigated, specifically-cited constituency-level governed closures for 10 P31
// indicators (5 Gross County Product national-accounts indicators + 5 2019/2009-census-derived
// household/population indicators), replacing the generic P29 "zero active series" closure with
// primary-source-verified reasons. Mirrors the pattern already used by the sibling P31 education-
// admin batch (data/completeness/local-54-education-admin-evidence-states.json): this file is
// consumed additively by scripts/p29/build-local-54-slot-ledger.mjs and never touches the shared
// data/completeness/evidence-states.json or the legacy P18 slot ledger it is validated against.
//
// Investigation performed 2026-09-18 (see PR description for full source list):
//   - KNBS Gross County Product 2019 methodology report (downloaded and read directly, full text):
//     https://www.knbs.or.ke/wp-content/uploads/2023/08/Kenya-Gross-County-Product-2019.pdf
//     Confirms GCP is a top-down allocation of national GDP/GVA to the 47 counties using
//     distribution keys (output, employment, wages, population); its own Section 2.1 states
//     national-level source data "is available but without sufficient disaggregation at the
//     county level" and that KNBS's national samples are "not designed to collect accurate
//     regional-level information" -- i.e. even county GCP is a modelled allocation, and the
//     underlying source surveys (2009 KPHC, MSME Survey 2016, CIP 2010/2018, COE 2017, KIHBS
//     2015/16, county government financial data) were never compiled at constituency
//     granularity. Annex I ("County Contribution to Agriculture Gross Value Added") and Annex II
//     ("County Contribution to Manufacturing Gross Value Added") are the report's finest sectoral
//     breakdown and both stop at county. KNBS's live Gross County Product portal
//     (https://www.knbs.or.ke/gross-county-product/), which lists every GCP edition released
//     since 2019 (through 2024/2025), was also checked directly and confirms every edition
//     remains county-level only -- no sub-county or constituency GCP has ever been published.
//   - KNBS 2019 KPHC Volume IV (Distribution of Population by Socio-Economic Characteristics),
//     downloaded and read directly:
//     https://www.knbs.or.ke/wp-content/uploads/2023/09/2019-Kenya-population-and-Housing-Census-Volume-4-Distribution-of-Population-by-Socio-Economic-Characteristics.pdf
//     Its own List of Tables confirms Table 2.13 (dominant wall material) and Table 2.36
//     (household asset ownership, including car and motorcycle) are both published only to
//     "Area of Residence, County and Sub-County" -- the same finest tier ("sub-county") this
//     project has already established (data/p23/constituency-census-closure-contract.json) is a
//     different, non-coterminous geography from the 290 IEBC electoral constituencies (e.g. Kwale
//     County has 5 KNBS sub-counties against 4 IEBC constituencies; Meru has 11 KNBS sub-counties
//     against 9 IEBC constituencies), with no authoritative published crosswalk.
//   - KNBS 2019 KPHC Analytical Report on Education and Training, downloaded and read directly:
//     https://www.knbs.or.ke/wp-content/uploads/2023/09/2019-Kenya-population-and-Housing-Census-Analytical-Report-on-Education-and-Training.pdf
//     Its school-attendance/internet/mobile-phone tables break out national/rural/urban and all 47
//     counties by name -- county is the finest tier in this analytical report (coarser even than
//     Volume IV's county+sub-county tables).
//   - KNBS 2009 KPHC Volume 1B (Population Distribution by Political Units), downloaded and read
//     directly:
//     https://www.knbs.or.ke/wp-content/uploads/2023/09/2009-Kenya-population-and-Housing-Census-Volume-1B-Population-Distribution-by-Political-Units.pdf
//     Its own text states results "are tabulated for the 210 constituencies and the 47 counties in
//     Kenya" -- the pre-2012-delimitation configuration, not the current 290-constituency
//     boundary_version 2012-01 this Atlas uses, and not further disaggregated. This reproduces,
//     for the 2009 census, the identical 210-vs-290 vintage/boundary mismatch this project already
//     established for the 2019 census (data/p23/constituency-census-closure-contract.json,
//     IND-POPULATION decision).
//
// All 10 indicators are confirmed genuinely unavailable at constituency level: structurally for
// the 5 GCP indicators (the input national-accounts data itself has never been disaggregated
// below county), and via a documented, non-crosswalkable boundary mismatch for the 5 census
// indicators (KNBS's finest tier -- sub-county, or in the case of the 2009 count, the pre-2012
// 210-constituency configuration -- does not reconcile 1:1 with the current 290 IEBC
// constituencies). No value is allocated, interpolated or spatially split from a county figure.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const outPath = path.join(root, 'data/completeness/local-54-gcp-census-evidence-states.json');

const geographies = readJson('data/geography/registry/geographies.json');
const constituencyGeoCodes = geographies
  .filter(g => g.level === 'constituency')
  .map(g => g.geo_code)
  .sort();

if (constituencyGeoCodes.length !== 290) {
  throw new Error(`Expected 290 constituency geo_codes, got ${constituencyGeoCodes.length}`);
}

const GCP_SOURCE = 'KNBS -- Gross County Product 2019 (methodology report) and Gross County Product portal (2019-2025 editions)';
const GCP_SOURCE_URL = 'https://www.knbs.or.ke/wp-content/uploads/2023/08/Kenya-Gross-County-Product-2019.pdf';
const GCP_PORTAL_URL = 'https://www.knbs.or.ke/gross-county-product/';

function gcpReason(sectorLabel, annexLabel) {
  return `KNBS's Gross County Product (GCP) 2019 methodology report (${GCP_SOURCE_URL}) was downloaded and read directly in full. GCP is compiled exclusively at the 47-county level using a "top-down" allocation of national GDP/GVA-by-activity: the report's own Section 2.1 ("Introduction") states that national-level income and expenditure source data "is available but without sufficient disaggregation at the county level," and that KNBS's national survey samples used to build national GDP are "not designed to collect accurate regional-level information" -- i.e. even the county-level GCP figures are themselves a modelled allocation using distribution keys (output, employment, wages, salaries, population) derived from national surveys and censuses (2009 KPHC, MSME Survey 2016, Census of Industrial Production 2010/2018, Census of Establishments 2017, 2015/16 Kenya Integrated Household Budget Survey, and a bespoke county government data collection conducted in June 2018) that were themselves never compiled at constituency granularity. The report's finest sectoral breakdown for ${sectorLabel} is ${annexLabel}, which presents county-level figures only; the report's entire table of contents (Sections 3.2-3.7: Gross County Product in current/constant prices, real per-capita GCP, percentage contribution to gross value added, GCP per county, county share of GCP) and its bespoke 2018 primary data collection are structured exclusively around the 47 counties. KNBS's live Gross County Product portal (${GCP_PORTAL_URL}), which lists every annual GCP edition released since the inaugural 2019 report (through the 2024 and 2025 editions), was checked directly and confirms every subsequent edition also remains county-level only -- no sub-county or constituency GCP, GVA-by-activity, or sectoral-share table has ever been published. This is a structural gap, not merely a publication gap: the underlying national-accounts input data itself lacks the granularity a genuine constituency-level estimate would require. Under data/policy/local-54-indicator-contract.json's economic_accounts_small_area treatment class, a resolved local value would require a direct local record, an exact aggregation, or a transparently labelled, validated model -- its own condition explicitly forbids "population/land/equal-share parent allocation presented as observed output," which is what apportioning the published county figure to 290 constituencies (whether by population, land area or equal share) would amount to. No such genuine constituency-level source or defensible model currently exists, so this cell is closed as official_unavailable pending KNBS publishing constituency-level national accounts.`;
}

const KPHC_VOL4_URL = 'https://www.knbs.or.ke/wp-content/uploads/2023/09/2019-Kenya-population-and-Housing-Census-Volume-4-Distribution-of-Population-by-Socio-Economic-Characteristics.pdf';
const CROSSWALK_NOTE = 'This project has already independently established (data/p23/constituency-census-closure-contract.json, IND-HOUSEHOLD-SIZE decision) that KNBS administrative sub-counties are a different, non-coterminous geography from the 290 IEBC electoral constituencies with no authoritative published crosswalk -- for example Kwale County has 5 KNBS sub-counties (Kinango, Lunga Lunga, Matuga, Msambweni, Samburu) against Kwale\'s 4 IEBC constituencies, and Meru County has 11 KNBS sub-counties against Meru\'s 9 IEBC constituencies. Aggregating or name-matching sub-counties into constituencies without such a crosswalk would fabricate a value the source does not itself publish.';

function kphcVol4Reason(tableLabel, tableTitle) {
  return `KNBS's 2019 KPHC Volume IV (Distribution of Population by Socio-Economic Characteristics, ${KPHC_VOL4_URL}) was downloaded and its full List of Tables inspected directly. ${tableLabel} ("${tableTitle}") is published only to "Area of Residence, County and Sub-County" -- its own title confirms sub-county is the finest geographic tier, not the current 290 IEBC constituencies. ${CROSSWALK_NOTE} Under data/policy/local-54-indicator-contract.json's census_or_household_crosswalk treatment class, a resolved local value requires "exact electoral geography or a defensible documented crosswalk" and any "boundary mismatch must be disclosed" -- no such crosswalk exists, so this cell is closed as official_unavailable rather than fabricating a value from the published sub-county table.`;
}

const states = [
  {
    contract_id: 'P31-GCP-CENSUS-CONSTITUENCY-CLOSURE-2026-09-18',
    level: 'constituency',
    indicator_code: 'IND-AGRICULTURE-GCP-SHARE',
    status: 'official_unavailable',
    geo_codes: constituencyGeoCodes,
    period_label: 'GCP 2013-2017 series (2019 report) through 2024/2025 editions -- current 290-constituency boundary',
    source: GCP_SOURCE,
    source_url: GCP_SOURCE_URL,
    reason: gcpReason('agriculture', 'Annex I ("County Contribution to Agriculture Gross Value Added")')
  },
  {
    contract_id: 'P31-GCP-CENSUS-CONSTITUENCY-CLOSURE-2026-09-18',
    level: 'constituency',
    indicator_code: 'IND-AGRICULTURE-GVA',
    status: 'official_unavailable',
    geo_codes: constituencyGeoCodes,
    period_label: 'GCP 2013-2017 series (2019 report) through 2024/2025 editions -- current 290-constituency boundary',
    source: GCP_SOURCE,
    source_url: GCP_SOURCE_URL,
    reason: gcpReason('agriculture gross value added', 'Annex I ("County Contribution to Agriculture Gross Value Added")')
  },
  {
    contract_id: 'P31-GCP-CENSUS-CONSTITUENCY-CLOSURE-2026-09-18',
    level: 'constituency',
    indicator_code: 'IND-GCP-CURRENT',
    status: 'official_unavailable',
    geo_codes: constituencyGeoCodes,
    period_label: 'GCP 2013-2017 series (2019 report) through 2024/2025 editions -- current 290-constituency boundary',
    source: GCP_SOURCE,
    source_url: GCP_SOURCE_URL,
    reason: gcpReason('overall GCP in current prices', 'Section 3.2 ("Gross County Product, in Current Prices")')
  },
  {
    contract_id: 'P31-GCP-CENSUS-CONSTITUENCY-CLOSURE-2026-09-18',
    level: 'constituency',
    indicator_code: 'IND-MANUFACTURING-GCP-SHARE',
    status: 'official_unavailable',
    geo_codes: constituencyGeoCodes,
    period_label: 'GCP 2013-2017 series (2019 report) through 2024/2025 editions -- current 290-constituency boundary',
    source: GCP_SOURCE,
    source_url: GCP_SOURCE_URL,
    reason: gcpReason('manufacturing', 'Annex II ("County Contribution to Manufacturing Gross Value Added")')
  },
  {
    contract_id: 'P31-GCP-CENSUS-CONSTITUENCY-CLOSURE-2026-09-18',
    level: 'constituency',
    indicator_code: 'IND-MANUFACTURING-GVA',
    status: 'official_unavailable',
    geo_codes: constituencyGeoCodes,
    period_label: 'GCP 2013-2017 series (2019 report) through 2024/2025 editions -- current 290-constituency boundary',
    source: GCP_SOURCE,
    source_url: GCP_SOURCE_URL,
    reason: gcpReason('manufacturing gross value added', 'Annex II ("County Contribution to Manufacturing Gross Value Added")')
  },
  {
    contract_id: 'P31-GCP-CENSUS-CONSTITUENCY-CLOSURE-2026-09-18',
    level: 'constituency',
    indicator_code: 'IND-HOUSEHOLD-CAR-OWNERSHIP',
    status: 'official_unavailable',
    geo_codes: constituencyGeoCodes,
    period_label: '2019 KPHC -- current 290-constituency boundary',
    source: 'KNBS -- 2019 Kenya Population and Housing Census, Volume IV',
    source_url: KPHC_VOL4_URL,
    reason: kphcVol4Reason('Table 2.36', 'Percentage Distribution of Conventional Households by Ownership of Selected Household Assets by Area of Residence, County and Sub County')
  },
  {
    contract_id: 'P31-GCP-CENSUS-CONSTITUENCY-CLOSURE-2026-09-18',
    level: 'constituency',
    indicator_code: 'IND-HOUSEHOLD-MOTORCYCLE-OWNERSHIP',
    status: 'official_unavailable',
    geo_codes: constituencyGeoCodes,
    period_label: '2019 KPHC -- current 290-constituency boundary',
    source: 'KNBS -- 2019 Kenya Population and Housing Census, Volume IV',
    source_url: KPHC_VOL4_URL,
    reason: kphcVol4Reason('Table 2.36', 'Percentage Distribution of Conventional Households by Ownership of Selected Household Assets by Area of Residence, County and Sub County')
  },
  {
    contract_id: 'P31-GCP-CENSUS-CONSTITUENCY-CLOSURE-2026-09-18',
    level: 'constituency',
    indicator_code: 'IND-HOUSING-MATERIAL',
    status: 'official_unavailable',
    geo_codes: constituencyGeoCodes,
    period_label: '2019 KPHC -- current 290-constituency boundary',
    source: 'KNBS -- 2019 Kenya Population and Housing Census, Volume IV',
    source_url: KPHC_VOL4_URL,
    reason: kphcVol4Reason('Table 2.13', 'Percentage Distribution of Conventional Households by Dominant Wall Material of Main Dwelling Unit, Area of Residence, County and Sub-County')
  },
  {
    contract_id: 'P31-GCP-CENSUS-CONSTITUENCY-CLOSURE-2026-09-18',
    level: 'constituency',
    indicator_code: 'IND-SCHOOL-ATTENDANCE-RATE',
    status: 'official_unavailable',
    geo_codes: constituencyGeoCodes,
    period_label: '2019 KPHC -- current 290-constituency boundary',
    source: 'KNBS -- 2019 Kenya Population and Housing Census, Analytical Report on Education and Training',
    source_url: 'https://www.knbs.or.ke/wp-content/uploads/2023/09/2019-Kenya-population-and-Housing-Census-Analytical-Report-on-Education-and-Training.pdf',
    reason: 'KNBS\'s 2019 KPHC Analytical Report on Education and Training (https://www.knbs.or.ke/wp-content/uploads/2023/09/2019-Kenya-population-and-Housing-Census-Analytical-Report-on-Education-and-Training.pdf) was downloaded and its school-attendance tables inspected directly: every table breaks the population out only by national total, rural, urban and each of the 47 counties by name -- county is the finest geographic tier in this analytical report, coarser even than Volume IV\'s Table 2.2/2.3 school-attendance tables, which themselves stop at "County and Sub-County" (KNBS 2019 KPHC Volume IV, ' + KPHC_VOL4_URL + '). ' + CROSSWALK_NOTE + ' Under data/policy/local-54-indicator-contract.json\'s census_or_household_crosswalk treatment class, a resolved local value requires "exact electoral geography or a defensible documented crosswalk" and any "boundary mismatch must be disclosed" -- no such crosswalk exists at either sub-county or county-only granularity, so this cell is closed as official_unavailable rather than fabricating a value from a coarser published table.'
  },
  {
    contract_id: 'P31-GCP-CENSUS-CONSTITUENCY-CLOSURE-2026-09-18',
    level: 'constituency',
    indicator_code: 'IND-POP-2009',
    status: 'official_unavailable',
    geo_codes: constituencyGeoCodes,
    period_label: '2009 KPHC -- current 290-constituency boundary',
    source: 'KNBS -- 2009 Kenya Population and Housing Census, Volume 1B (Population Distribution by Political Units)',
    source_url: 'https://www.knbs.or.ke/wp-content/uploads/2023/09/2009-Kenya-population-and-Housing-Census-Volume-1B-Population-Distribution-by-Political-Units.pdf',
    reason: 'KNBS\'s 2009 KPHC Volume 1B (Population Distribution by Political Units, https://www.knbs.or.ke/wp-content/uploads/2023/09/2009-Kenya-population-and-Housing-Census-Volume-1B-Population-Distribution-by-Political-Units.pdf) was downloaded and read directly: its own preface states the report "presents the distribution of the enumerated population by political units (constituencies and counties)... tabulated for the 210 constituencies and the 47 counties in Kenya." This is the pre-2012-delimitation configuration of 210 constituencies, not the current 2012-01, 290-constituency boundary this Atlas uses (data/geography/registry/geographies.json, level=constituency). This reproduces, for the 2009 census, the identical vintage/boundary mismatch this project already established for the 2019 census (data/p23/constituency-census-closure-contract.json, IND-POPULATION decision: KNBS\'s standalone "Constituency Population by Sex, Number of Households, Area and Density" page republishes this same 2009 Volume 1B data, not a current-290 table). No authoritative 210-to-290 constituency crosswalk has been published by KNBS or IEBC (see data/p23/constituency-census-closure-contract.json and data/p24/ward-census-closure-contract.json, both re-affirmed by the P28A audit on 2026-09-16), and IEBC has confirmed no boundary-delimitation review reconciling the two configurations will occur before the 2027 general election. Remapping the 210-constituency 2009 figures onto the current 290 constituencies without such a crosswalk would fabricate a value the source does not itself publish, so this cell is closed as official_unavailable.'
  }
];

const output = {
  schema_version: 'kda.completeness.evidence-states.v1',
  definition: 'P31 constituency-level evidence-state closures for 5 Gross County Product national-accounts indicators (IND-AGRICULTURE-GCP-SHARE, IND-AGRICULTURE-GVA, IND-GCP-CURRENT, IND-MANUFACTURING-GCP-SHARE, IND-MANUFACTURING-GVA) and 5 2019/2009-census-derived household/population indicators (IND-HOUSEHOLD-CAR-OWNERSHIP, IND-HOUSEHOLD-MOTORCYCLE-OWNERSHIP, IND-HOUSING-MATERIAL, IND-SCHOOL-ATTENDANCE-RATE, IND-POP-2009), replacing the generic P29 "zero active series" closure with a genuinely investigated, primary-source-cited reason for each. Generated deterministically by scripts/p31/build-gcp-census-evidence-states.mjs; edit that script and re-run `node scripts/p31/build-gcp-census-evidence-states.mjs`, do not hand-edit this file. Consumed additively by scripts/p29/build-local-54-slot-ledger.mjs alongside data/completeness/evidence-states.json and data/completeness/local-54-education-admin-evidence-states.json; never touches the shared evidence-states.json or the legacy P18 slot ledger it is validated against. Never manufactures a zero, proxy, regional inheritance or synthetic observation.',
  states
};

fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
console.log(`Wrote ${states.length} states (${states.length * constituencyGeoCodes.length} geo-indicator cells) to ${outPath}`);
