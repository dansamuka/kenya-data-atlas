#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const p=x=>path.join(root,x);
const read=x=>fs.readFileSync(p(x),'utf8');
const write=(x,v)=>fs.writeFileSync(p(x),v);
const json=x=>JSON.parse(read(x));

const pkg=json('package.json');
pkg.version='0.18.0';
pkg.scripts['distribution:build']='node scripts/distribution/build-distribution.mjs';
pkg.scripts['distribution:validate']='node scripts/distribution/validate-distribution.mjs';
if(!pkg.scripts['build:data'].includes('distribution:build')) pkg.scripts['build:data']=pkg.scripts['build:data'].replace('&& npm run ui:build','&& npm run distribution:build && npm run ui:build');
if(!pkg.scripts.test.includes('distribution:validate')) pkg.scripts.test=pkg.scripts.test.replace('&& npm run evidence:validate','&& npm run evidence:validate && npm run distribution:validate');
write('package.json',JSON.stringify(pkg,null,2)+'\n');

const lock=json('package-lock.json');
lock.version='0.18.0';
lock.packages[''].version='0.18.0';
write('package-lock.json',JSON.stringify(lock,null,2)+'\n');

const roadmap=json('data/project-roadmap.json');
const phase=id=>roadmap.phases.find(x=>x.id===id);
const p14=phase('P14'), p15=phase('P15'), p16=phase('P16'), p17=phase('P17');
p14.status='deferred';
p14.target_release='v1.1-beta';
p14.defer_reason='Opportunity and funding programme freshness creates a continuing maintenance obligation; the core Atlas can reach a defensible v1.0 without making this Beta action layer a launch blocker.';
p15.status='complete';
p15.target_release='v1.0';
p16.status='next';
p16.target_release='v1.0';
p17.status='planned';
p17.target_release='v1.0';
write('data/project-roadmap.json',JSON.stringify(roadmap,null,2)+'\n');

let validator=read('scripts/project/validate-roadmap.mjs');
validator=validator.replace("const allowed=new Set(['implemented_pending_release_check','next','planned','complete','blocked']);","const allowed=new Set(['implemented_pending_release_check','next','planned','complete','blocked','deferred']);");
validator=validator.replace("for(let i=0;i<nextIndex;i++)assert(roadmap.phases[i].status==='complete',`${roadmap.phases[i].id} must be complete before ${next[0].id} can be next`);","for(let i=0;i<nextIndex;i++){\n    const prior=roadmap.phases[i];\n    assert(['complete','deferred'].includes(prior.status),`${prior.id} must be complete or explicitly deferred before ${next[0].id} can be next`);\n    if(prior.status==='deferred'){assert(prior.target_release&&prior.defer_reason,`${prior.id} deferred phase requires target_release and defer_reason`);}\n  }");
validator=validator.replace("for(let i=0;i<nextIndex;i++){\n    const id=roadmap.phases[i].id;\n    assert(sectionOf(id).includes('**Status: complete.**'),`${id} documentation must be marked complete`);\n  }","for(let i=0;i<nextIndex;i++){\n    const prior=roadmap.phases[i];\n    const expectedStatus=prior.status==='deferred'?'**Status: deferred.**':'**Status: complete.**';\n    assert(sectionOf(prior.id).includes(expectedStatus),`${prior.id} documentation must be marked ${prior.status}`);\n  }");
write('scripts/project/validate-roadmap.mjs',validator);

const roadmapMd=`# Kenya Data Atlas — Completion Roadmap\n\nThe repository is being completed through bounded, independently deployable phases. The machine-readable authority is [\`data/project-roadmap.json\`](data/project-roadmap.json).\n\n## Completed core phases\n\n**P00–P13 are complete. P15 is complete.** The core geography, provenance, indicator registry, historical data, CountyIQ analytics, rankings/results, canonical policy, county evidence and developer distribution surface are now implemented and validated.\n\nKey current products include 1,788 geographies, 98 indicators, 3,370 series, 6,864 observations, 47 CountyIQ profiles, 14 complete county indicator leaderboards, 47 development snapshots, 46 complete fiscal-delivery scores and 247 county evidence records.\n\n## Deferred post-v1.0 Beta\n\n**P14 — Action & Opportunity Finder Beta** is explicitly **deferred to v1.1 Beta**. Programme freshness, deadlines and eligibility require continuing maintenance; this useful action layer is not necessary to make the underlying Atlas source-auditable, reproducible and release-ready.\n\n## Next phase\n\n**P16 — Real-browser accessibility, SEO and performance release audit**\n\nRun the public product through Chromium, Firefox and WebKit; close critical WCAG 2.2 AA issues; test keyboard/focus/mobile journeys; enforce Lighthouse/performance budgets; and run a reproducible external-link and crawlability audit.\n\nRecommended next-session instruction:\n\n> Complete P16 from \`data/project-roadmap.json\`. Do not restart completed phases. Run real-browser, accessibility, link-integrity, SEO and performance gates and report any unmet release blocker explicitly.\n\n## Final v1.0 phase\n\n**P17 — Final reproducibility, governance and v1.0 release** follows P16. It will run the final deterministic rebuild, reconcile data/revision status, finish release notes/manifests and verify that GitHub Pages serves the exact release commit.\n\n## Release sequence\n\nCore v1.0 track: **P15 → P16 → P17 → v1.0**.\n\nPost-v1.0 action track: **P14 → v1.1 Beta**.\n`;
write('ROADMAP.md',roadmapMd);

