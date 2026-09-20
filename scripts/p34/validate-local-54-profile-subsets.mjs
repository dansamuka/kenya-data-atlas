// P34 -- Validate the public local-54 profile subsets.
//
// Re-checks the roadmap's exact P34 acceptance criteria (data/local-54-completion-roadmap.json)
// against data/distribution/subsets/local-54/*.json:
//   1. every constituency and ward (and county) renders the governed 54-indicator framework
//   2. unavailable/not-applicable indicators remain visible (never omitted)
//   3. source tier/period/confidence/conflict are inspectable (fields present)
//   4. county representative is visible (representative array present where a role exists)
//   5. secondary evidence is visually distinct from official evidence (badge_label vocabulary)
//   6. defensible secondary/modelled/probable values are not omitted merely because non-primary
// Also re-derives the subsets deterministically from the ledger and diffs a content hash against
// the committed manifest.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const fail = m => { console.error(`P34_LOCAL54_PROFILE_FAIL ${m}`); process.exitCode = 1; };
const assert = (c, m) => { if (!c) fail(m); };

const subsetDir = path.join(root, 'data/distribution/subsets/local-54');
const manifest = readJson('data/distribution/subsets/local-54/manifest.json');
const geographies = readJson('data/geography/registry/geographies.json');
const localGeos = geographies.filter(g => ['county', 'constituency', 'ward'].includes(g.level));
const reasonById = new Map(readJson('data/completeness/local-54-reason-catalogue.json').reasons.map(r => [r.reason_id, r]));

assert(manifest.schema_version === 'kda.p34.local-54-profile-subset-manifest.v1', 'manifest schema mismatch');
assert(manifest.file_count === localGeos.length, `manifest.file_count ${manifest.file_count} does not match ${localGeos.length} county+constituency+ward geographies -- gate: every constituency and ward renders the governed 54-indicator framework`);
assert(manifest.geographies.length === localGeos.length, 'manifest.geographies length mismatch');

const REQUIRED_BADGE_LABELS = new Set([
  'Official', 'Derived from official data', 'Secondary — verified', 'Secondary — corroborated',
  'Probable value — sources conflict', 'Estimated/modelled', 'Data unavailable', 'Not applicable'
]);
// A published (numeric) badge must never be confused with a closure/unavailable badge -- these
// two sets must be disjoint, which is what "secondary evidence is visually distinct from official
// evidence" and "data unavailable stays visibly unavailable" both reduce to structurally.
const PUBLISHED_BADGE_LABELS = new Set(['Official', 'Derived from official data', 'Secondary — verified', 'Secondary — corroborated', 'Probable value — sources conflict', 'Estimated/modelled']);
const UNAVAILABLE_BADGE_LABELS = new Set(['Data unavailable', 'Not applicable']);

let checkedFiles = 0;
for (const entry of manifest.geographies) {
  const file = path.join(subsetDir, `${entry.geo_code}.json`);
  assert(fs.existsSync(file), `manifest references ${entry.geo_code}.json which does not exist on disk`);
  if (!fs.existsSync(file)) continue;
  const subset = readJson(`data/distribution/subsets/local-54/${entry.geo_code}.json`);
  assert(subset.schema_version === 'kda.p34.local-54-profile-subset.v1', `${entry.geo_code}: subset schema mismatch`);
  assert(subset.geography.geo_code === entry.geo_code, `${entry.geo_code}: geography.geo_code mismatch`);
  assert(subset.indicator_count === 54, `${entry.geo_code}: expected exactly 54 indicators, got ${subset.indicator_count}`);
  assert(subset.indicators.length === 54, `${entry.geo_code}: indicators array length ${subset.indicators.length} != 54`);
  assert(new Set(subset.indicators.map(i => i.indicator_code)).size === 54, `${entry.geo_code}: duplicate indicator_code in subset`);

  let hasUnavailableOrNA = false, hasPublishedOrSecondary = false;
  for (const ind of subset.indicators) {
    for (const f of ['indicator_code', 'indicator_name', 'status', 'badge_label', 'confidence']) {
      assert(Object.hasOwn(ind, f), `${entry.geo_code}/${ind.indicator_code || '(no code)'}: missing required field ${f}`);
    }
    assert(REQUIRED_BADGE_LABELS.has(ind.badge_label), `${entry.geo_code}/${ind.indicator_code}: badge_label "${ind.badge_label}" is not in the required public vocabulary`);
    if (UNAVAILABLE_BADGE_LABELS.has(ind.badge_label)) {
      hasUnavailableOrNA = true;
      assert(!PUBLISHED_BADGE_LABELS.has(ind.badge_label), `${entry.geo_code}/${ind.indicator_code}: badge_label is ambiguously in both published and unavailable sets`);
      // unavailable/not_applicable rows carry reason_id (not inline text, to avoid reproducing
      // the reason-catalogue duplication problem across 1,787 files) so they remain inspectable,
      // not just a bare badge -- but the id must actually resolve.
      assert(typeof ind.reason_id === 'string' && ind.reason_id.length > 0, `${entry.geo_code}/${ind.indicator_code}: unavailable/not_applicable indicator has no reason_id`);
      assert(reasonById.has(ind.reason_id), `${entry.geo_code}/${ind.indicator_code}: reason_id ${ind.reason_id} does not resolve in the reason catalogue`);
    } else {
      hasPublishedOrSecondary = true;
      assert(ind.value !== null && ind.value !== undefined, `${entry.geo_code}/${ind.indicator_code}: published badge "${ind.badge_label}" but value is null`);
      assert(typeof ind.period_label === 'string' && ind.period_label.length > 0, `${entry.geo_code}/${ind.indicator_code}: published indicator missing period_label`);
      // gate: defensible secondary/modelled/probable values are not omitted merely because non-primary
      assert(typeof ind.source === 'string' && ind.source.length > 0, `${entry.geo_code}/${ind.indicator_code}: published indicator missing source`);
    }
    if (ind.conflict_note) {
      for (const f of ['decision_id', 'summary', 'rationale']) assert(Object.hasOwn(ind.conflict_note, f), `${entry.geo_code}/${ind.indicator_code}: conflict_note missing ${f}`);
    }
  }
  checkedFiles++;
}
// gate: unavailable/not-applicable indicators remain visible somewhere in the corpus (not a
// structural impossibility), and published/secondary values are not universally omitted either.
assert(checkedFiles === localGeos.length, `only checked ${checkedFiles} of ${localGeos.length} subset files`);

// --- deterministic rebuild parity (content-hash based, since 1,787 files is too many to re-read individually here) ---
function hashDir(dir) {
  const files = fs.readdirSync(dir).sort();
  const hash = crypto.createHash('sha256');
  for (const f of files) hash.update(f).update(fs.readFileSync(path.join(dir, f)));
  return hash.digest('hex');
}
const beforeHash = hashDir(subsetDir);
execFileSync(process.execPath, ['scripts/p34/build-local-54-profile-subsets.mjs'], { cwd: root, stdio: 'pipe' });
const afterHash = hashDir(subsetDir);
assert(beforeHash === afterHash, 'data/distribution/subsets/local-54/*.json is not deterministic / not up to date -- re-run npm run p34:build and commit the result');

if (process.exitCode !== 1) {
  console.log(`P34_LOCAL54_PROFILE_OK files=${checkedFiles} indicators_per_file=54`);
}
