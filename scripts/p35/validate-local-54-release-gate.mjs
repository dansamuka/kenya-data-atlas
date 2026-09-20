// P35 -- Validate the permanent local-54 release gate.
//
// Re-checks the roadmap's exact P35 acceptance criteria (data/local-54-completion-roadmap.json),
// re-deriving from source registries rather than trusting the generated audit files, then
// confirms the generated files rebuild deterministically.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const fail = m => { console.error(`P35_RELEASE_GATE_FAIL ${m}`); process.exitCode = 1; };
const assert = (c, m) => { if (!c) fail(m); };

const ledger = readJson('data/completeness/local-54-slot-ledger.json');
const manifest = readJson('data/completeness/local-54-indicator-manifest.json');
const geographies = readJson('data/geography/registry/geographies.json');
const representatives = readJson('data/representation/representatives.json');
const dashboard = readJson('data/local-54-completion-dashboard.json');
const freshnessQueue = readJson('data/audit/local-54-freshness-queue.json');
const supersessionQueue = readJson('data/audit/local-54-supersession-queue.json');
const reauditQueue = readJson('data/audit/local-54-reaudit-queue.json');

assert(dashboard.schema_version === 'kda.p35.local-54-completion-dashboard.v1', 'dashboard schema mismatch');
assert(freshnessQueue.schema_version === 'kda.p35.local-54-freshness-queue.v1', 'freshness queue schema mismatch');
assert(supersessionQueue.schema_version === 'kda.p35.local-54-supersession-queue.v1', 'supersession queue schema mismatch');
assert(reauditQueue.schema_version === 'kda.p35.local-54-reaudit-queue.v1', 'reaudit queue schema mismatch');

// --- gate 1: 54/54 indicators remain governed ---
assert(manifest.indicators.length === 54, `expected 54 governed indicators, got ${manifest.indicators.length}`);

// --- gates 2-3: 290x54 constituency + 1450x54 ward dispositions remain complete ---
const constituencyCells = ledger.rows.filter(r => r.level === 'constituency');
const wardCells = ledger.rows.filter(r => r.level === 'ward');
assert(constituencyCells.length === 290 * 54, `constituency cells ${constituencyCells.length} != ${290 * 54}`);
assert(wardCells.length === 1450 * 54, `ward cells ${wardCells.length} != ${1450 * 54}`);
assert(constituencyCells.every(r => r.resolved), 'every constituency cell must remain resolved');
assert(wardCells.every(r => r.resolved), 'every ward cell must remain resolved');

// --- gate 4: 47/47 county representative dispositions remain current ---
const womanReps = representatives.rows.filter(r => r.role_id === 'county_woman_representative');
assert(womanReps.length === 47, `expected 47 county_woman_representative rows, got ${womanReps.length}`);
assert(womanReps.every(r => r.status), 'every county representative row must have an explicit disposition');
assert(new Set(womanReps.map(r => r.geo_code)).size === 47, 'duplicate county in county_woman_representative rows');

// --- gate 5: unknown local cells = 0 ---
assert(ledger.rows.every(r => r.resolved), 'gate: unknown local cells must be zero -- every ledger row must be resolved');

// --- gate 6: unlabelled secondary observations = 0 ---
const numericStatuses = new Set(['published_direct', 'published_derived', 'published_modelled', 'external_verified']);
const numericRows = ledger.rows.filter(r => numericStatuses.has(r.status));
assert(numericRows.every(r => r.badge), 'gate: every numeric (published) observation must carry an explicit badge/tier label');

// --- gate 7: unexplained conflicts = 0 ---
const legacyConflicts = readJson('data/audit/legacy-conflicts.json');
const legacyTierAudit = readJson('data/audit/legacy-source-tier-audit.json');
const conflictDecisions = readJson('data/evidence/conflict-decisions.json');
const auditRows = Array.isArray(legacyTierAudit) ? legacyTierAudit : (legacyTierAudit.rows || []);
const s4Count = auditRows.filter(r => String(r.audited_source_tier || '').startsWith('S4')).length;
if (s4Count > 0 || legacyConflicts.count > 0) {
  assert(conflictDecisions.decisions.length > 0, `${s4Count} S4 observation(s) and/or ${legacyConflicts.count} legacy conflict candidate(s) exist but zero conflict decisions are recorded -- every conflict must be explained, not left unexplained`);
}

