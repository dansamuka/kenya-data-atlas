#!/usr/bin/env node
import fs from 'node:fs';
const rep=(text,from,to,label)=>{if(!text.includes(from))throw new Error(`Methods bootstrap: missing ${label}`);return text.replace(from,to);};

// package wiring
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
pkg.scripts['methods:validate']='node scripts/ui/validate-methods-comparability.mjs';
if(!pkg.scripts['ui:validate'].includes('assets/methods-comparability.js'))pkg.scripts['ui:validate']=pkg.scripts['ui:validate'].replace('node --check assets/evidence-hub.js','node --check assets/evidence-hub.js && node --check assets/methods-comparability.js');
if(!pkg.scripts.test.includes('methods:validate'))pkg.scripts.test=pkg.scripts.test.replace('npm run ia:validate','npm run ia:validate && npm run methods:validate');
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');

// index route, stylesheet, shell and footer
let html=fs.readFileSync('index.html','utf8');
if(!html.includes('assets/methods-comparability.css'))html=rep(html,'  <link rel="stylesheet" href="assets/evidence-hub.css">\n','  <link rel="stylesheet" href="assets/evidence-hub.css">\n  <link rel="stylesheet" href="assets/methods-comparability.css">\n','stylesheet anchor');
if(!html.includes('data-view-link="methods"'))html=rep(html,'      <a href="#/data" data-view-link="data">Data</a>\n      <a href="#/countyiq" data-view-link="countyiq">CountyIQ</a>','      <a href="#/data" data-view-link="data">Data</a>\n      <a href="#/methods" data-view-link="methods">Methods</a>\n      <a href="#/countyiq" data-view-link="countyiq">CountyIQ</a>','main navigation');
if(!html.includes('id="methods" data-view="methods"')){
  const marker='    <section class="countyiq-route" id="countyiq-view" data-view="countyiq" hidden>';
  const section=`    <section class="section methods-section" id="methods" data-view="methods" hidden>
      <div class="methods-hero">
        <div><p class="eyebrow">Methods &amp; Comparability · policy made visible</p><h1>See what can be <em>ranked, trended and compared.</em></h1><p>The Atlas exposes the same canonical rules used by CountyIQ and cross-level comparison. Inspect all 98 indicator policies, every P06 county ranking/trend decision and all 3,370 observed-series comparability decisions.</p></div>
        <aside class="methods-hero-note"><small>Canonical policy</small><strong id="methods-policy-version">Loading…</strong><span id="methods-principle-note">Loading the policy registry…</span><a class="text-link" href="data/policy/indicator-policy.json" target="_blank" rel="noopener">Open raw policy JSON ↗</a></aside>
      </div>
      <div class="methods-summary" id="methods-summary" aria-label="Methods coverage summary"><article><small>Loading policy</small><strong>—</strong><span id="methods-load-state">Canonical registry loads on demand.</span></article></div>
      <div class="methods-guidance">
        <article><strong>Static policy ≠ published result</strong><p>A ranking or trend can be permitted in principle and still be withheld when coverage, common periods, provenance, history or required uncertainty fail.</p></article>
        <article><strong>Positional ≠ better or worse</strong><p>Raw scale measures may be shown as highest/lowest without implying that a larger value is desirable.</p></article>
        <article><strong>No downward copying</strong><p>Kenya- or county-level values are never copied into child geographies. Cross-level comparison requires a genuinely compatible concrete series.</p></article>
      </div>
      <div class="methods-tabs" id="methods-tabs" role="tablist" aria-label="Methods explorer views">
        <button type="button" class="active" role="tab" aria-selected="true" data-methods-tab="policy">Indicator policy catalogue</button>
        <button type="button" role="tab" aria-selected="false" data-methods-tab="ranking">County rankings &amp; trends</button>
        <button type="button" role="tab" aria-selected="false" data-methods-tab="series">Cross-level decisions</button>
      </div>

      <section class="methods-panel" id="methods-policy-panel" data-methods-panel="policy">
        <div class="methods-panel-head"><div><h2>98-indicator policy catalogue</h2><p>Domain, ranking mode, direction, trend permission, composite eligibility, publication status and cross-level series coverage—straight from P12.</p></div><span class="methods-count" id="methods-policy-count"></span></div>
        <div class="methods-controls"><label>Search indicators<input id="methods-policy-search" type="search" placeholder="Poverty, voters, absorption…" autocomplete="off"></label><label>Domain<select id="methods-domain-filter"><option value="all">All domains</option><option value="economic">Economic</option><option value="fiscal">Fiscal</option><option value="health">Health</option><option value="education">Education</option><option value="living">Living standards</option><option value="infrastructure">Infrastructure</option><option value="governance">Governance</option></select></label><label>Rule<select id="methods-rule-filter"><option value="all">All rules</option><option value="rankable">Ranking permitted</option><option value="directional">Directional</option><option value="positional">Positional only</option><option value="trend">Trend permitted</option><option value="composite">Composite eligible</option><option value="cross-level">Has cross-level series</option><option value="withheld">Any key restriction</option></select></label></div>
        <div class="methods-table-wrap"><table class="methods-table"><thead><tr><th>Indicator</th><th>Domain</th><th>Ranking</th><th>Direction</th><th>Trend</th><th>Composite</th><th>Cross-level</th><th>Publication</th></tr></thead><tbody id="methods-policy-body"><tr><td colspan="8">Loading canonical policy…</td></tr></tbody></table></div>
      </section>

      <section class="methods-panel" id="methods-ranking-panel" data-methods-panel="ranking" hidden>
        <div class="methods-panel-head"><div><h2>County rankings &amp; trend evidence</h2><p>P06 values for every CountyIQ metric—not just the top three and bottom three surfaced on the compact CountyIQ page. Withheld results show their dynamic gate reason.</p></div><span class="methods-count" id="methods-ranking-count"></span></div>
        <div class="methods-county-toolbar"><label>County<select id="methods-county-select"><option>Loading counties…</option></select></label><label>Search metrics<input id="methods-ranking-search" type="search" placeholder="Absorption, poverty, internet…"></label><label>Evidence<select id="methods-ranking-filter"><option value="all">All CountyIQ metrics</option><option value="ranked">Ranked</option><option value="trend">Trend available</option><option value="withheld">Both withheld</option></select></label></div>
        <div class="methods-county-meta" id="methods-county-meta"><strong>CountyIQ mart loads when this tab opens.</strong></div>
        <div class="methods-table-wrap"><table class="methods-table"><thead><tr><th>Metric</th><th>Latest</th><th>National rank</th><th>Peer rank</th><th>Trend</th><th>Direction</th></tr></thead><tbody id="methods-ranking-body"><tr><td colspan="6">Open this tab to load P06 evidence.</td></tr></tbody></table></div>
      </section>

      <section class="methods-panel" id="methods-series-panel" data-methods-panel="series" hidden>
        <div class="methods-panel-head"><div><h2>3,370 observed-series decisions</h2><p>Search the concrete series-level decisions that power County ↔ constituency ↔ ward comparison. A normalized sibling never makes a raw total safe to compare across levels.</p></div><span class="methods-count" id="methods-series-count"></span></div>
        <div class="methods-controls"><label>Search series<input id="methods-series-search" type="search" placeholder="Series code, indicator, place, unit…"></label><label>Comparability<select id="methods-series-filter"><option value="all">All decisions</option><option value="eligible">Cross-level eligible</option><option value="same-level">Same-level only</option></select></label><div></div></div>
        <div class="methods-series-list" id="methods-series-list"><div class="methods-empty">Loading series policy…</div></div><button class="methods-series-more" id="methods-series-more" type="button" hidden>Show more decisions</button>
      </section>
    </section>\n\n`;
  html=rep(html,marker,section+marker,'CountyIQ insertion anchor');
}
if(!html.includes('href="#/methods">Methods</a><a href="#/countyiq"'))html=rep(html,'<a href="#/data">Data & sources</a><a href="#/countyiq">CountyIQ</a>','<a href="#/data">Data & sources</a><a href="#/methods">Methods</a><a href="#/countyiq">CountyIQ</a>','footer navigation');
fs.writeFileSync('index.html',html);

