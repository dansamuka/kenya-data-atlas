#!/usr/bin/env node
import fs from 'node:fs';

const mode=process.argv[2]||'product';
const replaceOnce=(text,from,to,label)=>{if(!text.includes(from))throw new Error(`P13 bootstrap could not find ${label}`);return text.replace(from,to);};

function product(){
  const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
  pkg.version='0.17.0';
  pkg.scripts['evidence:build']='node scripts/evidence/build-registry.mjs';
  pkg.scripts['evidence:validate']='node scripts/evidence/validate-p13.mjs';
  if(!pkg.scripts['build:data'].includes('evidence:build'))pkg.scripts['build:data']=pkg.scripts['build:data'].replace('npm run placefacts:build && npm run countyiq:build','npm run placefacts:build && npm run evidence:build && npm run countyiq:build');
  if(!pkg.scripts.test.includes('evidence:validate'))pkg.scripts.test=pkg.scripts.test.replace('npm run policy:validate && npm run project:validate','npm run policy:validate && npm run evidence:validate && npm run project:validate');
  if(!pkg.scripts['ui:validate'].includes('assets/evidence-hub.js'))pkg.scripts['ui:validate']=pkg.scripts['ui:validate'].replace('node --check assets/countyiq-view.js','node --check assets/countyiq-view.js && node --check assets/evidence-hub.js');
  fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');

  const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));lock.version='0.17.0';if(lock.packages?.[''])lock.packages[''].version='0.17.0';fs.writeFileSync('package-lock.json',JSON.stringify(lock,null,2)+'\n');

  let index=fs.readFileSync('index.html','utf8');
  if(!index.includes('assets/evidence-hub.css'))index=replaceOnce(index,'  <link rel="stylesheet" href="assets/countyiq-view.css">\n','  <link rel="stylesheet" href="assets/countyiq-view.css">\n  <link rel="stylesheet" href="assets/evidence-hub.css">\n','Evidence Hub stylesheet insertion point');
  if(!index.includes('id="ciq-evidence-hub"')){
    const marker='          <article class="ciq-card"><div class="ciq-card-head"><div><small>Evidence discipline</small><h2>What this view does—and does not do</h2></div></div>';
    const hub=`          <article class="ciq-card ciq-evidence-hub-card" id="ciq-evidence-hub">
            <div class="ciq-card-head"><div><small>P13 · official documents</small><h2>County Evidence &amp; Knowledge Hub</h2></div><p>Planning, budget and accountability evidence with explicit verification states. A source collection is never presented as a pinned file.</p></div>
            <div class="evidence-hub-tools">
              <label>Search evidence<input id="ciq-evidence-search" type="search" placeholder="Title, publisher, period…" autocomplete="off"></label>
              <label>Document family<select id="ciq-evidence-family" aria-label="Filter county evidence by document family"><option value="all">All document families</option></select></label>
            </div>
            <div class="evidence-summary" id="ciq-evidence-summary" aria-label="Evidence coverage summary"></div>
            <p class="evidence-hub-note" id="ciq-evidence-note">Official evidence loads with CountyIQ.</p>
            <div class="evidence-hub-list" id="ciq-evidence-list"><div class="source-note">Loading county evidence registry…</div></div>
          </article>
`;
    index=replaceOnce(index,marker,hub+marker,'Evidence Hub card insertion point');
  }
  fs.writeFileSync('index.html',index);

  let lazy=fs.readFileSync('assets/lazy-integrations.js','utf8');
  if(!lazy.includes('evidenceHubPromise'))lazy=replaceOnce(lazy,'  let promise=null,countyIqPromise=null,mapVotersPromise=null,seriesBrowserPromise=null;','  let promise=null,countyIqPromise=null,evidenceHubPromise=null,mapVotersPromise=null,seriesBrowserPromise=null;','Evidence Hub promise declaration');
  if(!lazy.includes('function loadEvidenceHub()')){
    const old=`  function loadCountyIQ(){
    if(window.KDACountyIQ)return window.KDACountyIQ.boot();
    if(countyIqPromise)return countyIqPromise;
    countyIqPromise=KDA.loadScript('assets/countyiq-view.js',{id:'kda-countyiq-view'})
      .then(()=>window.KDACountyIQ?.boot?.()||null)
      .catch(countyIqFailure);
    return countyIqPromise;
  }
`;
    const fresh=`  function loadEvidenceHub(){
    if(window.KDAEvidenceHub)return window.KDAEvidenceHub.boot();
    if(evidenceHubPromise)return evidenceHubPromise;
    evidenceHubPromise=KDA.loadScript('assets/evidence-hub.js',{id:'kda-evidence-hub'})
      .then(()=>window.KDAEvidenceHub?.boot?.()||null)
      .catch(error=>{console.warn('P13 Evidence Hub load:',error?.message||error);return null;});
    return evidenceHubPromise;
  }
  function loadCountyIQ(){
    if(window.KDACountyIQ)return Promise.resolve(window.KDACountyIQ.boot()).then(()=>loadEvidenceHub());
    if(countyIqPromise)return countyIqPromise;
    countyIqPromise=KDA.loadScript('assets/countyiq-view.js',{id:'kda-countyiq-view'})
      .then(()=>window.KDACountyIQ?.boot?.()||null)
      .then(()=>loadEvidenceHub())
      .catch(countyIqFailure);
    return countyIqPromise;
  }
`;
    lazy=replaceOnce(lazy,old,fresh,'CountyIQ lazy loader');
  }
  fs.writeFileSync('assets/lazy-integrations.js',lazy);
  console.log('P13_PRODUCT_MIGRATION_OK');
}

