#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, v) => fs.writeFileSync(path.join(root, p), v);

// Machine-readable roadmap.
const roadmapPath = 'data/project-roadmap.json';
const roadmap = JSON.parse(read(roadmapPath));
const phase = id => roadmap.phases.find(p => p.id === id);

Object.assign(phase('P12'), {
  title: 'Canonical Convergence & Governance',
  status: 'complete',
  session_goal: 'Centralize static indicator semantics so every Atlas build, analytical product and comparison surface derives domain, direction, ranking mode, uncertainty, trend, inheritance, publication and cross-level rules from one versioned policy layer.',
  outputs: [
    'versioned canonical indicator policy module',
    'generated public indicator-policy registry',
    'CountyIQ mart policy convergence',
    'cross-level comparison policy convergence',
    'policy drift validator wired into npm test'
  ],
  acceptance: [
    'all 98 indicator policy rows reproduce from one executable policy module',
    'all CountyIQ metrics mirror canonical static policy',
    'all published series-level cross-geography decisions mirror canonical normalisation rules',
    'parent-to-child value inheritance remains prohibited',
    'full Atlas validation and independent geometry audit pass'
  ],
  depends_on: ['P01', 'P02', 'P11']
});

Object.assign(phase('P13'), {
  title: 'County Evidence & Knowledge Hub',
  status: 'next',
  session_goal: 'Make every county profile a durable evidence doorway to official planning, budget, accountability and statistical documents, with explicit found/not-published/not-found/inaccessible states.',
  outputs: [
    'county document registry',
    '47-county CIDP coverage target',
    'ADP/CFSP/CBROP/budget/audit document families',
    'verification and link-health metadata',
    'county evidence UI and search hooks'
  ],
  acceptance: [
    '47/47 counties have a verified CIDP record or an explicit evidence-state reason',
    'at least three additional core document families are indexed wherever officially published',
    'document type county period source page and verification state are recorded',
    'no placeholder links are presented as evidence',
    'broken or inaccessible links are distinguished from documents not found or not published'
  ],
  depends_on: ['P12']
});

Object.assign(phase('P14'), {
  title: 'Action & Opportunity Finder Beta',
  status: 'planned',
  session_goal: 'Connect CountyIQ gaps and county context to a verified, date-aware opportunity registry without presenting stale or speculative funding information as live.',
  outputs: [
    'opportunity registry and freshness policy',
    'verified programme records',
    'beneficiary/sector/geography eligibility model',
    'gap-to-opportunity relevance logic',
    'Beta county opportunity UI'
  ],
  acceptance: [
    'every live record has a primary URL verification date and next-review state',
    'expired paused unknown and closed programmes cannot appear as live',
    'deadline and amount claims are source-backed',
    'match rationale is reproducible from published county gaps and programme rules'
  ],
  depends_on: ['P07', 'P12']
});

Object.assign(phase('P15'), {
  title: 'Data distribution and developer surface',
  status: 'planned',
  session_goal: 'Package canonical registries, policy and analytical products into a stable public data interface with versioned machine-readable contracts.',
  outputs: [
    'versioned downloadable bundles',
    'JSON Schema contracts',
    'CSV/JSON/NDJSON/Parquet distributions where practical',
    'county and indicator subset products',
    'developer documentation and reproducible example queries'
  ],
  acceptance: [
    'downloads map to documented releases and checksums',
    'canonical data and analytical methodology versions are distinguishable',
    'schema changes are versioned',
    'developer examples reproduce published values'
  ],
  depends_on: ['P12', 'P13']
});

