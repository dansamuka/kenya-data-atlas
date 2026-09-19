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
//
// P32 ward-level extension (performed 2026-09-19, PR TBD): a ward is a strictly finer subdivision
// of a constituency -- every one of the 290 constituencies contains multiple of the 1,450 wards
// (data/geography/registry/geographies.json, level=ward, parent_id -> constituency). Because each
// of the 10 P31 findings above is a *ceiling* (GCP: never compiled below county; the four KPHC
// closures: never published below sub-county, a non-coterminous administrative geography with no
// constituency crosswalk; 2009 census: tabulated only for the pre-2012 210-constituency
// configuration), and a county/sub-county/210-constituency ceiling that already blocks the coarser
// 290-constituency level necessarily also blocks the strictly finer 1,450-ward level, these 10
// findings are extended to ward level below rather than re-litigated from scratch. Before writing
// the extension, a fresh live spot-check was performed on 2026-09-19 to rule out anything having
// changed since the 2026-09-18 constituency investigation:
//   - KNBS's live Gross County Product portal (https://www.knbs.or.ke/gross-county-product/) was
//     refetched: the same five editions (2019, 2021, 2023, 2024, 2025) are listed, all still
//     county-level only -- nothing new published in the interim.
//   - KNBS's 2019 KPHC reports index (https://www.knbs.or.ke/2019-kenya-population-and-housing-census-reports/)
//     was refetched: still exactly the same four volumes (I-IV) last updated February 2020, with
//     no "Volume V" or any ward/constituency-level population, household or socio-economic table
//     added -- Volume II's most granular administrative tier remains "county, sub-county, division,
//     location and sub-location," none of which is a ward or a constituency.
// Also added under P32: a genuinely fresh (not merely extended) investigation of IND-HOUSEHOLD-SIZE
// at ward level -- see householdSizeWardReason() below. Unlike the 10 indicators above,
// IND-HOUSEHOLD-SIZE's only prior review (P28A, 2026-09-16, PR #237; data/audit/p28a-reopening-review-log.json)
// was scoped to constituency level only ("levels": ["constituency"]); ward level had never been
// checked. That check has now been performed directly against the same KNBS 2019 KPHC Volume II
// this project already established as the operative source for this indicator
// (data/completeness/evidence-states.json, contract_id P23-KPHC-CONSTITUENCY-CLOSURE-2026-09-02).
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

const wardGeoCodes = geographies
  .filter(g => g.level === 'ward')
  .map(g => g.geo_code)
  .sort();

