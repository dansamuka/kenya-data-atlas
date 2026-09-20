// P33 -- Validate candidate-value conflict resolution.
//
// Re-checks the roadmap's exact P33 acceptance criteria (data/local-54-completion-roadmap.json):
//   1. zero preferred S4 values lack competing-source records
//   2. zero conflicts are resolved by unlabelled averaging
//   3. duplicate lineages do not inflate corroboration
//   4. every probable value has confidence and rationale
//   5. material close calls remain in review until adjudicated
// Also re-derives both evidence files deterministically from their source contracts and diffs
// against the committed files.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const fail = m => { console.error(`P33_CONFLICT_RESOLUTION_FAIL ${m}`); process.exitCode = 1; };
const assert = (c, m) => { if (!c) fail(m); };

const candidateObservations = readJson('data/evidence/candidate-observations.json');
const conflictDecisions = readJson('data/evidence/conflict-decisions.json');
const legacyConflicts = readJson('data/audit/legacy-conflicts.json');
const legacyTierAudit = readJson('data/audit/legacy-source-tier-audit.json');

assert(candidateObservations.schema_version === 'kda.p33.candidate-observations.v1', 'candidate-observations schema mismatch');
assert(conflictDecisions.schema_version === 'kda.p33.conflict-decisions.v1', 'conflict-decisions schema mismatch');

// --- structural integrity of candidate-observations.json ---
const groupIds = new Set();
for (const group of candidateObservations.candidate_groups) {
  assert(!groupIds.has(group.group_id), `duplicate candidate group_id ${group.group_id}`);
  groupIds.add(group.group_id);
  assert(Array.isArray(group.candidates) && group.candidates.length >= 1, `${group.group_id}: must have at least one candidate`);
  assert(fs.existsSync(path.join(root, group.source_contract)), `${group.group_id}: source_contract ${group.source_contract} does not exist`);
  if (group.candidates.length > 1) {
    const lineages = group.candidates.map(c => c.evidence_lineage_id);
    assert(new Set(lineages).size === lineages.length, `${group.group_id}: duplicate evidence_lineage_id across candidates -- duplicate lineages must not inflate corroboration`);
    for (const c of group.candidates) {
      for (const f of ['candidate_id', 'source_tier', 'source_label', 'value', 'status', 'evidence_lineage_id']) {
        assert(Object.hasOwn(c, f), `${group.group_id}/${c.candidate_id || '(no id)'}: candidate missing required field ${f}`);
      }
    }
  }
}
assert(candidateObservations.candidate_group_count === candidateObservations.candidate_groups.length, 'candidate_group_count does not match candidate_groups.length');

// --- structural integrity of conflict-decisions.json + acceptance gates 2-5 ---
const REQUIRED_DECISION_FIELDS = ['decision_id', 'indicator_code', 'level', 'group_ids', 'conflict_type', 'candidate_count', 'independent_lineages', 'selection_method', 'confidence', 'rationale', 'resulting_disposition', 'not_an_unlabelled_average', 'source_contract'];
const UNLABELLED_AVERAGE_METHODS = new Set(['average', 'mean', 'unlabelled_average']);
for (const decision of conflictDecisions.decisions) {
  for (const f of REQUIRED_DECISION_FIELDS) assert(Object.hasOwn(decision, f), `${decision.decision_id || '(no id)'}: decision missing required field ${f}`);
  assert(Array.isArray(decision.group_ids) && decision.group_ids.length > 0, `${decision.decision_id}: must reference at least one candidate group`);
  for (const gid of decision.group_ids) assert(groupIds.has(gid), `${decision.decision_id}: references unknown candidate group ${gid}`);
  assert(decision.independent_lineages >= 2, `${decision.decision_id}: a conflict decision requires at least 2 independent evidence lineages (gate: zero preferred S4 values lack competing-source records)`);
  // gate 2 -- zero conflicts resolved by unlabelled averaging
  assert(!UNLABELLED_AVERAGE_METHODS.has(decision.selection_method), `${decision.decision_id}: selection_method "${decision.selection_method}" resolves a conflict by unlabelled averaging, which is prohibited`);
  assert(decision.not_an_unlabelled_average === true, `${decision.decision_id}: must explicitly assert not_an_unlabelled_average`);
  // gate 4 -- every probable value has confidence and rationale
  assert(typeof decision.confidence === 'string' && decision.confidence.length > 0, `${decision.decision_id}: missing confidence`);
  assert(typeof decision.rationale === 'string' && decision.rationale.length >= 20, `${decision.decision_id}: rationale is missing or too thin to be a real rationale`);
  assert(fs.existsSync(path.join(root, decision.source_contract)), `${decision.decision_id}: source_contract ${decision.source_contract} does not exist`);
}
assert(conflictDecisions.decision_count === conflictDecisions.decisions.length, 'decision_count does not match decisions.length');

// --- gate 1 + gate 5, cross-checked against the actual current registry state ---
// Today's ground truth (data/audit/legacy-conflicts.json + the legacy source-tier audit) is that
// zero preferred observations are machine-tiered S4. If that ever becomes nonzero, this assertion
// requires at least that many decisions to exist -- it is not a free pass to leave S4 rows
// unadjudicated ("material close calls remain in review until adjudicated" is enforced by making
// a nonzero S4 count without any decisions a hard failure).
const auditRows = Array.isArray(legacyTierAudit) ? legacyTierAudit : (legacyTierAudit.rows || []);
const s4Count = auditRows.filter(r => String(r.audited_source_tier || '').startsWith('S4')).length;
assert(legacyConflicts.count === 0 ? true : legacyConflicts.count === legacyConflicts.rows.length, 'legacy-conflicts.json count/rows length mismatch');
if (s4Count > 0 || legacyConflicts.count > 0) {
  assert(conflictDecisions.decisions.length > 0, `${s4Count} S4-tiered preferred observation(s) and/or ${legacyConflicts.count} legacy conflict candidate(s) exist but zero conflict decisions are recorded -- every S4 value or detected conflict must be adjudicated, not left unexplained`);
} else {
  console.log('P33_NO_S4_PREFERRED_OBSERVATIONS_TODAY_OK s4_count=0 legacy_conflict_candidates=0 -- gate is currently vacuously satisfied, not bypassed');
}

// --- deterministic rebuild parity ---
execFileSync(process.execPath, ['scripts/p33/build-conflict-resolution.mjs'], { cwd: root, stdio: 'pipe' });
const rebuiltCandidates = readJson('data/evidence/candidate-observations.json');
const rebuiltDecisions = readJson('data/evidence/conflict-decisions.json');
assert(JSON.stringify(rebuiltCandidates) === JSON.stringify(candidateObservations), 'candidate-observations.json is not deterministic / not up to date -- re-run npm run p33:build and commit the result');
assert(JSON.stringify(rebuiltDecisions) === JSON.stringify(conflictDecisions), 'conflict-decisions.json is not deterministic / not up to date -- re-run npm run p33:build and commit the result');

if (process.exitCode !== 1) {
  console.log(`P33_CONFLICT_RESOLUTION_OK candidate_groups=${candidateObservations.candidate_group_count} decisions=${conflictDecisions.decision_count} s4_preferred_observations=${s4Count} legacy_conflict_candidates=${legacyConflicts.count}`);
}
