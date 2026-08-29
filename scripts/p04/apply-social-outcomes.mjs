import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const p=(...x)=>path.join(root,...x);
const readJson=f=>JSON.parse(fs.readFileSync(p(f),'utf8'));
const writeJson=(f,v)=>fs.writeFileSync(p(f),JSON.stringify(v,null,2)+'\n');
const read=f=>fs.readFileSync(p(f),'utf8');
const write=(f,v)=>fs.writeFileSync(p(f),v);
const upsert=(rows,key,row)=>{const i=rows.findIndex(x=>x[key]===row[key]);if(i>=0)rows[i]=row;else rows.push(row);};
const replaceOnce=(text,from,to,label)=>{if(text.includes(to))return text;if(!text.includes(from))throw new Error(`P04 patch anchor missing: ${label}`);return text.replace(from,to);};

const social=readJson('data/p04/county-social-outcomes.json');
const facilities=readJson('data/p04/health-facility-census-2023.json');
if(social.counties.length!==47||new Set(social.counties.map(x=>x.geo_code)).size!==47)throw new Error('P04 survey snapshot must contain 47 unique counties');
if(facilities.counties.length!==47||facilities.counties.reduce((s,x)=>s+x.value,0)!==14883)throw new Error('P04 facility snapshot must reconcile to 14,883 assessed facilities');
const facilityByGeo=new Map(facilities.counties.map(x=>[x.geo_code,x]));

// ---------------- units: generic non-person count for inventories
const units=readJson('data/indicators/seed/units.json');
upsert(units,'code',{code:'count',name:'Count',symbol:'',dimension:'count',scale_factor:1,decimal_places:0});
writeJson('data/indicators/seed/units.json',units);

// ---------------- catalogue: narrow, reviewed, published source slices
const datasets=readJson('data/catalogue/seed/datasets.json');
upsert(datasets,'code',{
  code:'DS-KNBS-POVERTY-2022',source_code:'KNBS-STATISTICS',title:'Kenya Poverty Report 2022 — County Overall Poverty Headcount',
  description:'County overall individual poverty headcount estimates from the 2022 Kenya Continuous Household Survey, including source-reported standard errors.',topic:'Living Standards',geographic_coverage:['county'],frequency:'periodic',publication_status:'published',
  methodology_url:social.sources.poverty.url,known_limitations:'Survey estimates. P04 publishes county point estimates with source-reported standard errors but withholds league-table ranking; 2022 reference period must remain visible.'
});
upsert(datasets,'code',{
  code:'DS-KNBS-KDHS-2022-COUNTY',source_code:'KNBS-STATISTICS',title:'Kenya Demographic and Health Survey 2022 — Selected County Indicators',
  description:'Selected 2022 KDHS county estimates for child nutrition, basic immunisation and skilled birth attendance, with the source table denominator retained as precision metadata.',topic:'Health',geographic_coverage:['county'],frequency:'periodic',publication_status:'published',
  methodology_url:social.sources.kdhs.url,known_limitations:'Survey estimates from distinct analytic universes. Reported table denominators are retained; P04 withholds point-estimate county ranking pending P06 comparison methodology.'
});
upsert(datasets,'code',{
  code:'DS-MOH-HEALTH-FACILITY-CENSUS-2023',source_code:'MOH-HEALTH',title:'Kenya Health Facility Census 2023 — County Facilities Assessed',
  description:'County counts of health facilities assessed in the 2023 Ministry of Health Health Facility Census.',topic:'Health Infrastructure',geographic_coverage:['county'],frequency:'one_off',publication_status:'published',
  methodology_url:facilities.source_url,known_limitations:'Dated August–September 2023 census assessment snapshot, not a live 2026 KMHFR/NHFR registry total. Raw counts are not population-adjusted and are not ranked in P04.'
});
writeJson('data/catalogue/seed/datasets.json',datasets);

