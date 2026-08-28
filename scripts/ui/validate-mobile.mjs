import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const assert=(ok,message)=>{if(!ok)throw new Error(`Mobile UI validation: ${message}`);};

try{
  const mobile=read('assets/mobile.css');
  const routed=read('assets/routed-views.css');
  const ux=read('assets/ux-polish.js');
  const html=read('index.html');

  assert(html.includes('<link rel="stylesheet" href="assets/mobile.css">'),'mobile.css must be linked directly in the document head');
  assert(html.indexOf('assets/mobile.css')>html.indexOf('assets/routed-views.css'),'mobile.css must load after routed-views.css');
  assert(!routed.includes('@import url("mobile.css")'),'mobile CSS must not use a serial @import waterfall');
  assert(html.includes('name="viewport"')&&html.includes('viewport-fit=cover'),'safe-area viewport contract is missing');
  console.log('MOBILE_DIRECT_LOAD_OK');

  for(const token of [
    '@media(max-width:760px)',
    '@media(max-width:430px)',
    '@media(max-width:350px)',
    '@media(pointer:coarse)',
    'body:has(#main-nav.open)',
    '.site-header nav.open',
    '100dvh',
    'min-height:44px',
    'font-size:16px',
    'overscroll-behavior',
    '-webkit-overflow-scrolling:touch'
  ]) assert(mobile.includes(token),`missing phone interaction contract: ${token}`);
  for(const token of ['installMobileNavigation','event.key===\'Escape\'','window.addEventListener(\'kda:route\'','(min-width:901px)','Close main navigation'])assert(ux.includes(token),`mobile menu behavior missing ${token}`);
  console.log('MOBILE_NAV_TOUCH_CONTRACT_OK');

  for(const token of [
    '#geo-svg{height:min(54svh,460px)!important',
    '.geo-ranking-panel{max-height:340px',
    '.geo-ranking-list button{min-height:48px',
    '.geo-selected-summary.kda-card,.geo-selected-summary',
    '.geo-map-meta .geo-legend{'
  ]) assert(mobile.includes(token),`Explore mobile contract missing ${token}`);
  console.log('MOBILE_EXPLORE_CONTRACT_OK');

  for(const token of [
    '.compare-matrix-wrap{max-height:none',
    '.compare-matrix{min-width:610px',
    'min-width:155px;max-width:170px',
    '.compare-place-card{min-width:min(82vw,285px)',
    '.compare-life-controls{padding:1rem var(--mobile-gutter);grid-template-columns:1fr'
  ]) assert(mobile.includes(token),`Compare mobile contract missing ${token}`);
  console.log('MOBILE_COMPARE_CONTRACT_OK');

  for(const token of [
    '.ciq-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}',
    '.ciq-metric{min-height:145px',
    '.ciq-fiscal{grid-template-columns:repeat(2,minmax(0,1fr))}',
    '.series-toolbar{align-items:stretch;flex-direction:column}',
    '.series-meta{grid-template-columns:1fr 1fr',
    '.footer-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'
  ]) assert(mobile.includes(token),`content-density mobile contract missing ${token}`);
  console.log('MOBILE_DENSITY_CONTRACT_OK');

  assert(!mobile.includes('width:100vw'),'mobile layer must not introduce 100vw overflow against scrollbar/safe-area widths');
  assert(mobile.includes('body{overflow-x:clip}'),'horizontal overflow guard missing');
  console.log('MOBILE_OVERFLOW_GUARD_OK');

  console.log('MOBILE_UI_ALL_OK');
}catch(error){
  console.error(error.message||error);
  process.exit(1);
}
