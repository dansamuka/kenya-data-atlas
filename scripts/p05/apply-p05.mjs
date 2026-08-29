import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const p=(...x)=>path.join(root,...x);
const read=f=>fs.readFileSync(p(f),'utf8');
const write=(f,v)=>fs.writeFileSync(p(f),v);
const j=f=>JSON.parse(read(f));
const wj=(f,v)=>write(f,JSON.stringify(v,null,2)+'\n');
const upsert=(rows,key,row)=>{const i=rows.findIndex(x=>x[key]===row[key]);if(i>=0)rows[i]=row;else rows.push(row);};
const replaceOnce=(text,from,to,label)=>{if(text.includes(to))return text;if(!text.includes(from))throw new Error(`P05 patch anchor missing: ${label}`);return text.replace(from,to);};
const num=v=>{const n=Number(v);if(!Number.isFinite(n))throw new Error(`P05 invalid number: ${v}`);return n;};
function csvRows(file){
  const lines=read(file).trim().split(/\r?\n/);const fields=lines.shift().split(',');
  return lines.map(line=>{const vals=line.split(',');return Object.fromEntries(fields.map((f,i)=>[f,vals[i]??'']));});
}

const education=csvRows('data/p05/source/education-tsc-2023.csv');
const economy=csvRows('data/p05/source/economic-structure-gcp-2024.csv');
const maize=csvRows('data/p05/source/maize-2023.csv');
const connectivity=csvRows('data/p05/source/connectivity-housing-survey-2023-24.csv');
for(const [name,rows] of Object.entries({education,economy,maize,connectivity})){
  if(rows.length!==47||new Set(rows.map(r=>r.geo_code)).size!==47)throw new Error(`${name}: expected 47 unique counties`);
}
const byGeo=rows=>new Map(rows.map(r=>[r.geo_code,r]));
const edu=byGeo(education),eco=byGeo(economy),agr=byGeo(maize),conn=byGeo(connectivity);
const geos=education.map(r=>r.geo_code);
if(geos.some((g,i)=>g!==`KEN-C${String(i+1).padStart(3,'0')}`))throw new Error('P05 source rows must follow formal county order 001-047');

const eduTotals={
  public_primary_schools:education.reduce((s,r)=>s+num(r.public_primary_schools),0),
  primary_classroom_teachers:education.reduce((s,r)=>s+num(r.primary_classroom_teachers),0),
  public_secondary_schools:education.reduce((s,r)=>s+num(r.public_secondary_schools),0),
  secondary_teachers:education.reduce((s,r)=>s+num(r.secondary_teachers),0)
};
const expectedEdu={public_primary_schools:23274,primary_classroom_teachers:183929,public_secondary_schools:9246,secondary_teachers:108569};
if(JSON.stringify(eduTotals)!==JSON.stringify(expectedEdu))throw new Error(`P05 education totals diverged: ${JSON.stringify(eduTotals)}`);
if(Math.round(maize.reduce((s,r)=>s+num(r.maize_area_ha),0))!==2430013)throw new Error('P05 maize area total diverged');
if(Math.round(maize.reduce((s,r)=>s+num(r.maize_production_tonnes),0))!==4285206)throw new Error('P05 maize production total diverged');

// Units used only where the existing registry does not already carry an equivalent.
const units=j('data/indicators/seed/units.json');
for(const u of [
  {code:'kes_million',name:'Kenya shillings, million',symbol:'KES mn',dimension:'currency',scale_factor:1000000,decimal_places:0,currency_code:'KES'},
  {code:'hectares',name:'Hectares',symbol:'ha',dimension:'area',scale_factor:1,decimal_places:0},
  {code:'tonnes',name:'Tonnes',symbol:'t',dimension:'mass',scale_factor:1,decimal_places:0},
  {code:'tonnes_per_hectare',name:'Tonnes per hectare',symbol:'t/ha',dimension:'rate',scale_factor:1,decimal_places:2}
])upsert(units,'code',u);
wj('data/indicators/seed/units.json',units);

