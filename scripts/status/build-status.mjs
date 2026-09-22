#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { classifyWorkflowRuns } from './workflow-run-classifier.mjs';
import { summarizeSuccessorRoadmap } from './successor-roadmap.mjs';

const ROOT = resolve(process.cwd());

function readJson(path, { optional = false } = {}) {
  const full = resolve(ROOT, path);
  if (!existsSync(full)) {
    if (optional) return null;
    throw new Error(`Missing required file: ${path}`);
  }
  return JSON.parse(readFileSync(full, 'utf8'));
}

function exists(path) {
  return existsSync(resolve(ROOT, path));
}

function dirHasFiles(path) {
  const full = resolve(ROOT, path);
  return existsSync(full) && statSync(full).isDirectory() && readdirSync(full).length > 0;
}

function git(args, fallback = null) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

function pct(n, d) {
  return d ? Math.round((n / d) * 10000) / 100 : 0;
}

function statusIcon(status) {
  if (status === 'complete') return '✅';
  if (status === 'in_progress' || status === 'in-progress' || status === 'active') return '🟡';
  return '⏳';
}

function phaseNumber(id) {
  return Number(String(id).replace(/^P/, ''));
}

const LOCAL_PHASE_EVIDENCE_CONFIG = {
  P27: {
    outputs: ['data/policy/local-54-indicator-contract.json']
  },
  P28: {
    outputs: ['data/audit/legacy-source-tier-audit.json', 'data/audit/legacy-source-tier-summary.json']
  },
  P29: {
    outputs: ['data/completeness/local-54-summary.json', 'data/completeness/local-54-slot-ledger.json']
  },
  P30: {
    outputs: ['data/representation/representatives.json', 'data/representation/representatives.csv']
  },
  P31: {
    outputs: [
      'data/p31/class-c-road-constituency-closure-contract.json',
      'data/p31/fuel-petrol-constituency-closure-contract.json'
    ],
    shared_validators: ['p29:validate', 'p35:validate']
  },
  P32: {
    outputs: [
      'data/p32/ward-completion-assurance-contract.json',
      'data/completeness/local-54-roads-fuel-ward-evidence-states.json'
    ],
    shared_validators: ['p29:validate', 'p35:validate']
  },
  P33: {
    outputs: ['data/evidence/candidate-observations.json', 'data/evidence/conflict-decisions.json'],
    shared_validators: ['p35:validate']
  },
  P34: {
    outputs: ['data/local-54-profiles'],
    shared_validators: ['p35:validate']
  },
  P35: {
    outputs: [
      'data/local-54-completion-dashboard.json',
      'data/audit/local-54-freshness-queue.json',
      'data/audit/local-54-supersession-queue.json',
      'data/audit/local-54-reaudit-queue.json'
    ]
  }
};

function loadRoadmaps() {
  const groups = [
    { key: 'core', label: 'Core product', path: 'data/project-roadmap.json' },
    { key: 'completion', label: 'Governed completion', path: 'data/data-completion-roadmap.json' },
    { key: 'local54', label: 'Local-54 programme', path: 'data/local-54-completion-roadmap.json' }
  ];
  return groups.map(group => {
    const roadmap = readJson(group.path);
    return { ...group, roadmap, phases: roadmap.phases || [] };
  });
}

function localPhaseEvidence(phase, packageJson) {
  const id = phase.id.toLowerCase();
  const config = LOCAL_PHASE_EVIDENCE_CONFIG[phase.id] || {};
  const workflowDir = resolve(ROOT, '.github/workflows');
  const workflows = existsSync(workflowDir)
    ? readdirSync(workflowDir).filter(name => name.toLowerCase().startsWith(id))
    : [];
  const scriptDir = `scripts/${id}`;
  const dedicatedValidatorNames = config.dedicated_validators || [`${id}:validate`];
  const sharedValidatorNames = config.shared_validators || [];
  const dedicatedValidators = dedicatedValidatorNames.filter(name => Boolean(packageJson.scripts?.[name]));
  const sharedValidators = sharedValidatorNames.filter(name => Boolean(packageJson.scripts?.[name]));
  const validator = dedicatedValidators.length > 0 || sharedValidators.length > 0;
  const builder = Boolean(packageJson.scripts?.[`${id}:build`]);
  const outputPaths = config.outputs || [];
  const outputsPresent = outputPaths.filter(exists);

  const implementationDetected =
    dirHasFiles(scriptDir) || validator || builder || workflows.length > 0 || outputsPresent.length > 0;

  let evidenceState = 'planned';
  if (phase.status === 'complete') {
    evidenceState = validator || outputsPresent.length ? 'complete + implementation evidence' : 'complete (declaration only)';
  } else if (implementationDetected) {
    evidenceState = 'implementation detected before roadmap closure';
  }

  return {
    script_dir: dirHasFiles(scriptDir),
    validator,
    dedicated_validator: dedicatedValidators.length > 0,
    dedicated_validator_scripts: dedicatedValidators,
    shared_validator_scripts: sharedValidators,
    builder,
    workflows,
    known_outputs_present: outputsPresent,
    implementation_detected: implementationDetected,
    evidence_state: evidenceState
  };
}