// ---------------- indicators: preserve explicit ranking/uncertainty policy
const indicators=readJson('data/indicators/seed/indicators.json');
const defs=[
  {code:'IND-POVERTY-RATE',name:'Overall poverty headcount rate',short_name:'Poverty rate',description:'Share of individuals below Kenya’s overall poverty line in the 2022 Kenya Poverty Report.',topic:'Living Standards',subtopic:'Poverty',unit_code:'percent',higher_is_better:false,preferred_frequency:'periodic',minimum_geo_level:'county',methodology_url:social.sources.poverty.url,comparable:true,ranking_allowed:false,requires_sampling_uncertainty:true},
  {code:'IND-STUNTING-RATE',name:'Children under 5 stunted',short_name:'Stunting',description:'Share of children under age 5 whose height-for-age is below minus two standard deviations from the WHO Child Growth Standards median.',topic:'Health',subtopic:'Child nutrition',unit_code:'percent',higher_is_better:false,preferred_frequency:'periodic',minimum_geo_level:'county',methodology_url:social.sources.kdhs.url,comparable:true,ranking_allowed:false,requires_sampling_uncertainty:true},
  {code:'IND-IMMUNIZATION-RATE',name:'Children 12–23 months fully vaccinated with basic antigens',short_name:'Basic immunisation',description:'Share of children age 12–23 months who received all basic antigens as defined in KDHS 2022 Table 10.4C.',topic:'Health',subtopic:'Child health',unit_code:'percent',higher_is_better:true,preferred_frequency:'periodic',minimum_geo_level:'county',methodology_url:social.sources.kdhs.url,comparable:true,ranking_allowed:false,requires_sampling_uncertainty:true},
  {code:'IND-MATERNAL-HEALTH',name:'Skilled birth attendance',short_name:'Skilled birth attendance',description:'Share of live births in the two years before KDHS 2022 assisted by a skilled provider (doctor, nurse, midwife or clinical officer).',topic:'Health',subtopic:'Maternal health',unit_code:'percent',higher_is_better:true,preferred_frequency:'periodic',minimum_geo_level:'county',methodology_url:social.sources.kdhs.url,comparable:true,ranking_allowed:false,requires_sampling_uncertainty:true},
  {code:'IND-HEALTH-FACILITY-COUNT',name:'Health facilities assessed in the 2023 Health Facility Census',short_name:'Health facilities assessed',description:'Count of health facilities assessed in each county in the 2023 Ministry of Health Health Facility Census.',topic:'Health',subtopic:'Health infrastructure',unit_code:'count',higher_is_better:null,preferred_frequency:'one_off',minimum_geo_level:'county',methodology_url:facilities.source_url,comparable:true,ranking_allowed:false,requires_sampling_uncertainty:false}
];
for(const d of defs)upsert(indicators,'code',d);
writeJson('data/indicators/seed/indicators.json',indicators);

// ---------------- series + observations: 47 x 5, deterministic and source-backed
let series=readJson('data/indicators/seed/series.json').filter(x=>!String(x.code).startsWith('KDA-P04-'));
let observations=readJson('data/indicators/seed/observations.json').filter(x=>!String(x.series_code).startsWith('KDA-P04-'));
const specs={
  poverty_rate:{prefix:'POVERTY',indicator:'IND-POVERTY-RATE',dataset:'DS-KNBS-POVERTY-2022',url:social.sources.poverty.url,table:'Table 4.4 / Annex Table E.2',label:'2022',start:'2022-01-01',end:'2022-12-31'},
  stunting_rate:{prefix:'STUNTING',indicator:'IND-STUNTING-RATE',dataset:'DS-KNBS-KDHS-2022-COUNTY',url:social.sources.kdhs.url,table:'Table 11.1C',label:'2022 KDHS',start:'2022-02-17',end:'2022-07-13'},
  basic_immunisation_rate:{prefix:'IMMUNISATION',indicator:'IND-IMMUNIZATION-RATE',dataset:'DS-KNBS-KDHS-2022-COUNTY',url:social.sources.kdhs.url,table:'Table 10.4C',label:'2022 KDHS',start:'2022-02-17',end:'2022-07-13'},
  skilled_birth_attendance:{prefix:'SKILLED-BIRTH',indicator:'IND-MATERNAL-HEALTH',dataset:'DS-KNBS-KDHS-2022-COUNTY',url:social.sources.kdhs.url,table:'Table 9.9C',label:'2022 KDHS',start:'2022-02-17',end:'2022-07-13'}
};
for(const county of social.counties){
  for(const [key,s] of Object.entries(specs)){
    const v=county.metrics[key],code=`KDA-P04-${s.prefix}-${county.geo_code}`;
    series.push({code,indicator_code:s.indicator,geo_code:county.geo_code,dataset_code:s.dataset,frequency:'periodic',period_type:'survey_period',unit_code:'percent',price_basis:'not_applicable',transformation:'level',geographic_method:'direct',comparability_group:`P04-${s.prefix}-2022`});
    const o={series_code:code,period_start:s.start,period_end:s.end,period_type:'survey_period',period_label:s.label,value:v.value,geographic_method:'direct',statistical_status:'final',source_url:s.url,published_at:key==='poverty_rate'?'2024-01-01':'2023-01-01',source_table:s.table,notes:'Official county survey estimate. P04 displays source precision metadata and withholds league-table ranking.'};
    if(Number.isFinite(v.standard_error))o.standard_error=v.standard_error;
    if(Number.isFinite(v.sample_size))o.sample_size=v.sample_size;
    observations.push(o);
  }
  const f=facilityByGeo.get(county.geo_code);if(!f)throw new Error(`Missing facility count ${county.geo_code}`);
  const code=`KDA-P04-FACILITIES-${county.geo_code}`;
  series.push({code,indicator_code:'IND-HEALTH-FACILITY-COUNT',geo_code:county.geo_code,dataset_code:'DS-MOH-HEALTH-FACILITY-CENSUS-2023',frequency:'one_off',period_type:'survey_period',unit_code:'count',price_basis:'not_applicable',transformation:'level',geographic_method:'direct',comparability_group:'P04-HEALTH-FACILITY-CENSUS-2023'});
  observations.push({series_code:code,period_start:'2023-08-01',period_end:'2023-09-30',period_type:'survey_period',period_label:'2023 Health Facility Census',value:f.value,geographic_method:'direct',statistical_status:'final',source_url:facilities.source_url,published_at:'2023-12-21',source_table:facilities.source_table,notes:'Facilities assessed in the 2023 census. This is a dated inventory snapshot, not a live KMHFR/NHFR total; raw count is not ranked.'});
}
writeJson('data/indicators/seed/series.json',series);
writeJson('data/indicators/seed/observations.json',observations);

