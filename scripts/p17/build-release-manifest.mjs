import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const writeJson = (file, value) => {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
};

const pkg = readJson('package.json');
const distribution = readJson('data/distribution/manifest.json');
const roadmap = readJson('data/project-roadmap.json');
const opportunities = readJson('data/opportunities/opportunity-registry.json');
const p17 = roadmap.phases.find((phase) => phase.id === 'P17');
if (!p17) throw new Error('P17 missing from project roadmap');

const released = p17.status === 'complete';
const manifest = {
  schema_version: 'kda.release-manifest.v1',
  release_version: '1.0.0',
  release_status: released ? 'released' : 'release_candidate',
  release_date: '2026-08-30',
  source_ref: 'v1.0.0',
  application_version: pkg.version,
  data_contract_version: distribution.data_contract_version,
  completed_phase_count: roadmap.phases.filter((phase) => phase.status === 'complete').length,
  counts: {
    ...distribution.counts,
    opportunity_programmes: opportunities.meta?.programme_count ?? opportunities.programmes?.length ?? 0
  },
  methodology_versions: distribution.methodology_versions,
  release_evidence: {
    deterministic_build: 'npm run build:data',
    validation_suite: 'npm test',
    geometry_audit: 'npm run geography:audit',
    browser_release_audit: '.github/workflows/release-audit.yml',
    exact_commit_deployment_gate: '.github/workflows/p17-publish.yml',
    distribution_manifest: 'data/distribution/manifest.json',
    distribution_checksums: 'data/distribution/checksums.sha256',
    unresolved_items: 'docs/releases/v1.0.0-unresolved.md',
    release_notes: 'docs/releases/v1.0.0.md'
  },
  canonical_products: [
    'data/geography/registry/geographies.json',
    'data/catalogue/registry/datasets.json',
    'data/indicators/registry/indicators.json',
    'data/indicators/registry/series.json',
    'data/indicators/registry/observations.json',
    'data/countyiq/county-summary.json',
    'data/results/county-results.json',
    'data/evidence/county-documents.json',
    'data/opportunities/opportunity-registry.json',
    'data/policy/indicator-policy.json'
  ]
};

writeJson('data/release/v1.0.0.json', manifest);
console.log(`P17_RELEASE_MANIFEST_OK status=${manifest.release_status} app=${manifest.application_version} phases=${manifest.completed_phase_count}`);
