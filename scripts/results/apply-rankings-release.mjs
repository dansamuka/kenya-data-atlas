#!/usr/bin/env node
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
const must=(s,needle,label)=>{if(!s.includes(needle))throw new Error(`Migration: missing ${label||needle}`);};

let html=read('index.html');
must(html,'assets/methods-comparability.css','methods stylesheet link');
html=html.replace('assets/methods-comparability.css','assets/rankings-insights.css');
html=html.replace('<a href="#/methods" data-view-link="methods">Methods</a>','<a href="#/rankings" data-view-link="rankings">Rankings</a>');
html=html.replaceAll('href="#/methods">Methods</a>','href="#/rankings">Rankings</a>');
html=html.replace('class="section rankings-section" id="rankings" hidden aria-hidden="true"','class="section rankings-section" id="rankings-legacy" hidden aria-hidden="true"');
const start=html.indexOf('    <section class="section methods-section" id="methods" data-view="methods" hidden>');
const endMarker='    <section class="countyiq-route" id="countyiq-view" data-view="countyiq" hidden>';
const end=html.indexOf(endMarker);
if(start<0||end<0||end<=start)throw new Error('Migration: methods section boundaries not found');
const section=`    <section class="rankings-route" id="rankings-results" data-view="rankings" hidden>
      <div class="ri-hero">
        <div><p class="eyebrow">County Rankings &amp; Insights</p><h1>See how Kenya's counties <em>compare and change.</em></h1><p>Explore the actual results produced by the Atlas: complete indicator rankings, the current development snapshot, fiscal-delivery scores, strengths and gaps, administration-period recognition and official county evidence.</p></div>
        <aside class="ri-hero-note"><small>Current release</small><strong>47 counties · source-backed outputs</strong><span>Results are shown where the underlying evidence supports them. Missing inputs remain visibly unscored rather than estimated.</span></aside>
      </div>
      <div class="ri-summary" id="ri-summary"><article><small>Loading rankings</small><strong>—</strong><span id="ri-load-state">Results load on demand.</span></article></div>
      <div class="ri-phase-strip" aria-label="Available results">
        <article><strong>Rankings &amp; trends</strong><span>National and peer positions for every eligible county indicator.</span></article>
        <article><strong>Development snapshot</strong><span>A current 0–100 score with broad five-band relative position.</span></article>
        <article><strong>Fiscal delivery</strong><span>FY2024/25 execution, revenue mobilisation and arrears-control results.</span></article>
        <article><strong>Evidence &amp; recognition</strong><span>County strengths, administration-period recognition and official documents.</span></article>
      </div>
      <div class="ri-tabs" id="ri-tabs" role="tablist" aria-label="County results views">
        <button type="button" class="active" role="tab" aria-selected="true" data-ri-tab="development">Development snapshot</button>
        <button type="button" role="tab" aria-selected="false" data-ri-tab="fiscal">Fiscal delivery</button>
        <button type="button" role="tab" aria-selected="false" data-ri-tab="indicator">Indicator rankings</button>
        <button type="button" role="tab" aria-selected="false" data-ri-tab="gaps">Strengths &amp; gaps</button>
        <button type="button" role="tab" aria-selected="false" data-ri-tab="recognition">Recognition</button>
        <button type="button" role="tab" aria-selected="false" data-ri-tab="evidence">Official evidence</button>
      </div>

      <section class="ri-panel" data-ri-panel="development">
        <div class="ri-panel-head"><div><p class="eyebrow">Current county development snapshot</p><h2>All 47 counties, one current view.</h2><p>The broad position band is the published comparison. The exact position is shown as a diagnostic so users can inspect the underlying ordering without treating it as a settled league table.</p></div><span class="ri-count" id="ri-development-count"></span></div>
        <div class="ri-table-wrap"><table class="ri-table"><thead><tr><th>County</th><th>Score</th><th>Relative position</th><th>Exact position*</th><th>Plausible range</th></tr></thead><tbody id="ri-development-body"><tr><td colspan="5">Loading development snapshot…</td></tr></tbody></table></div>
        <p class="ri-note">* Exact composite position is diagnostic. The snapshot remains constrained to the indicators that currently meet the publication requirements; historical composite movement is not published.</p>
      </section>

      <section class="ri-panel" data-ri-panel="fiscal" hidden>
        <div class="ri-panel-head"><div><p class="eyebrow">County fiscal delivery · FY2024/25</p><h2>Execution, revenue and arrears control.</h2><p>Complete scores are ranked nationally. A county with a missing required published input remains in the table but is not scored.</p></div><span class="ri-count" id="ri-fiscal-count"></span></div>
        <div class="ri-table-wrap"><table class="ri-table"><thead><tr><th>Rank</th><th>County</th><th>Score</th><th>Execution</th><th>Revenue mobilisation</th><th>Arrears control</th></tr></thead><tbody id="ri-fiscal-body"><tr><td colspan="6">Loading fiscal delivery…</td></tr></tbody></table></div>
      </section>

      <section class="ri-panel" data-ri-panel="indicator" hidden>
        <div class="ri-panel-head"><div><p class="eyebrow">Complete indicator leaderboards</p><h2>Every county ranking that clears the evidence gate.</h2><p>Choose an indicator to see all 47 counties with national rank, percentile, peer position and trend where history is available.</p></div></div>
        <div class="ri-controls"><label>Indicator<select id="ri-indicator-select"><option>Loading ranked indicators…</option></select></label><label>Find county<input id="ri-indicator-search" type="search" placeholder="Nakuru, Kiambu, Turkana…"></label></div>
        <div class="ri-indicator-meta" id="ri-indicator-meta"></div>
        <div class="ri-table-wrap"><table class="ri-table"><thead><tr><th>Rank</th><th>County</th><th>Latest value</th><th>Percentile</th><th>Peer rank</th><th>Trend</th><th>Interpretation</th></tr></thead><tbody id="ri-indicator-body"><tr><td colspan="7">Loading indicator rankings…</td></tr></tbody></table></div>
      </section>

      <section class="ri-panel" data-ri-panel="gaps" hidden>
        <div class="ri-panel-head"><div><p class="eyebrow">County strengths and gaps</p><h2>What stands out for each county.</h2><p>These statements are generated from the same displayed county statistics and benchmark comparisons—not from separate qualitative scoring.</p></div></div>
        <div class="ri-controls"><label>County<select id="ri-gap-county"><option>Loading counties…</option></select></label><div></div></div>
        <div id="ri-gap-content"></div>
      </section>

      <section class="ri-panel" data-ri-panel="recognition" hidden>
        <div class="ri-panel-head"><div><p class="eyebrow">Administration-period recognition</p><h2>Six reproducible county recognition categories.</h2><p>Recognition reflects published fiscal results and observed change during the administration period. It is not a personal governor causal score.</p></div></div>
        <div class="ri-recognition-grid" id="ri-recognition-grid"></div>
      </section>

      <section class="ri-panel" data-ri-panel="evidence" hidden>
        <div class="ri-panel-head"><div><p class="eyebrow">Official county evidence</p><h2>Follow results back to county documents.</h2><p>Open verified CIDP, budget, fiscal-strategy, implementation and audit source doorways indexed for each county.</p></div></div>
        <div class="ri-controls"><label>County<select id="ri-evidence-county"><option>Loading counties…</option></select></label><div></div></div>
        <div class="ri-evidence-meta" id="ri-evidence-meta"></div><div class="ri-evidence-list" id="ri-evidence-list"></div>
      </section>
    </section>

`;
html=html.slice(0,start)+section+html.slice(end);
write('index.html',html);