// router
let router=fs.readFileSync('assets/router.js','utf8');
router=rep(router,"const VIEW_IDS=new Set(['home','pulse','explore','compare','series','data','countyiq']);","const VIEW_IDS=new Set(['home','pulse','explore','compare','series','data','methods','countyiq']);",'router view IDs');
router=rep(router,"data:'Data Catalogue — Kenya Data Atlas',countyiq:'CountyIQ — Kenya Data Atlas'","data:'Data Catalogue — Kenya Data Atlas',methods:'Methods & Comparability — Kenya Data Atlas',countyiq:'CountyIQ — Kenya Data Atlas'",'router titles');
router=rep(router,"'#catalogue':'#/data','#data':'#/data','#countyiq':'#/countyiq'","'#catalogue':'#/data','#data':'#/data','#methods':'#/methods','#countyiq':'#/countyiq'",'legacy route map');
fs.writeFileSync('assets/router.js',router);

// lazy loader
let lazy=fs.readFileSync('assets/lazy-integrations.js','utf8');
lazy=rep(lazy,'let promise=null,countyIqPromise=null,evidenceHubPromise=null,mapVotersPromise=null,seriesBrowserPromise=null;','let promise=null,countyIqPromise=null,evidenceHubPromise=null,methodsPromise=null,mapVotersPromise=null,seriesBrowserPromise=null;','promise declaration');
if(!lazy.includes('function loadMethods()'))lazy=rep(lazy,'  function countyIqFailure(error){','  function loadMethods(){\n    if(window.KDAMethods)return window.KDAMethods.boot();\n    if(methodsPromise)return methodsPromise;\n    methodsPromise=KDA.loadScript(\'assets/methods-comparability.js\',{id:\'kda-methods-comparability\'})\n      .then(()=>window.KDAMethods?.boot?.()||null)\n      .catch(error=>{console.warn(\'Methods & Comparability load:\',error?.message||error);return null;});\n    return methodsPromise;\n  }\n  function countyIqFailure(error){','methods loader anchor');
lazy=rep(lazy,"  const routeNeedsCountyIQ=hash=>/^#\\/countyiq(?:\\/|\\?|$)/.test(hash)||/^#(?:countyiq|county-dashboard)$/.test(hash);","  const routeNeedsMethods=hash=>/^#\\/methods(?:\\/|\\?|$)/.test(hash)||/^#methods$/.test(hash);\n  const routeNeedsCountyIQ=hash=>/^#\\/countyiq(?:\\/|\\?|$)/.test(hash)||/^#(?:countyiq|county-dashboard)$/.test(hash);",'methods route matcher');
lazy=rep(lazy,'  if(routeNeedsSeries(location.hash))loadSeriesBrowser();\n  if(routeNeedsCountyIQ(location.hash))loadCountyIQ();','  if(routeNeedsSeries(location.hash))loadSeriesBrowser();\n  if(routeNeedsMethods(location.hash))loadMethods();\n  if(routeNeedsCountyIQ(location.hash))loadCountyIQ();','initial methods load');
lazy=rep(lazy,"if(routeNeedsSeries(location.hash))loadSeriesBrowser();if(routeNeedsCountyIQ(location.hash))loadCountyIQ();","if(routeNeedsSeries(location.hash))loadSeriesBrowser();if(routeNeedsMethods(location.hash))loadMethods();if(routeNeedsCountyIQ(location.hash))loadCountyIQ();",'hashchange methods load');
lazy=rep(lazy,"    if(event.detail?.view==='series')loadSeriesBrowser();\n    if(event.detail?.view==='countyiq')loadCountyIQ();","    if(event.detail?.view==='series')loadSeriesBrowser();\n    if(event.detail?.view==='methods')loadMethods();\n    if(event.detail?.view==='countyiq')loadCountyIQ();",'route event methods load');
lazy=rep(lazy,'window.KDAOptional={load:loadOptionalIntegrations,loadMapVoters,loadSeriesBrowser,loadCountyIQ};','window.KDAOptional={load:loadOptionalIntegrations,loadMapVoters,loadSeriesBrowser,loadMethods,loadCountyIQ};','public lazy API');
fs.writeFileSync('assets/lazy-integrations.js',lazy);

