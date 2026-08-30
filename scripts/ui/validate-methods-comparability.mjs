import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const json=p=>JSON.parse(read(p));
const assert=(ok,msg)=>{if(!ok)throw new Error(`Methods visibility validation: ${msg}`);};

try{
  const html=read('index.html'),router=read('assets/router.js'),lazy=read('assets/lazy-integrations.js');
  const js=read('assets/methods-comparability.js'),css=read('assets/methods-comparability.css');
  const policy=json('data/policy/indicator-policy.json');
  assert(policy.indicators?.length===98,`expected 98 indicator policies, found ${policy.indicators?.length}`);
  assert(policy.series?.length===3370,`expected 3370 observed-series policies, found ${policy.series?.length}`);
  assert(html.includes('href="#/methods"')&&html.includes('data-view-link="methods"'),'Methods & Comparability is missing from main navigation');
  assert(html.includes('id="methods"')&&html.includes('data-view="methods"'),'Methods route section is missing');
  for(const id of ['methods-policy-panel','methods-ranking-panel','methods-series-panel','methods-policy-body','methods-ranking-body','methods-series-list'])assert(html.includes(`id="${id}"`),`missing ${id}`);
  assert(html.includes('assets/methods-comparability.css'),'Methods stylesheet is not loaded');
  assert(router.includes("'methods'")&&router.includes('Methods & Comparability — Kenya Data Atlas'),'router does not own the Methods route');
  assert(lazy.includes('assets/methods-comparability.js')&&lazy.includes("event.detail?.view==='methods'"),'Methods explorer is not lazy-loaded from its route');
  assert(js.includes("data/policy/indicator-policy.json")&&js.includes("data/countyiq/county-summary.json"),'Methods UI is not driven by canonical policy + CountyIQ mart');
  assert(js.includes('reason_not_eligible')&&js.includes('cross_level_comparison')&&js.includes('peer_group'),'Methods UI does not expose withholding/cross-level/peer evidence');
  assert(css.includes('.methods-table')&&css.includes('.methods-series-card'),'Methods responsive styling incomplete');
  const eligible=policy.series.filter(s=>s.cross_level_comparison?.eligible).length;
  assert(eligible>0&&eligible<policy.series.length,'cross-level policy must expose both eligible and same-level-only series');
  console.log(`METHODS_POLICY_VISIBILITY_OK indicators=${policy.indicators.length} series=${policy.series.length} cross_level=${eligible}`);
}catch(error){console.error(error.message||error);process.exit(1);}