function representationSummary() {
  const rep = readJson('data/representation/representatives.json', { optional: true });
  if (!rep) return null;
  const rows = Array.isArray(rep.rows) ? rep.rows : [];
  const roleKey = rows.length
    ? ['role_id', 'role', 'role_type', 'representative_role'].find(key => Object.hasOwn(rows[0], key))
    : null;
  const roleCounts = {};
  if (roleKey) {
    for (const row of rows) {
      const value = String(row[roleKey] ?? 'unknown');
      roleCounts[value] = (roleCounts[value] || 0) + 1;
    }
  }
  return {
    total_records: rows.length,
    roles_used: rep.roles_used || null,
    role_counts: roleCounts,
    schema_version: rep.schema_version || null
  };
}

async function githubJson(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kda-status-runner'
    }
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${path}: ${await response.text()}`);
  }
  return response.json();
}

async function githubCollection(path, token, { maxPages = 5 } = {}) {
  const items = [];
  const separator = path.includes('?') ? '&' : '?';
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await githubJson(`${path}${separator}page=${page}`, token);
    if (!Array.isArray(batch)) throw new Error(`Expected GitHub collection for ${path}`);
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

// The /actions/runs endpoints wrap their array in { total_count, workflow_runs: [...] },
// unlike /pulls or /branches which return a bare array -- githubCollection() cannot be reused
// here without misreading the response shape.
async function githubWorkflowRuns(path, token, { maxPages = 5 } = {}) {
  const items = [];
  const separator = path.includes('?') ? '&' : '?';
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await githubJson(`${path}${separator}page=${page}`, token);
    const runs = batch.workflow_runs;
    if (!Array.isArray(runs)) throw new Error(`Expected workflow_runs array for ${path}`);
    items.push(...runs);
    if (runs.length < 100) break;
  }
  return items;
}

function extractIndicatorCodes(...texts) {
  const codes = new Set();
  const pattern = /\bIND-[A-Z0-9][A-Z0-9-]*\b/g;
  for (const text of texts.flat(Infinity)) {
    if (!text) continue;
    for (const match of String(text).matchAll(pattern)) codes.add(match[0]);
  }
  return [...codes].sort();
}

function phaseScopedPr(item, phaseId) {
  if (!phaseId || !item) return false;
  const titlePattern = new RegExp(`^\\s*${phaseId}\\b`, 'i');
  const branchPattern = new RegExp(`^${phaseId.toLowerCase()}(?:[-/_]|$)`, 'i');
  return titlePattern.test(item.title || '') || branchPattern.test(item.head?.ref || '');
}

function summarizeRunForReport(run) {
  return {
    id: run.id,
    name: run.name,
    head_branch: run.head_branch,
    status: run.status,
    created_at: run.created_at,
    updated_at: run.updated_at,
    jobs_count: run.jobs_count ?? null,
    classification: run.classification,
    url: run.html_url
  };
}

async function remoteGitHubSummary(currentPhase, completedLocalIds, targetIndicatorCount) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) {
    return { available: false, reason: 'GITHUB_TOKEN/GITHUB_REPOSITORY not available' };
  }

  const encodedRepo = repository.split('/').map(encodeURIComponent).join('/');
  const [openPrs, closedPrs, runs, branches, repoWideQueued, repoWideInProgress] = await Promise.all([
    githubJson(`/repos/${encodedRepo}/pulls?state=open&per_page=100&sort=updated&direction=desc`, token),
    githubJson(`/repos/${encodedRepo}/pulls?state=closed&per_page=100&sort=updated&direction=desc`, token),
    githubJson(`/repos/${encodedRepo}/actions/runs?branch=main&per_page=100`, token),
    githubCollection(`/repos/${encodedRepo}/branches?per_page=100`, token),
    // Phantom queue records are not necessarily on main -- the 24 records this classification
    // exists for sit on a long-merged branch. Actions-queue health must be checked repo-wide.
    githubWorkflowRuns(`/repos/${encodedRepo}/actions/runs?status=queued&per_page=100`, token),
    githubWorkflowRuns(`/repos/${encodedRepo}/actions/runs?status=in_progress&per_page=100`, token)
  ]);

  const latestMerged = closedPrs
    .filter(pr => pr.merged_at)
    .sort((a, b) => String(b.merged_at).localeCompare(String(a.merged_at)))[0] || null;

  const latestByWorkflow = new Map();
  for (const run of runs.workflow_runs || []) {
    if (run.name === 'KDA repository status') continue;
    if (!latestByWorkflow.has(run.name)) latestByWorkflow.set(run.name, run);
  }

  const baseCritical = new Set(['Validate Atlas data', 'Release rehearsal', 'P16 release audit']);
  const localPrefixes = new Set([...completedLocalIds, currentPhase?.id].filter(Boolean));
  const critical = [...latestByWorkflow.values()].filter(run => {
    if (baseCritical.has(run.name)) return true;
    return [...localPrefixes].some(id => run.name.startsWith(id));
  });
  const failing = critical.filter(run => run.status === 'completed' && !['success', 'skipped'].includes(run.conclusion));

  // P37 -- repo-wide Actions-queue classification (fresh/active/stale/phantom). Job counts are
  // fetched with per_page=1 purely to read total_count cheaply; the jobs themselves are unused.
  const repoWideRunsRaw = [...repoWideQueued, ...repoWideInProgress].filter(run => run.name !== 'KDA repository status');
  const runsWithJobCounts = await Promise.all(repoWideRunsRaw.map(async run => {
    if (run.status !== 'queued') return run;
    try {
      const jobs = await githubJson(`/repos/${encodedRepo}/actions/runs/${run.id}/jobs?per_page=1`, token);
      return { ...run, jobs_count: jobs.total_count ?? null };
    } catch {
      return { ...run, jobs_count: null };
    }
  }));
  const queueClassification = classifyWorkflowRuns(runsWithJobCounts);
  const actionsQueueHealth = {
    checked_at: new Date().toISOString(),
    total_non_completed_runs: repoWideRunsRaw.length,
    fresh_queued_count: queueClassification.fresh_queued.length,
    stale_queued_count: queueClassification.stale_queued.length,
    in_progress_count: queueClassification.in_progress.length,
    phantom_count: queueClassification.phantom.length,
    blocking_count: queueClassification.blocking.length,
    fresh_queued: queueClassification.fresh_queued.map(summarizeRunForReport),
    stale_queued: queueClassification.stale_queued.map(summarizeRunForReport),
    in_progress: queueClassification.in_progress.map(summarizeRunForReport),
    phantom: queueClassification.phantom.map(summarizeRunForReport)
  };

  const currentPhaseId = currentPhase?.id || null;
  const currentPhasePattern = currentPhaseId
    ? new RegExp(`^${currentPhaseId.toLowerCase()}(?:[-/_]|$)`, 'i')
    : null;
  const openPrByHead = new Map(openPrs.map(pr => [pr.head?.ref, pr]));
  const currentPhaseBranches = currentPhasePattern
    ? branches.filter(branch => currentPhasePattern.test(branch.name))
    : [];

  const branchWork = [];
  for (const branch of currentPhaseBranches) {
    const pr = openPrByHead.get(branch.name) || null;
    let compare = null;
    try {
      compare = await githubJson(
        `/repos/${encodedRepo}/compare/main...${encodeURIComponent(branch.name)}`,
        token
      );
    } catch (error) {
      compare = { status: 'unknown', ahead_by: null, behind_by: null, commits: [], compare_error: error.message };
    }

    if (!pr && compare?.ahead_by === 0) continue;

    const commitMessages = (compare?.commits || []).map(commit => commit.commit?.message || '');
    const indicatorCodes = extractIndicatorCodes(pr?.title, pr?.body, commitMessages);
    const latestCommit = (compare?.commits || []).at(-1) || null;

    branchWork.push({
      branch: branch.name,
      url: `https://github.com/${repository}/tree/${encodeURIComponent(branch.name)}`,
      head_sha: branch.commit?.sha || latestCommit?.sha || null,
      ahead_by: compare?.ahead_by ?? null,
      behind_by: compare?.behind_by ?? null,
      compare_status: compare?.status || 'unknown',
      latest_commit_at: latestCommit?.commit?.committer?.date || latestCommit?.commit?.author?.date || null,
      latest_commit_subject: latestCommit?.commit?.message?.split('\n')[0] || null,
      open_pr: pr ? {
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        draft: pr.draft
      } : null,
      indicator_codes: indicatorCodes,
      indicator_count: indicatorCodes.length,
      state: pr ? 'open_pr' : 'branch_only',
      compare_error: compare?.compare_error || null
    });
  }

  branchWork.sort((a, b) => {
    if (a.state !== b.state) return a.state === 'open_pr' ? -1 : 1;
    return String(b.latest_commit_at || '').localeCompare(String(a.latest_commit_at || ''));
  });

  const mergedCurrentPhasePrs = currentPhaseId
    ? closedPrs.filter(pr => pr.merged_at && phaseScopedPr(pr, currentPhaseId))
    : [];
  const mergedIndicatorCodes = extractIndicatorCodes(
    mergedCurrentPhasePrs.flatMap(pr => [pr.title, pr.body])
  );
  const mergedSet = new Set(mergedIndicatorCodes);
  const activeIndicatorCodes = extractIndicatorCodes(branchWork.flatMap(item => item.indicator_codes))
    .filter(code => !mergedSet.has(code));
  const coveredIndicatorCodes = [...new Set([...mergedIndicatorCodes, ...activeIndicatorCodes])].sort();

  const indicatorBasedPhase = ['P31', 'P32'].includes(currentPhaseId);
  const phaseProgress = indicatorBasedPhase && targetIndicatorCount
    ? {
        phase_id: currentPhaseId,
        method: 'Distinct frozen Local-54 indicator families with concrete merged or ahead-of-main current-phase branch/PR work divided by the frozen indicator count. This is a coverage estimate, not a declaration that phase acceptance criteria are met.',
        target_indicator_count: targetIndicatorCount,
        covered_indicator_count: coveredIndicatorCodes.length,
        covered_indicator_pct: pct(coveredIndicatorCodes.length, targetIndicatorCount),
        merged_indicator_count: mergedIndicatorCodes.length,
        merged_indicator_pct: pct(mergedIndicatorCodes.length, targetIndicatorCount),
        in_flight_indicator_count: activeIndicatorCodes.length,
        in_flight_indicator_pct: pct(activeIndicatorCodes.length, targetIndicatorCount),
        covered_indicator_codes: coveredIndicatorCodes,
        merged_indicator_codes: mergedIndicatorCodes,
        in_flight_indicator_codes: activeIndicatorCodes,
        current_phase_branch_count: branchWork.length,
        open_pr_branch_count: branchWork.filter(item => item.state === 'open_pr').length,
        branch_only_count: branchWork.filter(item => item.state === 'branch_only').length
      }
    : null;

  return {
    available: true,
    open_pr_count: openPrs.length,
    open_prs: openPrs.slice(0, 10).map(pr => ({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      updated_at: pr.updated_at,
      draft: pr.draft,
      head_branch: pr.head?.ref || null,
      head_sha: pr.head?.sha || null
    })),
    latest_merged_pr: latestMerged ? {
      number: latestMerged.number,
      title: latestMerged.title,
      url: latestMerged.html_url,
      merged_at: latestMerged.merged_at
    } : null,
    current_phase_work: {
      phase_id: currentPhaseId,
      branches: branchWork,
      branch_count: branchWork.length,
      merged_phase_prs: mergedCurrentPhasePrs.map(pr => ({
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        merged_at: pr.merged_at
      })),
      progress_estimate: phaseProgress
    },
    critical_workflows: critical.map(run => ({
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      url: run.html_url,
      updated_at: run.updated_at,
      head_sha: run.head_sha
    })),
    failing_critical_workflows: failing.map(run => ({
      name: run.name,
      conclusion: run.conclusion,
      url: run.html_url,
      updated_at: run.updated_at
    })),
    actions_queue_health: actionsQueueHealth
  };
}

