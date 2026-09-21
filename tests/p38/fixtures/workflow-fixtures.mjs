// P38 -- fixtures for workflow trigger-shape classification, mirroring real shapes found in
// .github/workflows/ (verified: validate.yml for permanent_gate, p23-wajir-west-fresh-source-
// review.yml for the dual push+pull_request self-referential historical_one_off case, and
// p23-form34b-source-verification.yml for shared_gate).
export const PERMANENT_GATE_UNCONDITIONAL_PUSH = `name: Validate Atlas data

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
`;

export const PERMANENT_GATE_SCHEDULE = `name: KDA repository status

on:
  push:
    branches: [main]
  schedule:
    - cron: '17 4 * * *'
  workflow_dispatch:
`;

// Real shape: both push AND pull_request are present, but every path under both references only
// this workflow's own file pair -- trigger *type* alone would misclassify this as permanent.
export const HISTORICAL_ONE_OFF_DUAL_TRIGGER = `name: P23 Wajir West fresh source review

on:
  pull_request:
    paths:
      - data/p23/form34b-wajir-west-fresh-source-review.json
      - scripts/p23/validate-wajir-west-fresh-source-review.mjs
      - .github/workflows/p23-wajir-west-fresh-source-review.yml
  push:
    branches: [main]
    paths:
      - data/p23/form34b-wajir-west-fresh-source-review.json
      - scripts/p23/validate-wajir-west-fresh-source-review.mjs
      - .github/workflows/p23-wajir-west-fresh-source-review.yml
  workflow_dispatch:

permissions:
  contents: read
`;

export const SHARED_GATE_BROAD_PATHS = `name: P23 Form 34B source verification

on:
  pull_request:
    paths:
      - .github/workflows/p23-form34b-source-verification.yml
      - scripts/p23/validate-form34b-source-verifications.mjs
      - data/p23/form34b-*-source-verification.json
      - data/geography/registry/geographies.json
      - data/indicators/registry/series.json
      - data/indicators/registry/observations.json
  push:
    branches: [main]
    paths:
      - data/geography/registry/geographies.json
      - data/indicators/registry/series.json
  workflow_dispatch:
`;

export const REUSABLE_MANUAL_TOOL = `name: P23 salvage fresh download

on:
  workflow_dispatch:

permissions:
  contents: read
`;

export const NEEDS_MANUAL_REVIEW_UNKNOWN_SHAPE = `name: Something unusual

on:
  issue_comment:
    types: [created]
`;

export function makeBranchFixtures() {
  return {
    openPrsByRef: new Map([
      ['feature/open-work', { number: 501, html_url: 'https://example.com/pull/501' }]
    ]),
    closedPrsByRef: new Map([
      ['feature/merged-work', [{ number: 401, merged_at: '2026-09-01T00:00:00Z', html_url: 'https://example.com/pull/401' }]],
      ['feature/abandoned-work', [{ number: 402, merged_at: null, html_url: 'https://example.com/pull/402' }]]
    ])
  };
}