// IA validator: seven routes -> eight routes
let ia=fs.readFileSync('scripts/ui/validate-routed-views.mjs','utf8');
ia=rep(ia,"const routeLinks=['#/pulse','#/explore','#/compare','#/series/KDA-CPI-YOY-KEN','#/data','#/countyiq'];","const routeLinks=['#/pulse','#/explore','#/compare','#/series/KDA-CPI-YOY-KEN','#/data','#/methods','#/countyiq'];",'IA route list');
ia=rep(ia,"for(const view of ['home','pulse','explore','compare','series','data','countyiq'])","for(const view of ['home','pulse','explore','compare','series','data','methods','countyiq'])",'IA data-view list');
ia=rep(ia,"console.log('IA_SEVEN_ROUTE_STRUCTURE_OK');","console.log('IA_EIGHT_ROUTE_STRUCTURE_OK');",'IA route log');
fs.writeFileSync('scripts/ui/validate-routed-views.mjs',ia);

// Update P12 documentation to distinguish the original architecture release from the new visible surface.
let doc=fs.readFileSync('docs/P12-CANONICAL-CONVERGENCE.md','utf8');
if(!doc.includes('## User-facing Methods & Comparability surface')){
  doc += `\n## User-facing Methods & Comparability surface\n\nThe canonical policy is now exposed in a dedicated \`#/methods\` website section. It provides three public views without redefining any analytical rule in browser code:\n\n- all 98 indicator policy records;\n- all CountyIQ P06 ranking/trend outputs by county, including withholding reasons;\n- all 3,370 observed-series cross-level decisions and their rule basis.\n\nThis resolves the earlier product gap where the policy was public as machine-readable JSON but not discoverable as a first-class website surface.\n`;
  fs.writeFileSync('docs/P12-CANONICAL-CONVERGENCE.md',doc);
}
console.log('METHODS_VISIBILITY_BOOTSTRAP_OK');
