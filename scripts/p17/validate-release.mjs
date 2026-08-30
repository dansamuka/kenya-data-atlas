import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const assert = (condition, message) => { if (!condition) throw new Error(`P17 validation: ${message}`); };

try {
  const pkg = json('package.json');
  const roadmap = json('data/project-roadmap.json');
  const distribution = json('data/distribution/manifest.json');
  const opportunities = json('data/opportunities/opportunity-registry.json');
  const manifest = json('data/release/v1.0.0.json');
  const unresolved = read('docs/releases/v1.0.0-unresolved.md');
  const releaseNotes = read('docs/releases/v1.0.0.md');
  const readme = read('README.md');
  const roadmapDoc = read('ROADMAP.md');
  const citation = read('CITATION.cff');
  const checksums = read('data/distribution/checksums.sha256').trim().split(/\r?\n/).filter(Boolean);
  const p17 = roadmap.phases.find((phase) => phase.id === 'P17');

  assert(p17, 'P17 must exist in the roadmap');
  assert(['next', 'complete'].includes(p17.status), `P17 must be next or complete, got ${p17.status}`);
  assert(manifest.schema_version === 'kda.release-manifest.v1', 'release manifest schema must be kda.release-manifest.v1');
  assert(manifest.release_version === '1.0.0', 'release manifest version must be 1.0.0');
  assert(manifest.source_ref === 'v1.0.0', 'release manifest must resolve through v1.0.0');
  assert(manifest.application_version === pkg.version, 'release manifest application version must match package.json');
  assert(manifest.data_contract_version === distribution.data_contract_version, 'data-contract version must match distribution manifest');
  assert(manifest.completed_phase_count === roadmap.phases.filter((phase) => phase.status === 'complete').length, 'completed phase count must reproduce from roadmap');
  for (const [key, value] of Object.entries(distribution.counts)) {
    assert(manifest.counts[key] === value, `release count ${key} must match distribution manifest`);
  }
  const opportunityCount = opportunities.meta?.programme_count ?? opportunities.programmes?.length ?? 0;
  assert(manifest.counts.opportunity_programmes === opportunityCount, 'opportunity count must match P14 registry');
  assert(checksums.length >= 10, 'distribution checksum inventory must be populated');

  for (const required of [
    'Narok fiscal-delivery score',
    'Mandera East / Lafey ward spatial hold',
    'longitudinal composite',
    'P14 programme freshness',
    'external source links'
  ]) assert(unresolved.includes(required), `unresolved register missing ${required}`);
  assert(!/\bTBD\b|\bTODO\b/i.test(unresolved), 'unresolved register must not contain TBD/TODO placeholders');

  for (const required of ['Kenya Data Atlas v1.0.0', 'Reproducibility', 'Browser and accessibility', 'Known limitations']) {
    assert(releaseNotes.includes(required), `release notes missing ${required}`);
  }
  assert(readme.includes('P17_RELEASE_STATE_START') && readme.includes('P17_RELEASE_STATE_END'), 'README must expose the P17 release-state marker');
  assert(roadmapDoc.includes('P17_STATUS_START') && roadmapDoc.includes('P17_STATUS_END'), 'ROADMAP must expose the P17 status marker');
  assert(!readme.includes('P16 is the next v1.0 hardening phase'), 'README must not describe P16 as next');
  assert(!roadmapDoc.includes('P14 — Action & Opportunity Finder Beta** is explicitly **deferred'), 'ROADMAP must not describe completed P14 as deferred');

  if (p17.status === 'complete') {
    assert(roadmap.phases.every((phase) => phase.status === 'complete'), 'all P00–P17 phases must be complete at v1.0 release');
    assert(pkg.version === '1.0.0', 'package version must be 1.0.0 when P17 is complete');
    assert(manifest.release_status === 'released', 'manifest must be released when P17 is complete');
    assert(manifest.completed_phase_count === 18, 'all 18 phases must be complete');
    assert(citation.includes('version: "1.0.0"'), 'CITATION.cff must identify v1.0.0');
    assert(readme.includes('**Release state: v1.0.0 released.**'), 'README must identify v1.0.0 as released');
    assert(roadmapDoc.includes('**P00–P17 are complete.**'), 'ROADMAP must identify terminal completion');
  } else {
    assert(manifest.release_status === 'release_candidate', 'manifest must remain release_candidate before exact-commit gates pass');
    assert(manifest.completed_phase_count === 17, 'release candidate must have P00–P16 complete and P17 next');
  }

  console.log(`P17_RELEASE_PACKAGE_OK status=${manifest.release_status}`);
  console.log(`P17_RELEASE_COUNTS_OK indicators=${manifest.counts.indicators} series=${manifest.counts.series} observations=${manifest.counts.observations}`);
  console.log(`P17_UNRESOLVED_REGISTER_OK items=5+`);
  console.log('P17_GOVERNANCE_STATE_OK');
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
