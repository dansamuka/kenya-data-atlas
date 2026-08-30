import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const j=f=>JSON.parse(read(f));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P05 validation: ${msg}`);};
function csvRows(file){const lines=read(file).trim().split(/\r?\n/);const fields=lines.shift().split(',');return lines.map(line=>{const vals=line.split(',');return Object.fromEntries(fields.map((f,i)=>[f,vals[i]??'']));});}
const num=v=>Number(v);
const education=csvRows('data/p05/source/education-tsc-2023.csv');
const economy=csvRows('data/p05/source/economic-structure-gcp-2024.csv');
const maize=csvRows('data/p05/source/maize-2023.csv');
const connectivity=csvRows('data/p05/source/connectivity-housing-survey-2023-24.csv');
const byGeo=rows=>new Map(rows.map(r=>[r.geo_code,r]));
const sources={education:byGeo(education),economy:byGeo(economy),maize:byGeo(maize),connectivity:byGeo(connectivity)};
const mart=j('data/countyiq/county-summary.json');
const indicators=j('data/indicators/registry/indicators.json');
const datasets=j('data/catalogue/registry/datasets.json');
const roadmap=j('data/project-roadmap.json');
const html=read('index.html'),ui=read('assets/countyiq-view.js'),css=read('assets/p05-breadth.css'),lazy=read('assets/lazy-integrations.js');
const P05=[
 ['IND-PUBLIC-PRIMARY-SCHOOLS','education','public_primary_schools','A'],
 ['IND-PRIMARY-CLASSROOM-TEACHERS','education','primary_classroom_teachers','A'],
 ['IND-PUBLIC-SECONDARY-SCHOOLS','education','public_secondary_schools','A'],
 ['IND-SECONDARY-TEACHERS','education','secondary_teachers','A'],
 ['IND-AGRICULTURE-GVA','economy','agriculture_gva_ksh_m','A'],
 ['IND-MANUFACTURING-GVA','economy','manufacturing_gva_ksh_m','A'],
 ['IND-AGRICULTURE-GCP-SHARE','economy','agriculture_share_pct','B'],
 ['IND-MANUFACTURING-GCP-SHARE','economy','manufacturing_share_pct','B'],
 ['IND-MAIZE-AREA','maize','maize_area_ha','A'],
 ['IND-MAIZE-PRODUCTION','maize','maize_production_tonnes','A'],
 ['IND-MAIZE-YIELD','maize','maize_yield_t_per_ha','B'],
 ['IND-INTERNET-USE','connectivity','internet_use_pct','A'],
 ['IND-COMPUTER-USE','connectivity','computer_use_pct','A'],
 ['IND-MAIN-GRID-ELECTRICITY','connectivity','main_grid_electricity_pct','A']
];
const DATASETS=['DS-MOE-TSC-COUNTY-2023','DS-KNBS-GCP-STRUCTURE-2024','DS-KNBS-MAIZE-2023','DS-KNBS-KHS-CONNECTIVITY-2023-24'];
const indByCode=new Map(indicators.map(x=>[x.indicator_code,x]));
try{
 for(const [name,rows] of Object.entries({education,economy,maize,connectivity}))assert(rows.length===47&&new Set(rows.map(x=>x.geo_code)).size===47,`${name} source must contain 47 unique counties`);
 assert(education.every((r,i)=>r.geo_code===`KEN-C${String(i+1).padStart(3,'0')}`),'formal 001-047 county order missing');
 assert(education.reduce((s,r)=>s+num(r.public_primary_schools),0)===23274,'primary-school total mismatch');
 assert(education.reduce((s,r)=>s+num(r.primary_classroom_teachers),0)===183929,'primary-teacher total mismatch');
 assert(education.reduce((s,r)=>s+num(r.public_secondary_schools),0)===9246,'secondary-school total mismatch');
 assert(education.reduce((s,r)=>s+num(r.secondary_teachers),0)===108569,'secondary-teacher total mismatch');
 assert(Math.round(maize.reduce((s,r)=>s+num(r.maize_area_ha),0))===2430013,'maize area reconciliation mismatch');
 assert(Math.round(maize.reduce((s,r)=>s+num(r.maize_production_tonnes),0))===4285206,'maize production reconciliation mismatch');
 console.log('COUNTYIQ_P05_SOURCE_RECONCILIATION_OK');

 for(const code of DATASETS)assert(datasets.some(d=>d.dataset_code===code&&d.publication_status==='published'),`${code} must be a published canonical dataset`);
 for(const [code] of P05){const ind=indByCode.get(code);assert(ind&&ind.active!==false,`${code} missing/inactive`);assert(ind.comparable!==false,`${code} must be comparable`);assert(ind.ranking_allowed===false,`${code} must defer ranking to P06`);}
 console.log('COUNTYIQ_P05_CATALOGUE_PROVENANCE_OK');

 assert(mart.meta?.county_count===47&&mart.counties?.length===47,'CountyIQ mart must contain exactly 47 counties');
 let metricCount=0;
 for(const county of mart.counties){const geo=county.geography?.geo_code;assert(geo,`mart county missing geo_code`);
   for(const [code,sourceName,field,badge] of P05){
     const src=sources[sourceName].get(geo);assert(src,`${geo}/${code}: source row missing`);
     const m=county.metrics?.[code];assert(m?.status==='active',`${geo}/${code}: active mart metric missing`);metricCount++;
     assert(Number(m.latest?.value)===Number(src[field]),`${geo}/${code}: mart value diverges from validated source snapshot`);
     assert(m.latest?.geographic_method!=='inherited',`${geo}/${code}: inheritance prohibited`);
     assert(m.latest?.provenance?.badge===badge,`${geo}/${code}: expected provenance badge ${badge}, got ${m.latest?.provenance?.badge}`);
     assert(Boolean(m.latest?.provenance?.source_url),`${geo}/${code}: source URL missing`);
     assert(m.eligibility?.ranking_allowed===false,`${geo}/${code}: P05 ranking must be withheld`);
   }
 }
 assert(metricCount===47*14,`expected 658 P05 county metrics, got ${metricCount}`);
 console.log(`COUNTYIQ_P05_47X14_OK metrics=${metricCount}`);
 console.log('COUNTYIQ_P05_NO_INHERITANCE_OK');
 console.log('COUNTYIQ_P05_DERIVED_BADGES_OK');

 const allCodes=new Set();for(const c of mart.counties)for(const code of Object.keys(c.metrics||{}))allCodes.add(code);
 const full=[];for(const code of allCodes){if(mart.counties.every(c=>c.metrics?.[code]?.status==='active'&&c.metrics?.[code]?.latest?.value!==null&&c.metrics?.[code]?.latest?.value!==undefined))full.push(code);}
 const domainFor=ind=>{const t=`${ind?.topic||''} ${ind?.subtopic||''} ${ind?.name||''}`.toLowerCase();if(/budget|fiscal|expenditure|revenue/.test(t))return'public_finance';if(/health|stunt|immun|maternal/.test(t))return'health';if(/education|school|teacher|learning/.test(t))return'education';if(/infrastructure|digital|electric|internet|computer|road|water|land area/.test(t))return'infrastructure';if(/poverty|living|population|demograph|housing|household/.test(t))return'living_standards';if(/election|voter|govern/.test(t))return'governance';return'economy';};
 const domains=new Set(full.map(code=>domainFor(indByCode.get(code))));
 assert(full.length>=20,`breadth gate requires >=20 fully county-covered active indicators; got ${full.length}`);
 assert(domains.size>=5,`breadth gate requires >=5 domains; got ${domains.size}: ${[...domains].join(', ')}`);
 console.log(`COUNTYIQ_P05_BREADTH_GATE_OK indicators=${full.length} domains=${domains.size}`);

 for(const token of ['id="ciq-p05-breadth"','Education, economy, agriculture & connectivity'])assert(html.includes(token),`HTML missing ${token}`);
 assert(lazy.includes('assets/p05-breadth.css'),'P05 breadth stylesheet is not route-loaded with CountyIQ');
 assert(!html.includes('<link rel="stylesheet" href="assets/p05-breadth.css">'),'P05 breadth stylesheet must stay off the homepage cold-load path');
 for(const token of P05.map(x=>x[0]))assert(ui.includes(token),`CountyIQ UI missing ${token}`);
 for(const token of ['renderBreadth(row)','Maize yield · Atlas derived','Internet use · age 3+','Households on main grid'])assert(ui.includes(token),`CountyIQ breadth renderer missing ${token}`);
 assert(css.includes('.ciq-p05-grid{')&&css.includes('@media(max-width:560px)'),'responsive P05 CSS missing');
 console.log('COUNTYIQ_P05_UI_OK');

 const phase05=roadmap.phases.find(x=>x.id==='P05');
 assert(phase05?.status==='complete','P05 roadmap must be complete');
 const order=roadmap.phases.map(x=>x.id);
 const nextPhases=roadmap.phases.filter(x=>x.status==='next');
 assert(nextPhases.length===1,`exactly one phase must be marked next, found ${nextPhases.length}`);
 assert(order.indexOf(nextPhases[0].id)>order.indexOf('P05'),`the next phase (${nextPhases[0].id}) must come after P05 — roadmap must only move forward`);
 console.log(`COUNTYIQ_P05_ROADMAP_OK next=${nextPhases[0].id}`);
 console.log('COUNTYIQ_P05_ALL_OK');
}catch(error){console.error(error.message||error);process.exit(1);}