// Narrow publication slices. Broad source families can remain under review independently.
const datasets=j('data/catalogue/seed/datasets.json');
const EDU_URL='https://www.education.go.ke/sites/default/files/2023-08/B5%20REPORT%20OF%20THE%20PRESIDENTIAL%20WORKING%20PARTY%20ON%20EDUCATION%20REFORM%207th%20JULY%202023%20.pdf';
const GCP_URL='https://www.knbs.or.ke/wp-content/uploads/2025/12/2025-Gross-County-Product.pdf';
const AGRI_URL='https://www.knbs.or.ke/wp-content/uploads/2025/01/National-Agriculture-Production-Report-2024.pdf';
const KHS_URL='https://www.knbs.or.ke/reports/2023-24-kenya-housing-survey-basic-report/';
for(const d of [
  {code:'DS-MOE-TSC-COUNTY-2023',source_code:'MOE-EDUCATION',title:'Presidential Working Party on Education Reform 2023 — TSC County Establishments',description:'County public primary and secondary school establishments and TSC teacher establishments from Appendices 4.5 and 4.6.',topic:'Education',geographic_coverage:['county'],frequency:'one_off',publication_status:'published',methodology_url:EDU_URL,known_limitations:'Public-school and TSC establishment counts only; not all public/private schools or all education workers.'},
  {code:'DS-KNBS-GCP-STRUCTURE-2024',source_code:'KNBS-STATISTICS',title:'Gross County Product 2025 release — 2024 Economic Activity',description:'County agriculture and manufacturing gross value added at current prices from the 2024 GCP economic-activity annex.',topic:'Economy',geographic_coverage:['county'],frequency:'annual',publication_status:'published',methodology_url:GCP_URL,known_limitations:'Current-price sector values and shares describe economic structure, not welfare or county-government performance.'},
  {code:'DS-KNBS-MAIZE-2023',source_code:'KNBS-STATISTICS',title:'National Agriculture Production Report 2024 — 2023 Maize by County',description:'County maize area and production for 2023 from Annex 1; Atlas yield is transparent arithmetic from the same source row.',topic:'Agriculture',geographic_coverage:['county'],frequency:'annual',publication_status:'published',methodology_url:AGRI_URL,known_limitations:'2023 crop production snapshot. Yield is an Atlas-derived ratio of reported production tonnes to reported area hectares.'},
  {code:'DS-KNBS-KHS-CONNECTIVITY-2023-24',source_code:'KNBS-STATISTICS',title:'2023/24 Kenya Housing Survey — County Connectivity and Main-grid Electricity',description:'County internet use, computer use and household connection to main-grid electricity from the 2023/24 Kenya Housing Survey data tables.',topic:'Infrastructure',geographic_coverage:['county'],frequency:'periodic',publication_status:'published',methodology_url:KHS_URL,known_limitations:'Survey reference period 2023/24. Internet/computer measures are for individuals aged 3+; main-grid electricity is a household measure and must not be conflated with the individual denominator.'}
])upsert(datasets,'code',d);
wj('data/catalogue/seed/datasets.json',datasets);