// ---------------- registry builder must carry statistical publication policy fields
let builder=read('scripts/indicators/build-registry.mjs');
builder=replaceOnce(builder,
`    minimum_denominator: i.minimum_denominator ?? null, methodology_url: i.methodology_url ?? '',\n    comparable: true, active: true`,
`    minimum_denominator: i.minimum_denominator ?? null, methodology_url: i.methodology_url ?? '',\n    comparable: i.comparable ?? true, active: i.active ?? true,\n    ranking_allowed: i.ranking_allowed ?? true, requires_sampling_uncertainty: i.requires_sampling_uncertainty ?? false`,
'indicator policy preservation');
builder=replaceOnce(builder,
`'minimum_denominator', 'methodology_url', 'comparable', 'active']`,
`'minimum_denominator', 'methodology_url', 'comparable', 'active', 'ranking_allowed', 'requires_sampling_uncertainty']`,
'indicator CSV policy fields');
write('scripts/indicators/build-registry.mjs',builder);

// ---------------- CountyIQ product scaffold statuses
const cq=readJson('data/countyiq/roadmap.json');
for(const domain of cq.data_domains){
  for(const item of domain.indicators||[]){
    const coverage={
      'IND-POVERTY-RATE':'47/47 counties · 2022 Kenya Poverty Report · source SE retained',
      'IND-HEALTH-FACILITY-COUNT':'47/47 counties · 2023 Health Facility Census assessed-facility snapshot',
      'IND-STUNTING-RATE':'47/47 counties · KDHS 2022 · reported table denominator retained',
      'IND-IMMUNIZATION-RATE':'47/47 counties · KDHS 2022 · reported table denominator retained',
      'IND-MATERNAL-HEALTH':'47/47 counties · KDHS 2022 · reported table denominator retained'
    }[item.code];
    if(coverage){item.status='integrated';item.coverage=coverage;delete item.dependency;}
  }
  if(domain.id==='human_development')domain.current_readiness='first_county_outcome_package_active';
  if(domain.id==='health')domain.current_readiness='strong_first_package';
}
writeJson('data/countyiq/roadmap.json',cq);

// ---------------- CountyIQ UI: one concise source/precision-first social card
let html=read('index.html');
const oldEvidence=`          <article class="ciq-card"><div class="ciq-card-head"><div><small>Evidence discipline</small><h2>What this view does—and does not do</h2></div></div><div class="ciq-evidence">`;
const socialCard=`          <article class="ciq-card ciq-social-card"><div class="ciq-card-head"><div><small>Health & living standards</small><h2>Official county outcomes</h2></div><p>2022 survey outcomes plus the 2023 facility-census inventory. Precision is visible; survey league tables are withheld.</p></div><div class="ciq-social-grid" id="ciq-social"></div><p class="ciq-trend-note">P04 shows source-backed county estimates, not a health score. Survey point estimates are not ranked in this phase.</p></article>\n`+oldEvidence;
html=replaceOnce(html,oldEvidence,socialCard,'CountyIQ social card');
write('index.html',html);