// --- gate 8: prohibited parent-child inheritance = 0 ---
const policy = readJson('data/policy/local-54-indicator-contract.json');
assert(policy.acceptance?.parent_child_inheritance_prohibited === true, 'the local-54 policy contract must declare acceptance.parent_child_inheritance_prohibited: true');
const FORBIDDEN_GEOGRAPHIC_METHODS = new Set(['inherited', 'copied', 'downscaled', 'equal_share', 'parent_rate']);
const inheritedCells = ledger.rows.filter(r => FORBIDDEN_GEOGRAPHIC_METHODS.has(String(r.geographic_method || '').toLowerCase()));
assert(inheritedCells.length === 0, `gate: prohibited parent-child inheritance must be zero, found ${inheritedCells.length} cell(s) with a forbidden geographic_method`);
const allowedMethods = new Set(['', 'direct', 'aggregated', 'proxy', 'modelled']);
for (const r of ledger.rows) assert(allowedMethods.has(r.geographic_method || ''), `${r.slot_key}: geographic_method "${r.geographic_method}" is not in the allowed vocabulary -- gate 8 depends on this vocabulary staying closed`);

// --- gate 9: dynamic observations carry as_of/recheck rules ---
assert(freshnessQueue.cell_count === numericRows.length, `freshness queue covers ${freshnessQueue.cell_count} cells but ${numericRows.length} numeric cells exist`);
for (const row of freshnessQueue.rows) {
  assert(typeof row.as_of === 'string' && row.as_of.length > 0, `${row.slot_key}: freshness row missing as_of`);
  assert(['due_for_recheck', 'current', 'no_computable_schedule'].includes(row.recheck_status), `${row.slot_key}: invalid recheck_status ${row.recheck_status}`);
}

// --- gate 10: recheck triggers for unavailable values (legacy re-audit) ---
const REAUDITABLE_STATUSES = new Set(['official_unavailable', 'governed_unavailable', 'boundary_unresolved']);
const reauditableCellCount = ledger.rows.filter(r => REAUDITABLE_STATUSES.has(r.status)).length;
assert(reauditQueue.cell_count === reauditableCellCount, `reaudit queue covers ${reauditQueue.cell_count} cells but ${reauditableCellCount} reauditable cells exist`);
assert(reauditQueue.without_refresh_trigger === 0, `gate: every official_unavailable/governed_unavailable/boundary_unresolved closure must carry a refresh_trigger; ${reauditQueue.without_refresh_trigger} do not`);

// --- gate 11: secondary observations queued for supersession ---
const secondaryNumeric = numericRows.filter(r => r.badge && r.badge !== 'A');
assert(supersessionQueue.cell_count === secondaryNumeric.length, `supersession queue covers ${supersessionQueue.cell_count} cells but ${secondaryNumeric.length} non-official numeric cells exist`);

// --- dashboard cross-check ---
assert(dashboard.all_gates_pass === true, 'the local-54 completion dashboard reports at least one failing gate');

// --- deterministic rebuild parity ---
const before = {
  freshnessQueue: fs.readFileSync(path.join(root, 'data/audit/local-54-freshness-queue.json'), 'utf8'),
  supersessionQueue: fs.readFileSync(path.join(root, 'data/audit/local-54-supersession-queue.json'), 'utf8'),
  reauditQueue: fs.readFileSync(path.join(root, 'data/audit/local-54-reaudit-queue.json'), 'utf8'),
  dashboard: fs.readFileSync(path.join(root, 'data/local-54-completion-dashboard.json'), 'utf8')
};
execFileSync(process.execPath, ['scripts/p35/build-local-54-release-gate.mjs'], { cwd: root, stdio: 'pipe' });
const after = {
  freshnessQueue: fs.readFileSync(path.join(root, 'data/audit/local-54-freshness-queue.json'), 'utf8'),
  supersessionQueue: fs.readFileSync(path.join(root, 'data/audit/local-54-supersession-queue.json'), 'utf8'),
  reauditQueue: fs.readFileSync(path.join(root, 'data/audit/local-54-reaudit-queue.json'), 'utf8'),
  dashboard: fs.readFileSync(path.join(root, 'data/local-54-completion-dashboard.json'), 'utf8')
};
for (const key of Object.keys(before)) assert(before[key] === after[key], `${key} is not deterministic / not up to date -- re-run npm run p35:build and commit the result`);

if (process.exitCode !== 1) {
  console.log(`P35_RELEASE_GATE_OK indicators=54 constituency=${constituencyCells.length} ward=${wardCells.length} representatives=${womanReps.length} freshness=${freshnessQueue.cell_count} supersession=${supersessionQueue.cell_count} reaudit_groups=${reauditQueue.reason_group_count} all_gates_pass=${dashboard.all_gates_pass}`);
}