const indicators=j('data/indicators/seed/indicators.json');
const defs=[
  ['IND-PUBLIC-PRIMARY-SCHOOLS','Public primary schools','Public primary schools','Count of public primary school establishments in the TSC 2023 county table.','Education','School infrastructure','count',null],
  ['IND-PRIMARY-CLASSROOM-TEACHERS','Primary classroom teachers','Primary teachers','TSC 2023 classroom-teacher establishment in public primary schools.','Education','Teachers','count',null],
  ['IND-PUBLIC-SECONDARY-SCHOOLS','Public secondary schools','Public secondary schools','Count of public secondary school establishments in the TSC 2023 county table.','Education','School infrastructure','count',null],
  ['IND-SECONDARY-TEACHERS','Secondary teachers','Secondary teachers','TSC 2023 teacher establishment in public secondary schools.','Education','Teachers','count',null],
  ['IND-AGRICULTURE-GVA','Agriculture gross value added','Agriculture GVA','Agriculture, forestry and fishing gross value added at current prices in 2024.','Economy','Economic structure','kes_million',null],
  ['IND-MANUFACTURING-GVA','Manufacturing gross value added','Manufacturing GVA','Manufacturing gross value added at current prices in 2024.','Economy','Economic structure','kes_million',null],
  ['IND-AGRICULTURE-GCP-SHARE','Agriculture share of GCP','Agriculture share','Agriculture, forestry and fishing gross value added as a share of 2024 Gross County Product.','Economy','Economic structure','percent',null],
  ['IND-MANUFACTURING-GCP-SHARE','Manufacturing share of GCP','Manufacturing share','Manufacturing gross value added as a share of 2024 Gross County Product.','Economy','Economic structure','percent',null],
  ['IND-MAIZE-AREA','Maize area','Maize area','Area under maize reported for 2023.','Agriculture','Crop production','hectares',null],
  ['IND-MAIZE-PRODUCTION','Maize production','Maize production','Maize production reported for 2023.','Agriculture','Crop production','tonnes',null],
  ['IND-MAIZE-YIELD','Maize yield','Maize yield','Tonnes of maize production per reported hectare in 2023, calculated by the Atlas from the two fields in the same official county row.','Agriculture','Crop productivity','tonnes_per_hectare',true],
  ['IND-INTERNET-USE','Individuals using internet','Internet use','Share of individuals aged 3 years and above who used the internet in the 2023/24 Kenya Housing Survey.','Infrastructure','Digital connectivity','percent',true],
  ['IND-COMPUTER-USE','Individuals using a computer','Computer use','Share of individuals aged 3 years and above who used a computer in the 2023/24 Kenya Housing Survey.','Infrastructure','Digital connectivity','percent',true],
  ['IND-MAIN-GRID-ELECTRICITY','Households connected to main-grid electricity','Main-grid electricity','Share of households connected to electricity on the main grid in the 2023/24 Kenya Housing Survey.','Infrastructure','Electricity access','percent',true]
];
for(const [code,name,short_name,description,topic,subtopic,unit_code,higher_is_better] of defs){
  const methodology_url=code.startsWith('IND-PUBLIC')||code.includes('TEACHER')?EDU_URL:code.includes('GVA')||code.includes('GCP-SHARE')?GCP_URL:code.startsWith('IND-MAIZE')?AGRI_URL:KHS_URL;
  upsert(indicators,'code',{code,name,short_name,description,topic,subtopic,unit_code,higher_is_better,preferred_frequency:code.startsWith('IND-MAIZE')||code.includes('GVA')||code.includes('GCP-SHARE')?'annual':'periodic',minimum_geo_level:'county',methodology_url,comparable:true,ranking_allowed:false,requires_sampling_uncertainty:false});
}
wj('data/indicators/seed/indicators.json',indicators);