Object.assign(phase('P16'), {
  title: 'Real-browser accessibility, SEO and performance release audit',
  status: 'planned',
  session_goal: 'Harden the public product with real-browser, accessibility, performance and link-integrity gates rather than DOM-only smoke checks.',
  outputs: [
    'Playwright browser smoke matrix',
    'axe/WCAG 2.2 AA audit and fixes',
    'mobile keyboard and focus checks',
    'Lighthouse/performance budgets',
    'deduplicated external-link audit',
    'metadata and crawlability review'
  ],
  acceptance: [
    'critical journeys pass in Chromium Firefox and WebKit without uncaught runtime errors',
    'critical accessibility failures are closed',
    'performance budgets pass for core cold-load routes',
    'broken-link audit is reproducible',
    'known browser and SEO limitations are documented'
  ],
  depends_on: ['P15']
});

Object.assign(phase('P17'), {
  title: 'Final reproducibility, governance and v1.0 release',
  status: 'planned',
  session_goal: 'Close the repository against one final completion ledger and publish a defensible v1.0 state only after reproducibility, real-browser and deployment gates pass.',
  outputs: [
    'full deterministic rebuild',
    'all validators and browser release gates',
    'data-quality/revision review',
    'README/status rewrite',
    'v1.0 changelog and release manifest',
    'final unresolved-items register'
  ],
  acceptance: [
    'build:data clean with no committed-output drift',
    'npm test and real-browser release audit clean',
    'geometry audit clean',
    'GitHub Pages deploys the exact release commit successfully',
    'post-deployment smoke test passes',
    'no required completion gate is silently deferred'
  ],
  depends_on: ['P09', 'P11', 'P12', 'P13', 'P16']
});

write(roadmapPath, JSON.stringify(roadmap, null, 2) + '\n');

// Completion-plan handoff sections.
const planPath = 'docs/REPO-COMPLETION-PLAN.md';
let plan = read(planPath);
plan = plan.replace('> Complete P12 from `docs/REPO-COMPLETION-PLAN.md`.', '> Complete P13 from `docs/REPO-COMPLETION-PLAN.md`.');
plan = plan.replace(
  'The remaining work is therefore primarily **peer comparison, decision intelligence, action layers, analytical governance and public-launch hardening**.',
  'With P06–P12 now complete, the remaining work is primarily **county evidence/document depth, a verified action layer, public data distribution and real-browser launch hardening**.'
);

