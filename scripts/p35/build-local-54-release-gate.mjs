// P35 -- Permanent local-completeness, freshness and supersession gate.
//
// Builds four small audit/dashboard artifacts that convert the now-complete local-54 surface
// (P27-P34) into a continuously re-checkable contract, per docs/LOCAL-54-COMPLETION-PLAN.md P35:
//   - data/audit/local-54-freshness-queue.json: every numeric (published) cell, with its as_of
//     period and a recheck rule derived from its series' own frequency metadata.
//   - data/audit/local-54-supersession-queue.json: every non-official (badge B/C/D/E) numeric
//     cell, queued to be re-checked against whether a primary (badge A) source has since appeared.
//   - data/audit/local-54-reaudit-queue.json: every official_unavailable/governed_unavailable/
//     boundary_unresolved cell, with its refresh_trigger, so legacy unavailable states are
//     periodically re-audited rather than permanently grandfathered.
//   - data/local-54-completion-dashboard.json: one summary of every P35 acceptance gate.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const auditDir = path.join(root, 'data/audit');
const AS_OF = '2026-09-20';

const ledger = readJson('data/completeness/local-54-slot-ledger.json');
const reasonCatalogue = readJson('data/completeness/local-54-reason-catalogue.json');
const manifest = readJson('data/completeness/local-54-indicator-manifest.json');
const series = readJson('data/indicators/registry/series.json');
const geographies = readJson('data/geography/registry/geographies.json');
const representatives = readJson('data/representation/representatives.json');
const legacyConflicts = readJson('data/audit/legacy-conflicts.json');
const conflictDecisions = readJson('data/evidence/conflict-decisions.json');
const legacyTierAudit = readJson('data/audit/legacy-source-tier-audit.json');

const reasonById = new Map(reasonCatalogue.reasons.map(r => [r.reason_id, r]));
const seriesByCode = new Map(series.map(s => [s.series_code, s]));

// Frequency -> a defensible recheck interval in days, only where the frequency itself implies one.
// "irregular"/"periodic"/"one_off" do not imply a computable interval -- flagging those as overdue
// would fabricate a schedule the source itself never published, so they are monitored, not dated.
const FREQUENCY_INTERVAL_DAYS = {
  daily: 1, weekly: 7, monthly: 31, annual: 366, decennial: 3660,
  electoral_cycle: 1830, survey_round: 1830
};
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

fs.mkdirSync(auditDir, { recursive: true });

// --- 1. freshness queue: every numeric cell ---
const numericStatuses = new Set(['published_direct', 'published_derived', 'published_modelled', 'external_verified']);
const freshnessRows = [];
for (const row of ledger.rows) {
  if (!numericStatuses.has(row.status)) continue;
  const s = seriesByCode.get(row.series_code);
  const frequency = s?.frequency || 'unknown';
  const intervalDays = FREQUENCY_INTERVAL_DAYS[frequency] ?? null;
  const periodEnd = s?.end_period || null;
  let recheckStatus = 'no_computable_schedule';
  let daysSincePeriodEnd = null;
  if (intervalDays != null && periodEnd) {
    daysSincePeriodEnd = daysBetween(periodEnd, AS_OF);
    recheckStatus = daysSincePeriodEnd > intervalDays ? 'due_for_recheck' : 'current';
  }
  freshnessRows.push({
    slot_key: row.slot_key,
    geo_code: row.geo_code,
    level: row.level,
    indicator_code: row.indicator_code,
    as_of: row.period_label,
    frequency,
    interval_days: intervalDays,
    period_end: periodEnd,
    days_since_period_end: daysSincePeriodEnd,
    next_expected_release: s?.next_expected_release || null,
    recheck_status: recheckStatus,
    refresh_trigger: row.refresh_trigger || null
  });
}
const freshnessQueue = {
  schema_version: 'kda.p35.local-54-freshness-queue.v1',
  as_of: AS_OF,
  definition: 'Every numeric (published) local-54 cell with its as_of period and a recheck rule derived from its series frequency metadata. recheck_status is "no_computable_schedule" wherever the series frequency (irregular/periodic/one_off) does not imply a defensible interval -- this records that the schedule is unknown, not that the cell is stale.',
  cell_count: freshnessRows.length,
  by_recheck_status: Object.fromEntries([...new Set(freshnessRows.map(r => r.recheck_status))].sort().map(k => [k, freshnessRows.filter(r => r.recheck_status === k).length])),
  rows: freshnessRows
};
fs.writeFileSync(path.join(auditDir, 'local-54-freshness-queue.json'), JSON.stringify(freshnessQueue, null, 2) + '\n');

