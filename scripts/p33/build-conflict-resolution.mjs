// P33 -- Candidate-value conflict resolution and probable-value publication.
//
// Builds data/evidence/candidate-observations.json and data/evidence/conflict-decisions.json: a
// governed record of every case where this project identified and evaluated more than one
// candidate source/value for the same indicator+geography+level cell before publishing a
// disposition. This is a curation layer over evidence already gathered during P28A/P31/P32 --
// registered in candidateInvestigationContracts below -- not a re-research pass. Per this
// project's own governance (docs/LOCAL-54-COMPLETION-PLAN.md P33), any preferred value tiered S4
// (probable value, sources conflict) must have a competing-source record here; today there are
// zero S4-tiered preferred observations (see data/audit/legacy-conflicts.json,
// machine_detected_conflict_group_count=0), so this build's job is to make that fact verifiable
// and to hold the one genuine documented candidate-conflict case this project has produced so
// far, in which a competing candidate was correctly rejected rather than published.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const outDir = path.join(root, 'data/evidence');
const AS_OF = '2026-09-20';

// Each entry is a contract this project already produced (P28A/P31/P32 diligence trail) that
// documents a genuine multi-candidate investigation for one indicator. `extract` turns that
// contract's own recorded facts into candidate_groups + decisions -- it must not invent any value
// or source not already present in the contract file.
const candidateInvestigationContracts = [
  {
    contractPath: 'data/p31/source/class-c-road-spatial-derivation-attempt.json',
    extract: contract => {
      const indicatorCode = contract.indicator_code;
      const geographies = readJson('data/geography/registry/geographies.json');
      const geoByCode = new Map(geographies.map(g => [g.geo_code, g]));
      const groups = [];
      for (const row of contract.class_c_by_county_reconciliation) {
        const geo = geoByCode.get(row.geo_code);
        const groupId = `P33-CAND-CLASS-C-ROAD-${row.geo_code}`;
        groups.push({
          group_id: groupId,
          indicator_code: indicatorCode,
          level: 'county',
          geo_code: row.geo_code,
          geo_name: row.name,
          geography_id: geo?.geography_id || null,
          candidates: [
            {
              candidate_id: `${groupId}-C1`,
              source_tier: 'S0_direct_primary_official',
              source_label: 'KNBS Economic Survey 2026 Table 11.9',
              source_url: 'https://www.knbs.or.ke/reports/2026-economic-survey/',
              value: row.published_km,
              unit: 'km',
              period_label: '2025 provisional',
              status: 'published',
              evidence_lineage_id: 'KNBS-ECONOMIC-SURVEY-2026-TABLE-11.9'
            },
            {
              candidate_id: `${groupId}-C2`,
              source_tier: 'S5_transparent_modelled_or_spatial_estimate',
              source_label: 'World Bank/ESMAP "Kenya - Roads" spatial derivation (energydata.info, KRB-attributed, ~2017 vintage)',
              source_url: 'https://energydata.info/dataset/kenya-roads-1',
              value: row.derived_km,
              unit: 'km',
              period_label: '~2017 vintage GIS layer',
              status: 'rejected_failed_reconciliation',
              evidence_lineage_id: 'WORLDBANK-ESMAP-KENYA-ROADS-2017-CLASS-C-CLIP'
            }
          ],
          ratio_pct: row.ratio_pct,
          source_contract: contract.__contractPath
        });
      }
      const decision = {
        decision_id: 'P33-DECISION-CLASS-C-ROAD-COUNTY-RECONCILIATION-2026-09-18',
        indicator_code: indicatorCode,
        level: 'county',
        scope: `all ${contract.class_c_by_county_reconciliation.length} counties`,
        group_ids: groups.map(g => g.group_id),
        conflict_type: 'value_disagreement',
        candidate_count: 2,
        independent_lineages: 2,
        selected_source_tier: 'S0_direct_primary_official',
        selected_source_label: 'KNBS Economic Survey 2026 Table 11.9',
        rejected_source_tier: 'S5_transparent_modelled_or_spatial_estimate',
        rejected_source_label: 'World Bank/ESMAP "Kenya - Roads" spatial derivation',
        selection_method: 'reconciliation_test_failure',
        confidence: 'high',
        rationale: contract.reconciliation_test.conclusion,
        resulting_disposition: 'official county value published unchanged; the derived candidate was rejected outright (not published as a probable S4 value), and constituency/ward-level spatial derivation for the same indicator remains governed_unavailable rather than being built on a candidate that failed reconciliation by up to two orders of magnitude',
        not_an_unlabelled_average: true,
        source_contract: contract.__contractPath
      };
      return { groups, decisions: [decision] };
    }
  }
];

const candidateGroups = [];
const conflictDecisions = [];
for (const entry of candidateInvestigationContracts) {
  const contract = readJson(entry.contractPath);
  contract.__contractPath = entry.contractPath;
  const { groups, decisions } = entry.extract(contract);
  candidateGroups.push(...groups);
  conflictDecisions.push(...decisions);
}

fs.mkdirSync(outDir, { recursive: true });

const candidateObservations = {
  schema_version: 'kda.p33.candidate-observations.v1',
  generated_at: AS_OF,
  definition: 'Every documented case where this project identified and evaluated more than one candidate source/value for the same indicator+geography+level cell before publishing a disposition, so a competing-source record exists for any value that could ever be tiered S4. Curated from already-existing P28A/P31/P32 investigation contracts (see candidateInvestigationContracts in scripts/p33/build-conflict-resolution.mjs) -- not new research.',
  candidate_group_count: candidateGroups.length,
  candidate_groups: candidateGroups
};
fs.writeFileSync(path.join(outDir, 'candidate-observations.json'), JSON.stringify(candidateObservations, null, 2) + '\n');

const conflictDecisionsOut = {
  schema_version: 'kda.p33.conflict-decisions.v1',
  generated_at: AS_OF,
  definition: 'For every candidate group in data/evidence/candidate-observations.json with 2+ candidates carrying genuinely independent evidence lineages, records which candidate was selected/rejected, the selection method, confidence and rationale. No decision here may resolve a conflict by unlabelled averaging.',
  decision_count: conflictDecisions.length,
  decisions: conflictDecisions
};
fs.writeFileSync(path.join(outDir, 'conflict-decisions.json'), JSON.stringify(conflictDecisionsOut, null, 2) + '\n');

console.log(`P33_CONFLICT_RESOLUTION_BUILD_OK candidate_groups=${candidateGroups.length} decisions=${conflictDecisions.length}`);