let plan=read('docs/REPO-COMPLETION-PLAN.md');
plan=plan.replace('With P06–P12 now complete, the remaining work is primarily **county evidence/document depth, a verified action layer, public data distribution and real-browser launch hardening**.','With P00–P13 complete and P15 now released, the remaining v1.0 work is **real-browser/accessibility/SEO/performance hardening (P16) and final release closeout (P17)**. P14 Opportunity Finder is explicitly deferred to v1.1 Beta because programme freshness requires continuing maintenance.');
plan=plan.replace('## P14 — Action & Opportunity Finder Beta\n\n**Status: next.**','## P14 — Action & Opportunity Finder Beta\n\n**Status: deferred.**\n\n**Target:** v1.1 Beta. This phase is intentionally not a v1.0 blocker because live opportunity/deadline accuracy requires an ongoing freshness operation after launch.');
plan=plan.replace('Recommended next-session instruction: **Complete P14** from `data/project-roadmap.json`. Do not restart completed phases; implement the full Beta action layer and run its acceptance checks.\n\n','');
plan=plan.replace('## P15 — Data distribution + developer surface\n\nThe repository already has good machine-readable registries and PostgreSQL/PostGIS schema. Package them into a stable developer experience:','## P15 — Data distribution + developer surface\n\n**Status: complete.**\n\nP15 packages the canonical registries, CountyIQ results and county evidence into a stable static developer experience without creating a parallel data store. It publishes a versioned manifest, checksums, JSON Schemas, NDJSON, flattened result/evidence CSVs and query-sized county/indicator bundles.\n\nImplemented release surface:');
plan=plan.replace('- optional lightweight API architecture if a static data API is insufficient.','- static manifest/subset API as the primary developer interface; server infrastructure remains unnecessary for v1.0.');
plan=plan.replace('Do not deploy server infrastructure merely for appearance; the static JSON/CSV release can remain the primary API if it satisfies the use case.','Release evidence is documented in `docs/P15-DATA-DISTRIBUTION.md`; consumer examples and versioning rules are in `docs/DEVELOPER.md`. Parquet remains a reproducible consumer-side conversion rather than a second canonical binary store.');
plan=plan.replace('## P16 — Accessibility + browser + SEO + performance release audit\n\nA dedicated public-launch hardening session:','## P16 — Accessibility + browser + SEO + performance release audit\n\n**Status: next.**\n\nRecommended next-session instruction: **Complete P16** from `data/project-roadmap.json`. Do not restart completed phases.\n\nA dedicated public-launch hardening session:');
plan=plan.replace('## P17 — Final reproducibility + governance + v1.0\n\nFinal closeout session.','## P17 — Final reproducibility + governance + v1.0\n\n**Status: planned.**\n\nFinal closeout session.');
plan=plan.replace('The core sequence is now:\n\n`P00 → P01 → P02 → P03 → P04 → P05 → P06 → P07 → P08 → P09 → P10 → P11 → P12 → P13 → P14 → P15 → P16 → P17`\n\nP14 is intentionally a Beta action layer; P17 should not weaken evidence or browser gates merely to make the action layer appear more complete.','The v1.0 sequence is now:\n\n`P00–P13 complete → P15 complete → P16 next → P17 → v1.0`\n\nP14 is explicitly deferred to `v1.1 Beta`; P17 must not weaken evidence or browser gates merely to pull that maintenance-heavy action layer into v1.0.');
write('docs/REPO-COMPLETION-PLAN.md',plan);

let changelog=read('CHANGELOG.md');
if(!changelog.includes('## 0.18.0 — 30 August 2026 — P15 data distribution and developer surface')){
  const entry=`## 0.18.0 — 30 August 2026 — P15 data distribution and developer surface\n\nTurns the validated Atlas registries and CountyIQ outputs into a stable public developer interface.\n\n- Publishes \`data/distribution/manifest.json\` with application/data version, independent data-contract version, product counts, methodology versions, byte sizes and SHA-256 hashes.\n- Adds NDJSON distributions for core registry/catalogue/results/evidence products while keeping canonical JSON/CSV as the source of truth.\n- Adds Draft 2020-12 JSON Schemas for indicators, series, observations, geographies, datasets, county results and evidence records.\n- Generates 47 county bundles and 98 indicator bundles for query-sized consumption.\n- Adds \`checksums.sha256\`, developer examples, MIT software licensing, a source-data rights notice and citation metadata.\n- Explicitly defers P14 Opportunity Finder to v1.1 Beta and advances P16 real-browser/accessibility/SEO/performance hardening as the next v1.0 gate.\n\nSee \`docs/P15-DATA-DISTRIBUTION.md\` and \`docs/DEVELOPER.md\`.\n\n`;
  changelog=changelog.replace('# Changelog\n\n','# Changelog\n\n'+entry);
  write('CHANGELOG.md',changelog);
}

console.log('P15_RELEASE_MIGRATION_APPLIED version=0.18.0 next=P16 deferred=P14');