export function validateStatus(status) {
  const errors = [];
  const all = status.roadmap.phases;

  const ids = all.map(p => p.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) errors.push(`duplicate phase IDs: ${[...new Set(duplicateIds)].join(', ')}`);

  for (let n = 0; n <= 35; n += 1) {
    const id = `P${String(n).padStart(2, '0')}`;
    if (!ids.includes(id)) errors.push(`missing expected phase ${id}`);
  }

  const byId = new Map(all.map(phase => [phase.id, phase]));
  for (const phase of all) {
    if (phase.status !== 'complete') continue;
    for (const dependency of phase.depends_on || []) {
      if (byId.has(dependency) && byId.get(dependency).status !== 'complete') {
        errors.push(`${phase.id} is complete while dependency ${dependency} is not complete`);
      }
    }
  }

  if (byId.get('P26')?.status === 'complete') {
    if (status.legacy_completeness.resolved_slots !== status.legacy_completeness.total_slots) {
      errors.push('P26 is complete but legacy resolved_slots != total_slots');
    }
    if (status.legacy_completeness.unknown_missing !== 0) {
      errors.push('P26 is complete but legacy unknown_missing != 0');
    }
  }

  if (byId.get('P29')?.status === 'complete') {
    if (!status.local54_completeness) errors.push('P29 is complete but local-54 summary is missing');
    else if (status.local54_completeness.unclassified_cells !== 0) {
      errors.push('P29 is complete but local-54 unclassified_cells != 0');
    }
  }

  if (byId.get('P30')?.status === 'complete') {
    if (!status.representation) errors.push('P30 is complete but representation registry is missing');
    else if (status.representation.total_records < 47) errors.push('P30 is complete but representation registry has fewer than 47 records');
    if (!status.roadmap.local54_evidence.P30?.validator) errors.push('P30 is complete but p30:validate is not wired');
  }

  if (byId.get('P32')?.status === 'complete') {
    const evidence = status.roadmap.local54_evidence.P32;
    if (!evidence?.dedicated_validator) errors.push('P32 is complete but a dedicated p32:validate gate is not wired');
    if (evidence?.evidence_state === 'complete (declaration only)') {
      errors.push('P32 is complete but the status report still labels it declaration-only');
    }
  }

  // P37 -- the successor roadmap (P36-P42) must never be able to corrupt the frozen historical
  // 36/36 result, and must not reuse a historical phase ID.
  if (status.roadmap.total_phases !== 36) errors.push(`historical roadmap.total_phases must remain 36, got ${status.roadmap.total_phases}`);
  if (status.successor_roadmap) {
    const historicalIds = new Set(ids);
    const collidingIds = status.successor_roadmap.phases.filter(p => historicalIds.has(p.id)).map(p => p.id);
    if (collidingIds.length) errors.push(`successor roadmap phase IDs collide with historical phase IDs: ${collidingIds.join(', ')}`);
    const successorIds = status.successor_roadmap.phases.map(p => p.id);
    const duplicateSuccessorIds = successorIds.filter((id, index) => successorIds.indexOf(id) !== index);
    if (duplicateSuccessorIds.length) errors.push(`duplicate successor phase IDs: ${[...new Set(duplicateSuccessorIds)].join(', ')}`);
  }

  // P37 -- a phantom Actions-queue record must never be counted as a blocker.
  const queueHealth = status.github?.available ? status.github.actions_queue_health : null;
  if (queueHealth) {
    if (queueHealth.blocking_count !== queueHealth.fresh_queued_count + queueHealth.stale_queued_count + queueHealth.in_progress_count) {
      errors.push('actions_queue_health.blocking_count must equal fresh_queued + stale_queued + in_progress, excluding phantom');
    }
  }

  if (errors.length) {
    throw new Error(`KDA status validation failed:\n- ${errors.join('\n- ')}`);
  }
  return true;
}