function finalize(){
  const roadmap=JSON.parse(fs.readFileSync('data/project-roadmap.json','utf8'));const p13=roadmap.phases.find(p=>p.id==='P13'),p14=roadmap.phases.find(p=>p.id==='P14');if(!p13||!p14)throw new Error('P13/P14 roadmap phases missing');p13.status='complete';p14.status='next';fs.writeFileSync('data/project-roadmap.json',JSON.stringify(roadmap,null,2)+'\n');
  let docs=fs.readFileSync('docs/REPO-COMPLETION-PLAN.md','utf8');const p13Start=docs.indexOf('## P13 — County Evidence & Knowledge Hub'),p14Start=docs.indexOf('## P14 — Action & Opportunity Finder Beta');if(p13Start<0||p14Start<=p13Start)throw new Error('P13/P14 completion-plan sections missing');
  const section=`## P13 — County Evidence & Knowledge Hub\n\n**Status: complete.**\n\nP13 adds a generated, county-scoped official-document registry and searchable Evidence Hub inside CountyIQ. All 47 counties have a verified 2023–2027 CIDP document or official source page. Common evidence doorways cover Controller of Budget implementation reporting, Auditor-General county audit collections, CFSP and CBROP discovery, with richer official ADP/CFSP/CBROP/budget source hubs where separately verified.\n\nThe registry distinguishes \`verified_document\`, \`verified_source_page\`, \`verified_source_collection\`, \`not_published\`, \`not_found\` and \`inaccessible\`. A collection link is never labelled as an exact county file, unavailable states require a reason, and placeholder/fragment links are rejected.\n\nRelease evidence: 47/47 CIDP coverage, at least four non-CIDP 47-county evidence doorways, full Atlas tests and the independent geometry audit pass.\n\n**Exit:** every county has a durable official-document doorway and evidence-state drift fails CI. See \`docs/P13-COUNTY-EVIDENCE-HUB.md\`.\n\n---\n\n`;
  docs=docs.slice(0,p13Start)+section+docs.slice(p14Start);docs=docs.replace('## P14 — Action & Opportunity Finder Beta\n\n**Status: planned.**','## P14 — Action & Opportunity Finder Beta\n\n**Status: next.**');fs.writeFileSync('docs/REPO-COMPLETION-PLAN.md',docs);
  let r=fs.readFileSync('ROADMAP.md','utf8');r=replaceOnce(r,'P00 through P12 are complete.','P00 through P13 are complete.','completed phase range');r=replaceOnce(r,'- **P12** — Canonical Convergence & Governance (`docs/P12-CANONICAL-CONVERGENCE.md`) — **complete.** One versioned policy now governs domain, direction, composite/ranking/trend semantics, uncertainty, inheritance and cross-level normalisation across CountyIQ and registry products; drift is mechanically tested.\n','- **P12** — Canonical Convergence & Governance (`docs/P12-CANONICAL-CONVERGENCE.md`) — **complete.** One versioned policy now governs domain, direction, composite/ranking/trend semantics, uncertainty, inheritance and cross-level normalisation across CountyIQ and registry products; drift is mechanically tested.\n- **P13** — County Evidence & Knowledge Hub (`docs/P13-COUNTY-EVIDENCE-HUB.md`) — **complete.** 47/47 third-generation CIDP evidence coverage plus source-honest budget, audit, CFSP/CBROP and county planning-document doorways with explicit verification states.\n','P13 completed bullet');
  const next=r.indexOf('## Next phase');if(next<0)throw new Error('ROADMAP next phase heading missing');r=r.slice(0,next)+`## Next phase\n\n**P14 — Action & Opportunity Finder Beta**\n\nBuild the action layer on top of the governed CountyIQ and county evidence foundations. Every live programme must have a primary URL, verification date and reproducible match rationale; expired, paused, unknown and closed programmes cannot appear as live.\n\nRecommended next-session instruction:\n\n> Complete P14 from \`data/project-roadmap.json\`. Do not restart completed phases. Implement the full phase, run its acceptance checks, and report any unmet gate explicitly.\n\nAfter a phase passes its evidence checks, update \`data/project-roadmap.json\` and this file together — both are considered part of the same handoff, not one authoritative and one optional.\n`;fs.writeFileSync('ROADMAP.md',r);console.log('P13_ROADMAP_FINALIZED next=P14');
}

if(mode==='product')product();else if(mode==='finalize')finalize();else throw new Error(`Unknown mode ${mode}`);