// --- 2. supersession queue: every non-official (badge != A) numeric cell ---
const supersessionRows = ledger.rows
  .filter(row => numericStatuses.has(row.status) && row.badge && row.badge !== 'A')
  .map(row => ({
    slot_key: row.slot_key,
    geo_code: row.geo_code,
    level: row.level,
    indicator_code: row.indicator_code,
    badge: row.badge,
    geographic_method: row.geographic_method,
    current_source: row.source,
    supersession_trigger: `Re-check whether an official (badge A, direct primary) source has since become available for ${row.indicator_code} at ${row.geo_code}; if so, promote this cell and retire the ${row.badge}-badged (${row.geographic_method}) value it currently carries.`
  }));
const supersessionQueue = {
  schema_version: 'kda.p35.local-54-supersession-queue.v1',
  as_of: AS_OF,
  definition: 'Every published local-54 cell whose value is not a direct primary (badge A) observation, queued for periodic re-check against whether a primary source has since become available -- so a secondary/derived/modelled value is never permanently presented as final.',
  cell_count: supersessionRows.length,
  rows: supersessionRows
};
fs.writeFileSync(path.join(auditDir, 'local-54-supersession-queue.json'), JSON.stringify(supersessionQueue, null, 2) + '\n');

// --- 3. re-audit queue: every genuinely "unavailable pending future evidence" closure ---
const REAUDITABLE_STATUSES = new Set(['official_unavailable', 'governed_unavailable', 'boundary_unresolved']);
const reauditGroups = new Map();
for (const row of ledger.rows) {
  if (!REAUDITABLE_STATUSES.has(row.status) || !row.reason_id) continue;
  if (!reauditGroups.has(row.reason_id)) reauditGroups.set(row.reason_id, { reason_id: row.reason_id, indicator_codes: new Set(), levels: new Set(), cell_count: 0 });
  const g = reauditGroups.get(row.reason_id);
  g.indicator_codes.add(row.indicator_code);
  g.levels.add(row.level);
  g.cell_count++;
}
const reauditRows = [...reauditGroups.values()].map(g => {
  const catalogue = reasonById.get(g.reason_id);
  return {
    reason_id: g.reason_id,
    indicator_codes: [...g.indicator_codes].sort(),
    levels: [...g.levels].sort(),
    cell_count: g.cell_count,
    has_refresh_trigger: Boolean(catalogue?.refresh_trigger),
    refresh_trigger: catalogue?.refresh_trigger || null,
    source: catalogue?.source || null
  };
}).sort((a, b) => a.reason_id.localeCompare(b.reason_id));
const reauditQueue = {
  schema_version: 'kda.p35.local-54-reaudit-queue.v1',
  as_of: AS_OF,
  definition: 'Every distinct closure reason behind an official_unavailable/governed_unavailable/boundary_unresolved local-54 cell, with its refresh_trigger, so legacy unavailable states are periodically re-audited for new representable evidence rather than permanently grandfathered. not_applicable and retired_replaced are excluded -- those are permanent structural dispositions, not "unavailable pending future evidence".',
  reason_group_count: reauditRows.length,
  cell_count: reauditRows.reduce((sum, r) => sum + r.cell_count, 0),
  without_refresh_trigger: reauditRows.filter(r => !r.has_refresh_trigger).length,
  rows: reauditRows
};
fs.writeFileSync(path.join(auditDir, 'local-54-reaudit-queue.json'), JSON.stringify(reauditQueue, null, 2) + '\n');

