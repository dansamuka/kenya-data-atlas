import fs from 'node:fs';

const requiredFiles = [
  'playwright.config.mjs',
  'tests/browser/release.spec.mjs',
  'scripts/release/run-lighthouse.mjs',
  'scripts/release/audit-links.mjs',
  'scripts/release/validate-seo.mjs',
  'assets/release-hardening.css',
  'favicon.svg',
  'place-profile.css',
  'robots.txt',
  'sitemap.xml',
  'docs/P16-RELEASE-HARDENING.md',
  '.github/workflows/release-hardening.yml'
];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`P16 required file missing: ${file}`);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (pkg.version !== '0.19.0') throw new Error(`P16 expects package version 0.19.0, found ${pkg.version}`);
for (const script of ['p16:seo', 'p16:links', 'p16:static', 'p16:browser', 'p16:lighthouse', 'p16:release']) {
  if (!pkg.scripts?.[script]) throw new Error(`P16 package script missing: ${script}`);
}
if (!pkg.scripts.test.includes('p16:static')) throw new Error('P16 static validation is not wired into npm test');

const html = fs.readFileSync('index.html', 'utf8');
if (!html.includes('assets/release-hardening.css')) throw new Error('P16 release-hardening CSS is not loaded');
if (!html.includes('class="skip-link"')) throw new Error('P16 skip-link contract missing');
if (!/<main id="main" tabindex="-1">/.test(html)) throw new Error('P16 main focus target missing tabindex=-1');
if (!html.includes('rel="icon" href="favicon.svg"')) throw new Error('P16 explicit favicon metadata missing');

const roadmap = JSON.parse(fs.readFileSync('data/project-roadmap.json', 'utf8'));
const p16 = roadmap.phases.find(p => p.id === 'P16');
const p17 = roadmap.phases.find(p => p.id === 'P17');
if (p16?.status !== 'complete') throw new Error(`P16 roadmap status must be complete, found ${p16?.status}`);
if (p17?.status !== 'next') throw new Error(`P17 roadmap status must be next, found ${p17?.status}`);

const workflow = fs.readFileSync('.github/workflows/release-hardening.yml', 'utf8');
for (const gate of ['npm audit --omit=dev --audit-level=high', 'playwright install --with-deps chromium firefox webkit', 'npm run p16:browser', 'npm run p16:lighthouse', 'npm run p16:links']) {
  if (!workflow.includes(gate)) throw new Error(`P16 permanent workflow missing gate: ${gate}`);
}

console.log('P16_BROWSER_MATRIX_WIRED_OK chromium=1 firefox=1 webkit=1 mobile=chromium');
console.log('P16_ACCESSIBILITY_GATE_WIRED_OK axe=wcag22aa keyboard=1 focus=1 reduced_motion=1');
console.log('P16_PERFORMANCE_GATE_WIRED_OK lighthouse=4-routes');
console.log('P16_LINK_AND_SEO_GATE_WIRED_OK favicon=1');
console.log('P16_PRODUCTION_DEPENDENCY_AUDIT_WIRED_OK');
console.log('P16_ROADMAP_HANDOFF_OK next=P17');
console.log('P16_RELEASE_HARDENING_ALL_OK');
