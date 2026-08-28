import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(`Routed IA validation: ${msg}`);};

const html=read('index.html');
const router=read('assets/router.js');
const routed=read('assets/routed-views.js');
const css=read('assets/routed-views.css');
const baseCss=read('assets/styles.css');
const units=read('assets/unit-system.js');
const lazy=read('assets/lazy-integrations.js');
const schema=read('db/schema/indicators.sql');
const compare=read('assets/compare.js');

try{
  const routeLinks=['#/pulse','#/explore','#/compare','#/series/KDA-CPI-YOY-KEN','#/data'];
  for(const href of routeLinks)assert(html.includes(`href="${href}"`),`missing navigation route ${href}`);
  for(const view of ['home','pulse','explore','compare','series','data'])assert(html.includes(`data-view="${view}"`),`missing data-view ${view}`);
  assert(html.includes('id="home-glance-grid"'),'home is missing the short at-a-glance teaser');
  assert(html.includes('id="pulse-filters"')&&['core','economy','social','environment','institutions'].every(x=>html.includes(`data-pulse-filter="${x}"`)),'Pulse category picker is incomplete');
  assert(html.includes('class="geo-context-rail"')&&html.includes('class="geo-workspace"'),'Explore persistent context rail is missing');
  console.log('IA_SIX_ROUTE_STRUCTURE_OK');

  for(const token of ['hashchange','popstate','data-view-link','window.KDARouter','canonicalHash','#/explore/'])assert(router.includes(token),`router missing ${token}`);
  assert(router.includes("'#map/'")||router.includes("startsWith('#map/')"),'legacy map hashes are not canonicalised');
  assert(routed.includes("params.get('places')"),'Compare direct-route places restore is missing');
  assert(routed.includes("[['from','#life-home'],['to','#life-away']]")&&routed.includes("r.params.get(param)"),'Compare life-route from/to restore is missing');
  assert(routed.includes("params.set('places'")&&routed.includes("params.set('from'")&&routed.includes("params.set('to'"),'Compare state is not written back to shareable URLs');
  assert(routed.includes("KDA.registries(['series','observations','indicators','units','geographies','agencies']"),'Series route is not registry-driven');
  assert(routed.includes('window.KDAGeo')&&routed.includes("r.view==='explore'"),'Explore route does not restore map state');
  console.log('IA_SHAREABLE_STATE_CONTRACT_OK');

  assert(css.includes('.geo-context-rail{position:sticky'),'Explore rail is not sticky on desktop');
  assert(css.includes('[data-view="pulse"] .metric-grid'),'Pulse compact-card treatment missing');
  assert(css.includes('.pulse-filter-bar'),'Pulse filter styling missing');
  assert(lazy.includes("['pulse','explore','series','data']"),'optional integrations are not route-aware');
  console.log('IA_VIEW_POLISH_OK');

  assert(!units.includes("$('.series-unit-chip','.series-side')"),'unit-system.js still passes a selector string as querySelector root');
  for(const dead of ['.county-cell{','.kenya-map{','.map-tooltip{','.map-panel{','.map-section{'])assert(!baseCss.includes(dead),`dead schematic-map CSS remains: ${dead}`);
  console.log('IA_PHASE0_CLEANUP_OK');

  assert(schema.includes("'proxy'")&&schema.includes("geographic_method <> 'proxy' OR notes IS NOT NULL"),'governed proxy geographic method is not formalised');
  assert(compare.includes('assets/compare-life-natural.css'),'current natural-language Life Elsewhere treatment is not loaded from main');
  console.log('IA_BRANCH_RECONCILIATION_OK');
  console.log('IA_ROUTED_VIEWS_ALL_OK');
}catch(error){
  console.error(error.message||error);
  process.exit(1);
}
