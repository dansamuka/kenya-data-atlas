// P37 -- classify GitHub Actions workflow run records as fresh/active/stale/phantom.
//
// A "phantom" record is a queued run that has zero jobs, has never been touched since creation
// (updated_at === created_at), and has aged past a threshold -- objective, checkable evidence
// that GitHub's own queue entry is stuck server-side and will never execute, as distinct from a
// genuine backlog. This is the classification docs/POST-P35-CLOSURE-PLAN.md P37 calls for, meant
// to separate the 24 records queued since 2026-09-13 (zero jobs, frozen timestamps) from a real
// fresh queue that must still be treated as a blocker.
//
// Deliberately conservative: a run is only ever classified 'phantom' when job-count evidence is
// actually available and reads zero. If jobs_count is unknown, the run is never phantom-classified
// -- absence of evidence is not evidence of a phantom record.
export const DEFAULT_PHANTOM_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours
export const DEFAULT_STALE_AGE_MS = 30 * 60 * 1000; // 30 minutes

export function classifyWorkflowRun(run, { now = Date.now(), phantomAgeMs = DEFAULT_PHANTOM_AGE_MS, staleAgeMs = DEFAULT_STALE_AGE_MS } = {}) {
  if (run.status === 'completed') return 'completed';
  if (run.status === 'in_progress') return 'in_progress';
  if (run.status !== 'queued') return 'unknown';

  const createdAt = new Date(run.created_at).getTime();
  const updatedAt = new Date(run.updated_at || run.created_at).getTime();
  const ageMs = now - createdAt;
  const neverTouched = updatedAt === createdAt;
  const jobsCount = run.jobs_count ?? (Array.isArray(run.jobs) ? run.jobs.length : null);
  const zeroJobsConfirmed = jobsCount === 0;

  if (zeroJobsConfirmed && neverTouched && ageMs > phantomAgeMs) return 'phantom';
  if (ageMs > staleAgeMs) return 'stale_queued';
  return 'fresh_queued';
}

export function classifyWorkflowRuns(runs, options = {}) {
  const classified = runs.map(run => ({ ...run, classification: classifyWorkflowRun(run, options) }));
  const byClassification = key => classified.filter(r => r.classification === key);
  const phantom = byClassification('phantom');
  const freshQueued = byClassification('fresh_queued');
  const staleQueued = byClassification('stale_queued');
  const inProgress = byClassification('in_progress');
  return {
    runs: classified,
    fresh_queued: freshQueued,
    stale_queued: staleQueued,
    in_progress: inProgress,
    phantom,
    completed: byClassification('completed'),
    // Blocking = genuinely pending/active execution. Phantom records must never inflate this --
    // that is the entire point of the classification.
    blocking: [...freshQueued, ...staleQueued, ...inProgress]
  };
}