let series=j('data/indicators/seed/series.json').filter(x=>!String(x.code).startsWith('KDA-P05-'));
let observations=j('data/indicators/seed/observations.json').filter(x=>!String(x.series_code).startsWith('KDA-P05-'));
const specs=[
  {field:'public_primary_schools',prefix:'PRIMARY-SCHOOLS',indicator:'IND-PUBLIC-PRIMARY-SCHOOLS',dataset:'DS-MOE-TSC-COUNTY-2023',unit:'count',src:edu,url:EDU_URL,table:'Appendix 4.5 — Public Primary Schools, TSC 2023',label:'2023 TSC',start:'2023-01-01',end:'2023-12-31'},
  {field:'primary_classroom_teachers',prefix:'PRIMARY-TEACHERS',indicator:'IND-PRIMARY-CLASSROOM-TEACHERS',dataset:'DS-MOE-TSC-COUNTY-2023',unit:'count',src:edu,url:EDU_URL,table:'Appendix 4.5 — Public Primary School Teacher Establishment, TSC 2023',label:'2023 TSC',start:'2023-01-01',end:'2023-12-31'},
  {field:'public_secondary_schools',prefix:'SECONDARY-SCHOOLS',indicator:'IND-PUBLIC-SECONDARY-SCHOOLS',dataset:'DS-MOE-TSC-COUNTY-2023',unit:'count',src:edu,url:EDU_URL,table:'Appendix 4.6 — Public Secondary Schools, TSC 2023',label:'2023 TSC',start:'2023-01-01',end:'2023-12-31'},
  {field:'secondary_teachers',prefix:'SECONDARY-TEACHERS',indicator:'IND-SECONDARY-TEACHERS',dataset:'DS-MOE-TSC-COUNTY-2023',unit:'count',src:edu,url:EDU_URL,table:'Appendix 4.6 — Public Secondary School Teacher Establishment, TSC 2023',label:'2023 TSC',start:'2023-01-01',end:'2023-12-31'},
  {field:'agriculture_gva_ksh_m',prefix:'AGRI-GVA',indicator:'IND-AGRICULTURE-GVA',dataset:'DS-KNBS-GCP-STRUCTURE-2024',unit:'kes_million',src:eco,url:GCP_URL,table:'Annexe I — GCP by Economic Activity at Current Prices, 2024',label:'2024',start:'2024-01-01',end:'2024-12-31',price:'current_prices'},
  {field:'manufacturing_gva_ksh_m',prefix:'MANUFACTURING-GVA',indicator:'IND-MANUFACTURING-GVA',dataset:'DS-KNBS-GCP-STRUCTURE-2024',unit:'kes_million',src:eco,url:GCP_URL,table:'Annexe I — GCP by Economic Activity at Current Prices, 2024',label:'2024',start:'2024-01-01',end:'2024-12-31',price:'current_prices'},
  {field:'agriculture_share_pct',prefix:'AGRI-SHARE',indicator:'IND-AGRICULTURE-GCP-SHARE',dataset:'DS-KNBS-GCP-STRUCTURE-2024',unit:'percent',src:eco,url:GCP_URL,table:'Annexe I — GCP by Economic Activity at Current Prices, 2024',label:'2024',start:'2024-01-01',end:'2024-12-31',notes:'Atlas ratio: source agriculture GVA divided by source GCP in the same 2024 county row.'},
  {field:'manufacturing_share_pct',prefix:'MANUFACTURING-SHARE',indicator:'IND-MANUFACTURING-GCP-SHARE',dataset:'DS-KNBS-GCP-STRUCTURE-2024',unit:'percent',src:eco,url:GCP_URL,table:'Annexe I — GCP by Economic Activity at Current Prices, 2024',label:'2024',start:'2024-01-01',end:'2024-12-31',notes:'Atlas ratio: source manufacturing GVA divided by source GCP in the same 2024 county row.'},
  {field:'maize_area_ha',prefix:'MAIZE-AREA',indicator:'IND-MAIZE-AREA',dataset:'DS-KNBS-MAIZE-2023',unit:'hectares',src:agr,url:AGRI_URL,table:'Annex 1 — Area and Production of Maize by County, 2019-2023',label:'2023',start:'2023-01-01',end:'2023-12-31'},
  {field:'maize_production_tonnes',prefix:'MAIZE-PRODUCTION',indicator:'IND-MAIZE-PRODUCTION',dataset:'DS-KNBS-MAIZE-2023',unit:'tonnes',src:agr,url:AGRI_URL,table:'Annex 1 — Area and Production of Maize by County, 2019-2023',label:'2023',start:'2023-01-01',end:'2023-12-31'},
  {field:'maize_yield_t_per_ha',prefix:'MAIZE-YIELD',indicator:'IND-MAIZE-YIELD',dataset:'DS-KNBS-MAIZE-2023',unit:'tonnes_per_hectare',src:agr,url:AGRI_URL,table:'Annex 1 — Area and Production of Maize by County, 2019-2023',label:'2023',start:'2023-01-01',end:'2023-12-31',method:'aggregated',transform:'ratio',notes:'Atlas-derived ratio: reported 2023 maize production tonnes divided by reported 2023 maize area hectares for the same county.'},
  {field:'internet_use_pct',prefix:'INTERNET',indicator:'IND-INTERNET-USE',dataset:'DS-KNBS-KHS-CONNECTIVITY-2023-24',unit:'percent',src:conn,url:KHS_URL,table:'Table 3.18 — Individuals Aged 3+ Who Used Internet',label:'2023/24 Kenya Housing Survey',start:'2023-01-01',end:'2024-12-31'},
  {field:'computer_use_pct',prefix:'COMPUTER',indicator:'IND-COMPUTER-USE',dataset:'DS-KNBS-KHS-CONNECTIVITY-2023-24',unit:'percent',src:conn,url:KHS_URL,table:'Table 3.19 — Individuals Aged 3+ Who Used a Computer',label:'2023/24 Kenya Housing Survey',start:'2023-01-01',end:'2024-12-31'},
  {field:'main_grid_electricity_pct',prefix:'MAIN-GRID',indicator:'IND-MAIN-GRID-ELECTRICITY',dataset:'DS-KNBS-KHS-CONNECTIVITY-2023-24',unit:'percent',src:conn,url:KHS_URL,table:'Table 5.11 — Households Connected to Electricity on the Main Grid',label:'2023/24 Kenya Housing Survey',start:'2023-01-01',end:'2024-12-31'}
];
for(const geo of geos){
  for(const s of specs){
    const row=s.src.get(geo);if(!row)throw new Error(`P05 missing ${geo}/${s.field}`);
    const value=num(row[s.field]);const code=`KDA-P05-${s.prefix}-${geo}`;
    const method=s.method||'direct';
    series.push({code,indicator_code:s.indicator,geo_code:geo,dataset_code:s.dataset,frequency:s.label.includes('Housing Survey')?'periodic':'annual',period_type:s.label.includes('Housing Survey')?'survey_period':'calendar_year',unit_code:s.unit,price_basis:s.price||'not_applicable',transformation:s.transform||'level',geographic_method:method,comparability_group:`P05-${s.prefix}-${s.label.replace(/[^A-Za-z0-9]+/g,'-')}`});
    observations.push({series_code:code,period_start:s.start,period_end:s.end,period_type:s.label.includes('Housing Survey')?'survey_period':'calendar_year',period_label:s.label,value,geographic_method:method,statistical_status:'final',source_class:'official',source_url:s.url,source_table:s.table,notes:s.notes||'P05 county-comparable primary-source observation. Ranking is intentionally withheld until the P06 peer/percentile methodology.'});
  }
}
wj('data/indicators/seed/series.json',series);wj('data/indicators/seed/observations.json',observations);

