import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const j=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const t=f=>fs.readFileSync(path.join(root,f),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(`P04 validation: ${msg}`);};
const social=j('data/p04/county-social-outcomes.json');
const facilities=j('data/p04/health-facility-census-2023.json');
const mart=j('data/countyiq/county-summary.json');
const indicators=j('data/indicators/registry/indicators.json');
const datasets=j('data/catalogue/registry/datasets.json');
const codes=['IND-POVERTY-RATE','IND-STUNTING-RATE','IND-IMMUNIZATION-RATE','IND-MATERNAL-HEALTH','IND-HEALTH-FACILITY-COUNT'];
const surveyCodes=new Set(codes.slice(0,4));
const sourceByGeo=new Map(social.counties.map(c=>[c.geo_code,c]));
const facilityByGeo=new Map(facilities.counties.map(c=>[c.geo_code,c]));

try{
  assert(social.counties.length===47&&sourceByGeo.size===47,'survey snapshot must contain 47 unique counties');
  assert(facilities.counties.length===47&&facilityByGeo.size===47,'facility snapshot must contain 47 unique counties');
  assert(facilities.counties.reduce((s,x)=>s+x.value,0)===14883,'facility county totals must reconcile exactly to national assessed total 14,883');
  assert(mart.counties?.length===47,'CountyIQ mart must contain 47 counties');
  const indByCode=new Map(indicators.map(i=>[i.indicator_code,i]));
  for(const code of codes){const i=indByCode.get(code);assert(i,`missing canonical indicator ${code}`);assert(i.active!==false,`${code} is inactive`);assert(i.ranking_allowed===false,`${code} must explicitly withhold P04 ranking`);}
  for(const code of surveyCodes)assert(indByCode.get(code).requires_sampling_uncertainty===true,`${code} must require sampling precision metadata`);
  for(const datasetCode of ['DS-KNBS-POVERTY-2022','DS-KNBS-KDHS-2022-COUNTY','DS-MOH-HEALTH-FACILITY-CENSUS-2023'])assert(datasets.some(d=>d.dataset_code===datasetCode&&d.publication_status==='published'),`${datasetCode} must be a published canonical dataset`);

  let metricCount=0;
  for(const county of mart.counties){
    const geo=county.geography?.geo_code,src=sourceByGeo.get(geo),fac=facilityByGeo.get(geo);assert(src&&fac,`${geo}: missing source snapshot row`);
    const expected={
      'IND-POVERTY-RATE':src.metrics.poverty_rate,
      'IND-STUNTING-RATE':src.metrics.stunting_rate,
      'IND-IMMUNIZATION-RATE':src.metrics.basic_immunisation_rate,
      'IND-MATERNAL-HEALTH':src.metrics.skilled_birth_attendance,
      'IND-HEALTH-FACILITY-COUNT':fac
    };
    for(const code of codes){
      const m=county.metrics?.[code];assert(m?.status==='active',`${geo}: missing active ${code}`);metricCount++;
      assert(Number(m.latest?.value)===Number(expected[code].value),`${geo}/${code}: mart value diverges from P04 source snapshot`);
      assert(m.latest?.provenance?.badge==='A',`${geo}/${code}: P04 direct official observation must carry badge A`);
      assert(Boolean(m.latest?.provenance?.source_url),`${geo}/${code}: source URL missing`);
      assert(m.eligibility?.ranking_allowed===false,`${geo}/${code}: ranking_allowed must be false`);
      assert(m.ranking?.eligible===false,`${geo}/${code}: rank unexpectedly eligible`);
      if(surveyCodes.has(code)){
        assert(m.latest?.uncertainty,`${geo}/${code}: uncertainty metadata missing`);
        if(code==='IND-POVERTY-RATE')assert(Number.isFinite(Number(m.latest.uncertainty.standard_error))&&Number(m.latest.uncertainty.standard_error)>0,`${geo}: poverty standard error missing`);
        else assert(Number.isFinite(Number(m.latest.uncertainty.sample_size))&&Number(m.latest.uncertainty.sample_size)>0,`${geo}/${code}: reported table denominator missing`);
      }
      assert(m.latest?.geographic_method!=='inherited',`${geo}/${code}: inherited value prohibited`);
    }
  }
  console.log(`COUNTYIQ_P04_47X5_OK metrics=${metricCount}`);
  console.log('COUNTYIQ_P04_SURVEY_PRECISION_OK');
  console.log('COUNTYIQ_P04_RANKINGS_WITHHELD_OK');
  console.log('COUNTYIQ_P04_FACILITY_RECONCILIATION_OK total=14883');

  const ui=t('assets/countyiq-view.js'),html=t('index.html'),css=t('assets/countyiq-view.css');
  for(const token of codes)assert(ui.includes(token),`CountyIQ UI missing ${token}`);
  assert(html.includes('id="ciq-social"'),'CountyIQ social container missing');
  assert(ui.includes('renderSocial(row)'),'CountyIQ social renderer is not wired');
  assert(css.includes('.ciq-social-grid{')&&css.includes('@media(max-width:430px)'),'responsive P04 social styling missing');
  console.log('COUNTYIQ_P04_UI_OK');
  console.log('COUNTYIQ_P04_ALL_OK');
}catch(error){console.error(error.message||error);process.exit(1);}
