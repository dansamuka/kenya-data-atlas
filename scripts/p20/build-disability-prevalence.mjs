import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mode=process.argv[2];
if(!['catalogue','indicators'].includes(mode)) throw new Error('Usage: node scripts/p20/build-disability-prevalence.mjs <catalogue|indicators>');
const SOURCE_FILE='data/p20/source/disability-prevalence-2019.json';
const DATASET_CODE='DS-KNBS-KPHC-DISABILITY-2019-P20';
const RELEASE_CODE='REL-KNBS-KPHC-DISABILITY-2019-P20';
const SERIES_PREFIX='KDA-P20-DISABILITY-PREVALENCE-';
const INGESTED_AT='2026-08-31T07:30:00.000Z';
const EXPECTED=Array.from({length:47},(_,i)=>`KEN-C${String(i+1).padStart(3,'0')}`);
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const csvCell=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`;
const csv=rows=>{const fields=[...new Set(rows.flatMap(r=>Object.keys(r)))];return [fields.join(','),...rows.map(r=>fields.map(f=>csvCell(r[f])).join(','))].join('\n')+'\n';};
const uuid=name=>{const h=createHash('sha1').update(`kenya-data-atlas:p20-disability:${name}`).digest();h[6]=(h[6]&15)|80;h[8]=(h[8]&63)|128;const x=h.subarray(0,16).toString('hex');return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`;};
const norm=v=>String(v??'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const formal=geo=>geo.geo_code==='KEN-C043'?'Homa Bay':geo.name;
function validateSource(source){
  const rows=source.counties||[]; const map=new Map(rows.map(r=>[r.geo_code,r]));
  if(rows.length!==47||map.size!==47||EXPECTED.some(code=>!map.has(code))) throw new Error(`P20 disability: source must contain exact 47 county codes; rows=${rows.length} unique=${map.size}`);
  if(rows.some(r=>!Number.isFinite(Number(r.value))||Number(r.value)<0||Number(r.value)>100)) throw new Error('P20 disability: every county prevalence must be finite 0–100');
  if(Number(source.national_value)!==2.2) throw new Error(`P20 disability: national reconciliation expected 2.2, got ${source.national_value}`);
  if(!String(source.source_table||'').includes('Table 2.13')) throw new Error('P20 disability: Table 2.13 provenance missing');
  return map;
}
async function buildCatalogue(){
  const dir='data/catalogue/registry';
  let [source,datasets,releases,sources]=await Promise.all([readJson(SOURCE_FILE),readJson(`${dir}/datasets.json`),readJson(`${dir}/releases.json`),readJson(`${dir}/sources.json`)]);
  validateSource(source);
  const catalogueSource=sources.find(r=>r.source_code==='KNBS-STATISTICS');
  if(!catalogueSource) throw new Error('P20 disability: KNBS-STATISTICS source missing');
  let dataset=datasets.find(r=>r.dataset_code===DATASET_CODE);
  if(!dataset){dataset={dataset_id:uuid(`dataset:${DATASET_CODE}`),dataset_code:DATASET_CODE,source_id:catalogueSource.source_id,title:'2019 KPHC — Disability Prevalence by County',description:'Published total disability prevalence for all 47 counties from the 2019 KPHC Analytical Report on Disability, Table 2.13.',topic:'Demography',geographic_coverage:['county'],frequency:'decennial',publication_status:'published',methodology_url:source.source_url,known_limitations:'2019 census snapshot using the published Washington Group Short Set threshold. Atlas uses the reported Total prevalence column and does not average sex or residence subtotals.'};datasets.push(dataset);}
  if(!releases.some(r=>r.release_code===RELEASE_CODE)) releases.push({release_id:uuid(`release:${RELEASE_CODE}`),release_code:RELEASE_CODE,dataset_id:dataset.dataset_id,title:'2019 KPHC disability prevalence by county — Table 2.13',reference_period_start:source.reference_period_start,reference_period_end:source.reference_period_end,published_at:source.published_at,discovered_at:INGESTED_AT,ingested_at:INGESTED_AT,release_url:source.source_url,release_status:'published',version_label:'P20 governed county-source promotion',release_notes:`${source.publication}; ${source.source_table}. Uses the published Total prevalence column; no interpolation or geographic inheritance.`,supersedes_release_id:''});
  await Promise.all([writeFile(path.join(root,`${dir}/datasets.json`),JSON.stringify(datasets,null,2)+'\n'),writeFile(path.join(root,`${dir}/datasets.csv`),csv(datasets)),writeFile(path.join(root,`${dir}/releases.json`),JSON.stringify(releases,null,2)+'\n'),writeFile(path.join(root,`${dir}/releases.csv`),csv(releases))]);
  console.log('P20_DISABILITY_CATALOGUE_OK dataset=1 release=1');
}
async function buildIndicators(){
  const dir='data/indicators/registry';
  let [source,units,indicators,series,observations,geographies,datasets,releases,sources]=await Promise.all([readJson(SOURCE_FILE),readJson(`${dir}/units.json`),readJson(`${dir}/indicators.json`),readJson(`${dir}/series.json`),readJson(`${dir}/observations.json`),readJson('data/geography/registry/geographies.json'),readJson('data/catalogue/registry/datasets.json'),readJson('data/catalogue/registry/releases.json'),readJson('data/catalogue/registry/sources.json')]);
  const sourceByGeo=validateSource(source);
  const counties=geographies.filter(g=>g.level==='county').sort((a,b)=>a.geo_code.localeCompare(b.geo_code));
  if(counties.length!==47) throw new Error(`P20 disability: expected 47 canonical counties, found ${counties.length}`);
  for(const county of counties){const src=sourceByGeo.get(county.geo_code);if(norm(src.county_name)!==norm(formal(county))) throw new Error(`P20 disability: county-name mismatch ${county.geo_code}: ${src.county_name} vs ${formal(county)}`);}
  const indicator=indicators.find(r=>r.indicator_code==='IND-DISABILITY-PREVALENCE');
  const unit=units.find(r=>r.code==='percent');
  const dataset=datasets.find(r=>r.dataset_code===DATASET_CODE);
  const release=releases.find(r=>r.release_code===RELEASE_CODE);
  const catalogueSource=dataset?sources.find(r=>r.source_id===dataset.source_id):null;
  if(!indicator||!unit||!dataset||!release||!catalogueSource) throw new Error('P20 disability: required canonical records missing; run catalogue mode first');
  const oldIds=new Set(series.filter(r=>String(r.series_code).startsWith(SERIES_PREFIX)).map(r=>r.series_id));
  series=series.filter(r=>!oldIds.has(r.series_id)); observations=observations.filter(r=>!oldIds.has(r.series_id));
  for(const county of counties){
    const src=sourceByGeo.get(county.geo_code);const seriesCode=`${SERIES_PREFIX}${county.geo_code}`;const seriesId=uuid(`series:${seriesCode}`);const obsId=uuid(`observation:${seriesCode}:2019`);
    series.push({series_id:seriesId,series_code:seriesCode,indicator_id:indicator.indicator_id,geography_id:county.geography_id,geography_taxonomy:county.geography_system||'electoral',boundary_version:'2012-01',frequency:'decennial',period_type:'census',unit_id:unit.unit_id,price_basis:'not_applicable',base_period:'',currency:'',seasonal_adjustment:'none',transformation:'level',geographic_method:'direct',comparability_group:'P20-KPHC-2019-DISABILITY-PREVALENCE-COUNTY',dataset_id:dataset.dataset_id,agency_id:catalogueSource.agency_id,methodology_url:source.source_url,start_period:source.period_label,end_period:source.period_label,latest_observation_id:obsId,observation_count:1,last_updated_at:INGESTED_AT,next_expected_release:'',status:'active',superseded_by_series_id:''});
    observations.push({observation_id:obsId,series_id:seriesId,geography_id:county.geography_id,boundary_version:'2012-01',period_start:source.reference_period_start,period_end:source.reference_period_end,period_type:'census',period_label:source.period_label,value:Number(src.value),geographic_method:'direct',statistical_status:'final',source_class:'official',badge:'A',source_release_id:release.release_id,source_dataset_id:dataset.dataset_id,source_table:source.source_table,source_sheet:'',source_page:'35',source_row_label:src.county_name,source_url:source.source_url,published_at:source.published_at,ingested_at:INGESTED_AT,vintage_id:uuid(`vintage:${seriesCode}:2019:1`),supersedes_observation_id:'',lower_bound:null,upper_bound:null,confidence_level:null,standard_error:null,sample_size:null,suppression_reason:'',crosswalk_id:'',notes:'Direct KNBS 2019 KPHC Table 2.13 total disability prevalence. Total includes Intersex. No averaging of sex/residence columns, modelling, interpolation, or geographic inheritance.'});
  }
  Object.assign(indicator,{name:'Disability prevalence',short_name:'Disability prevalence',description:'Share of the population identified as having a disability under the published 2019 KPHC Washington Group Short Set threshold.',unit_id:unit.unit_id,lifecycle_status:'active',active:true,comparable:true,ranking_allowed:false,requires_sampling_uncertainty:false,methodology_url:source.source_url,expected_source:'KNBS 2019 KPHC Analytical Report on Disability, Table 2.13',expected_source_url:source.source_url,expected_availability_note:'Published directly for all 47 counties in Table 2.13. Census observation; no survey uncertainty requirement and no lower-level inheritance.'});
  await Promise.all([writeFile(path.join(root,`${dir}/indicators.json`),JSON.stringify(indicators,null,2)+'\n'),writeFile(path.join(root,`${dir}/indicators.csv`),csv(indicators)),writeFile(path.join(root,`${dir}/series.json`),JSON.stringify(series,null,2)+'\n'),writeFile(path.join(root,`${dir}/series.csv`),csv(series)),writeFile(path.join(root,`${dir}/observations.json`),JSON.stringify(observations,null,2)+'\n'),writeFile(path.join(root,`${dir}/observations.csv`),csv(observations))]);
  console.log('P20_DISABILITY_INDICATORS_OK counties=47 direct=47');
}
if(mode==='catalogue') await buildCatalogue(); else await buildIndicators();