let router=read('assets/router.js');
router=router.replace("'data','methods','countyiq'","'data','rankings','countyiq'");
router=router.replace("methods:'Methods & Comparability — Kenya Data Atlas'","rankings:'County Rankings & Insights — Kenya Data Atlas'");
router=router.replace("if(hash==='#main')return current?.hash||'#/';","if(hash==='#main')return current?.hash||'#/';\n    if(hash==='#/methods'||hash.startsWith('#/methods?'))return hash.replace('#/methods','#/rankings');");
router=router.replace("'#data':'#/data','#countyiq'","'#data':'#/data','#methods':'#/rankings','#countyiq'");
write('assets/router.js',router);

let lazy=read('assets/lazy-integrations.js');
lazy=lazy.replaceAll('methodsPromise','rankingsPromise').replaceAll('loadMethods','loadRankings').replaceAll('KDAMethods','KDARankings').replaceAll('routeNeedsMethods','routeNeedsRankings');
lazy=lazy.replaceAll('assets/methods-comparability.js','assets/rankings-insights.js').replaceAll('kda-methods-comparability','kda-rankings-insights').replaceAll('Methods & Comparability load','Rankings & Insights load');
lazy=lazy.replaceAll('/methods','/rankings').replaceAll('#methods','#rankings').replaceAll("view==='methods'","view==='rankings'");
write('assets/lazy-integrations.js',lazy);

