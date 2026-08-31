import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mode=process.argv[2];
if(!['catalogue','indicators'].includes(mode)) throw new Error('Usage: node scripts/p20/build-kenphia-hiv-prevalence.mjs <catalogue|indicators>');
const SOURCE_FILE='data/p20/source/kenphia-2018-hiv-prevalence-county.json';
const DATASET_CODE='DS-MOH-KENPHIA-HIV-PREVALENCE-2018-P20';
const RELEASE_CODE='REL-MOH-KENPHIA-HIV-PREVALENCE-2018-P20';
const PREFIX='KDA-P20-KENPHIA-HIV-PREVALENCE-';
const INGESTED_AT='2026-08-31T08:15:00.000Z';
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const csvCell=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`;
const csv=rows=>{const fields=[...new Set(rows.flatMap(r=>Object.keys(r)))];return [fields.join(','),...rows.map(r=>fields.map(f=>csvCell(r[f])).join(','))].join('\n')+'\n';};
const uuid=name=>{const h=createHash('sha1').update(`kenya-data-atlas:p20-kenphia-hiv:${name}`).digest();h[6]=(h[6]&15)|80;h[8]=(h[8]&63)|128;const x=h.subarray(0,16).toString('hex');return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`;};
const norm=v=>String(v??'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');

function validateSource(source){
  const rows=source.counties||[];
  const byGeo=new Map(rows.map(r=>[r.geo_code,r]));
  if(rows.length!==47||byGeo.size!==47) throw new Error(`P20 KENPHIA HIV: source must contain 47 unique counties; rows=${rows.length} unique=${byGeo.size}`);
  if(Number(source.reported_total_pct)!==4.9||Number(source.reported_total_unweighted_n)!==27745) throw new Error('P20 KENPHIA HIV: national prevalence/sample anchor mismatch');
  if(Number(source.reported_total_standard_error)!==0.2||Number(source.reported_total_lower_95)!==4.5||Number(source.reported_total_upper_95)!==5.3) throw new Error('P20 KENPHIA HIV: national uncertainty anchor mismatch');
  if(rows.reduce((a,r)=>a+Number(r.sample_size),0)!==27745) throw new Error('P20 KENPHIA HIV: county unweighted samples must sum to 27,745');
  for(const r of rows){
    const v=Number(r.hiv_prevalence_pct), n=Number(r.sample_size), se=Number(r.standard_error);
    if(!Number.isFinite(v)||v<0||v>100) throw new Error(`P20 KENPHIA HIV: invalid prevalence ${r.geo_code}`);
    if(!Number.isFinite(n)||n<=0) throw new Error(`P20 KENPHIA HIV: invalid sample size ${r.geo_code}`);
    if(!Number.isFinite(se)||se<0) throw new Error(`P20 KENPHIA HIV: invalid standard error ${r.geo_code}`);
    const isGarissa=r.geo_code==='KEN-C007';
    if(isGarissa){
      if(v!==0||se!==0||r.lower_95!==null||r.upper_95!==null) throw new Error('P20 KENPHIA HIV: Garissa must preserve published zero estimate/SE and unavailable confidence limits');
    }else{
      if(!Number.isFinite(Number(r.lower_95))||!Number.isFinite(Number(r.upper_95))) throw new Error(`P20 KENPHIA HIV: confidence limits missing ${r.geo_code}`);
      if(Number(r.lower_95)>v||Number(r.upper_95)<v) throw new Error(`P20 KENPHIA HIV: confidence interval does not contain estimate ${r.geo_code}`);
    }
  }
  return byGeo;
}

