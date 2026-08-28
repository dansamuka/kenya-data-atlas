import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const assert=(condition,message)=>{if(!condition)throw new Error(`CountyIQ scaffold validation: ${message}`);};

function validateRoadmap(){
  const r=json('data/countyiq/roadmap.json');
  assert(r.product?.name==='CountyIQ','product.name must be CountyIQ');
  assert(r.product?.parent_product==='Kenya Data Atlas','parent product must remain Kenya Data Atlas');
  assert(Array.isArray(r.data_domains)&&r.data_domains.length===7,'roadmap must define exactly seven target data domains');
  assert(Array.isArray(r.workstreams)&&r.workstreams.length>=12,'roadmap must define an elaborate ordered workstream tree');
  assert(Array.isArray(r.release_stages)&&r.release_stages.map(x=>x.id).join('')==='ABCDEFG','release stages must be A through G in order');
  assert(Array.isArray(r.guardrails)&&r.guardrails.length>=8,'roadmap must define core credibility guardrails');
  const allowed=new Set(['integrated','ready_to_surface','sourced','planned','research','blocked']);
  const priorities=[];
  for(const d of r.data_domains){
    assert(d.id&&d.name&&Number.isInteger(d.target_indicator_count),'every domain requires id, name and target_indicator_count');
    assert(Array.isArray(d.indicators)&&d.indicators.length>0,`domain ${d.id} has no indicator scaffold`);
    for(const i of d.indicators)assert(i.code&&i.name&&allowed.has(i.status),`invalid indicator scaffold in ${d.id}`);
  }
  for(const w of r.workstreams){assert(w.id&&w.name&&w.stage&&Number.isInteger(w.priority)&&w.exit_gate,'every workstream requires id/name/stage/priority/exit_gate');assert(allowed.has(w.status),`invalid workstream status ${w.status}`);priorities.push(w.priority);}
  const sorted=[...priorities].sort((a,b)=>a-b);
  assert(new Set(priorities).size===priorities.length,'workstream priorities must be unique');
  assert(sorted[0]===1,'workstream priority must start at 1');
  console.log('COUNTYIQ_ROADMAP_OK');
}

function validateSchema(){
  const s=json('data/countyiq/target-schema.json');
  assert(s.title==='CountyIQ County Analytical Mart','unexpected target schema title');
  assert(s.properties?.counties?.minItems===47&&s.properties?.counties?.maxItems===47,'target mart must require exactly 47 counties');
  assert(s.properties?.meta?.properties?.county_count?.const===47,'meta county_count must be locked to 47');
  for(const def of ['county','metric','observation','provenance','ranking','trend','indexResult','gap','opportunityMatch','document','coverage'])assert(s.$defs?.[def],`missing schema definition ${def}`);
  assert(s.$defs.provenance.properties.badge.enum.join('')==='ABCDE','provenance badge enum must preserve A-E');
  console.log('COUNTYIQ_SCHEMA_OK');
}

function validateWebsite(){
  const html=read('index.html');
  const redirect=read('county-dashboard.html');
  const js=read('assets/countyiq-view.js');
  const css=read('assets/countyiq-view.css');
  const roadmapJs=read('assets/countyiq-roadmap.js');
  const roadmapCss=read('assets/countyiq-roadmap.css');
  for(const token of ['href="#/countyiq"','data-view="countyiq"','id="countyiq-view"','id="ciq-county-select"','assets/countyiq-view.css'])assert(html.includes(token),`integrated website missing ${token}`);
  assert(redirect.includes('index.html#/countyiq'),'legacy county-dashboard.html must redirect to integrated CountyIQ');
  assert(js.includes('window.KDACountyIQ')&&js.includes("KDA.csv('data/sprint1/gcp-2020-2024.csv')"),'integrated CountyIQ runtime is not wired to shared Atlas data');
  assert(css.includes('.countyiq-route')&&css.includes('.ciq-metrics'),'integrated CountyIQ stylesheet missing core layout classes');
  // The machine-readable final-shape scaffold remains maintained, but it is no
  // longer a boot dependency for the public CountyIQ route.
  assert(roadmapJs.includes("fetch('data/countyiq/roadmap.json')"),'roadmap renderer must still consume the machine-readable roadmap');
  assert(roadmapJs.includes('renderExperiences')&&roadmapJs.includes('renderDomains')&&roadmapJs.includes('renderWorkstreams'),'roadmap renderer missing required views');
  assert(roadmapCss.includes('.roadmap-experiences')&&roadmapCss.includes('.roadmap-domains')&&roadmapCss.includes('.roadmap-workstreams'),'roadmap stylesheet missing core layout classes');
  console.log('COUNTYIQ_WEBSITE_SCAFFOLD_OK');
}

function validateCi(){
  const p=json('package.json');
  const countyScript=String(p.scripts?.['countyiq:validate']||'');
  assert(countyScript.includes('node scripts/countyiq/validate-scaffold.mjs all'),'package must run CountyIQ scaffold validation');
  assert(countyScript.includes('node scripts/countyiq/validate-runtime.mjs'),'package must run CountyIQ resilience/sample validation');
  assert(String(p.scripts?.test||'').includes('npm run countyiq:validate'),'main test command must include CountyIQ validation');
  console.log('COUNTYIQ_CI_WIRED_OK');
}

const mode=process.argv[2]||'all';
try{
  if(mode==='roadmap')validateRoadmap();
  else if(mode==='schema')validateSchema();
  else if(mode==='website')validateWebsite();
  else if(mode==='ci')validateCi();
  else if(mode==='all'){validateRoadmap();validateSchema();validateWebsite();validateCi();console.log('COUNTYIQ_SCAFFOLD_ALL_OK');}
  else throw new Error(`Unknown validation mode: ${mode}`);
}catch(error){console.error(error.message||error);process.exit(1);}