// CountyIQ roadmap: mark breadth data as integrated without claiming peer/index maturity.
const cq=j('data/countyiq/roadmap.json');
const domain=id=>cq.data_domains.find(d=>d.id===id);
const economyDomain=domain('economy');
if(economyDomain){
  for(const item of economyDomain.indicators||[]){if(item.code==='CQ-SECTOR-MIX'){item.status='integrated';item.coverage='47/47 counties · 2024 GCP economic-activity annex';delete item.dependency;}if(item.code==='IND-AGRI-PRODUCTION'){item.status='integrated';item.coverage='47/47 counties · 2023 maize area, production and derived yield';delete item.dependency;}}
  economyDomain.current_readiness='broad_county_structure_active';
}
const educationDomain=domain('education');
if(educationDomain){educationDomain.current_readiness='county_establishment_package_active';for(const row of [
  {code:'IND-PUBLIC-PRIMARY-SCHOOLS',name:'Public primary schools',status:'integrated',coverage:'47/47 counties · TSC 2023',priority:2},
  {code:'IND-PRIMARY-CLASSROOM-TEACHERS',name:'Primary classroom teachers',status:'integrated',coverage:'47/47 counties · TSC 2023',priority:2},
  {code:'IND-PUBLIC-SECONDARY-SCHOOLS',name:'Public secondary schools',status:'integrated',coverage:'47/47 counties · TSC 2023',priority:2},
  {code:'IND-SECONDARY-TEACHERS',name:'Secondary teachers',status:'integrated',coverage:'47/47 counties · TSC 2023',priority:2}
])upsert(educationDomain.indicators,'code',row);}
const infra=domain('infrastructure_resilience');
if(infra){infra.current_readiness='county_connectivity_package_active';for(const row of [
  {code:'IND-INTERNET-USE',name:'Internet use',status:'integrated',coverage:'47/47 counties · 2023/24 Kenya Housing Survey',priority:2},
  {code:'IND-COMPUTER-USE',name:'Computer use',status:'integrated',coverage:'47/47 counties · 2023/24 Kenya Housing Survey',priority:3},
  {code:'IND-MAIN-GRID-ELECTRICITY',name:'Main-grid electricity connection',status:'integrated',coverage:'47/47 counties · 2023/24 Kenya Housing Survey',priority:2}
])upsert(infra.indicators,'code',row);}
for(const d of cq.data_domains){for(const item of d.indicators||[]){if(item.code==='CQ-ELECTRICITY-ACCESS'){item.status='integrated';item.coverage='47/47 counties · household main-grid connection · 2023/24 Kenya Housing Survey';delete item.dependency;}}}
wj('data/countyiq/roadmap.json',cq);

// Project roadmap advances only one phase.
const roadmap=j('data/project-roadmap.json');
const p05=roadmap.phases.find(x=>x.id==='P05'),p06=roadmap.phases.find(x=>x.id==='P06');
if(!p05||!p06)throw new Error('P05/P06 project roadmap phases missing');
p05.status='complete';p06.status='next';
for(const phase of roadmap.phases)if(!['P05','P06'].includes(phase.id)&&phase.status==='next')phase.status='planned';
wj('data/project-roadmap.json',roadmap);