if (wardGeoCodes.length !== 1450) {
  throw new Error(`Expected 1,450 ward geo_codes, got ${wardGeoCodes.length}`);
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

const WARD_FRESH_CHECK_DATE = '2026-09-19';
const KPHC_REPORTS_INDEX_URL = 'https://www.knbs.or.ke/2019-kenya-population-and-housing-census-reports/';

function gcpWardReason(sectorLabel, annexLabel) {
  return `As established at constituency level (P31, PR #252, contract_id P31-GCP-CENSUS-CONSTITUENCY-CLOSURE-2026-09-18): KNBS's Gross County Product (GCP) 2019 methodology report (${GCP_SOURCE_URL}) documents that GCP is compiled exclusively at the 47-county level as a top-down allocation of national GDP/GVA-by-activity, using distribution keys derived from national surveys and censuses that were themselves never compiled below county; the report's finest sectoral breakdown for ${sectorLabel} is ${annexLabel}, county-level only. Since a ward is a strictly finer subdivision of a constituency (each of the 290 constituencies contains multiple of the 1,450 wards; data/geography/registry/geographies.json), and GCP's finest published/compiled tier -- county -- is itself coarser than the constituency level already found unavailable, this ceiling applies at least as strongly to all 1,450 wards: no GCP edition has ever published sub-county, constituency or ward figures, because the underlying national-accounts input data was never disaggregated that far in the first place. A fresh spot-check of KNBS's live Gross County Product portal (${GCP_PORTAL_URL}) performed on ${WARD_FRESH_CHECK_DATE} confirms the same GCP editions (2019, 2021, 2023, 2024, 2025) remain listed, all still county-level only, with nothing new published in the interim. Apportioning the published county figure to 1,450 wards by population, land area or equal share would fabricate a value the source does not itself publish (explicitly forbidden by data/policy/local-54-indicator-contract.json's economic_accounts_small_area treatment class), so this cell is closed as official_unavailable pending KNBS publishing sub-county-or-finer national accounts.`;
}

function kphcVol4WardReason(tableLabel, tableTitle) {
  return `As established at constituency level (P31, PR #252, contract_id P31-GCP-CENSUS-CONSTITUENCY-CLOSURE-2026-09-18): KNBS's 2019 KPHC Volume IV (${KPHC_VOL4_URL}) publishes ${tableLabel} ("${tableTitle}") only to "Area of Residence, County and Sub-County," and this project has already independently established that KNBS's sub-counties are a different, non-coterminous geography from the 290 IEBC electoral constituencies with no authoritative published crosswalk (e.g. Kwale 5 KNBS sub-counties vs 4 IEBC constituencies; Meru 11 vs 9). Since a ward is a strictly finer subdivision of a constituency (each of the 290 constituencies contains multiple of the 1,450 wards; data/geography/registry/geographies.json), and sub-county is already coarser than -- and non-crosswalkable to -- the constituency level already found unavailable, this ceiling applies at least as strongly to all 1,450 wards: even where a KNBS sub-county happens to be finer than some individual ward in raw population terms, there is still no published table or KNBS/IEBC-certified crosswalk that maps sub-county figures onto ward boundaries, so no genuine ward-level value can be derived without fabricating one. A fresh spot-check of KNBS's 2019 KPHC reports index (${KPHC_REPORTS_INDEX_URL}) performed on ${WARD_FRESH_CHECK_DATE} confirms only the same four volumes (I-IV, last updated February 2020) remain published, with no new "Volume V" or any ward-level table added in the interim. Under data/policy/local-54-indicator-contract.json's census_or_household_crosswalk treatment class, a resolved local value requires "exact electoral geography or a defensible documented crosswalk" -- no such crosswalk exists, so this cell is closed as official_unavailable rather than fabricating a value from the published sub-county table.`;
}

// Genuine, standalone P32 investigation of IND-HOUSEHOLD-SIZE at ward level (not an extension of
// a prior finding -- P28A's 2026-09-16 review of this indicator, PR #237, was scoped to
// constituency level only; ward level had never been checked before now).
function householdSizeWardReason() {
  const vol2Url = 'https://www.knbs.or.ke/wp-content/uploads/2023/09/2019-Kenya-population-and-Housing-Census-Volume-2-Distribution-of-Population-by-Administrative-Units.pdf';
  return `IND-HOUSEHOLD-SIZE's only prior review, P28A (2026-09-16, PR #237; data/audit/p28a-reopening-review-log.json), was explicitly scoped to constituency level only ("levels": ["constituency"]) -- ward level had never been investigated. This is therefore a fresh, standalone P32 investigation, not a mechanical extension of a prior finding, though it necessarily starts from the same operative source this project already established for this indicator at constituency level (data/completeness/evidence-states.json, contract_id P23-KPHC-CONSTITUENCY-CLOSURE-2026-09-02, re-affirmed by P28A): KNBS's 2019 KPHC Volume II (Distribution of Population by Administrative Units, ${vol2Url}), downloaded and text-extracted directly in that prior review. Its own List of Tables shows Table 2.4 ("Distribution of Population by Sex, Number of Households, Land Area, Population Density and Sub Locations") is the single finest administrative tier for which population-and-household-count data is published -- there is no Table 2.x for wards or constituencies. "Ward" and "Constituency" appear in Volume II exactly twice, both times only as fields on the raw household enumeration questionnaire reproduced in the appendix, never as a published aggregate table; a census questionnaire field recording ward does not by itself constitute a published ward statistic. Although KNBS sub-locations are numerically finer-grained than the 1,450 wards (Kenya's roughly 7,000+ sub-locations subdivide the country well below ward scale), sub-locations are the pre-devolution provincial-administration hierarchy (county > sub-county > division > location > sub-location) and are not the same delineation as the 1,450 electoral/administrative wards (county > constituency > ward) -- the same category of non-coterminous-geography problem this project already established for sub-county vs. constituency (e.g. Kwale 5 KNBS sub-counties vs 4 IEBC constituencies; Meru 11 vs 9), and no KNBS- or IEBC-certified sub-location-to-ward crosswalk has ever been published. A resolved ward-level value would therefore require either a direct published ward table (none exists) or a certified crosswalk to aggregate a finer administrative geography up to wards (none exists); computing household size (population divided by number of households) from sub-location figures without such a crosswalk would fabricate a value the source does not itself publish. A fresh, direct check performed on ${WARD_FRESH_CHECK_DATE} of KNBS's live 2019 KPHC reports index (${KPHC_REPORTS_INDEX_URL}) confirms only the same four volumes (I-IV, last updated February 2020) remain published -- no new "Volume V" and no ward-level population, household-count or household-size table has been added since the P28A review. Under data/policy/local-54-indicator-contract.json's census_or_household_crosswalk treatment class, a resolved local value requires "exact electoral geography or a defensible documented crosswalk"; no such crosswalk exists at ward level (nor, as already established, at constituency level), so this cell is closed as official_unavailable.`;
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
  },

  // --- P32 ward-level extensions of the 10 P31 constituency closures above ---
  {
    contract_id: 'P32-GCP-CENSUS-WARD-CLOSURE-2026-09-19',
    level: 'ward',
    indicator_code: 'IND-AGRICULTURE-GCP-SHARE',
    status: 'official_unavailable',
    geo_codes: wardGeoCodes,
    period_label: 'GCP 2013-2017 series (2019 report) through 2024/2025 editions -- current 1,450-ward boundary',
    source: GCP_SOURCE,
    source_url: GCP_SOURCE_URL,
    reason: gcpWardReason('agriculture', 'Annex I ("County Contribution to Agriculture Gross Value Added")')
  },
  {
    contract_id: 'P32-GCP-CENSUS-WARD-CLOSURE-2026-09-19',
    level: 'ward',
    indicator_code: 'IND-AGRICULTURE-GVA',
    status: 'official_unavailable',
    geo_codes: wardGeoCodes,
    period_label: 'GCP 2013-2017 series (2019 report) through 2024/2025 editions -- current 1,450-ward boundary',
    source: GCP_SOURCE,
    source_url: GCP_SOURCE_URL,
    reason: gcpWardReason('agriculture gross value added', 'Annex I ("County Contribution to Agriculture Gross Value Added")')
  },
  {
    contract_id: 'P32-GCP-CENSUS-WARD-CLOSURE-2026-09-19',
    level: 'ward',
    indicator_code: 'IND-GCP-CURRENT',
    status: 'official_unavailable',
    geo_codes: wardGeoCodes,
    period_label: 'GCP 2013-2017 series (2019 report) through 2024/2025 editions -- current 1,450-ward boundary',
    source: GCP_SOURCE,
    source_url: GCP_SOURCE_URL,
    reason: gcpWardReason('overall GCP in current prices', 'Section 3.2 ("Gross County Product, in Current Prices")')
  },
  {
    contract_id: 'P32-GCP-CENSUS-WARD-CLOSURE-2026-09-19',
    level: 'ward',
    indicator_code: 'IND-MANUFACTURING-GCP-SHARE',
    status: 'official_unavailable',
    geo_codes: wardGeoCodes,
    period_label: 'GCP 2013-2017 series (2019 report) through 2024/2025 editions -- current 1,450-ward boundary',
    source: GCP_SOURCE,
    source_url: GCP_SOURCE_URL,
    reason: gcpWardReason('manufacturing', 'Annex II ("County Contribution to Manufacturing Gross Value Added")')
  },
  {
    contract_id: 'P32-GCP-CENSUS-WARD-CLOSURE-2026-09-19',
    level: 'ward',
    indicator_code: 'IND-MANUFACTURING-GVA',
    status: 'official_unavailable',
    geo_codes: wardGeoCodes,
    period_label: 'GCP 2013-2017 series (2019 report) through 2024/2025 editions -- current 1,450-ward boundary',
    source: GCP_SOURCE,
    source_url: GCP_SOURCE_URL,
    reason: gcpWardReason('manufacturing gross value added', 'Annex II ("County Contribution to Manufacturing Gross Value Added")')
  },
  {
    contract_id: 'P32-GCP-CENSUS-WARD-CLOSURE-2026-09-19',
    level: 'ward',
    indicator_code: 'IND-HOUSEHOLD-CAR-OWNERSHIP',
    status: 'official_unavailable',
    geo_codes: wardGeoCodes,
    period_label: '2019 KPHC -- current 1,450-ward boundary',
    source: 'KNBS -- 2019 Kenya Population and Housing Census, Volume IV',
    source_url: KPHC_VOL4_URL,
    reason: kphcVol4WardReason('Table 2.36', 'Percentage Distribution of Conventional Households by Ownership of Selected Household Assets by Area of Residence, County and Sub County')
  },
  {
    contract_id: 'P32-GCP-CENSUS-WARD-CLOSURE-2026-09-19',
    level: 'ward',
    indicator_code: 'IND-HOUSEHOLD-MOTORCYCLE-OWNERSHIP',
    status: 'official_unavailable',
    geo_codes: wardGeoCodes,
    period_label: '2019 KPHC -- current 1,450-ward boundary',
    source: 'KNBS -- 2019 Kenya Population and Housing Census, Volume IV',
    source_url: KPHC_VOL4_URL,
    reason: kphcVol4WardReason('Table 2.36', 'Percentage Distribution of Conventional Households by Ownership of Selected Household Assets by Area of Residence, County and Sub County')
  },
  {
    contract_id: 'P32-GCP-CENSUS-WARD-CLOSURE-2026-09-19',
    level: 'ward',
    indicator_code: 'IND-HOUSING-MATERIAL',
    status: 'official_unavailable',
    geo_codes: wardGeoCodes,
    period_label: '2019 KPHC -- current 1,450-ward boundary',
    source: 'KNBS -- 2019 Kenya Population and Housing Census, Volume IV',
    source_url: KPHC_VOL4_URL,
    reason: kphcVol4WardReason('Table 2.13', 'Percentage Distribution of Conventional Households by Dominant Wall Material of Main Dwelling Unit, Area of Residence, County and Sub-County')
  },
  {
    contract_id: 'P32-GCP-CENSUS-WARD-CLOSURE-2026-09-19',
    level: 'ward',
    indicator_code: 'IND-SCHOOL-ATTENDANCE-RATE',
    status: 'official_unavailable',
    geo_codes: wardGeoCodes,
    period_label: '2019 KPHC -- current 1,450-ward boundary',
    source: 'KNBS -- 2019 Kenya Population and Housing Census, Analytical Report on Education and Training',
    source_url: 'https://www.knbs.or.ke/wp-content/uploads/2023/09/2019-Kenya-population-and-Housing-Census-Analytical-Report-on-Education-and-Training.pdf',
    reason: `As established at constituency level (P31, PR #252, contract_id P31-GCP-CENSUS-CONSTITUENCY-CLOSURE-2026-09-18): KNBS's 2019 KPHC Analytical Report on Education and Training breaks the population out only by national total, rural, urban and each of the 47 counties by name -- county is the finest geographic tier in this analytical report, coarser even than Volume IV's county-and-sub-county school-attendance tables (${KPHC_VOL4_URL}). Since a ward is a strictly finer subdivision of a constituency (each of the 290 constituencies contains multiple of the 1,450 wards; data/geography/registry/geographies.json), and county is coarser than -- and non-crosswalkable to -- the constituency level already found unavailable, this ceiling applies at least as strongly to all 1,450 wards. ${CROSSWALK_NOTE} A fresh spot-check of KNBS's 2019 KPHC reports index (${KPHC_REPORTS_INDEX_URL}) performed on ${WARD_FRESH_CHECK_DATE} confirms only the same four volumes (I-IV) remain published, with no new education-and-training or ward-level release added in the interim. Under data/policy/local-54-indicator-contract.json's census_or_household_crosswalk treatment class, a resolved local value requires "exact electoral geography or a defensible documented crosswalk" -- no such crosswalk exists at either sub-county or county-only granularity, so this cell is closed as official_unavailable rather than fabricating a value from a coarser published table.`
  },
  {
    contract_id: 'P32-GCP-CENSUS-WARD-CLOSURE-2026-09-19',
    level: 'ward',
    indicator_code: 'IND-POP-2009',
    status: 'official_unavailable',
    geo_codes: wardGeoCodes,
    period_label: '2009 KPHC -- current 1,450-ward boundary',
    source: 'KNBS -- 2009 Kenya Population and Housing Census, Volume 1B (Population Distribution by Political Units)',
    source_url: 'https://www.knbs.or.ke/wp-content/uploads/2023/09/2009-Kenya-population-and-Housing-Census-Volume-1B-Population-Distribution-by-Political-Units.pdf',
    reason: 'As established at constituency level (P31, PR #252, contract_id P31-GCP-CENSUS-CONSTITUENCY-CLOSURE-2026-09-18): KNBS\'s 2009 KPHC Volume 1B tabulates the enumerated population only "for the 210 constituencies and the 47 counties in Kenya" -- the pre-2012-delimitation configuration, not the current 2012-01, 290-constituency boundary, and not further disaggregated to any ward-equivalent unit at all. Since a ward is a strictly finer subdivision of a constituency (each of the current 290 constituencies contains multiple of the 1,450 wards; data/geography/registry/geographies.json) and wards did not exist as a mapped geography at the time of the 2009 count under either the pre- or post-2012 configuration, a source that cannot even be reconciled to the current 290 constituencies certainly cannot be reconciled to the 1,450 wards nested inside them -- this ceiling applies at least as strongly. No authoritative 210-to-290-constituency crosswalk, still less a 210-constituency-to-1,450-ward crosswalk, has been published by KNBS or IEBC (data/p23/constituency-census-closure-contract.json and data/p24/ward-census-closure-contract.json, re-affirmed by the P28A audit on 2026-09-16), and IEBC has confirmed no boundary-delimitation review reconciling the two configurations will occur before the 2027 general election. Remapping the 210-constituency 2009 figures onto the current 1,450 wards without such a crosswalk would fabricate a value the source does not itself publish, so this cell is closed as official_unavailable.'
  },

  // --- P32 fresh, standalone investigation (not a P31 extension): IND-HOUSEHOLD-SIZE at ward
  // level was never previously reviewed at any level below constituency (see
  // data/audit/p28a-reopening-review-log.json, IND-HOUSEHOLD-SIZE entry: "levels": ["constituency"]
  // only). See header comment above for the fresh checks performed.
  {
    contract_id: 'P32-HOUSEHOLD-SIZE-WARD-CLOSURE-2026-09-19',
    level: 'ward',
    indicator_code: 'IND-HOUSEHOLD-SIZE',
    status: 'official_unavailable',
    geo_codes: wardGeoCodes,
    period_label: '2019 KPHC -- current 1,450-ward boundary',
    source: 'KNBS -- 2019 Kenya Population and Housing Census, Volume II (Distribution of Population by Administrative Units)',
    source_url: 'https://www.knbs.or.ke/wp-content/uploads/2023/09/2019-Kenya-population-and-Housing-Census-Volume-2-Distribution-of-Population-by-Administrative-Units.pdf',
    reason: householdSizeWardReason()
  }
];