async function buildCatalogue(){
  const dir='data/catalogue/registry';
  let [source,datasets,releases,sources]=await Promise.all([readJson(SOURCE_FILE),readJson(`${dir}/datasets.json`),readJson(`${dir}/releases.json`),readJson(`${dir}/sources.json`)]);
  validateSource(source);
  const catalogueSource=sources.find(s=>s.source_code==='MOH-HEALTH');
  if(!catalogueSource) throw new Error('P20 KENPHIA HIV: MOH-HEALTH catalogue source missing');
  let dataset=datasets.find(d=>d.dataset_code===DATASET_CODE);
  if(!dataset){
    dataset={dataset_id:uuid(`dataset:${DATASET_CODE}`),dataset_code:DATASET_CODE,source_id:catalogueSource.source_id,title:'KENPHIA 2018 — HIV Prevalence by County, Ages 15–64',description:'Published county HIV prevalence estimates for persons age 15–64 from the Kenya Population-based HIV Impact Assessment (KENPHIA) 2018, including source-reported unweighted sample sizes, standard errors and 95% confidence limits.',topic:'Health',geographic_coverage:['county'],frequency:'survey_round',publication_status:'published',methodology_url:source.final_report_url,known_limitations:'Survey estimates from fieldwork conducted June 2018–February 2019. County sampling uncertainty varies materially; point-estimate league-table ranking is prohibited. Garissa had no HIV-positive persons identified and the final report does not print finite confidence limits for that county.'};
    datasets.push(dataset);
  }
  if(!releases.some(r=>r.release_code===RELEASE_CODE)) releases.push({release_id:uuid(`release:${RELEASE_CODE}`),release_code:RELEASE_CODE,dataset_id:dataset.dataset_id,title:'KENPHIA 2018 final report — county HIV prevalence, ages 15–64',reference_period_start:'2018-06-01',reference_period_end:'2019-02-28',published_at:'',discovered_at:INGESTED_AT,ingested_at:INGESTED_AT,release_url:source.final_report_url,release_status:'published',version_label:'P20 governed county survey promotion',release_notes:`${source.source_table}; uncertainty from ${source.uncertainty_table}. Public fieldwork timing is month-precision (June 2018–February 2019); bounding calendar dates encode that interval in the Atlas.`,supersedes_release_id:''});
  await Promise.all([writeFile(path.join(root,`${dir}/datasets.json`),JSON.stringify(datasets,null,2)+'\n'),writeFile(path.join(root,`${dir}/datasets.csv`),csv(datasets)),writeFile(path.join(root,`${dir}/releases.json`),JSON.stringify(releases,null,2)+'\n'),writeFile(path.join(root,`${dir}/releases.csv`),csv(releases))]);
  console.log('P20_KENPHIA_HIV_CATALOGUE_OK dataset=1 release=1');
}

