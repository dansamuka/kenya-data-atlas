#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const roadmapPath=path.join(root,'data/project-roadmap.json');
const planPath=path.join(root,'docs/REPO-COMPLETION-PLAN.md');
const roadmap=JSON.parse(fs.readFileSync(roadmapPath,'utf8'));
const p14=roadmap.phases.find(p=>p.id==='P14');
if(!p14)throw new Error('P14 roadmap row not found');
if(!['deferred','complete'].includes(p14.status))throw new Error(`P14 cannot transition from ${p14.status}`);
p14.status='complete';
delete p14.defer_reason;
p14.completion_note='Implemented as a bounded v1.1 Beta on 2026-08-30 with an evidence-gated programme registry, monthly freshness review, reproducible P07 gap matching and lazy CountyIQ UI. Ongoing programme freshness remains a maintenance obligation and does not become a v1.0/P17 blocker.';
fs.writeFileSync(roadmapPath,JSON.stringify(roadmap,null,2)+'\n');

let docs=fs.readFileSync(planPath,'utf8');
const baselineOld='With P00–P13, P15 and P16 complete, the only remaining v1.0 phase is **final reproducibility, governance, deployment and release closeout (P17)**. P14 Opportunity Finder is explicitly deferred to v1.1 Beta because programme freshness requires continuing maintenance.';
const baselineNew='With P00–P16 complete (including P14 as a separately governed **v1.1 Beta** action layer), the only remaining v1.0 phase is **final reproducibility, governance, deployment and release closeout (P17)**. P14 programme freshness remains an ongoing maintenance obligation but is not a v1.0 blocker.';
if(docs.includes(baselineOld))docs=docs.replace(baselineOld,baselineNew);

const p14Section=/## P14 — Action & Opportunity Finder Beta\n\n[\s\S]*?(?=\n---\n\n## P15 — Data distribution \+ developer surface)/;
if(!p14Section.test(docs))throw new Error('P14 completion-plan section not found');
const replacement=`## P14 — Action & Opportunity Finder Beta\n\n**Status: complete.**\n\n**Target:** v1.1 Beta. P14 is implemented but remains separately governed from the v1.0 statistical release because live programme accuracy requires continuing freshness review.\n\nP14 adds a verified, date-aware programme registry and a lazy CountyIQ Action & Opportunity Finder. The initial Beta uses a bounded set of official programme/application surfaces rather than attempting an unmaintainable national directory.\n\nImplemented release surface:\n\n- versioned programme seed and generated public registry;\n- explicit live/paused/closed/expired/unknown states plus browser-side review-due downgrade after the next-review date;\n- beneficiary, sector, geography and application-method eligibility fields;\n- source-backed amount/window claims, with conflicting official terms withheld rather than guessed;\n- reproducible P07 gap-to-programme matching through declarative indicator triggers;\n- contextual nationwide opportunities clearly separated from measured county-gap matches;\n- lazy CountyIQ Beta UI that preserves the P01 first-paint architecture;\n- dedicated P14 build/validation and maintenance protocol.\n\nRelease evidence: the P14 validator proves trigger indicators exist in the canonical CountyIQ mart, reproduces matches from unfavourable P07 gap objects, enforces freshness/source rules and checks the responsive UI. The existing Atlas deterministic rebuild, full validation suite, geometry audit and P16 real-browser gates remain required before merge.\n\n**Exit:** stale or unverified programmes cannot appear as currently verified live; every match rationale is reconstructible from the programme registry plus displayed P07 county evidence; county relevance never establishes personal eligibility. See \`docs/P14-ACTION-OPPORTUNITY-FINDER.md\`.\n`;
docs=docs.replace(p14Section,replacement);

const orderOld='`P00–P13 complete → P15 complete → P16 complete → P17 next → v1.0`\n\nP14 is explicitly deferred to `v1.1 Beta`; P17 must not weaken evidence or browser gates merely to pull that maintenance-heavy action layer into v1.0.';
const orderNew='`P00–P16 complete → P17 next → v1.0`\n\nP14 is complete as a separately governed `v1.1 Beta` action layer. Its ongoing programme-freshness operation remains outside the v1.0 release gate; P17 must preserve all evidence, reproducibility and browser thresholds.';
if(!docs.includes(orderOld))throw new Error('Recommended-order P14 handoff text not found');
docs=docs.replace(orderOld,orderNew);
fs.writeFileSync(planPath,docs);
console.log('P14_ROADMAP_COMPLETION_MARKED next=P17 target=v1.1-beta');
