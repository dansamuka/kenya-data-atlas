// P40 -- barrier classification for every one of the 87 addressable closure-reason groups in
// data/audit/local-54-reaudit-queue.json. This is a genuine reading of each reason group's full
// text in data/completeness/local-54-reason-catalogue.json (not a keyword-matched guess), done as
// part of building the P40 opportunity portfolio, and cross-checked where practical against live
// re-verification (see data/p40/opportunity-portfolio.json's live_recheck entries and
// data/p40/p41-tranche-contract.json).
//
// Six classifications, ordered roughly by decreasing near-term feasibility:
//   publication_pending      -- data collection is COMPLETE and the source's own instrument
//                                explicitly captures the needed geography, but results have not
//                                yet been publicly released. No technical or design barrier
//                                exists at all; only a publication step remains.
//   access_technical         -- a specific live registry/portal that could in principle support
//                                this granularity (its data model carries the right geography) is
//                                currently unreachable (network/TLS/host failure). Fixable if and
//                                when the system comes back online.
//   boundary_vintage_mismatch -- data was collected for this indicator/level but under a stale or
//                                non-coterminous administrative boundary, and this project's
//                                anti-allocation policy blocks a naive crosswalk.
//   regulatory_publication_scope -- a regulator publishes only for a fixed statutory list of
//                                locations (not sub-national administrative units) by law or
//                                notice -- a different flavour of permanent barrier from a survey
//                                sampling domain.
//   already_attempted_rejected -- a genuine derivation was already tried (e.g. spatial GIS
//                                clipping) and formally rejected for reconciliation or policy
//                                reasons; revisiting needs a genuinely new source, not a re-check.
//   structural_permanent      -- the source's own documented design (survey sampling domain,
//                                report table plan, national-accounts compilation methodology,
//                                thematic cross-tabulation scope) never produces values at this
//                                geography. Not fixable by re-checking; only an entirely new
//                                source would change this.
//
// Every reason_id present in the reaudit queue must have exactly one entry here -- the build
// script fails hard if any are missing or if an unknown reason_id is classified.
export const REASON_CLASSIFICATIONS = {
  // -- Ministry of Education / KNBS 2024 National School Census (publication_pending) --
  // The census questionnaire's own identification panel (fields EA06/EA07) captures Constituency
  // and Ward for every institution; fieldwork concluded ~July 2024; only a Pilot Report (Jan 2025,
  // 8 of 47 counties, 674 institutions) has been published as of the most recent check
  // (2026-09-22, this session) -- the main nationwide report/microdata release remains outstanding
  // over two years after fieldwork concluded, with every other administrative avenue (NEMIS,
  // opendata.go.ke, TSC's own site, KNBS Economic Survey Ch.15) independently confirmed as
  // dead ends (R057's full text).
  R057: { classification: 'publication_pending', basis: 'TSC/NEMIS primary-classroom-teachers, constituency -- 2024 National School Census captures Constituency+Ward natively; only publication is outstanding.' },
  R058: { classification: 'publication_pending', basis: 'Public primary schools, constituency -- same 2024 National School Census pending-publication finding as R057.' },
  R059: { classification: 'publication_pending', basis: 'Public secondary schools, constituency -- same 2024 National School Census pending-publication finding as R057.' },
  R060: { classification: 'publication_pending', basis: 'Secondary teachers, constituency -- same 2024 National School Census pending-publication finding as R057.' },
  R089: { classification: 'publication_pending', basis: 'Primary classroom teachers, ward -- extends R057 a fortiori to ward; same census, same pending-publication barrier.' },
  R090: { classification: 'publication_pending', basis: 'Public primary schools, ward -- extends R058 a fortiori to ward.' },
  R091: { classification: 'publication_pending', basis: 'Public secondary schools, ward -- extends R059 a fortiori to ward.' },
  R092: { classification: 'publication_pending', basis: 'Secondary teachers, ward -- extends R060 a fortiori to ward.' },

  // -- Ministry of Health / KMHFR (Kenya Master Health Facility Registry) (access_technical) --
  // KMHFR's public portal and apex host have been independently re-tested unreachable across
  // multiple sessions (P24 original check, P28A 2026-09-16, P31/P32 2026-09-18) and again live in
  // this session (2026-09-22: ECONNREFUSED). Its only public mirror (HDX, 2017 snapshot) was
  // already found unusable by this project (no coordinates, predates the 2023 census) and
  // independently re-confirmed stale in this session's own research (last updated 2017-08-02).
  // KMHFR's own data model explicitly carries facility-level constituency/ward location (R038),
  // so this is a pure access barrier, not a design one.
  R036: { classification: 'access_technical', basis: 'Health-facility stock, constituency -- ultimately blocked by the same unreachable KMHFR/KMHFL registry as R052/R067 (R036 full text traces the barrier there explicitly).' },
  R038: { classification: 'access_technical', basis: "Health-facility density, constituency -- KMHFR's own data model carries constituency location; portal unreachable, not structurally incompatible." },
  R052: { classification: 'access_technical', basis: 'Health-facility count, constituency -- KMHFR public portal and apex host unreachable, re-confirmed live 2026-09-22 (ECONNREFUSED).' },
  R067: { classification: 'access_technical', basis: 'Health-facility count, ward -- extends R052 a fortiori; same KMHFR barrier.' },
  R068: { classification: 'access_technical', basis: 'Health-facility stock, ward -- extends R036 a fortiori; same KMHFR barrier.' },
  R076: { classification: 'access_technical', basis: 'Health-facility density, ward -- extends R038 a fortiori; same KMHFR barrier.' },

  // -- KNBS agriculture / KilimoSTAT (access_technical) --
  // KilimoSTAT (statistics.kilimo.go.ke) has an expired TLS certificate, re-confirmed live in this
  // session (2026-09-22: "certificate has expired"), matching the 2026-09-19 finding in R064-066's
  // full text. County agriculture-department websites checked for a ward-level alternative found
  // none published. The primary county-level source (KNBS National Agriculture Production Report)
  // does not itself extend below county, but KilimoSTAT's own stated scope (an open-data platform
  // "covering crops, livestock, fisheries, agroforestry") is the specific avenue that could in
  // principle carry finer geography, and it remains technically broken, not structurally scoped
  // to county alone.
  R061: { classification: 'access_technical', basis: 'Maize area, constituency -- KilimoSTAT TLS-expired, re-confirmed live 2026-09-22; county agri-department sites checked, none published ward/constituency data.' },
  R062: { classification: 'access_technical', basis: 'Maize production, constituency -- same KilimoSTAT barrier as R061.' },
  R063: { classification: 'access_technical', basis: 'Maize yield, constituency -- same KilimoSTAT barrier as R061 (Atlas-derived ratio of R061/R062).' },
  R064: { classification: 'access_technical', basis: 'Maize area, ward -- extends R061 a fortiori; same KilimoSTAT barrier.' },
  R065: { classification: 'access_technical', basis: 'Maize production, ward -- extends R062 a fortiori.' },
  R066: { classification: 'access_technical', basis: 'Maize yield, ward -- extends R063 a fortiori.' },

  // -- Boundary/vintage mismatches (data exists, but not at a usable current boundary) --
  R001: { classification: 'boundary_vintage_mismatch', basis: '2009 KPHC Volume 1B population tabulates the pre-2012, 210-constituency configuration, not the current 290-constituency boundary, and no ward-equivalent tier at all.' },
  R037: { classification: 'boundary_vintage_mismatch', basis: 'Household size, ward -- same KPHC population-tabulation/boundary-vintage family as R001/R044/R045/R046; fresh P32 investigation confirmed no current-boundary ward table exists.' },
  R039: { classification: 'boundary_vintage_mismatch', basis: '2009 KPHC Volume 1B population, constituency -- pre-2012, 210-constituency configuration, not the current 290-constituency boundary.' },
  R044: { classification: 'boundary_vintage_mismatch', basis: 'Household size, constituency -- older KNBS constituency table predates the current 2012-01 configuration; no crosswalk without inheritance.' },
  R045: { classification: 'boundary_vintage_mismatch', basis: 'Population, constituency -- 2019 KPHC does not publish a direct current-290-constituency table; no crosswalk without inheritance.' },
  R046: { classification: 'boundary_vintage_mismatch', basis: "Population, ward -- KPHC's finest published tier (sub-location) is a different, non-coterminous geography from the 1,450 IEBC electoral wards." },
  R077: { classification: 'boundary_vintage_mismatch', basis: 'Registered voters, ward (10 cells) -- Mandera East/Lafey ward-geometry crosswalk gap in the Atlas\'s own materialisation, not an external source-availability problem.' },

  // -- Regulatory publication scope (statutory list of named locations, not sub-national units) --
  R022: { classification: 'regulatory_publication_scope', basis: 'EPRA maximum retail petrol price, constituency -- set by legal notice for a fixed list of designated pricing towns, not per constituency.' },
  R023: { classification: 'regulatory_publication_scope', basis: 'EPRA maximum retail petrol price, ward -- same statutory designated-towns scope as R022.' },

  // -- Already attempted and formally rejected --
  R056: { classification: 'already_attempted_rejected', basis: 'Class-C rural road length, ward -- P31 spatial-derivation attempt against World Bank/ESMAP GIS layer failed county-level reconciliation by up to two orders of magnitude (the P33 conflict-ledger seed record).' },
  R075: { classification: 'already_attempted_rejected', basis: 'Class-C rural road length, constituency -- same rejected spatial-derivation attempt as R056; no bulk-downloadable classified road-network GIS layer found on KRB channels, re-confirmed live 2026-09-22 (krb.go.ke/downloads/ lists no GIS files).' },

  // -- Non-submission (a specific entity didn't submit; not a source-discovery problem) --
  R053: { classification: 'non_submission', basis: 'County pending bills, Narok only (1 cell) -- Narok did not submit pending-bills data to the Controller of Budget; preserved as official non-submission, not zero.' },

  // -- Structural/permanent: source's own documented design never produces this geography --
  R002: { classification: 'structural_permanent', basis: '2019 KPHC Analytical Report on Education, ward -- county is the finest tier in every table.' },
  R003: { classification: 'structural_permanent', basis: '2019 KPHC Volume IV housing-material table, ward -- no table below county.' },
  R004: { classification: 'structural_permanent', basis: '2019 KPHC Volume IV car-ownership table, ward -- no table below county.' },
  R005: { classification: 'structural_permanent', basis: '2019 KPHC Volume IV motorcycle-ownership table, ward -- no table below county.' },
  R006: { classification: 'structural_permanent', basis: 'Gross County Product (GCP), agriculture GVA, ward -- compiled exclusively at county level as a top-down national-accounts allocation.' },
  R007: { classification: 'structural_permanent', basis: 'GCP agriculture share, ward -- same national-accounts compilation ceiling as R006.' },
  R008: { classification: 'structural_permanent', basis: 'GCP manufacturing GVA, ward -- same national-accounts compilation ceiling as R006.' },
  R009: { classification: 'structural_permanent', basis: 'GCP manufacturing share, ward -- same national-accounts compilation ceiling as R006.' },
  R010: { classification: 'structural_permanent', basis: 'GCP current, ward -- same national-accounts compilation ceiling as R006.' },
  R011: { classification: 'structural_permanent', basis: '2019 KPHC Analytical Report on Labour Force, constituency -- a thematic cross-tabulation with its own independently-scoped, county-finest table plan.' },
  R024: { classification: 'structural_permanent', basis: "Kenya Poverty Report 2022, ward -- survey's own stated 50 study domains stop at county; no constituency/ward domain." },
  R025: { classification: 'structural_permanent', basis: "2022 KDHS cash-transfer/social-assistance, ward -- survey's own Sample Design states national/county estimation only." },
  R026: { classification: 'structural_permanent', basis: '2022 KDHS literacy rate, ward -- same KDHS sample-design ceiling as R025.' },
  R027: { classification: 'structural_permanent', basis: "2023/24 Kenya Housing Survey computer-use, ward -- survey's own design targets national/county estimation only." },
  R028: { classification: 'structural_permanent', basis: '2023/24 KHS electricity access, ward -- same KHS sample-design ceiling as R027.' },
  R029: { classification: 'structural_permanent', basis: '2023/24 KHS internet use, ward -- same KHS sample-design ceiling as R027.' },
  R030: { classification: 'structural_permanent', basis: '2023/24 KHS main-grid electricity, ward -- same KHS sample-design ceiling as R027.' },
  R031: { classification: 'structural_permanent', basis: '2023/24 KHS rent burden, ward -- same KHS sample-design ceiling as R027 (republished via Economic Survey Ch.20).' },
  R032: { classification: 'structural_permanent', basis: '2023/24 KHS water access, ward -- same KHS sample-design ceiling as R027.' },
  R033: { classification: 'structural_permanent', basis: '2019 KPHC Analytical Report on Disability, ward -- thematic cross-tabulation, own independently-scoped table plan, county-finest.' },
  R034: { classification: 'structural_permanent', basis: '2019 KPHC Analytical Report on Labour Force, ward -- same thematic-report ceiling as R011.' },
  R035: { classification: 'structural_permanent', basis: "2021 Kenya Time Use Survey, ward -- module's own design targets national/county estimation only." },
  R040: { classification: 'structural_permanent', basis: '2019 KPHC Analytical Report on Education, constituency -- county is the finest tier in every table.' },
  R041: { classification: 'structural_permanent', basis: '2019 KPHC Volume IV housing-material table, constituency -- no table below county.' },
  R042: { classification: 'structural_permanent', basis: '2019 KPHC Volume IV car-ownership table, constituency -- no table below county.' },
  R043: { classification: 'structural_permanent', basis: '2019 KPHC Volume IV motorcycle-ownership table, constituency -- no table below county.' },
  R047: { classification: 'structural_permanent', basis: 'GCP agriculture GVA, constituency -- same national-accounts compilation ceiling as R006.' },
  R048: { classification: 'structural_permanent', basis: 'GCP agriculture share, constituency -- same national-accounts compilation ceiling as R006.' },
  R049: { classification: 'structural_permanent', basis: 'GCP manufacturing GVA, constituency -- same national-accounts compilation ceiling as R006.' },
  R050: { classification: 'structural_permanent', basis: 'GCP manufacturing share, constituency -- same national-accounts compilation ceiling as R006.' },
  R051: { classification: 'structural_permanent', basis: 'GCP current, constituency -- same national-accounts compilation ceiling as R006.' },
  R069: { classification: 'structural_permanent', basis: "Ministry of Health SARA report, inpatient-service availability, ward -- Table 18 is county-only across all 434 pages." },
  R072: { classification: 'structural_permanent', basis: '2021 Kenya Time Use Survey, housing owner-occupied, constituency -- same module-design ceiling as R035.' },
  R073: { classification: 'structural_permanent', basis: '2022 KDHS cash-transfer + literacy bundle, constituency -- same KDHS sample-design ceiling as R025/R026.' },
  R074: { classification: 'structural_permanent', basis: '2023/24 KHS 5-indicator bundle, constituency -- same KHS sample-design ceiling as R027-R032.' },
  R078: { classification: 'structural_permanent', basis: '2022 KDHS immunization rate, constituency -- sample design never extends to constituency.' },
  R079: { classification: 'structural_permanent', basis: '2022 KDHS stunting rate, constituency -- same KDHS sample-design ceiling.' },
  R080: { classification: 'structural_permanent', basis: '2022 KDHS FGM/child marriage, constituency -- same KDHS sample-design ceiling.' },
  R081: { classification: 'structural_permanent', basis: '2022 KDHS home-birth rate, constituency -- same KDHS sample-design ceiling.' },
  R082: { classification: 'structural_permanent', basis: '2022 KDHS contraceptive use, constituency -- same KDHS sample-design ceiling.' },
  R083: { classification: 'structural_permanent', basis: '2022 KDHS maternal health, constituency -- same KDHS sample-design ceiling.' },
  R084: { classification: 'structural_permanent', basis: '2022 KDHS teenage pregnancy, constituency -- same KDHS sample-design ceiling.' },
  R085: { classification: 'structural_permanent', basis: 'KENPHIA 2018 HIV prevalence, constituency -- survey designed only to national and county domains.' },
  R086: { classification: 'structural_permanent', basis: 'Kenya Poverty Report 2022, constituency -- same 50-study-domain ceiling as R024.' },
  R087: { classification: 'structural_permanent', basis: '2023/24 KHS rent burden, constituency -- same KHS sample-design ceiling as R031.' },
  R088: { classification: 'structural_permanent', basis: 'Ministry of Health SARA report, inpatient-service availability, constituency -- same county-only Table 18 ceiling as R069.' },
  R093: { classification: 'structural_permanent', basis: '2022 KDHS immunization rate, ward -- extends R078 a fortiori.' },
  R094: { classification: 'structural_permanent', basis: '2022 KDHS stunting rate, ward -- extends R079 a fortiori.' },
  R095: { classification: 'structural_permanent', basis: '2022 KDHS FGM/child marriage, ward -- extends R080 a fortiori.' },
  R096: { classification: 'structural_permanent', basis: '2022 KDHS home-birth rate, ward -- extends R081 a fortiori.' },
  R097: { classification: 'structural_permanent', basis: '2022 KDHS contraceptive use, ward -- extends R082 a fortiori.' },
  R098: { classification: 'structural_permanent', basis: '2022 KDHS maternal health, ward -- extends R083 a fortiori.' },
  R099: { classification: 'structural_permanent', basis: '2022 KDHS teenage pregnancy, ward -- extends R084 a fortiori.' },
  R100: { classification: 'structural_permanent', basis: 'KENPHIA 2018 HIV prevalence, ward -- extends R085 a fortiori.' },
  R101: { classification: 'structural_permanent', basis: '2019 KPHC Analytical Report on Disability, constituency -- same thematic-report ceiling as R033.' }
};

