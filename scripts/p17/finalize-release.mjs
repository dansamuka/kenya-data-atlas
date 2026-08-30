import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, value) => fs.writeFileSync(path.join(root, file), value);
const readJson = (file) => JSON.parse(read(file));
const writeJson = (file, value) => write(file, `${JSON.stringify(value, null, 2)}\n`);
const replaceOnce = (text, search, replacement, label) => {
  if (!text.includes(search)) throw new Error(`P17 finalize: missing ${label}`);
  return text.replace(search, replacement);
};

const pkg = readJson('package.json');
pkg.version = '1.0.0';
writeJson('package.json', pkg);

const lock = readJson('package-lock.json');
lock.version = '1.0.0';
if (lock.packages?.['']) lock.packages[''].version = '1.0.0';
writeJson('package-lock.json', lock);

const roadmap = readJson('data/project-roadmap.json');
const p17 = roadmap.phases.find((phase) => phase.id === 'P17');
if (!p17) throw new Error('P17 finalize: roadmap phase missing');
p17.status = 'complete';
p17.completion_note = 'Completed for Kenya Data Atlas v1.0.0 on 2026-08-30 after deterministic rebuild, full validators, independent geometry audit, real-browser/accessibility/performance gates, exact-commit GitHub Pages deployment and post-deployment smoke verification.';
writeJson('data/project-roadmap.json', roadmap);

let plan = read('docs/REPO-COMPLETION-PLAN.md');
plan = replaceOnce(plan, 'Status: **living session plan**', 'Status: **completed v1.0 release ledger**', 'completion-plan status');
plan = replaceOnce(plan, '**Status: next.**\n\nRecommended next-session instruction: **Complete P17** from `data/project-roadmap.json`. Do not restart completed phases.\n\nFinal closeout session.', '**Status: complete.**\n\nP17 closed the v1.0 release only after the exact release commit passed the deterministic data rebuild, full validation suite, independent geometry audit, P16 browser/accessibility/performance audit, GitHub Pages deployment and post-deployment smoke test.\n\nFinal closeout completed on 30 August 2026.', 'P17 status block');
plan = plan.replace(/With P00–P16 complete \(including P14 as a separately governed \*\*v1\.1 Beta\*\* action layer\), the only remaining v1\.0 phase is \*\*final reproducibility, governance, deployment and release closeout \(P17\)\*\*\. P14 programme freshness remains an ongoing maintenance obligation but is not a v1\.0 blocker\./, 'P00–P17 are complete. Kenya Data Atlas v1.0.0 is the closed statistical/data release; P14 remains a separately governed v1.1 Beta action layer whose programme-freshness maintenance continues after v1.0.');
plan = plan.replace(/## Recommended session order[\s\S]*?## Session completion protocol/, '## Completion state\n\n`P00–P17 complete → v1.0.0 released`\n\nP14 is complete as a separately governed `v1.1 Beta` action layer. Its ongoing programme-freshness operation remains a maintenance obligation and does not alter the v1.0 statistical release state.\n\n## Session completion protocol');
write('docs/REPO-COMPLETION-PLAN.md', plan);

let readme = read('README.md');
readme = readme.replace(/<!-- P17_RELEASE_STATE_START -->[\s\S]*?<!-- P17_RELEASE_STATE_END -->/, `<!-- P17_RELEASE_STATE_START -->\n**Release state: v1.0.0 released.** P00–P17 are complete. The tagged release passed deterministic rebuild, the full validation suite, independent Shapely geometry audit, Chromium/Firefox/WebKit + axe checks, Lighthouse budgets, exact-commit GitHub Pages deployment and a post-deployment smoke test. P14 remains available as a separately governed v1.1 Beta opportunity layer with ongoing monthly freshness obligations.\n<!-- P17_RELEASE_STATE_END -->`);
readme = readme.replace(/1\. \*\*Application\/data release version\*\* —[^\n]*/, '1. **Application/data release version** — `1.0.0`.');
write('README.md', readme);

let roadmapDoc = read('ROADMAP.md');
roadmapDoc = roadmapDoc.replace(/<!-- P17_STATUS_START -->[\s\S]*?<!-- P17_STATUS_END -->/, `<!-- P17_STATUS_START -->\n## v1.0 completion\n\n**P00–P17 are complete.** Kenya Data Atlas v1.0.0 is the closed reproducible statistical/data release. P14 is also implemented as a separately governed v1.1 Beta action layer; its continuing programme-freshness review is maintenance, not an unresolved v1.0 release gate.\n\nRelease acceptance: deterministic rebuild and zero drift, full validators, independent geometry audit, Chromium/Firefox/WebKit + axe, Lighthouse budgets, link/crawlability checks, exact-commit GitHub Pages deployment and post-deployment smoke test all pass.\n<!-- P17_STATUS_END -->`);
write('ROADMAP.md', roadmapDoc);

let citation = read('CITATION.cff').replace(/version: "[^"]+"/, 'version: "1.0.0"').replace(/date-released: .*/, 'date-released: 2026-08-30');
write('CITATION.cff', citation);

let changelog = read('CHANGELOG.md');
if (!changelog.includes('## 1.0.0 — 30 August 2026')) {
  const entry = `## 1.0.0 — 30 August 2026 — P17 final reproducibility, governance and release\n\nCloses the Kenya Data Atlas v1.0 programme after the exact release commit passes all required reproducibility, browser, accessibility, performance, geometry and deployment gates.\n\n- Completes P17 and the P00–P17 repository completion ledger.\n- Publishes the v1.0 release manifest and explicit unresolved-items register.\n- Reconciles README, ROADMAP, citation metadata and application version to the released state.\n- Requires deterministic \`build:data\` with zero committed-output drift, full \`npm test\`, independent Shapely geometry audit, Chromium/Firefox/WebKit smoke + axe checks and Lighthouse budgets.\n- Requires GitHub Pages to deploy the exact release commit and pass a live post-deployment smoke test before the \`v1.0.0\` tag/release is created.\n- Preserves known evidence limits instead of filling them by approximation, including Narok's withheld fiscal-delivery score, the Mandera East/Lafey ward spatial hold, the withheld longitudinal composite and continuing P14 freshness obligations.\n\nSee \`docs/releases/v1.0.0.md\`, \`docs/releases/v1.0.0-unresolved.md\` and \`data/release/v1.0.0.json\`.\n\n`;
  changelog = changelog.replace('# Changelog\n\n', `# Changelog\n\n${entry}`);
}
write('CHANGELOG.md', changelog);

console.log('P17_FINAL_RELEASE_METADATA_OK version=1.0.0 status=complete');