const output = {
  schema_version: 'kda.completeness.evidence-states.v1',
  definition: 'P31 constituency-level evidence-state closures for 5 Gross County Product national-accounts indicators (IND-AGRICULTURE-GCP-SHARE, IND-AGRICULTURE-GVA, IND-GCP-CURRENT, IND-MANUFACTURING-GCP-SHARE, IND-MANUFACTURING-GVA) and 5 2019/2009-census-derived household/population indicators (IND-HOUSEHOLD-CAR-OWNERSHIP, IND-HOUSEHOLD-MOTORCYCLE-OWNERSHIP, IND-HOUSING-MATERIAL, IND-SCHOOL-ATTENDANCE-RATE, IND-POP-2009), replacing the generic P29 "zero active series" closure with a genuinely investigated, primary-source-cited reason for each -- plus, added under P32 (2026-09-19), ward-level extensions of all 10 of those same closures (each ward-level ceiling follows because a ward is a strictly finer subdivision of a constituency, so a county/sub-county/pre-2012-210-constituency ceiling that already blocks the 290-constituency level blocks the 1,450-ward level at least as strongly), plus one genuinely fresh, standalone ward-level investigation of IND-HOUSEHOLD-SIZE (never previously reviewed below constituency; see householdSizeWardReason() in this script). Generated deterministically by scripts/p31/build-gcp-census-evidence-states.mjs; edit that script and re-run `node scripts/p31/build-gcp-census-evidence-states.mjs`, do not hand-edit this file. Consumed additively by scripts/p29/build-local-54-slot-ledger.mjs alongside data/completeness/evidence-states.json and data/completeness/local-54-education-admin-evidence-states.json; never touches the shared evidence-states.json or the legacy P18 slot ledger it is validated against. Never manufactures a zero, proxy, regional inheritance or synthetic observation.',
  states
};

fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
const cellCount = states.reduce((sum, s) => sum + s.geo_codes.length, 0);
console.log(`Wrote ${states.length} states (${cellCount} geo-indicator cells) to ${outPath}`);