const pkg=JSON.parse(read('package.json'));
pkg.scripts['results:build']='node scripts/results/build-county-results.mjs';
pkg.scripts['results:validate']='node scripts/results/validate-results.mjs';
pkg.scripts['rankings:validate']='node scripts/ui/validate-rankings-insights.mjs';
pkg.scripts['countyiq:build']='npm run p06:direction && npm run policy:build && node scripts/countyiq/build-mart.mjs && npm run results:build';
pkg.scripts['ui:validate']=pkg.scripts['ui:validate'].replace('node --check assets/methods-comparability.js','node --check assets/rankings-insights.js');
pkg.scripts.test=pkg.scripts.test.replace('npm run methods:validate','npm run results:validate && npm run rankings:validate');
delete pkg.scripts['methods:validate'];
write('package.json',JSON.stringify(pkg,null,2)+'\n');

let ia=read('scripts/ui/validate-routed-views.mjs');
ia=ia.replace("'#/data','#/methods','#/countyiq'","'#/data','#/rankings','#/countyiq'");
ia=ia.replace("'data','methods','countyiq'","'data','rankings','countyiq'");
ia=ia.replace("console.log('IA_EIGHT_ROUTE_STRUCTURE_OK');","assert(html.includes('id=\"rankings-results\"')&&html.includes('id=\"ri-indicator-body\"'),'rankings/results route is incomplete');\n  console.log('IA_EIGHT_ROUTE_STRUCTURE_OK');");
ia=ia.replace("assert(lazy.includes(\"assets/countyiq-view.js\")&&lazy.includes(\"event.detail?.view==='countyiq'\"),'CountyIQ is not lazy-loaded from its route');","assert(lazy.includes(\"assets/countyiq-view.js\")&&lazy.includes(\"event.detail?.view==='countyiq'\"),'CountyIQ is not lazy-loaded from its route');\n  assert(lazy.includes(\"assets/rankings-insights.js\")&&lazy.includes(\"event.detail?.view==='rankings'\"),'Rankings & Insights is not lazy-loaded from its route');");
write('scripts/ui/validate-routed-views.mjs',ia);

let p12=read('docs/P12-CANONICAL-CONVERGENCE.md');
p12=p12.replace(/\n## Public website visibility[\s\S]*$/,'');
p12+='\n\n## Public product boundary\nP12 is an architecture and governance layer, not a primary user-facing feature. Its policy registry remains public and machine-readable for auditability, but the main website presents the analytical results produced from that governed data under **Rankings & Insights**. Technical policy fields, build terminology and drift-validation details stay in repository documentation rather than the primary UI.\n';
write('docs/P12-CANONICAL-CONVERGENCE.md',p12);

console.log('RANKINGS_RESULTS_MIGRATION_APPLIED');