export const CLASSIFICATION_FEASIBILITY_TIER = {
  publication_pending: 4,
  access_technical: 3,
  boundary_vintage_mismatch: 2,
  regulatory_publication_scope: 1,
  already_attempted_rejected: 0,
  non_submission: 0,
  structural_permanent: 0
};

export const VALID_CLASSIFICATIONS = new Set(Object.keys(CLASSIFICATION_FEASIBILITY_TIER));

// Groups reason_ids sharing one real-world source/institution, so tranche selection can enforce
// "no more than three source families" meaningfully rather than counting reason_ids alone (many
// reason_ids -- e.g. every KDHS-derived indicator -- share one underlying survey).
export const SOURCE_FAMILY = {
  R057: 'moe-2024-national-school-census', R058: 'moe-2024-national-school-census',
  R059: 'moe-2024-national-school-census', R060: 'moe-2024-national-school-census',
  R089: 'moe-2024-national-school-census', R090: 'moe-2024-national-school-census',
  R091: 'moe-2024-national-school-census', R092: 'moe-2024-national-school-census',

  R036: 'moh-kmhfr', R038: 'moh-kmhfr', R052: 'moh-kmhfr',
  R067: 'moh-kmhfr', R068: 'moh-kmhfr', R076: 'moh-kmhfr',

  R061: 'knbs-kilimostat-maize', R062: 'knbs-kilimostat-maize', R063: 'knbs-kilimostat-maize',
  R064: 'knbs-kilimostat-maize', R065: 'knbs-kilimostat-maize', R066: 'knbs-kilimostat-maize',

  R001: 'knbs-kphc-2009-boundary', R039: 'knbs-kphc-2009-boundary',
  R037: 'knbs-kphc-boundary-family', R044: 'knbs-kphc-boundary-family',
  R045: 'knbs-kphc-boundary-family', R046: 'knbs-kphc-boundary-family',
  R077: 'iebc-ward-voter-crosswalk',

  R022: 'epra-fuel-prices', R023: 'epra-fuel-prices',
  R056: 'krb-class-c-roads', R075: 'krb-class-c-roads',
  R053: 'national-treasury-pending-bills',

  R002: 'knbs-kphc-2019-analytical', R040: 'knbs-kphc-2019-analytical',
  R003: 'knbs-kphc-2019-vol4', R041: 'knbs-kphc-2019-vol4',
  R004: 'knbs-kphc-2019-vol4', R042: 'knbs-kphc-2019-vol4',
  R005: 'knbs-kphc-2019-vol4', R043: 'knbs-kphc-2019-vol4',
  R006: 'knbs-gcp-national-accounts', R007: 'knbs-gcp-national-accounts',
  R008: 'knbs-gcp-national-accounts', R009: 'knbs-gcp-national-accounts',
  R010: 'knbs-gcp-national-accounts', R047: 'knbs-gcp-national-accounts',
  R048: 'knbs-gcp-national-accounts', R049: 'knbs-gcp-national-accounts',
  R050: 'knbs-gcp-national-accounts', R051: 'knbs-gcp-national-accounts',
  R011: 'knbs-kphc-labour-force', R034: 'knbs-kphc-labour-force',
  R033: 'knbs-kphc-disability', R101: 'knbs-kphc-disability',
  R024: 'knbs-poverty-report-2022', R086: 'knbs-poverty-report-2022',
  R025: 'knbs-icf-kdhs-2022', R026: 'knbs-icf-kdhs-2022', R073: 'knbs-icf-kdhs-2022',
  R078: 'knbs-icf-kdhs-2022', R079: 'knbs-icf-kdhs-2022', R080: 'knbs-icf-kdhs-2022',
  R081: 'knbs-icf-kdhs-2022', R082: 'knbs-icf-kdhs-2022', R083: 'knbs-icf-kdhs-2022',
  R084: 'knbs-icf-kdhs-2022', R093: 'knbs-icf-kdhs-2022', R094: 'knbs-icf-kdhs-2022',
  R095: 'knbs-icf-kdhs-2022', R096: 'knbs-icf-kdhs-2022', R097: 'knbs-icf-kdhs-2022',
  R098: 'knbs-icf-kdhs-2022', R099: 'knbs-icf-kdhs-2022',
  R027: 'knbs-kenya-housing-survey', R028: 'knbs-kenya-housing-survey',
  R029: 'knbs-kenya-housing-survey', R030: 'knbs-kenya-housing-survey',
  R031: 'knbs-kenya-housing-survey', R032: 'knbs-kenya-housing-survey',
  R074: 'knbs-kenya-housing-survey', R087: 'knbs-kenya-housing-survey',
  R035: 'knbs-time-use-survey-2021', R072: 'knbs-time-use-survey-2021',
  R069: 'moh-sara-report', R088: 'moh-sara-report',
  R085: 'kenphia-2018', R100: 'kenphia-2018'
};
