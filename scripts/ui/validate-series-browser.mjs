import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const assert=(ok,message)=>{if(!ok)throw new Error(`Series browser validation: ${message}`);};

try{
  const series=json('data/indicators/registry/series.json');
  const datasets=json('data/catalogue/registry/datasets.json');
  const browser=read('assets/series-browser.js');
  const css=read('assets/series-browser.css');
  const lazy=read('assets/lazy-integrations.js');

  const published=new Map(datasets.filter(d=>d.publication_status==='published').map(d=>[d.dataset_id,d]));
  const active=series.filter(s=>(!s.status||s.status==='active')&&published.has(s.dataset_id));
  const represented=new Set(active.map(s=>s.dataset_id));
  assert(represented.size>=4,`expected at least 4 published datasets with active series, found ${represented.size}`);
  for(const s of active)assert(published.has(s.dataset_id),`browseable series ${s.series_code} lacks a published dataset`);
  for(const code of ['DS-KNBS-CENSUS-TOPLINE','DS-KNBS-CPI-HEADLINE','DS-CBK-RATES-HEADLINE','DS-IEBC-VOTERS-TOPLINE']){
    const d=datasets.find(x=>x.dataset_code===code);assert(d&&d.publication_status==='published',`${code} must remain a published browseable dataset`);
    assert(represented.has(d.dataset_id),`${code} has no active canonical series`);
  }
  console.log(`SERIES_DATASET_CATALOGUE_OK datasets=${represented.size} series=${active.length}`);

  for(const token of [
    "KDA.registries(['series','indicators','geographies','datasets']",
    "publication_status==='published'",
    'dataset_id',
    'data-series-dataset',
    'data-series-choice',
    '<optgroup',
    "R.navigate('series'",
    'observation_count',
    'window.KDASeriesBrowser'
  ])assert(browser.includes(token),`browser missing ${token}`);
  assert(browser.includes("geoRank(geo")||browser.includes('geoRank(ga?.level)'), 'dataset default series must prefer geographic context deterministically');
  console.log('SERIES_BROWSER_ROUTE_SWITCH_OK');

  assert(lazy.includes("assets/series-browser.js")&&lazy.includes("event.detail?.view==='series'")&&lazy.includes('routeNeedsSeries'),'Series browser is not route-lazy');
  assert(css.includes('.series-browser{')&&css.includes('.series-browser-grid{')&&css.includes('.series-dataset-chips{'),'Series browser desktop styling is incomplete');
  assert(css.includes('@media(max-width:760px)')&&css.includes('.series-browser-grid{grid-template-columns:1fr')&&css.includes('font-size:16px'),'Series browser mobile styling is incomplete');
  console.log('SERIES_BROWSER_LAZY_MOBILE_OK');

  console.log('SERIES_BROWSER_ALL_OK');
}catch(error){
  console.error(error.message||error);
  process.exit(1);
}
