import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const size=p=>fs.statSync(path.join(root,p)).size;
const assert=(condition,message)=>{if(!condition)throw new Error(`P01 performance validation: ${message}`);};

const html=read('index.html');
const app=read('assets/app.js');
const compare=read('assets/compare.js');
const geo=read('assets/geo-explorer.js');
const loader=read('assets/data-loader.js');
const lazy=read('assets/lazy-integrations.js');
const search=read('assets/site-search.js');
const router=read('assets/router.js');
const routed=read('assets/routed-views.js');
const pulse=JSON.parse(read('data/ui/initial-pulse.json'));

function scriptSources(){
  return [...html.matchAll(/<script\s+[^>]*src="([^"]+)"[^>]*><\/script>/g)].map(m=>m[1].split(/[?#]/)[0]);
}

function validateFirstPaintContract(){
  const scripts=scriptSources();
  const expected=['assets/data-loader.js','assets/router.js','assets/app.js','assets/lazy-integrations.js','assets/routed-views.js'];
  assert(JSON.stringify(scripts)===JSON.stringify(expected),`unexpected direct script list/order: ${scripts.join(', ')}`);
  for(const forbidden of [
    'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js',
    'assets/compare.js','assets/geo-explorer.js','assets/ux-polish.js','assets/pre-p05-hardening.js','assets/site-search.js',
    'assets/sprint2-data.js','assets/sprint1-ui.js','assets/sprint2-ui.js','assets/unit-system.js','assets/worldbank-integration.js'
  ]) assert(!scripts.includes(forbidden),`${forbidden} must not be a first-paint script`);
  assert(html.indexOf('assets/data-loader.js')<html.indexOf('assets/app.js'),'shared data loader must execute before the shell');
  assert(html.indexOf('assets/router.js')<html.indexOf('assets/app.js'),'router must establish the visible view before shell modules initialise');
  console.log('P01_FIRST_PAINT_SCRIPT_CONTRACT_OK');
}

function validateSharedLoader(){
  for(const token of ['jsonCache=new Map()','styleCache=new Map()','registry(name','registries(names','geometry(level','loadStyle','ensureD3','whenVisible','window.KDAData']) assert(loader.includes(token),`shared loader missing ${token}`);
  assert(loader.includes("window.fetch=async function"),'legacy JSON fetch bridge must use the shared promise cache');
  console.log('P01_SHARED_LOADER_OK');
}

function validateLazyConsumers(){
  assert(app.includes('KDA.initialPulse()'),'shell must use compact first-paint pulse data');
  assert(!app.includes('data/indicators/registry/observations.json'),'shell must not directly reference master observations');
  assert(!app.includes('data/indicators/registry/series.json'),'shell must not directly reference master series');
  assert(app.includes('loadSiteSearch')&&app.includes("assets/site-search.js"),'universal search must load only after explicit search interaction');
  assert(search.includes("KDA.registries(['geographies','indicators','series','datasets'])"),'universal search should build its full Atlas index only on demand');

  for(const token of ['KDA.registries','KDA.whenVisible','bootPromise','window.KDACompare']) assert(compare.includes(token),`Compare lazy contract missing ${token}`);
  assert(!compare.includes('const fetchJson'),'Compare must not own an independent fetch helper');
  assert(lazy.includes("assets/compare.js")&&lazy.includes("assets/compare.css"),'Compare must be route-loaded by the shared lazy loader');

  for(const token of ['KDA.ensureD3','KDA.registries','KDA.whenVisible','window.KDAGeo','ensureGeometry']) assert(geo.includes(token),`Geo lazy contract missing ${token}`);
  assert(!/^\s*const\s+svg\s*=\s*d3\.select/m.test(geo),'Geo Explorer must not touch D3 at top level');
  assert(geo.includes("KDA.geometry(level"),'geometry must load through the shared level cache');
  assert(lazy.includes("assets/geo-explorer.js")&&lazy.includes("assets/geo-explorer.css"),'Explore must be route-loaded by the shared lazy loader');

  assert(lazy.includes("assets/unit-system.js")&&lazy.includes("assets/worldbank-integration.js"),'optional integrations must remain available through lazy loader');
  assert(!lazy.includes('assets/sprint2-data.js')&&!lazy.includes('assets/sprint1-ui.js')&&!lazy.includes('assets/sprint2-ui.js'),'retired runtime overlays must not be lazily resurrected');
  assert(router.includes("data-view")&&router.includes("#/explore"),'route shell must remain a lightweight visibility layer');
  assert(routed.includes("KDA.registries(['series','observations'"),'Series may load heavy registries only after its route is active');
  console.log('P01_LAZY_CONSUMERS_OK');
}

function validateCompactData(){
  assert(pulse?.meta?.schema_version===1,'initial pulse schema_version must be 1');
  assert(pulse?.meta?.card_count===6&&pulse.cards?.length===6,'initial pulse must contain six national cards');
  const required=new Set(['KDA-CPI-YOY-KEN','KDA-USDKES-KEN','KDA-CBR-KEN','KDA-TBILL91-KEN','KDA-POP-TOTAL-KEN','KDA-VOTERS-KEN']);
  for(const card of pulse.cards){
    required.delete(card.series_code);
    assert(Array.isArray(card.history)&&card.history.length>0,`${card.series_code} has no history`);
    assert(card.badge&&card.source&&card.unit_code,`${card.series_code} missing display metadata`);
  }
  assert(required.size===0,`initial pulse missing ${[...required].join(', ')}`);
  console.log('P01_COMPACT_DISPLAY_DATA_OK');
}

function validateBudgets(){
  const criticalScripts=scriptSources().filter(src=>src.startsWith('assets/'));
  const jsBytes=criticalScripts.reduce((sum,p)=>sum+size(p),0);
  const firstData=['data/ui/initial-pulse.json','data/sprint1/gcp-2020-2024.csv','data/sprint1/county-budget-fy2024-25.csv','data/sprint1/voters-2022.csv'];
  const dataBytes=firstData.reduce((sum,p)=>sum+size(p),0);
  const pulseBytes=size('data/ui/initial-pulse.json');
  assert(jsBytes<=130*1024,`direct local JavaScript is ${jsBytes} bytes; budget is 133120`);
  assert(dataBytes<=24*1024,`first-paint data is ${dataBytes} bytes; budget is 24576`);
  assert(pulseBytes<=12*1024,`initial pulse is ${pulseBytes} bytes; budget is 12288`);
  const heavy={observations:size('data/indicators/registry/observations.json'),series:size('data/indicators/registry/series.json'),wards:size('data/geography/geometry/wards.geojson')};
  console.log(`P01_ASSET_BUDGET_OK direct_js=${jsBytes}B first_data=${dataBytes}B pulse=${pulseBytes}B`);
  console.log(`P01_DEFERRED_REFERENCE observations=${heavy.observations}B series=${heavy.series}B wards=${heavy.wards}B`);
}

try{
  validateFirstPaintContract();
  validateSharedLoader();
  validateLazyConsumers();
  validateCompactData();
  validateBudgets();
  console.log('P01_PERFORMANCE_ALL_OK');
}catch(error){
  console.error(error.message||error);
  process.exit(1);
}
