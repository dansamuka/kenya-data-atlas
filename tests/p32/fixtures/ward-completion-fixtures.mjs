const evidencePath = 'fixture/p32-evidence.json';

const evidenceState = {
  contract_id: 'P32-FIXTURE-WARD-CLOSURE',
  level: 'ward',
  indicator_code: 'IND-FIXTURE-CLOSURE',
  status: 'governed_unavailable',
  geo_codes: ['WARD-001', 'WARD-002'],
  period_label: 'Fixture period',
  source: 'Fixture authority',
  source_url: 'https://example.test/p32-fixture',
  reason: 'A specific P32 fixture investigation found no ward publication.'
};

export function makeValidWardCompletionFixture() {
  const fixture = {
    contract: {
      schema_version: 'kda.p32.ward-completion-assurance.v1',
      expected: {
        indicator_count: 2,
        ward_count: 2,
        ward_cell_count: 4,
        p32_specific_indicator_count: 1,
        p32_specific_evidence_cell_count: 2
      },
      allowed_dispositions: ['published_direct', 'governed_unavailable', 'not_applicable'],
      allowed_geographic_methods: ['', 'direct'],
      prohibited_parent_child_methods: ['inherited', 'copied', 'downscaled', 'equal_share', 'parent_rate'],
      p32_specific_evidence: {
        files: [evidencePath],
        indicator_codes: ['IND-FIXTURE-CLOSURE']
      },
      outside_p32_specific_evidence: {
        structural_not_applicable_indicator_codes: [],
        already_resolved_before_p32_indicator_codes: ['IND-FIXTURE-NUMERIC']
      }
    },
    manifest: {
      indicators: [
        { indicator_id: 'IND-FIXTURE-NUMERIC' },
        { indicator_id: 'IND-FIXTURE-CLOSURE' }
      ]
    },
    geographies: [
      { geo_code: 'WARD-001', level: 'ward' },
      { geo_code: 'WARD-002', level: 'ward' }
    ],
    ledger: {
      rows: [
        {
          level: 'ward',
          geo_code: 'WARD-001',
          indicator_code: 'IND-FIXTURE-NUMERIC',
          status: 'published_direct',
          resolved: true,
          geographic_method: 'direct'
        },
        {
          level: 'ward',
          geo_code: 'WARD-001',
          indicator_code: 'IND-FIXTURE-CLOSURE',
          status: 'governed_unavailable',
          resolved: true,
          geographic_method: '',
          reason_id: 'R001'
        },
        {
          level: 'ward',
          geo_code: 'WARD-002',
          indicator_code: 'IND-FIXTURE-NUMERIC',
          status: 'published_direct',
          resolved: true,
          geographic_method: 'direct'
        },
        {
          level: 'ward',
          geo_code: 'WARD-002',
          indicator_code: 'IND-FIXTURE-CLOSURE',
          status: 'governed_unavailable',
          resolved: true,
          geographic_method: '',
          reason_id: 'R001'
        }
      ]
    },
    policy: {
      acceptance: { parent_child_inheritance_prohibited: true },
      indicators: [
        { indicator_id: 'IND-FIXTURE-NUMERIC', treatment_class: 'geometry_derived' },
        { indicator_id: 'IND-FIXTURE-CLOSURE', treatment_class: 'survey_small_area' }
      ]
    },
    reasonCatalogue: {
      reasons: [{
        reason_id: 'R001',
        period_label: evidenceState.period_label,
        source: evidenceState.source,
        source_url: evidenceState.source_url,
        reason: evidenceState.reason
      }]
    },
    evidenceDocuments: [{
      path: evidencePath,
      document: {
        schema_version: 'kda.completeness.evidence-states.v1',
        states: [evidenceState]
      }
    }],
    deterministicArtifacts: [{
      path: 'fixture/generated-p32-evidence.json',
      committed: { schema_version: 'fixture.v1', rows: [1, 2] },
      rebuilt: { schema_version: 'fixture.v1', rows: [1, 2] }
    }]
  };

  return structuredClone(fixture);
}