const replacement = `## P12 — Canonical Convergence & Governance\n\n**Status: complete.**\n\nP12 makes static indicator semantics a governed product rather than scattered implementation detail. The versioned executable policy in \`scripts/policy/indicator-policy.mjs\` now owns domain, direction, composite eligibility, ranking mode, uncertainty requirement, trend permission, parent-value inheritance, publication state and cross-level normalisation rules.\n\nThe generated \`data/policy/indicator-policy.json\` exposes the policy publicly for all indicators and observed series. CountyIQ, P06 direction/trend logic and the cross-level eligibility builder consume the same canonical layer, while dynamic evidence checks such as coverage, common periods, provenance and actual history remain independently validated.\n\nRelease evidence: all 98 indicator policies, all 3,370 published observed-series cross-level decisions and all 47 CountyIQ county records passed the P12 convergence validator; P03–P11 remained green; full \`npm test\` and the independent Shapely geometry audit passed.\n\n**Exit:** no main analytical path carries a duplicate domain/direction/cross-level policy, parent geography values remain non-inheritable, and policy drift is a test failure. See \`docs/P12-CANONICAL-CONVERGENCE.md\`.\n\n---\n\n## P13 — County Evidence & Knowledge Hub\n\n**Status: next.**\n\nBuild the durable county document layer, with 47/47 CIDP coverage as the first target and additional official document families wherever they are published:\n\n- CIDP;\n- ADP;\n- CFSP;\n- CBROP;\n- approved and supplementary budgets;\n- Controller of Budget reports;\n- Auditor-General county executive/assembly reports;\n- statistical abstracts/profiles;\n- sector, spatial, climate and investment plans where official.\n\nEach document record must distinguish \`verified\`, \`not_published\`, \`not_found\` and \`inaccessible\` rather than collapsing those states into missing. Record county, document type, period, publication date where known, source agency, source page, direct document URL, last verification and link-health state.\n\n**Exit:** 47/47 counties have a verified CIDP record or explicit evidence-state reason; at least three additional core document families are indexed wherever officially published; no \`href="#"\` placeholder is presented as evidence.\n\n---\n\n## P14 — Action & Opportunity Finder Beta\n\n**Status: planned.**\n\nBuild the action layer after the canonical/evidence foundations rather than as a small national-programme list. Connect published P07 gaps and P10/P11 context to a verified, date-aware programme registry.\n\nEach live record needs programme/funder, primary URL, beneficiary and geographic eligibility, sector, application method, opening/deadline or rolling status, verification date, next-review date and explicit live/paused/closed/unknown state. Amounts, rates and deadlines are shown only when source-backed.\n\n**Exit:** stale or unverified programmes cannot appear as live, and every match rationale is reproducible from programme rules plus displayed county evidence. Ship this surface as Beta because freshness requires continuing maintenance.\n\n---`;
plan = plan.replace(/## P12 — Verified County Opportunity Finder[\s\S]*?## P15 — Data distribution \+ developer surface/, replacement + '\n\n## P15 — Data distribution + developer surface');
plan = plan.replace(
  /## Recommended session order[\s\S]*?## Session completion protocol/,
  `## Recommended session order\n\nThe core sequence is now:\n\n\`P00 → P01 → P02 → P03 → P04 → P05 → P06 → P07 → P08 → P09 → P10 → P11 → P12 → P13 → P14 → P15 → P16 → P17\`\n\nP14 is intentionally a Beta action layer; P17 should not weaken evidence or browser gates merely to make the action layer appear more complete.\n\n## Session completion protocol`
);
write(planPath, plan);

// Human-readable roadmap.
const roadPath = 'ROADMAP.md';
let road = read(roadPath);
road = road.replace('P00 through P11 are complete.', 'P00 through P12 are complete.');
road = road.replace('Only 5 indicators across 3 of 7 domains currently qualify', 'Only 5 indicators across 4 of 7 domains currently qualify');
road = road.replace(
  '- **P11** — Administration-period scorecards and evidence-based recognition (`docs/countyiq/P11-RECOGNITION.md`) — **published for all 47 counties.** Uses FY2021/22 as the last full pre-election baseline, treats FY2022/23 as transition context, and compares to FY2024/25 without assigning a personal governor causal score. Recognition is reproducible from published fiscal rules.\n',
  '- **P11** — Administration-period scorecards and evidence-based recognition (`docs/countyiq/P11-RECOGNITION.md`) — **published for all 47 counties.** Uses FY2021/22 as the last full pre-election baseline, treats FY2022/23 as transition context, and compares to FY2024/25 without assigning a personal governor causal score. Recognition is reproducible from published fiscal rules.\n- **P12** — Canonical Convergence & Governance (`docs/P12-CANONICAL-CONVERGENCE.md`) — **complete.** One versioned policy now governs domain, direction, composite/ranking/trend semantics, uncertainty, inheritance and cross-level normalisation across CountyIQ and registry products; drift is mechanically tested.\n'
);
road = road.replace(/## Next phase[\s\S]*?After a phase passes its evidence checks/,
`## Next phase\n\n**P13 — County Evidence & Knowledge Hub**\n\nBuild the durable official-document layer: 47/47 CIDP coverage or explicit evidence-state reasons, then ADP, CFSP, CBROP, budgets, Controller of Budget, Auditor-General and statistical/sector plans wherever officially published. Missing evidence must distinguish not published, not found and inaccessible.\n\nRecommended next-session instruction:\n\n> Complete P13 from \`data/project-roadmap.json\`. Do not restart completed phases. Implement the full phase, run its acceptance checks, and report any unmet gate explicitly.\n\nAfter a phase passes its evidence checks`);
write(roadPath, road);

console.log('P12_ROADMAP_FINALIZED next=P13');
