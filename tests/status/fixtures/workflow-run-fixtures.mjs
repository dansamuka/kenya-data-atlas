// P37 -- fixtures for workflow-run classification, covering both the 24 real historical
// phantom records (queued 2026-09-13, zero jobs, never updated) and a genuine fresh queue.
const FIXED_NOW = new Date('2026-09-21T00:00:00Z').getTime();

export const NOW = FIXED_NOW;

// Matches the real, verified shape of the 24 historical records (see docs/POST-P35-CLOSURE-PLAN.md
// baseline table): created 2026-09-13, updated_at identical to created_at, zero jobs.
export function makePhantomRun(overrides = {}) {
  return {
    id: 34749084470,
    name: 'P22 food-security source gate',
    head_branch: 'p28a-epra-fuel-provenance',
    status: 'queued',
    created_at: '2026-09-13T09:11:17Z',
    updated_at: '2026-09-13T09:11:17Z',
    jobs_count: 0,
    html_url: 'https://github.com/dansamuka/kenya-data-atlas/actions/runs/34749084470',
    ...overrides
  };
}

// A genuinely fresh queued run: created moments ago, no job-count evidence yet (GitHub has not
// scheduled a runner to pick it up), must never be mistaken for a phantom record.
export function makeFreshQueuedRun(overrides = {}) {
  return {
    id: 99000001,
    name: 'Validate Atlas data',
    head_branch: 'main',
    status: 'queued',
    created_at: new Date(FIXED_NOW - 2 * 60 * 1000).toISOString(),
    updated_at: new Date(FIXED_NOW - 2 * 60 * 1000).toISOString(),
    jobs_count: null,
    html_url: 'https://github.com/dansamuka/kenya-data-atlas/actions/runs/99000001',
    ...overrides
  };
}

// Genuinely stuck but not yet old enough to be confirmed phantom -- still a real blocker to
// report, not to be silently absorbed into either "fresh" or "phantom".
export function makeStaleQueuedRun(overrides = {}) {
  return {
    id: 99000002,
    name: 'Release rehearsal',
    head_branch: 'main',
    status: 'queued',
    created_at: new Date(FIXED_NOW - 60 * 60 * 1000).toISOString(),
    updated_at: new Date(FIXED_NOW - 60 * 60 * 1000).toISOString(),
    jobs_count: 0,
    html_url: 'https://github.com/dansamuka/kenya-data-atlas/actions/runs/99000002',
    ...overrides
  };
}

export function makeInProgressRun(overrides = {}) {
  return {
    id: 99000003,
    name: 'P16 release audit',
    head_branch: 'main',
    status: 'in_progress',
    created_at: new Date(FIXED_NOW - 5 * 60 * 1000).toISOString(),
    updated_at: new Date(FIXED_NOW - 30 * 1000).toISOString(),
    jobs_count: 3,
    html_url: 'https://github.com/dansamuka/kenya-data-atlas/actions/runs/99000003',
    ...overrides
  };
}

export function makeCompletedRun(overrides = {}) {
  return {
    id: 99000004,
    name: 'P16 release audit',
    status: 'completed',
    conclusion: 'success',
    created_at: new Date(FIXED_NOW - 20 * 60 * 1000).toISOString(),
    updated_at: new Date(FIXED_NOW - 15 * 60 * 1000).toISOString(),
    html_url: 'https://github.com/dansamuka/kenya-data-atlas/actions/runs/99000004',
    ...overrides
  };
}

export function makeSuccessorRoadmapFixture(overrides = {}) {
  return {
    programme: 'P36-P42 Post-P35 Closure Programme',
    status: 'active',
    phases: [
      { id: 'P36', title: 'Local-54 assurance and validator parity', status: 'complete' },
      { id: 'P37', title: 'Truthful status and Actions-queue observability', status: 'next' },
      { id: 'P38', title: 'Evidence-preserving branch and workflow inventory', status: 'planned' },
      { id: 'P39', title: 'Safe repository cleanup and CI consolidation', status: 'planned' },
      { id: 'P40', title: 'Numeric-yield opportunity portfolio', status: 'planned' },
      { id: 'P41', title: 'First governed numeric-yield tranche', status: 'planned' },
      { id: 'P42', title: 'Full Local-54 best-available numeric maximisation', status: 'planned' }
    ],
    ...overrides
  };
}