export async function buildStatus({ includeRemote = true } = {}) {
  const roadmaps = loadRoadmaps();
  const packageJson = readJson('package.json');
  const phases = roadmaps.flatMap(group => group.phases.map(phase => ({
    ...phase,
    group: group.key,
    group_label: group.label
  }))).sort((a, b) => phaseNumber(a.id) - phaseNumber(b.id));

  const local54Group = roadmaps.find(group => group.key === 'local54');
  const currentPhase = local54Group.phases.find(phase => phase.status !== 'complete') || null;
  const completedLocalIds = local54Group.phases.filter(phase => phase.status === 'complete').map(phase => phase.id);
  const localEvidence = Object.fromEntries(local54Group.phases.map(phase => [
    phase.id,
    localPhaseEvidence(phase, packageJson)
  ]));

  const legacy = readJson('data/completeness/summary.json');
  const local54 = readJson('data/completeness/local-54-summary.json', { optional: true });
  const local54Manifest = readJson('data/completeness/local-54-indicator-manifest.json', { optional: true });
  const targetIndicatorCount = local54Manifest?.indicator_count || local54Manifest?.indicators?.length || null;
  const representation = representationSummary();
  const successorRoadmapJson = readJson('data/post-p35-closure-roadmap.json', { optional: true });
  const successorRoadmap = successorRoadmapJson ? summarizeSuccessorRoadmap(successorRoadmapJson) : null;

  const generatedAt = new Date().toISOString();
  const sha = process.env.GITHUB_SHA || git(['rev-parse', 'HEAD'], null);
  const commitSubject = git(['log', '-1', '--pretty=%s'], null);

  let githubSummary = { available: false, reason: 'remote GitHub checks disabled' };
  if (includeRemote) {
    try {
      githubSummary = await remoteGitHubSummary(currentPhase, completedLocalIds, targetIndicatorCount);
    } catch (error) {
      githubSummary = { available: false, reason: `GitHub API check failed: ${error.message}` };
    }
  }

  const status = {
    schema_version: 'kda.repository-status.v1',
    generated_at: generatedAt,
    repository: process.env.GITHUB_REPOSITORY || 'dansamuka/kenya-data-atlas',
    ref: process.env.GITHUB_REF_NAME || git(['branch', '--show-current'], null),
    sha,
    commit_subject: commitSubject,
    trigger: process.env.KDA_STATUS_TRIGGER || 'manual',
    is_finalized: process.env.KDA_STATUS_TRIGGER === 'finalized_after_critical_workflow',
    roadmap: {
      total_phases: phases.length,
      complete_phases: phases.filter(phase => phase.status === 'complete').length,
      completion_pct: pct(phases.filter(phase => phase.status === 'complete').length, phases.length),
      groups: Object.fromEntries(roadmaps.map(group => [group.key, {
        label: group.label,
        total: group.phases.length,
        complete: group.phases.filter(phase => phase.status === 'complete').length
      }])),
      current_phase: currentPhase ? { id: currentPhase.id, title: currentPhase.title, status: currentPhase.status } : null,
      next_public_ui_phase: local54Group.phases.find(phase => phase.id === 'P34' && phase.status !== 'complete')
        ? { id: 'P34', title: local54Group.phases.find(phase => phase.id === 'P34').title }
        : null,
      phases,
      local54_evidence: localEvidence
    },
    legacy_completeness: {
      total_slots: legacy.total_slots,
      resolved_slots: legacy.resolved_slots,
      unresolved_slots: legacy.unresolved_slots,
      resolved_pct: legacy.resolved_pct,
      unknown_missing: legacy.unknown_missing,
      active_missing: legacy.active_missing,
      by_status: legacy.by_status
    },
    local54_completeness: local54 ? {
      total_cells: local54.total_cells,
      county_cells: local54.county_cells,
      constituency_cells: local54.constituency_cells,
      ward_cells: local54.ward_cells,
      child_level_cells: local54.child_level_cells,
      unclassified_cells: local54.unclassified_cells,
      numeric_evidence_cells: local54.numeric_evidence_cells,
      numeric_evidence_pct: local54.numeric_evidence_pct,
      governed_closure_cells: local54.governed_closure_cells,
      governed_closure_pct: local54.governed_closure_pct,
      by_status: local54.by_status
    } : null,
    representation,
    successor_roadmap: successorRoadmap,
    github: githubSummary
  };

  validateStatus(status);
  return status;
}

