import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const write = (p, value) => fs.writeFileSync(p, value);

// Static SEO, focus target and hardening stylesheet.
let html = read('index.html');
if (!html.includes('rel="canonical"')) {
  const block = `  <meta name="robots" content="index,follow,max-image-preview:large">\n  <link rel="canonical" href="https://dansamuka.github.io/kenya-data-atlas/">\n  <meta property="og:type" content="website">\n  <meta property="og:site_name" content="Kenya Data Atlas">\n  <meta property="og:title" content="Kenya Data Atlas — Understand Kenya through data">\n  <meta property="og:description" content="Explore Kenya from country to county, constituency and ward; compare indicators, follow series and trace public data to source.">\n  <meta property="og:url" content="https://dansamuka.github.io/kenya-data-atlas/">\n  <meta name="twitter:card" content="summary">\n  <meta name="twitter:title" content="Kenya Data Atlas — Understand Kenya through data">\n  <meta name="twitter:description" content="Explore Kenya place by place with source-auditable public data and CountyIQ evidence.">\n  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Kenya Data Atlas","url":"https://dansamuka.github.io/kenya-data-atlas/","description":"Independent, source-auditable public data product for exploring Kenya from country to county, constituency and ward."},{"@type":"Dataset","name":"Kenya Data Atlas public data distribution","url":"https://dansamuka.github.io/kenya-data-atlas/data/distribution/manifest.json","description":"Versioned public statistical registries, county analytical results and official-document evidence for Kenya.","license":"https://github.com/dansamuka/kenya-data-atlas/blob/main/DATA-NOTICE.md","creator":{"@type":"Organization","name":"Kenya Data Atlas"},"spatialCoverage":{"@type":"Place","name":"Kenya"}}]}</script>`;
  html = html.replace('  <meta name="theme-color" content="#123c32">', `${block}\n  <meta name="theme-color" content="#123c32">`);
}
if (!html.includes('assets/release-hardening.css')) {
  html = html.replace('  <link rel="stylesheet" href="assets/mobile.css">', '  <link rel="stylesheet" href="assets/mobile.css">\n  <link rel="stylesheet" href="assets/release-hardening.css">');
}
html = html.replace('<main id="main">', '<main id="main" tabindex="-1">');
write('index.html', html);

// Roadmap handoff.
const roadmap = JSON.parse(read('data/project-roadmap.json'));
const p16 = roadmap.phases.find(p => p.id === 'P16');
const p17 = roadmap.phases.find(p => p.id === 'P17');
p16.status = 'complete';
p17.status = 'next';
write('data/project-roadmap.json', `${JSON.stringify(roadmap, null, 2)}\n`);

let roadMd = read('ROADMAP.md');
roadMd = roadMd.replace('**P00–P13 are complete. P15 is complete.**', '**P00–P13, P15 and P16 are complete.**');
roadMd = roadMd.replace('## Next phase\n\n**P16 — Real-browser accessibility, SEO and performance release audit**\n\nRun the public product through Chromium, Firefox and WebKit; close critical WCAG 2.2 AA issues; test keyboard/focus/mobile journeys; enforce Lighthouse/performance budgets; and run a reproducible external-link and crawlability audit.\n\nRecommended next-session instruction:\n\n> Complete P16 from `data/project-roadmap.json`. Do not restart completed phases. Run real-browser, accessibility, link-integrity, SEO and performance gates and report any unmet release blocker explicitly.\n\n## Final v1.0 phase\n\n**P17 — Final reproducibility, governance and v1.0 release** follows P16.', '## Completed release hardening\n\n**P16 — Real-browser accessibility, SEO and performance release audit** is complete. Chromium, Firefox, WebKit and mobile Chromium are now permanent CI gates alongside automated WCAG checks, Lighthouse budgets, link integrity, crawlability metadata and keyboard/focus regressions. See `docs/P16-RELEASE-HARDENING.md`.\n\n## Next and final v1.0 phase\n\n**P17 — Final reproducibility, governance and v1.0 release** is next.');
roadMd = roadMd.replace('Core v1.0 track: **P15 → P16 → P17 → v1.0**.', 'Core v1.0 track: **P15 complete → P16 complete → P17 next → v1.0**.');
write('ROADMAP.md', roadMd);

