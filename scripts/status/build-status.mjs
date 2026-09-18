#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

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
  const workflowDir = resolve(ROOT, '.github/workflows');
  const workflows = existsSync(workflowDir)
    ? readdirSync(workflowDir).filter(name => name.toLowerCase().startsWith(id))
    : [];
  const scriptDir = `scripts/${id}`;
  const validator = Boolean(packageJson.scripts?.[`${id}:validate`]);
  const builder = Boolean(packageJson.scripts?.[`${id}:build`]);

  const knownOutputs = {
    P27: ['data/policy/local-54-indicator-contract.json'],
    P28: ['data/audit/legacy-source-tier-audit.json', 'data/audit/legacy-source-tier-summary.json'],
    P29: ['data/completeness/local-54-summary.json', 'data/completeness/local-54-slot-ledger.json'],
    P30: ['data/representation/representatives.json', 'data/representation/representatives.csv']
  };
  const outputPaths = knownOutputs[phase.id] || [];
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

async function remoteGitHubSummary(currentPhase, completedLocalIds) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) {
    return { available: false, reason: 'GITHUB_TOKEN/GITHUB_REPOSITORY not available' };
  }

  const encodedRepo = repository.split('/').map(encodeURIComponent).join('/');
  const [openPrs, closedPrs, runs] = await Promise.all([
    githubJson(`/repos/${encodedRepo}/pulls?state=open&per_page=100&sort=updated&direction=desc`, token),
    githubJson(`/repos/${encodedRepo}/pulls?state=closed&per_page=100&sort=updated&direction=desc`, token),
    githubJson(`/repos/${encodedRepo}/actions/runs?branch=main&per_page=100`, token)
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

  return {
    available: true,
    open_pr_count: openPrs.length,
    open_prs: openPrs.slice(0, 10).map(pr => ({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      updated_at: pr.updated_at,
      draft: pr.draft
    })),
    latest_merged_pr: latestMerged ? {
      number: latestMerged.number,
      title: latestMerged.title,
      url: latestMerged.html_url,
      merged_at: latestMerged.merged_at
    } : null,
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
    }))
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
  const representation = representationSummary();

  const generatedAt = new Date().toISOString();
  const sha = process.env.GITHUB_SHA || git(['rev-parse', 'HEAD'], null);
  const commitSubject = git(['log', '-1', '--pretty=%s'], null);

  let githubSummary = { available: false, reason: 'remote GitHub checks disabled' };
  if (includeRemote) {
    try {
      githubSummary = await remoteGitHubSummary(currentPhase, completedLocalIds);
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
    `_Generated ${status.generated_at} from \`${shortSha}\`._`,
    '',
    '## Executive dashboard',
    '',
    '| Metric | Status |',
    '|---|---:|',
    `| Overall roadmap | **${status.roadmap.complete_phases} / ${status.roadmap.total_phases} complete (${status.roadmap.completion_pct}%)** |`,
    `| P00–P17 core product | **${group.core.complete} / ${group.core.total}** |`,
    `| P18–P26 governed completion | **${group.completion.complete} / ${group.completion.total}** |`,
    `| P27–P35 Local-54 | **${group.local54.complete} / ${group.local54.total}** |`,
    `| Current phase | **${current ? `${current.id} — ${current.title}` : 'All roadmap phases complete'}** |`,
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
      `| Open PRs | **${gh.open_pr_count}** |`,
      `| Critical workflow failures | **${failures}** |`
    ] : [
      '| GitHub live checks | _Unavailable in this run_ |'
    ]),
    '',
    '## Local-54 phase evidence',
    '',
    '| Phase | Roadmap | Validator | Scripts | Workflow | Assessment |',
    '|---|---|---:|---:|---:|---|'
  ];

  for (const phase of status.roadmap.phases.filter(p => phaseNumber(p.id) >= 27)) {
    const e = status.roadmap.local54_evidence[phase.id];
    lines.push(
      `| **${phase.id}** ${phase.title} | ${statusIcon(phase.status)} ${phase.status} | ${e.validator ? '✅' : '—'} | ${e.script_dir ? '✅' : '—'} | ${e.workflows.length ? '✅' : '—'} | ${e.evidence_state} |`
    );
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

  lines.push('## Next work', '');
  if (current) {
    lines.push(`**${current.id} — ${current.title}** is the first Local-54 phase not marked complete.`);
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
    'This dashboard does not treat a roadmap declaration as sufficient on its own. For Local-54 phases it separately reports whether validator scripts, phase scripts, workflows and known outputs are present. A planned phase with implementation evidence is flagged rather than silently treated as untouched.',
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