export function renderMarkdown(status) {
  const group = status.roadmap.groups;
  const current = status.roadmap.current_phase;
  const local = status.local54_completeness;
  const gh = status.github;
  const failures = gh.available ? gh.failing_critical_workflows.length : null;
  const shortSha = status.sha ? status.sha.slice(0, 8) : 'unknown';

  const lines = [
    '<!-- kda-live-status:v1 -->',
    '# KDA — Live Repository Status',
    '',
    `_Generated ${status.generated_at} from \`${shortSha}\`${status.is_finalized ? ' -- **finalized**: refreshed after critical workflows settled for this commit' : ' (live snapshot -- critical workflows for this commit may still be running)'}._`,
    '',
    '## Executive dashboard',
    '',
    '| Metric | Status |',
    '|---|---:|',
    `| Overall roadmap | **${status.roadmap.complete_phases} / ${status.roadmap.total_phases} complete (${status.roadmap.completion_pct}%)** |`,
    `| P00–P17 core product | **${group.core.complete} / ${group.core.total}** |`,
    `| P18–P26 governed completion | **${group.completion.complete} / ${group.completion.total}** |`,
    `| P27–P35 Local-54 | **${group.local54.complete} / ${group.local54.total}** |`,
    `| Current phase (historical P00–P35) | **${current ? `${current.id} — ${current.title}` : 'All roadmap phases complete'}** |`,
    ...(status.successor_roadmap ? [
      `| Successor programme (P36–P42) | **${status.successor_roadmap.complete_phases} / ${status.successor_roadmap.total_phases} complete (${status.successor_roadmap.completion_pct}%)** |`,
      `| Successor current phase | **${status.successor_roadmap.current_phase ? `${status.successor_roadmap.current_phase.id} — ${status.successor_roadmap.current_phase.title}` : 'All successor phases complete'}** |`
    ] : []),
    `| Legacy governed slots | **${status.legacy_completeness.resolved_slots.toLocaleString()} / ${status.legacy_completeness.total_slots.toLocaleString()} resolved** |`,
    `| Legacy unknown slots | **${status.legacy_completeness.unknown_missing.toLocaleString()}** |`,
    ...(local ? [
      `| Local-54 denominator | **${local.total_cells.toLocaleString()} cells** |`,
      `| Local-54 numeric evidence | **${local.numeric_evidence_cells.toLocaleString()} (${local.numeric_evidence_pct}%)** |`,
      `| Local-54 governed closures | **${local.governed_closure_cells.toLocaleString()} (${local.governed_closure_pct}%)** |`,
      `| Local-54 unclassified | **${local.unclassified_cells.toLocaleString()}** |`
    ] : []),
    ...(status.representation ? [
      `| Representation registry records | **${status.representation.total_records.toLocaleString()}** |`
    ] : []),
    ...(gh.available ? [
      ...(gh.current_phase_work?.progress_estimate ? [
        `| Current-phase progress estimate | **${gh.current_phase_work.progress_estimate.covered_indicator_pct}%** (${gh.current_phase_work.progress_estimate.covered_indicator_count}/${gh.current_phase_work.progress_estimate.target_indicator_count} indicator families incl. in-flight) |`,
        `| Current-phase merged coverage | **${gh.current_phase_work.progress_estimate.merged_indicator_pct}%** (${gh.current_phase_work.progress_estimate.merged_indicator_count}/${gh.current_phase_work.progress_estimate.target_indicator_count}) |`
      ] : []),
      `| Current-phase active branches | **${gh.current_phase_work?.branch_count ?? 0}** |`,
      `| Open PRs | **${gh.open_pr_count}** |`,
      `| Critical workflow failures | **${failures}** |`,
      ...(gh.actions_queue_health ? [
        `| Actions queue -- blocking (fresh/stale/in-progress) | **${gh.actions_queue_health.blocking_count}** |`,
        `| Actions queue -- historical phantom records | **${gh.actions_queue_health.phantom_count}** |`
      ] : [])
    ] : [
      '| GitHub live checks | _Unavailable in this run_ |'
    ]),
    '',
    '## Local-54 phase evidence',
    '',
    '| Phase | Roadmap | Dedicated validator | Shared gates | Scripts | Workflow | Outputs | Assessment |',
    '|---|---|---:|---|---:|---:|---:|---|'
  ];

  for (const phase of status.roadmap.phases.filter(p => phaseNumber(p.id) >= 27)) {
    const e = status.roadmap.local54_evidence[phase.id];
    const sharedGates = e.shared_validator_scripts.length
      ? e.shared_validator_scripts.map(name => `\`${name}\``).join(', ')
      : '—';
    lines.push(
      `| **${phase.id}** ${phase.title} | ${statusIcon(phase.status)} ${phase.status} | ${e.dedicated_validator ? '✅' : '—'} | ${sharedGates} | ${e.script_dir ? '✅' : '—'} | ${e.workflows.length ? '✅' : '—'} | ${e.known_outputs_present.length ? '✅' : '—'} | ${e.evidence_state} |`
    );
  }

  if (gh.available && gh.current_phase_work) {
    const progress = gh.current_phase_work.progress_estimate;
    lines.push('', '## Current-phase progress and ongoing branch work', '');

    if (progress) {
      lines.push(
        `**${progress.phase_id} estimated coverage: ${progress.covered_indicator_pct}%** — ${progress.covered_indicator_count}/${progress.target_indicator_count} frozen indicator families have concrete merged or in-flight work.`,
        '',
        `- Merged onto main: **${progress.merged_indicator_count}/${progress.target_indicator_count} (${progress.merged_indicator_pct}%)**`,
        `- In-flight on current-phase branches: **${progress.in_flight_indicator_count}/${progress.target_indicator_count} (${progress.in_flight_indicator_pct}%)**`,
        `- Active current-phase branches: **${progress.current_phase_branch_count}** (${progress.open_pr_branch_count} with open PRs; ${progress.branch_only_count} branch-only)`,
        '',
        `_Method: ${progress.method}_`,
        ''
      );
    }

    const branches = gh.current_phase_work.branches || [];
    if (branches.length) {
      lines.push(
        '| Branch | PR | Ahead / behind main | Indicator families | State |',
        '|---|---|---:|---:|---|'
      );
      for (const branch of branches) {
        const prText = branch.open_pr
          ? `[#${branch.open_pr.number}](${branch.open_pr.url})${branch.open_pr.draft ? ' draft' : ''}`
          : '—';
        const divergence = branch.ahead_by == null
          ? 'unknown'
          : `+${branch.ahead_by} / -${branch.behind_by ?? 0}`;
        const indicatorText = branch.indicator_count
          ? `**${branch.indicator_count}**`
          : '0 detected';
        lines.push(
          `| [\`${branch.branch}\`](${branch.url}) | ${prText} | ${divergence} | ${indicatorText} | ${branch.state === 'open_pr' ? 'open PR' : 'branch only'} |`
        );
      }
      lines.push('');
    } else {
      lines.push('No ahead-of-main branches matching the current phase prefix were detected.', '');
    }
  }

  lines.push('', '## Repository health', '');
  if (gh.available) {
    if (gh.latest_merged_pr) {
      lines.push(`Latest merged PR: [#${gh.latest_merged_pr.number} — ${gh.latest_merged_pr.title}](${gh.latest_merged_pr.url}) (${gh.latest_merged_pr.merged_at}).`, '');
    }
    if (gh.open_prs.length) {
      lines.push('Open PRs:', '');
      for (const pr of gh.open_prs) {
        lines.push(`- [#${pr.number} — ${pr.title}](${pr.url})${pr.draft ? ' _(draft)_' : ''}`);
      }
      lines.push('');
    } else {
      lines.push('Open PRs: **0**.', '');
    }

    if (gh.critical_workflows.length) {
      lines.push('Latest critical workflow state:', '');
      for (const run of gh.critical_workflows) {
        const icon = run.status !== 'completed' ? '🟡' : run.conclusion === 'success' ? '✅' : run.conclusion === 'skipped' ? '⚪' : '❌';
        lines.push(`- ${icon} [${run.name}](${run.url}) — ${run.status}${run.conclusion ? ` / ${run.conclusion}` : ''}`);
      }
      lines.push('');
    }
  } else {
    lines.push(`Live GitHub API checks were skipped: ${gh.reason}.`, '');
  }

  lines.push('## Actions queue health', '');
  if (gh.available && gh.actions_queue_health) {
    const q = gh.actions_queue_health;
    lines.push(
      `Checked repo-wide (all branches) at ${q.checked_at}. **${q.blocking_count}** run(s) are genuinely blocking (fresh queued: ${q.fresh_queued_count}, stale queued: ${q.stale_queued_count}, in progress: ${q.in_progress_count}). **${q.phantom_count}** historical record(s) are classified phantom (zero jobs, never updated, aged past threshold) and are reported separately -- they do not count as active capacity.`,
      ''
    );
    if (q.blocking_count) {
      lines.push('Blocking runs:', '');
      for (const run of [...q.fresh_queued, ...q.stale_queued, ...q.in_progress]) {
        lines.push(`- [${run.name}](${run.url}) on \`${run.head_branch}\` — ${run.classification}, created ${run.created_at}`);
      }
      lines.push('');
    }
    if (q.phantom_count) {
      lines.push(`Phantom records (not blocking): ${q.phantom.map(run => `[#${run.id}](${run.url})`).join(', ')}.`, '');
    }
  } else {
    lines.push('Live GitHub API checks were skipped, so Actions-queue health could not be classified this run.', '');
  }

  lines.push('## Successor programme (P36–P42)', '');
  if (status.successor_roadmap) {
    const sr = status.successor_roadmap;
    lines.push(
      `**${sr.complete_phases} / ${sr.total_phases} complete (${sr.completion_pct}%)**. Current: **${sr.current_phase ? `${sr.current_phase.id} — ${sr.current_phase.title}` : 'all successor phases complete'}**. This counter is independent of the historical P00–P35 result above and never modifies it.`,
      '',
      '| Phase | Title | Status |',
      '|---|---|---|'
    );
    for (const phase of sr.phases) {
      lines.push(`| **${phase.id}** | ${phase.title} | ${statusIcon(phase.status === 'complete' ? 'complete' : phase.status === 'next' ? 'in_progress' : 'planned')} ${phase.status} |`);
    }
    lines.push('');
  } else {
    lines.push('No successor roadmap file was found.', '');
  }

  lines.push('## Next work', '');
  if (current) {
    lines.push(`**${current.id} — ${current.title}** is the first Local-54 phase not marked complete.`);
  } else if (status.successor_roadmap?.current_phase) {
    lines.push(`All historical Local-54 phases are complete. Next successor phase: **${status.successor_roadmap.current_phase.id} — ${status.successor_roadmap.current_phase.title}**.`);
  } else {
    lines.push('All Local-54 phases are marked complete.');
  }
  if (status.roadmap.next_public_ui_phase) {
    lines.push('', `Next major public-product milestone: **${status.roadmap.next_public_ui_phase.id} — ${status.roadmap.next_public_ui_phase.title}**.`);
  }
  lines.push(
    '',
    '## Interpretation rule',
    '',
    'This dashboard does not treat a roadmap declaration as sufficient on its own. For Local-54 phases it separately reports dedicated validators, shared cross-phase gates, phase scripts, workflows and known outputs. A planned phase with implementation evidence is flagged rather than silently treated as untouched. For P31/P32, the progress percentage is a coverage estimate based on distinct frozen indicator families with concrete merged or ahead-of-main branch/PR work; the separate merged figure remains the stricter measure of work already on main.',
    '',
    '---',
    '_Generated by `.github/workflows/kda-status.yml`; the workflow updates this issue without committing generated status files back to the repository._',
    ''
  );

  return lines.join('\n');
}

function parseArgs(argv) {
  const result = { markdown: null, json: null, includeRemote: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--markdown') result.markdown = argv[++i];
    else if (arg === '--json') result.json = argv[++i];
    else if (arg === '--offline') result.includeRemote = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

function writeOutput(path, content) {
  const full = resolve(ROOT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const status = await buildStatus({ includeRemote: args.includeRemote });
  const markdown = renderMarkdown(status);

  if (args.markdown) writeOutput(args.markdown, markdown);
  if (args.json) writeOutput(args.json, `${JSON.stringify(status, null, 2)}\n`);
  if (!args.markdown && !args.json) process.stdout.write(`${markdown}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}