// CountyIQ UI wiring.
let html=read('index.html');
html=replaceOnce(html,'  <link rel="stylesheet" href="assets/pre-p05-hardening.css">','  <link rel="stylesheet" href="assets/pre-p05-hardening.css">\n  <link rel="stylesheet" href="assets/p05-breadth.css">','P05 CSS link');
html=html.replace('Current release combines published economic, fiscal, voter, health and living-standard facts; contextual place facts retain their own source dates.','Current release combines published economic, fiscal, voter, health, living-standard, education, agriculture and connectivity facts; contextual place facts retain their own source dates.');
const socialCard='<article class="ciq-card ciq-social-card"><div class="ciq-card-head"><div><small>Health & living standards</small><h2>Official county outcomes</h2></div><p>2022 survey outcomes plus the 2023 facility-census inventory. Precision is visible; survey league tables are withheld.</p></div><div class="ciq-social-grid" id="ciq-social"></div><p class="ciq-trend-note">P04 shows source-backed county estimates, not a health score. Survey point estimates are not ranked in this phase.</p></article>';
const breadthCard=socialCard+'\n          <article class="ciq-card ciq-p05-card"><div class="ciq-card-head"><div><small>P05 breadth</small><h2>Education, economy, agriculture & connectivity</h2></div><p>County-comparable primary data across four additional domains. Values retain their source period; peer scoring waits for P06.</p></div><div class="ciq-p05-grid" id="ciq-p05-breadth"></div><p class="ciq-p05-note">P05 broadens the evidence base; it does not convert raw school counts, sector size, crop output or connectivity rates into an overall county score.</p></article>';
html=replaceOnce(html,socialCard,breadthCard,'P05 CountyIQ card');
write('index.html',html);