let js=read('assets/countyiq-view.js');
js=js.replace(' * P03: production CountyIQ',' * P04: production CountyIQ');
js=replaceOnce(js,
`const CODES={gcp:'IND-GCP-CURRENT',budget:'IND-COUNTY-BUDGET-TOTAL',expenditure:'IND-COUNTY-EXPENDITURE-TOTAL',absorption:'IND-COUNTY-BUDGET-ABSORPTION',development:'IND-COUNTY-DEVELOPMENT-ABSORPTION',voters:'IND-REGISTERED-VOTERS'};`,
`const CODES={gcp:'IND-GCP-CURRENT',budget:'IND-COUNTY-BUDGET-TOTAL',expenditure:'IND-COUNTY-EXPENDITURE-TOTAL',absorption:'IND-COUNTY-BUDGET-ABSORPTION',development:'IND-COUNTY-DEVELOPMENT-ABSORPTION',voters:'IND-REGISTERED-VOTERS',poverty:'IND-POVERTY-RATE',stunting:'IND-STUNTING-RATE',immunisation:'IND-IMMUNIZATION-RATE',maternal:'IND-MATERNAL-HEALTH',facilities:'IND-HEALTH-FACILITY-COUNT'};`,
'CountyIQ P04 codes');
const renderAnchor=`  function render(code=currentCode){`;
const socialFns=[
  "  function precisionText(m){const u=m?.latest?.uncertainty||{};if(Number.isFinite(Number(u.standard_error)))return 'Source SE '+Number(u.standard_error).toLocaleString('en-KE',{maximumFractionDigits:2})+' pp';if(Number.isFinite(Number(u.sample_size)))return 'Reported table denominator n='+formatInt(u.sample_size);return 'Census inventory snapshot';}",
  "  function socialMetric(label,m,formatter){const o=m?.latest;if(!o)return '<article class=\"ciq-social-metric missing\"><small>'+esc(label)+'</small><strong>—</strong><span>Not published for this county</span></article>';const url=o.provenance?.source_url||'';return '<article class=\"ciq-social-metric\"><small>'+esc(label)+'</small><strong>'+esc(formatter(o.value))+'</strong><span>'+esc(o.period_label)+' · '+esc(precisionText(m))+'</span><em>'+(m?.ranking?.eligible?'Comparable rank available':'Ranking withheld')+'</em>'+(url?'<a href=\"'+esc(url)+'\" target=\"_blank\" rel=\"noopener\">Source ↗</a>':'')+'</article>';}",
  "  function renderSocial(row){const c=row.county;return [socialMetric('Overall poverty',metric(c,CODES.poverty),formatPct),socialMetric('Children under 5 stunted',metric(c,CODES.stunting),formatPct),socialMetric('Basic immunisation',metric(c,CODES.immunisation),formatPct),socialMetric('Skilled birth attendance',metric(c,CODES.maternal),formatPct),socialMetric('Facilities assessed',metric(c,CODES.facilities),formatInt)].join('');}"
].join('\\n')+'\\n\\n'+renderAnchor;
js=replaceOnce(js,renderAnchor,socialFns,'CountyIQ social renderer');
js=replaceOnce(js,
`  }\n\n  function wirePicker(){`,
`    const socialRoot=$('#ciq-social');if(socialRoot) socialRoot.innerHTML=mode==='production'?renderSocial(row):'<div class="source-note">Health and living-standards outcomes require the canonical CountyIQ mart.</div>';\n  }\n\n  function wirePicker(){`,
'CountyIQ social render call');
write('assets/countyiq-view.js',js);

let css=read('assets/countyiq-view.css');
if(!css.includes('.ciq-social-grid{'))css+=`\n/* P04 — survey precision-first health & living standards */\n.ciq-social-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin-top:1rem}.ciq-social-metric{background:#fff;padding:1rem;min-width:0}.ciq-social-metric small{display:block;color:var(--muted);font-size:.58rem;text-transform:uppercase;letter-spacing:.05em;line-height:1.35}.ciq-social-metric strong{display:block;font-family:var(--serif);font-size:1.55rem;font-weight:500;margin:.35rem 0}.ciq-social-metric span,.ciq-social-metric em,.ciq-social-metric a{display:block;font-size:.61rem;line-height:1.45}.ciq-social-metric span{color:var(--muted)}.ciq-social-metric em{font-style:normal;color:#7a6242;margin-top:.35rem}.ciq-social-metric a{color:var(--green2);font-weight:700;text-decoration:none;margin-top:.35rem}.ciq-social-metric.missing{opacity:.65}\n@media(max-width:1000px){.ciq-social-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}\n@media(max-width:650px){.ciq-social-grid{grid-template-columns:1fr 1fr}}\n@media(max-width:430px){.ciq-social-grid{grid-template-columns:1fr}}\n`;
write('assets/countyiq-view.css',css);

// ---------------- package gate
const pkg=readJson('package.json');
if(!String(pkg.scripts['countyiq:validate']).includes('validate-p04.mjs'))pkg.scripts['countyiq:validate']+=' && node scripts/countyiq/validate-p04.mjs';
pkg.scripts['countyiq:p04:validate']='node scripts/countyiq/validate-p04.mjs';
writeJson('package.json',pkg);

console.log(`P04_APPLIED counties=${social.counties.length} series_added=${47*5} observations_added=${47*5}`);
