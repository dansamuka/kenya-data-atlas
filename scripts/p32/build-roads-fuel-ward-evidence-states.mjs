// P32 -- Build data/completeness/local-54-roads-fuel-ward-evidence-states.json
//
// Ward-level closures for the 2 indicators P31 closed governed_unavailable at constituency level
// in PR #251 (data/p31/class-c-road-constituency-closure-contract.json,
// data/p31/fuel-petrol-constituency-closure-contract.json): IND-CLASS-C-RURAL-ROAD-LENGTH and
// IND-FUEL-PETROL. A ward is strictly finer than a constituency, so both P31 findings apply at
// least as strongly at ward level; each ward-level closure below also records a fresh 2026-09-19
// re-check performed specifically for this P32 batch (not a copy-paste of the constituency
// finding), per the local-54 source-governance contract's requirement to re-verify reachability/
// structure before reaffirming an unavailable state.
//
// Fresh checks performed 2026-09-19:
//   - IND-CLASS-C-RURAL-ROAD-LENGTH: searched KRB (krb.go.ke, maps.krb.go.ke), KeNHA
//     (gisportal.kenha.co.ke), KeRRA, and the Kenya Open Data Portal (opendata.go.ke) for any
//     newly published, bulk-downloadable classified road-network GIS layer since the P31
//     evidence file (data/p31/source/class-c-road-spatial-derivation-attempt.json, dated
//     2026-09-18). No new dataset was found: KRB's Map Portal remains the same view-only MangoMap
//     deployment with reproduction of its data prohibited without KRB's written consent; KeNHA's
//     GIS portal (gisportal.kenha.co.ke) is a general ArcGIS Online home page with no classified
//     national road-network export; opendata.go.ke has no matching new dataset. The World Bank/
//     ESMAP "Kenya - Roads" layer already tested in P31 remains the only downloadable classified
//     layer located anywhere.
//   - IND-FUEL-PETROL: re-checked the live EPRA pricing notice as of 2026-09-19. The circular
//     current on this date is the same one P31 already reviewed (15 September 2026 - 14 October
//     2026, https://www.epra.go.ke/maximum-retail-petroleum-prices-kenya-period-15th-september-2026-14th-october-2026),
//     independently corroborated again by additional news coverage published since the P31
//     review (People Daily, The Kenya Times, Top News Kenya, Kahawatungu, CarNews KE all report
//     the same unchanged per-town prices for the cycle, e.g. Nairobi Super Petrol Ksh 214.03,
//     Mombasa Ksh 210.87, Nakuru Ksh 212.92). The same named-pricing-town structure continues
//     with no reference to constituency or ward geography and no per-station pricing.
//
// Generated deterministically by scripts/p32/build-roads-fuel-ward-evidence-states.mjs; edit that
// script and re-run `node scripts/p32/build-roads-fuel-ward-evidence-states.mjs`, do not
// hand-edit the output file. Consumed additively by scripts/p29/build-local-54-slot-ledger.mjs
// alongside data/completeness/evidence-states.json and the sibling P31/P32 supplementary evidence
// files; never touches the shared evidence-states.json or the legacy P18 slot ledger it is
// validated against. Never manufactures a zero, proxy, regional inheritance or synthetic
// observation, and never inherits or interpolates any county/constituency value down to any ward.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function buildRoadsFuelWardEvidenceStates(geographies) {
  const wardGeoCodes = geographies
  .filter(g => g.level === 'ward')
  .map(g => g.geo_code)
  .sort();

if (wardGeoCodes.length !== 1450) {
  throw new Error(`Expected 1450 ward geo_codes, got ${wardGeoCodes.length}`);
}

