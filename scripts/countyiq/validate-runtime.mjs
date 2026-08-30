import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const exists=p=>fs.existsSync(path.join(root,p));
const assert=(condition,message)=>{if(!condition)throw new Error(`CountyIQ runtime validation: ${message}`);};

function parseCsv(text){
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  const head=(lines.shift()||'').split(',');
  return lines.filter(Boolean).map(line=>{
    const cells=[];let cur='';let quoted=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++;}else quoted=!quoted;}
      else if(ch===','&&!quoted){cells.push(cur);cur='';}
      else cur+=ch;
    }
    cells.push(cur);return Object.fromEntries(head.map((h,i)=>[h,cells[i]??'']));
  });
}
function loadSample(){const code=read('assets/countyiq-sample.js');const context={window:{}};vm.createContext(context);vm.runInContext(code,context,{filename:'assets/countyiq-sample.js'});return context.window.COUNTYIQ_SAMPLE;}
function validateSample(){
  const sample=loadSample();
  assert(sample?.meta?.mode==='sample','sample bundle must declare sample mode');
  assert(Array.isArray(sample.rows)&&sample.rows.length>=6,'sample bundle must contain at least six county rows');
  assert(sample.meta.preview_values?.toLowerCase().includes('synthetic'),'sample metadata must explicitly say preview fields are synthetic');
  assert(sample.previews?.['KEN-C032']?.development_performance_index,'Nakuru mature-product preview is required');
  assert(Array.isArray(sample.previews?.['KEN-C032']?.opportunities),'Nakuru sample opportunities are required');
  const gcp=new Map(parseCsv(read('data/sprint1/gcp-2020-2024.csv')).map(r=>[r.geo_code,r]));
  const budget=new Map(parseCsv(read('data/sprint1/county-budget-fy2024-25.csv')).map(r=>[r.geo_code,r]));
  const voters=new Map(parseCsv(read('data/sprint1/voters-2022.csv')).map(r=>[r.geo_code,r]));
  for(const row of sample.rows){
    const gr=gcp.get(row.geo_code),br=budget.get(row.geo_code),vr=voters.get(row.geo_code);assert(gr&&br&&vr,`sample county ${row.geo_code} missing in Sprint 1 source files`);
    for(const year of [2020,2021,2022,2023,2024])assert(Number(gr[String(year)])===Number(row[`gcp${year}`]),`${row.geo_code} GCP ${year} mismatch`);
    assert(Number(br.budget_total_ksh_mn)===Number(row.budget),`${row.geo_code} budget mismatch`);
    assert(Number(br.expenditure_total_ksh_mn)===Number(row.expenditure),`${row.geo_code} expenditure mismatch`);
    assert(Number(br.development_absorption_pct)===Number(row.devAbsorption),`${row.geo_code} development absorption mismatch`);
    assert(Number(br.overall_absorption_pct)===Number(row.absorption),`${row.geo_code} overall absorption mismatch`);
    assert(Number(vr.value)===Number(row.voters),`${row.geo_code} voters mismatch`);
  }
  console.log('COUNTYIQ_SAMPLE_SOURCE_MATCH_OK');
}
function validateLegacyResilience(){
  const js=read('assets/countyiq.js');
  for(const token of ['loadProductionRows','loadSampleBundle','state.mode=\'production\'','state.mode=\'sample\'','state.mode=\'unavailable\'','Demo preview','data-mode-note','renderUnavailable'])assert(js.includes(token),`legacy runtime missing resilience token ${token}`);
  const productionCall=js.indexOf('state.rows=await loadProductionRows()'),fallbackCall=js.indexOf('state.sample=await loadSampleBundle()',productionCall);
  assert(productionCall>=0&&fallbackCall>productionCall,'legacy production data must be attempted before bundled fallback');
  assert(!js.includes("const root=$('#iq-root');if(root)root.innerHTML"),'legacy data failure must not replace entire CountyIQ root');
  console.log('COUNTYIQ_LEGACY_RESILIENCE_OK');
}
function validateIntegratedRuntime(){
  const js=read('assets/countyiq-view.js'),lazy=read('assets/lazy-integrations.js'),html=read('index.html');
  assert(html.includes('data-view="countyiq"')&&html.includes('id="countyiq-view"'),'CountyIQ is not an Atlas routed view');
  assert(lazy.includes("KDA.loadScript('assets/countyiq-view.js'")&&lazy.includes("view==='countyiq'"),'CountyIQ route is not lazy loaded');
  assert(js.includes('const FALLBACK=[')&&js.includes("mode='sample'")&&js.includes("mode='production'"),'integrated runtime lacks production/fallback states');
  assert(js.includes("const MART='data/countyiq/county-summary.json'")&&js.includes('KDA.fetchJson(MART,{required:true})'),'integrated runtime is not grounded in canonical CountyIQ mart');
  assert(!js.includes('data/sprint1/')&&!js.includes('KDA.csv('),'integrated CountyIQ still directly joins Sprint CSV files');
  assert(!js.includes('roadmap.json')&&!js.includes('window.d3'),'integrated CountyIQ retains independent roadmap/D3 dependency');
  assert(js.includes('renderFailure')&&lazy.includes('countyIqFailure'),'CountyIQ route has no nonfatal failure path');
  assert(lazy.includes('hardenCountyIQMart')&&lazy.includes('ranking.eligible===true')&&lazy.includes('ranking.peer_group=null'),'CountyIQ loader must neutralise null ranking percentiles before rendering');
  assert(!exists('county-dashboard.html'),'retired standalone County Dashboard page must not exist');
  console.log('COUNTYIQ_INTEGRATED_MART_NONFATAL_OK null_percentile_guard=on');
}
function validateUiLabels(){const js=read('assets/countyiq.js'),css=read('assets/countyiq.css');assert(js.includes('Demo only:'),'synthetic preview missing Demo-only warning');assert(js.includes('These are not live programmes.'),'opportunity preview must state records are not live');assert(css.includes('.badge.demo')&&css.includes('.data-mode-note.sample'),'sample/demo visual states must be styled');console.log('COUNTYIQ_DEMO_LABELS_OK');}
try{validateSample();validateLegacyResilience();validateIntegratedRuntime();validateUiLabels();console.log('COUNTYIQ_RUNTIME_ALL_OK');}catch(error){console.error(error.message||error);process.exit(1);}
