import fs from 'node:fs';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = message => { throw new Error(`Data-completion execution validation failed: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

const phaseRoadmap = readJson('data/data-completion-roadmap.json');
const execution = readJson('data/data-completion-execution.json');
const summary = readJson('data/completeness/summary.json');

const expectedPhases = ['P18','P19','P20','P21','P22','P23','P24','P25','P26'];
const phaseIds = (phaseRoadmap.phases || []).map(p => p.id);
assert(JSON.stringify(phaseIds) === JSON.stringify(expectedPhases), `phase authority must remain ${expectedPhases.join(' → ')}`);

assert(execution.mode === 'parallel_governed_tracks', 'execution mode must be parallel_governed_tracks');
assert(execution.governed_denominator === 20115, 'execution overlay must retain the 20,115-slot denominator');
assert(summary.total_slots === execution.governed_denominator, 'live completeness denominator diverges from execution overlay');
assert(phaseRoadmap.baseline?.total_slots === execution.governed_denominator, 'historical phase-roadmap denominator diverges from execution overlay');
assert(summary.unknown_missing === 0, 'unknown_missing must remain zero');

const tracks = new Map((execution.tracks || []).map(t => [t.track_id, t]));
assert(JSON.stringify(tracks.get('county_completion')?.sequence) === JSON.stringify(['P21','P22']), 'county track must retain P21 → P22');
assert(JSON.stringify(tracks.get('local_intelligence_accelerator')?.sequence) === JSON.stringify(['P23A','P23']), 'local-intelligence track must be P23A → P23');
assert(tracks.get('local_intelligence_accelerator')?.feeds_phase === 'P23', 'P23A must feed P23');
assert(JSON.stringify(tracks.get('final_convergence')?.sequence) === JSON.stringify(['P24','P25','P26']), 'final convergence must remain P24 → P25 → P26');
assert(JSON.stringify(execution.closure_order) === JSON.stringify(expectedPhases), 'formal phase closure order must remain unchanged');

const p23a = execution.accelerators?.P23A;
assert(p23a, 'P23A accelerator must exist');
assert(p23a.parent_phase === 'P23', 'P23A must remain subordinate to P23');
assert(p23a.changes_governed_denominator === false, 'P23A must not change the governed denominator');
assert(p23a.uses_existing_parent_phase_slots_only === true, 'P23A may only resolve pre-existing P23 slots');
assert(p23a.target_geography_level === 'constituency', 'P23A must target constituency geography');
assert(p23a.canonical_geography_count === 290, 'P23A must reconcile exactly 290 constituencies');
assert(p23a.first_tranche?.indicator_code === 'IND-REGISTERED-VOTERS', 'P23A first tranche must remain registered voters');
assert(p23a.first_tranche?.expected_existing_p23_slots === 290, 'registered-voter tranche must resolve only the existing 290 constituency slots');
assert(p23a.first_tranche?.statistical_authority_schedule?.includes('First Schedule'), 'registered-voter provenance must retain the official IEBC ward schedule used by Sprint 2');
assert(p23a.first_tranche?.published_constituency_schedule?.includes('Second Schedule'), 'the Gazette constituency schedule must remain documented as a published cross-check/source context');
assert(p23a.first_tranche?.canonical_treatment?.includes('B — Official derived'), 'registered-voter tranche must preserve the audited Sprint 2 B/Official-derived treatment');

const byPhase = new Map((phaseRoadmap.phases || []).map(p => [p.id, p]));
const p21 = byPhase.get('P21');
const p23 = byPhase.get('P23');
const p24 = byPhase.get('P24');
const p26 = byPhase.get('P26');
const p21Remaining = summary.by_completion_phase?.P21 ?? 0;

assert(p21Remaining <= 423, 'live P21 unresolved count cannot exceed its governed phase allocation');
assert(p21?.progress?.remaining_slots === p21Remaining, `P21 roadmap progress (${p21?.progress?.remaining_slots}) must match live completeness (${p21Remaining})`);
assert(p21?.progress?.resolved_in_p21 === 423-p21Remaining, 'P21 resolved progress must reconcile to the original 423-slot governed queue');
assert(p23?.acceptance?.some(x => x.includes('3,190')), 'P23 full 3,190-slot acceptance gate must remain intact');
assert(p23?.acceptance?.some(x => x.includes('all 290 constituencies')), 'P23 must retain 290-constituency reconciliation');
assert(p23?.acceptance?.some(x => x.includes('no county value is inherited')), 'P23 must retain the no county→constituency inheritance rule');
assert(p23?.acceptance?.some(x => x.includes('boundary vintages')), 'P23 must retain explicit boundary/election vintage requirements');
assert(p24?.acceptance?.some(x => x.includes('13,050')), 'P24 full ward-slot acceptance gate must remain intact');
assert(p24?.acceptance?.some(x => x.includes('no constituency/county value is inherited')), 'P24 must retain the no parent→ward inheritance rule');
assert(p26?.acceptance?.some(x => x.includes('resolved slot count equals total governed slot count')), 'P26 100% governed-resolution gate must remain intact');
assert(p26?.acceptance?.some(x => x.includes('prohibited parent-to-child inherited observations equals zero')), 'P26 inheritance gate must remain intact');

assert((summary.by_completion_phase?.P23 ?? 0) <= 3190, 'live P23 unresolved count cannot exceed its governed phase allocation');
assert((summary.by_completion_phase?.P24 ?? 0) <= 13050, 'live P24 unresolved count cannot exceed its governed phase allocation');
assert(!('target_slot_count' in p23a), 'P23A must not introduce a second target-slot denominator');

console.log(JSON.stringify({
  ok: true,
  mode: execution.mode,
  denominator: execution.governed_denominator,
  live_resolved: summary.resolved_slots,
  live_unresolved: summary.unresolved_slots,
  p21_remaining: p21Remaining,
  p23_remaining: summary.by_completion_phase?.P23,
  p24_remaining: summary.by_completion_phase?.P24,
  p23a_first_tranche: p23a.first_tranche.indicator_code,
  p23a_voter_treatment: p23a.first_tranche.canonical_treatment
}, null, 2));