async function buildIndicators(){
  const dir='data/indicators/registry';
  let [source,units,indicators,series,observations,geographies,datasets,releases,sources]=await Promise.all([readJson(SOURCE_FILE),readJson(`${dir}/units.json`),readJson(`${dir}/indicators.json`),readJson(`${dir}/series.json`),readJson(`${dir}/observations.json`),readJson('data/geography/registry/geographies.json'),readJson('data/catalogue/registry/datasets.json'),readJson('data/catalogue/registry/releases.json'),readJson('data/catalogue/registry/sources.json')]);
  const srcByGeo=validateSource(source);
  const counties=geographies.filter(g=>g.level==='county').sort((a,b)=>a.geo_code.localeCompare(b.geo_code));
  if(counties.length!==47) throw new Error(`P20 KENPHIA HIV: expected 47 canonical counties, got ${counties.length}`);
  for(const county of counties){const src=srcByGeo.get(county.geo_code);if(!src)throw new Error(`P20 KENPHIA HIV: source missing ${county.geo_code}`);if(norm(src.county_name)!==norm(county.name)&&!(county.geo_code==='KEN-C043'&&norm(src.county_name)==='homabay')&&!(county.geo_code==='KEN-C047'&&norm(src.county_name)==='nairobi'))throw new Error(`P20 KENPHIA HIV: county-name mismatch ${county.geo_code}: ${src.county_name} vs ${county.name}`);}
  const indicator=indicators.find(i=>i.indicator_code==='IND-HIV-PREVALENCE');
  const unit=units.find(u=>u.code==='percent');
  const dataset=datasets.find(d=>d.dataset_code===DATASET_CODE);
  const release=releases.find(r=>r.release_code===RELEASE_CODE);
  const catalogueSource=dataset?sources.find(s=>s.source_id===dataset.source_id):null;
  if(!indicator||!unit||!dataset||!release||!catalogueSource) throw new Error('P20 KENPHIA HIV: canonical records missing; run catalogue mode first');
  const oldIds=new Set(series.filter(s=>String(s.series_code).startsWith(PREFIX)).map(s=>s.series_id));
  series=series.filter(s=>!oldIds.has(s.series_id)); observations=observations.filter(o=>!oldIds.has(o.series_id));
  Object.assign(indicator,{name:'HIV prevalence, ages 15–64',short_name:'HIV prevalence',description:'Percentage of persons age 15–64 testing HIV positive in the Kenya Population-based HIV Impact Assessment (KENPHIA) 2018, using the published total-sex county estimate.',unit_id:unit.unit_id,methodology_url:source.final_report_url,active:true,lifecycle_status:'active',comparable:true,expected_source:'KENPHIA 2018 final report, Table 6.D and Table C.3',expected_source_url:source.final_report_url,expected_availability_note:'Published for all 47 counties with unweighted sample size, standard error and 95% confidence limits. Garissa has a published 0.0% estimate and 0.0 SE with unavailable confidence limits because no HIV-positive persons were identified.',requires_sampling_uncertainty:true,ranking_allowed:false});
  for(const county of counties){
    const src=srcByGeo.get(county.geo_code); const code=`${PREFIX}${county.geo_code}`; const sid=uuid(`series:${code}`); const oid=uuid(`observation:${code}:2018-2019`);
    series.push({series_id:sid,series_code:code,indicator_id:indicator.indicator_id,geography_id:county.geography_id,geography_taxonomy:county.geography_system||'electoral',boundary_version:'2012-01',frequency:'survey_round',period_type:'survey_period',unit_id:unit.unit_id,price_basis:'not_applicable',base_period:'',currency:'',seasonal_adjustment:'none',transformation:'level',geographic_method:'direct',comparability_group:'P20-KENPHIA-HIV-PREVALENCE-15-64-2018',dataset_id:dataset.dataset_id,agency_id:catalogueSource.agency_id,methodology_url:source.final_report_url,start_period:source.period_label,end_period:source.period_label,latest_observation_id:oid,observation_count:1,last_updated_at:INGESTED_AT,next_expected_release:'',status:'active',superseded_by_series_id:''});
    observations.push({observation_id:oid,series_id:sid,geography_id:county.geography_id,boundary_version:'2012-01',period_start:'2018-06-01',period_end:'2019-02-28',period_type:'survey_period',period_label:source.period_label,value:Number(src.hiv_prevalence_pct),geographic_method:'direct',statistical_status:'final',source_class:'official',badge:'A',source_release_id:release.release_id,source_dataset_id:dataset.dataset_id,source_table:`${source.source_table}; ${source.uncertainty_table}`,source_sheet:'',source_page:'',source_row_label:src.county_name,source_url:source.final_report_url,published_at:'',ingested_at:INGESTED_AT,vintage_id:uuid(`vintage:${code}:2018-2019:1`),supersedes_observation_id:'',lower_bound:src.lower_95===null?null:Number(src.lower_95),upper_bound:src.upper_95===null?null:Number(src.upper_95),confidence_level:src.lower_95===null?null:0.95,standard_error:Number(src.standard_error),sample_size:Number(src.sample_size),suppression_reason:'',crosswalk_id:'',notes:src.geo_code==='KEN-C007'?'Direct KENPHIA 2018 total-sex county estimate for ages 15–64. No HIV-positive persons were identified in Garissa; the final report gives 0.0% and SE 0.0 but no finite confidence limits, so bounds remain null. Fieldwork dates are encoded as month-bound calendar dates from the published June 2018–February 2019 interval. Ranking withheld.':'Direct KENPHIA 2018 total-sex county estimate for ages 15–64 with source-reported unweighted sample size, standard error and 95% confidence interval. Fieldwork dates are encoded as month-bound calendar dates from the published June 2018–February 2019 interval. Ranking withheld.'});
  }
  await Promise.all([writeFile(path.join(root,`${dir}/indicators.json`),JSON.stringify(indicators,null,2)+'\n'),writeFile(path.join(root,`${dir}/indicators.csv`),csv(indicators)),writeFile(path.join(root,`${dir}/series.json`),JSON.stringify(series,null,2)+'\n'),writeFile(path.join(root,`${dir}/series.csv`),csv(series)),writeFile(path.join(root,`${dir}/observations.json`),JSON.stringify(observations,null,2)+'\n'),writeFile(path.join(root,`${dir}/observations.csv`),csv(observations))]);
  console.log('P20_KENPHIA_HIV_INDICATORS_OK counties=47 national=4.9 n=27745 uncertainty=published');
}

if(mode==='catalogue') await buildCatalogue(); else await buildIndicators();