const states = [
  {
    contract_id: 'P32-CLASS-C-ROAD-WARD-2026-09-19',
    level: 'ward',
    indicator_code: 'IND-CLASS-C-RURAL-ROAD-LENGTH',
    status: 'governed_unavailable',
    geo_codes: wardGeoCodes,
    period_label: '2025 provisional · Economic Survey 2026 · P32 ward spatial-derivation review',
    source: 'KNBS Economic Survey 2026 Table 11.9; underlying source Kenya Rural Roads Authority; spatial-derivation candidate World Bank/ESMAP "Kenya - Roads" (energydata.info, KRB-attributed)',
    source_url: 'https://www.knbs.or.ke/reports/2026-economic-survey/',
    reason: 'P31 (data/p31/class-c-road-constituency-closure-contract.json) attempted a genuine spatial_derivation of Class C road length at constituency level -- the coarsest possible sub-national geography below county -- by clipping the only publicly downloadable classified road-network GIS layer found anywhere (World Bank/ESMAP "Kenya - Roads", energydata.info, 2017 vintage, KRB-attributed, 61,201 segments) against the Atlas\'s own canonical COUNTY polygons, the mandatory reconciliation step network_spatial indicators must pass before publication. That county-level reconciliation already failed by up to two orders of magnitude in specific counties (19,503.7 km extracted versus KNBS Table 11.9\'s published 28,150.5 km national total, 69.3% coverage; per-county ratios from 29.9% in Marsabit to 6,020% in Nairobi), because the input layer materially under- and unevenly represents the current official Class C network mapped by KNBS\'s 2025 Road Inventory and Condition Surveys. A ward is strictly finer than a constituency: Kenya\'s 1,450 wards subdivide the same 290 constituencies into units roughly one-fifth their area, so any single missing, misclassified or mis-vintaged road segment in the 2017 input layer has an even larger relative impact on a ward\'s derived total than on a constituency\'s -- the same reconciliation failure that already invalidated the constituency-level attempt would only be magnified, not resolved, by attempting it one geographic tier lower from the identical, unchanged input data. This P32 review re-checked for a newly published alternative on 2026-09-19 (one day after the P31 evidence file\'s 2026-09-18 date): KRB\'s Map Portal (maps.krb.go.ke) remains a view-only MangoMap deployment with reproduction of its road-classification data prohibited without KRB\'s written consent; KeNHA\'s GIS portal (gisportal.kenha.co.ke) offers no classified national road-network export; KeRRA and opendata.go.ke have no matching new dataset. No new downloadable classified road-network GIS layer has been published by KRB, KeNHA, KeRRA or the Kenya Open Data Portal since the P31 review. No county or constituency Class C road-length value is inherited or interpolated down to any ward.',
    evidence_constraint: 'no_reconciling_classified_road_geometry_publicly_downloadable',
    refresh_trigger: 'KRB, KeNHA, KeRRA or the Kenya Open Data Portal publishes a downloadable, currently-classified road-network GIS layer whose Class C segments reconcile with KNBS Table 11.9\'s published county totals within a defensible margin, or KNBS/KeRRA directly publishes a ward-level Class C road-length table.'
  },
  {
    contract_id: 'P32-FUEL-PETROL-WARD-2026-09-19',
    level: 'ward',
    indicator_code: 'IND-FUEL-PETROL',
    status: 'governed_unavailable',
    geo_codes: wardGeoCodes,
    period_label: '15 September 2026 - 14 October 2026 EPRA pricing cycle · P32 ward review',
    source: 'Energy & Petroleum Regulatory Authority (EPRA) -- maximum retail petroleum prices notice',
    source_url: 'https://www.epra.go.ke/maximum-retail-petroleum-prices-kenya-period-15th-september-2026-14th-october-2026',
    reason: 'EPRA sets maximum retail Super Petrol prices under Section 101(y) of the Petroleum Act 2019 and Legal Notice No. 192 of 2022 for a small, named set of designated pricing towns, not per petrol station, ward or constituency. Under the dynamic_location_price treatment class (data/policy/local-54-indicator-contract.json), spatial_derivation is not a permitted method for this indicator at any sub-national level, so this is a structural fact about EPRA\'s regulatory regime -- it does not set prices below the town level at all -- that applies identically regardless of geography level: it already precluded a constituency value (data/p31/fuel-petrol-constituency-closure-contract.json) and precludes a ward value for the identical reason, only more strongly, since a ward is a smaller unit than a constituency and pricing towns are even less likely to align with ward boundaries than with constituency boundaries. This P32 review re-verified the live pricing circular on 2026-09-19 rather than assuming the P31 finding still held: the circular in force is the same 15 September 2026 - 14 October 2026 cycle P31 already reviewed, now independently corroborated by further news coverage published since the P31 review (People Daily, The Kenya Times, Top News Kenya, Kahawatungu and CarNews KE all report the identical unchanged per-town prices for this cycle, e.g. Nairobi Super Petrol Ksh 214.03, Mombasa Ksh 210.87, Nakuru Ksh 212.92, Eldoret and Kisumu Ksh 213.69). The same named-pricing-town schedule continues, with no reference anywhere in the notice or the corroborating coverage to constituency or ward geography, and no per-station pricing. No county or constituency pricing-town value is inherited, averaged or interpolated down to any ward.',
    evidence_constraint: 'epra_regulates_by_pricing_town_only_never_below_county_and_spatial_derivation_not_a_permitted_method_for_this_treatment_class',
    refresh_trigger: 'EPRA publishes maximum retail prices at ward level or per individual petrol station under a new regulatory instrument superseding Legal Notice No. 192 of 2022 / Section 101(y) of the Petroleum Act 2019.'
  }
];

const output = {
  schema_version: 'kda.completeness.evidence-states.v1',
  definition: 'P32 ward-level evidence-state closures for the 2 indicators P31 closed governed_unavailable at constituency level in PR #251 (IND-CLASS-C-RURAL-ROAD-LENGTH, IND-FUEL-PETROL), each carrying both the original constituency-level finding and a fresh 2026-09-19 ward-batch re-check. Generated deterministically by scripts/p32/build-roads-fuel-ward-evidence-states.mjs; edit that script and re-run `node scripts/p32/build-roads-fuel-ward-evidence-states.mjs`, do not hand-edit this file. Consumed additively by scripts/p29/build-local-54-slot-ledger.mjs alongside data/completeness/evidence-states.json and the sibling P31/P32 supplementary evidence files; never touches the shared evidence-states.json or the legacy P18 slot ledger it is validated against. Never manufactures a zero, proxy, regional inheritance or synthetic observation.',
  states
};

  return output;
}

function main() {
  const root = process.cwd();
  const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
  const outPath = path.join(root, 'data/completeness/local-54-roads-fuel-ward-evidence-states.json');
  const output = buildRoadsFuelWardEvidenceStates(readJson('data/geography/registry/geographies.json'));
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${output.states.length} states (${output.states.reduce((sum, state) => sum + state.geo_codes.length, 0)} geo-indicator cells) to ${outPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