let plan = read('docs/REPO-COMPLETION-PLAN.md');
const oldP16 = `## P16 — Accessibility + browser + SEO + performance release audit\n\n**Status: next.**\n\nRecommended next-session instruction: **Complete P16** from \`data/project-roadmap.json\`. Do not restart completed phases.\n\nA dedicated public-launch hardening session:\n\n- WCAG 2.2 AA review;\n- keyboard/focus/contrast/labels;\n- Chrome/Firefox/Safari/Edge smoke checks;\n- mobile layout;\n- broken links;\n- metadata/social cards/SEO;\n- JS console errors;\n- page/asset weight;\n- slow-network degradation.\n\n**Exit:** critical issues fixed; remaining limitations documented.`;
const newP16 = `## P16 — Accessibility + browser + SEO + performance release audit\n\n**Status: complete.**\n\nP16 adds permanent Playwright coverage in Chromium, Firefox, WebKit and mobile Chromium; axe-based WCAG 2.2 AA automated checks; skip-link, focus, keyboard, reduced-motion and mobile navigation regression tests; Lighthouse release budgets; a deduplicated external-link audit; and canonical/robots/sitemap/Open Graph/JSON-LD metadata.\n\nRelease evidence and the known hash-router crawlability limitation are documented in \`docs/P16-RELEASE-HARDENING.md\`.\n\n**Exit:** browser, automated accessibility, Lighthouse, link, full Atlas and independent geometry gates pass; remaining limitation is explicitly documented.`;
if (!plan.includes(oldP16)) throw new Error('Could not locate P16 completion-plan section');
plan = plan.replace(oldP16, newP16);
plan = plan.replace('## P17 — Final reproducibility + governance + v1.0\n\n**Status: planned.**', '## P17 — Final reproducibility + governance + v1.0\n\n**Status: next.**\n\nRecommended next-session instruction: **Complete P17** from `data/project-roadmap.json`. Do not restart completed phases.');
plan = plan.replace('`P00–P13 complete → P15 complete → P16 next → P17 → v1.0`', '`P00–P13 complete → P15 complete → P16 complete → P17 next → v1.0`');
write('docs/REPO-COMPLETION-PLAN.md', plan);

let readme = read('README.md');
readme = readme.replace('P00–P13 are complete, P15 is the current data-distribution release, P16 is the next v1.0 hardening phase, and the high-maintenance Opportunity Finder has been deliberately deferred to a v1.1 Beta rather than made a v1.0 blocker.', 'P00–P13, P15 and P16 are complete. Real-browser accessibility, SEO, performance and link-integrity gates are now permanent CI. P17 is the final v1.0 reproducibility/governance phase, while the high-maintenance Opportunity Finder remains deliberately deferred to v1.1 Beta.');
write('README.md', readme);

let changelog = read('CHANGELOG.md');
if (!changelog.includes('## 0.19.0')) {
  const entry = `## 0.19.0 — 2026-08-30\n\n### P16 — Real-browser release hardening\n\n- Added Chromium, Firefox, WebKit and mobile Chromium Playwright release journeys.\n- Added automated WCAG 2.2 AA/axe, keyboard, focus and reduced-motion gates.\n- Added Lighthouse performance/accessibility/best-practices/SEO budgets.\n- Added deduplicated external-link audit and CI artifacts.\n- Added canonical, robots, sitemap, Open Graph, Twitter and JSON-LD metadata.\n- Documented the hash-router crawlability limitation; P17 is now the final v1.0 phase.\n\n`;
  changelog = changelog.replace('# Changelog\n\n', `# Changelog\n\n${entry}`);
  write('CHANGELOG.md', changelog);
}

let gitignore = read('.gitignore');
for (const line of ['reports/p16/', 'test-results/', 'playwright-report/']) {
  if (!gitignore.includes(`${line}\n`)) gitignore += `${line}\n`;
}
write('.gitignore', gitignore);

console.log('P16_RELEASE_MIGRATION_APPLIED version=0.19.0 next=P17');