// --- 4. completion dashboard: every P35 acceptance gate in one summary ---
const localGeos = geographies.filter(g => ['county', 'constituency', 'ward'].includes(g.level));
const constituencyCells = ledger.rows.filter(r => r.level === 'constituency');
const wardCells = ledger.rows.filter(r => r.level === 'ward');
const womanReps = representatives.rows.filter(r => r.role_id === 'county_woman_representative');
const unknownCells = ledger.rows.filter(r => !r.resolved).length;
const s4Count = (Array.isArray(legacyTierAudit) ? legacyTierAudit : legacyTierAudit.rows || []).filter(r => String(r.audited_source_tier || '').startsWith('S4')).length;
const unexplainedConflicts = (s4Count > 0 || legacyConflicts.count > 0) && conflictDecisions.decisions.length === 0;
const FORBIDDEN_GEOGRAPHIC_METHODS = new Set(['inherited', 'copied', 'downscaled', 'equal_share', 'parent_rate']);
const inheritedCells = ledger.rows.filter(r => FORBIDDEN_GEOGRAPHIC_METHODS.has(String(r.geographic_method || '').toLowerCase())).length;

const dashboard = {
  schema_version: 'kda.p35.local-54-completion-dashboard.v1',
  as_of: AS_OF,
  gates: {
    indicators_governed: { value: manifest.indicators.length, target: 54, pass: manifest.indicators.length === 54 },
    constituency_dispositions: { value: constituencyCells.length, target: 290 * 54, pass: constituencyCells.length === 290 * 54 && constituencyCells.every(r => r.resolved) },
    ward_dispositions: { value: wardCells.length, target: 1450 * 54, pass: wardCells.length === 1450 * 54 && wardCells.every(r => r.resolved) },
    county_representative_dispositions: { value: womanReps.length, target: 47, pass: womanReps.length === 47 && womanReps.every(r => r.status) },
    unknown_local_cells: { value: unknownCells, target: 0, pass: unknownCells === 0 },
    unlabelled_secondary_observations: { value: ledger.rows.filter(r => numericStatuses.has(r.status) && !r.badge).length, target: 0, pass: ledger.rows.filter(r => numericStatuses.has(r.status) && !r.badge).length === 0 },
    unexplained_conflicts: { value: unexplainedConflicts ? 1 : 0, target: 0, pass: !unexplainedConflicts, s4_preferred_observations: s4Count, legacy_conflict_candidates: legacyConflicts.count, recorded_decisions: conflictDecisions.decisions.length },
    prohibited_parent_child_inheritance: { value: inheritedCells, target: 0, pass: inheritedCells === 0 },
    dynamic_observations_with_recheck_schedule: { value: freshnessRows.filter(r => r.recheck_status !== 'no_computable_schedule').length, of: freshnessRows.length },
    reauditable_closures_with_refresh_trigger: { value: reauditRows.filter(r => r.has_refresh_trigger).length, of: reauditRows.length, pass: reauditRows.every(r => r.has_refresh_trigger) },
    secondary_observations_queued_for_supersession: { value: supersessionRows.length },
    local_geographies_covered: { value: localGeos.length, target: 47 + 290 + 1450 }
  }
};
dashboard.all_gates_pass = Object.values(dashboard.gates).every(g => g.pass !== false);
fs.writeFileSync(path.join(root, 'data/local-54-completion-dashboard.json'), JSON.stringify(dashboard, null, 2) + '\n');

console.log(`P35_RELEASE_GATE_BUILD_OK freshness=${freshnessRows.length} supersession=${supersessionRows.length} reaudit_groups=${reauditRows.length} all_gates_pass=${dashboard.all_gates_pass}`);