let js=read('assets/countyiq-view.js');
js=js.replace(' * P04: production CountyIQ',' * P05: production CountyIQ');
const oldCodes="const CODES={gcp:'IND-GCP-CURRENT',budget:'IND-COUNTY-BUDGET-TOTAL',expenditure:'IND-COUNTY-EXPENDITURE-TOTAL',absorption:'IND-COUNTY-BUDGET-ABSORPTION',development:'IND-COUNTY-DEVELOPMENT-ABSORPTION',voters:'IND-REGISTERED-VOTERS',poverty:'IND-POVERTY-RATE',stunting:'IND-STUNTING-RATE',immunisation:'IND-IMMUNIZATION-RATE',maternal:'IND-MATERNAL-HEALTH',facilities:'IND-HEALTH-FACILITY-COUNT'};";
const newCodes="const CODES={gcp:'IND-GCP-CURRENT',budget:'IND-COUNTY-BUDGET-TOTAL',expenditure:'IND-COUNTY-EXPENDITURE-TOTAL',absorption:'IND-COUNTY-BUDGET-ABSORPTION',development:'IND-COUNTY-DEVELOPMENT-ABSORPTION',voters:'IND-REGISTERED-VOTERS',poverty:'IND-POVERTY-RATE',stunting:'IND-STUNTING-RATE',immunisation:'IND-IMMUNIZATION-RATE',maternal:'IND-MATERNAL-HEALTH',facilities:'IND-HEALTH-FACILITY-COUNT',primarySchools:'IND-PUBLIC-PRIMARY-SCHOOLS',primaryTeachers:'IND-PRIMARY-CLASSROOM-TEACHERS',secondarySchools:'IND-PUBLIC-SECONDARY-SCHOOLS',secondaryTeachers:'IND-SECONDARY-TEACHERS',agriGva:'IND-AGRICULTURE-GVA',manufacturingGva:'IND-MANUFACTURING-GVA',agriShare:'IND-AGRICULTURE-GCP-SHARE',manufacturingShare:'IND-MANUFACTURING-GCP-SHARE',maizeArea:'IND-MAIZE-AREA',maizeProduction:'IND-MAIZE-PRODUCTION',maizeYield:'IND-MAIZE-YIELD',internet:'IND-INTERNET-USE',computer:'IND-COMPUTER-USE',mainGrid:'IND-MAIN-GRID-ELECTRICITY'};";
js=replaceOnce(js,oldCodes,newCodes,'P05 CountyIQ codes');
const socialFn="  function renderSocial(row){const c=row.county;return [socialMetric('Overall poverty',metric(c,CODES.poverty),formatPct),socialMetric('Children under 5 stunted',metric(c,CODES.stunting),formatPct),socialMetric('Basic immunisation',metric(c,CODES.immunisation),formatPct),socialMetric('Skilled birth attendance',metric(c,CODES.maternal),formatPct),socialMetric('Facilities assessed',metric(c,CODES.facilities),formatInt)].join('');}\n";
const breadthFns=socialFn+`  function breadthMetric(label,m,formatter){const o=m?.latest;if(!o)return '<div class="ciq-p05-metric"><small>'+esc(label)+'</small><strong>—</strong><span>Not available</span></div>';const url=o.provenance?.source_url||'';return '<div class="ciq-p05-metric"><small>'+esc(label)+'</small><strong>'+esc(formatter(o.value))+'</strong><span>'+esc(o.period_label)+' · '+esc(o.provenance?.badge||'')+' provenance</span>'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener">Source ↗</a>':'')+'</div>';}
  function breadthGroup(title,period,items){return '<section class="ciq-p05-group"><header><h3>'+esc(title)+'</h3><span>'+esc(period)+'</span></header>'+items.join('')+'</section>';}
  function formatHa(v){return Number.isFinite(Number(v))?formatInt(v)+' ha':'—';}
  function formatTonnes(v){return Number.isFinite(Number(v))?formatInt(v)+' t':'—';}
  function formatYield(v){return Number.isFinite(Number(v))?Number(v).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})+' t/ha':'—';}
  function renderBreadth(row){const c=row.county;return [
    breadthGroup('Education','TSC 2023',[breadthMetric('Public primary schools',metric(c,CODES.primarySchools),formatInt),breadthMetric('Primary classroom teachers',metric(c,CODES.primaryTeachers),formatInt),breadthMetric('Public secondary schools',metric(c,CODES.secondarySchools),formatInt),breadthMetric('Secondary teachers',metric(c,CODES.secondaryTeachers),formatInt)]),
    breadthGroup('Economic structure','GCP 2024',[breadthMetric('Agriculture GVA',metric(c,CODES.agriGva),formatKesMn),breadthMetric('Agriculture share of GCP',metric(c,CODES.agriShare),formatPct),breadthMetric('Manufacturing GVA',metric(c,CODES.manufacturingGva),formatKesMn),breadthMetric('Manufacturing share of GCP',metric(c,CODES.manufacturingShare),formatPct)]),
    breadthGroup('Agriculture','Maize 2023',[breadthMetric('Maize area',metric(c,CODES.maizeArea),formatHa),breadthMetric('Maize production',metric(c,CODES.maizeProduction),formatTonnes),breadthMetric('Maize yield · Atlas derived',metric(c,CODES.maizeYield),formatYield)]),
    breadthGroup('Connectivity','KHS 2023/24',[breadthMetric('Internet use · age 3+',metric(c,CODES.internet),formatPct),breadthMetric('Computer use · age 3+',metric(c,CODES.computer),formatPct),breadthMetric('Households on main grid',metric(c,CODES.mainGrid),formatPct)])
  ].join('');}
`;
js=replaceOnce(js,socialFn,breadthFns,'P05 breadth renderer');
const socialRender="    const socialRoot=$('#ciq-social');if(socialRoot) socialRoot.innerHTML=mode==='production'?renderSocial(row):'<div class=\"source-note\">Health and living-standards outcomes require the canonical CountyIQ mart.</div>';\n";
const breadthRender=socialRender+"    const breadthRoot=$('#ciq-p05-breadth');if(breadthRoot) breadthRoot.innerHTML=mode==='production'?renderBreadth(row):'<div class=\"source-note\">P05 county breadth requires the canonical CountyIQ mart.</div>';\n";
js=replaceOnce(js,socialRender,breadthRender,'P05 render call');
write('assets/countyiq-view.js',js);

const pkg=j('package.json');
pkg.scripts['countyiq:p05:validate']='node scripts/countyiq/validate-p05.mjs';
if(!pkg.scripts['countyiq:validate'].includes('validate-p05.mjs'))pkg.scripts['countyiq:validate']+=' && node scripts/countyiq/validate-p05.mjs';
wj('package.json',pkg);

console.log('P05_APPLY_47X14_OK metrics=658');
console.log('P05_APPLY_CATALOGUE_OK datasets=4');
console.log('P05_APPLY_UI_OK');
console.log('P05_APPLY_ROADMAP_OK next=P06');
