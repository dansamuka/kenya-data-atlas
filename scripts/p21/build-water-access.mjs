import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mode=process.argv[2];
if(!['catalogue','indicators'].includes(mode)){
  console.error('Usage: node scripts/p21/build-water-access.mjs <catalogue|indicators>');
  process.exit(2);
}

const SOURCE_FILE='data/p21/source/water-access-khs-2023-24.json';
const DATASET_CODE='DS-KNBS-KHS-WATER-ACCESS-2023-24-P21';
const RELEASE_CODE='REL-KNBS-KHS-WATER-ACCESS-2023-24-P21';
const PREFIX='KDA-P21-WATER-ACCESS-';
const INGESTED_AT='2026-08-31T12:40:00.000Z';
const EXPECTED_CODES=Array.from({length:47},(_,i)=>`KEN-C${String(i+1).padStart(3,'0')}`);
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const csvCell=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`;
const csv=rows=>{const fields=[...new Set(rows.flatMap(r=>Object.keys(r)))];return [fields.join(','),...rows.map(r=>fields.map(f=>csvCell(r[f])).join(','))].join('\n')+'\n';};
const uuid=name=>{const h=createHash('sha1').update(`kenya-data-atlas:p21-water-access:${name}`).digest();h[6]=(h[6]&15)|80;h[8]=(h[8]&63)|128;const x=h.subarray(0,16).toString('hex');return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`;};
const norm=v=>String(v??'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const formal=geo=>geo.geo_code==='KEN-C006'?'Taita-Taveta':geo.geo_code==='KEN-C028'?'Elgeyo-Marakwet':geo.geo_code==='KEN-C047'?'Nairobi City':geo.name;

function validateSnapshot(source){
  const rows=source.counties||[];
  const byCode=new Map(rows.map(r=>[r.geo_code,r]));
  if(rows.length!==47||byCode.size!==47||EXPECTED_CODES.some(code=>!byCode.has(code)))throw new Error(`P21 water access: source must reconcile exactly 47/47 county codes; rows=${rows.length} unique=${byCode.size}`);
  for(const row of rows){if(!Number.isFinite(Number(row.value))||Number(row.value)<0||Number(row.value)>100)throw new Error(`P21 water access: invalid percentage ${row.geo_code}`);}
  if(Number(source.national_value)!==78.1)throw new Error('P21 water access: national Table 5.14 subtotal must reconcile to 78.1');
  if(!source.source_url||!source.source_pdf_url||!source.source_table||!source.reference_period_start||!source.reference_period_end)throw new Error('P21 water access: source metadata incomplete');
  return {rows,byCode};
}

async function buildCatalogue(){
  const dir='data/catalogue/registry';
  let [datasets,releases,sources,source]=await Promise.all([
    readJson(`${dir}/datasets.json`),readJson(`${dir}/releases.json`),readJson(`${dir}/sources.json`),readJson(SOURCE_FILE)
  ]);
  validateSnapshot(source);
  const catalogueSource=sources.find(s=>s.source_code==='KNBS-STATISTICS');
  if(!catalogueSource)throw new Error('P21 water access: KNBS-STATISTICS source missing from canonical catalogue');
  let dataset=datasets.find(d=>d.dataset_code===DATASET_CODE);
  if(!dataset){
    dataset={
      dataset_id:uuid(`dataset:${DATASET_CODE}`),dataset_code:DATASET_CODE,source_id:catalogueSource.source_id,
      title:'2023/24 Kenya Housing Survey — Improved Drinking Water Source by County',
      description:'Percentage of households using an improved main drinking-water source for all 47 counties, reported directly in KNBS 2023/24 Kenya Housing Survey Table 5.14.',
      topic:'Housing and infrastructure',geographic_coverage:['county'],frequency:'periodic',publication_status:'published',
      methodology_url:source.source_url,
      known_limitations:'Household survey estimates from the 2023/24 KHS fieldwork period. Values describe households and the KNBS Table 5.14 improved-source classification; they are not population shares, utility-connection rates, constituency estimates or ward estimates. No interpolation or parent-geography inheritance is applied.'
    };
    datasets.push(dataset);
  }else{
    Object.assign(dataset,{source_id:catalogueSource.source_id,title:'2023/24 Kenya Housing Survey — Improved Drinking Water Source by County',description:'Percentage of households using an improved main drinking-water source for all 47 counties, reported directly in KNBS 2023/24 Kenya Housing Survey Table 5.14.',topic:'Housing and infrastructure',geographic_coverage:['county'],frequency:'periodic',publication_status:'published',methodology_url:source.source_url,known_limitations:'Household survey estimates from the 2023/24 KHS fieldwork period. Values describe households and the KNBS Table 5.14 improved-source classification; they are not population shares, utility-connection rates, constituency estimates or ward estimates. No interpolation or parent-geography inheritance is applied.'});
  }
  let release=releases.find(r=>r.release_code===RELEASE_CODE);
  const releaseFields={
    release_code:RELEASE_CODE,dataset_id:dataset.dataset_id,title:'2023/24 KHS improved drinking-water source by county — Table 5.14',
    reference_period_start:source.reference_period_start,reference_period_end:source.reference_period_end,published_at:source.published_at,
    discovered_at:INGESTED_AT,ingested_at:INGESTED_AT,release_url:source.source_url,release_status:'published',version_label:'P21 governed hard-county promotion',
    release_notes:`${source.publication}; ${source.source_table}. The value is the published improved-source subtotal for each county. Publication date is stored at month precision as documented in the source snapshot; no lower-level or parent-geography inheritance.` ,supersedes_release_id:''
  };
  if(!release){release={release_id:uuid(`release:${RELEASE_CODE}`),...releaseFields};releases.push(release);}else Object.assign(release,releaseFields);
  await Promise.all([
    writeFile(path.join(root,`${dir}/datasets.json`),JSON.stringify(datasets,null,2)+'\n'),writeFile(path.join(root,`${dir}/datasets.csv`),csv(datasets)),
    writeFile(path.join(root,`${dir}/releases.json`),JSON.stringify(releases,null,2)+'\n'),writeFile(path.join(root,`${dir}/releases.csv`),csv(releases))
  ]);
  console.log('P21_WATER_ACCESS_CATALOGUE_OK dataset=1 release=1 counties=47');
}

async function buildIndicators(){
  const dir='data/indicators/registry';
  let [source,units,indicators,series,observations,geographies,datasets,releases,sources]=await Promise.all([
    readJson(SOURCE_FILE),readJson(`${dir}/units.json`),readJson(`${dir}/indicators.json`),readJson(`${dir}/series.json`),readJson(`${dir}/observations.json`),
    readJson('data/geography/registry/geographies.json'),readJson('data/catalogue/registry/datasets.json'),readJson('data/catalogue/registry/releases.json'),readJson('data/catalogue/registry/sources.json')
  ]);
  const {byCode}=validateSnapshot(source);
  const counties=geographies.filter(g=>g.level==='county').sort((a,b)=>String(a.geo_code).localeCompare(String(b.geo_code)));
  if(counties.length!==47)throw new Error(`P21 water access: expected 47 canonical counties, found ${counties.length}`);
  for(const county of counties){const src=byCode.get(county.geo_code);if(!src)throw new Error(`P21 water access: source missing ${county.geo_code}`);if(norm(src.county_name)!==norm(formal(county)))throw new Error(`P21 water access: county-name mismatch ${county.geo_code}: ${src.county_name} vs ${formal(county)}`);}
  const indicator=indicators.find(i=>i.indicator_code==='IND-WATER-ACCESS');
  const unit=units.find(u=>u.code==='percent');
  const dataset=datasets.find(d=>d.dataset_code===DATASET_CODE);
  const release=releases.find(r=>r.release_code===RELEASE_CODE);
  const catalogueSource=dataset?sources.find(s=>s.source_id===dataset.source_id):null;
  if(!indicator||!unit||!dataset||!release||!catalogueSource)throw new Error('P21 water access: required indicator/unit/catalogue records missing; run catalogue mode first');
  const oldIds=new Set(series.filter(s=>String(s.series_code).startsWith(PREFIX)).map(s=>s.series_id));
  series=series.filter(s=>!oldIds.has(s.series_id));observations=observations.filter(o=>!oldIds.has(o.series_id));
  Object.assign(indicator,{
    name:'Households with access to improved drinking-water source',short_name:'Improved water source',
    description:'Percentage of households whose main source of drinking water falls within the improved-source subtotal published by KNBS in 2023/24 Kenya Housing Survey Table 5.14.',
    unit_id:unit.unit_id,methodology_url:source.source_url,active:true,lifecycle_status:'active',comparable:true,ranking_allowed:false,requires_sampling_uncertainty:true,
    expected_source:'KNBS 2023/24 Kenya Housing Survey, Table 5.14',expected_source_url:source.source_url,
    expected_availability_note:'Published directly for all 47 counties. This is a household survey estimate of the KNBS improved-source subtotal. Standard errors/confidence intervals are not fabricated, ranking is withheld, and county values are never inherited to constituencies or wards.'
  });
  for(const county of counties){
    const src=byCode.get(county.geo_code),code=`${PREFIX}${county.geo_code}`,sid=uuid(`series:${code}`),oid=uuid(`observation:${code}:${source.reference_period_start}:${source.reference_period_end}`);
    series.push({series_id:sid,series_code:code,indicator_id:indicator.indicator_id,geography_id:county.geography_id,geography_taxonomy:county.geography_system||'electoral',boundary_version:'2012-01',frequency:'periodic',period_type:'survey_period',unit_id:unit.unit_id,price_basis:'not_applicable',base_period:'',currency:'',seasonal_adjustment:'none',transformation:'level',geographic_method:'direct',comparability_group:'P21-KHS-2023-24-IMPROVED-WATER-COUNTY',dataset_id:dataset.dataset_id,agency_id:catalogueSource.agency_id,methodology_url:source.source_url,start_period:source.period_label,end_period:source.period_label,latest_observation_id:oid,observation_count:1,last_updated_at:INGESTED_AT,next_expected_release:'',status:'active',superseded_by_series_id:''});
    observations.push({observation_id:oid,series_id:sid,geography_id:county.geography_id,boundary_version:'2012-01',period_start:source.reference_period_start,period_end:source.reference_period_end,period_type:'survey_period',period_label:source.period_label,value:Number(src.value),geographic_method:'direct',statistical_status:'final',source_class:'official',badge:'A',source_release_id:release.release_id,source_dataset_id:dataset.dataset_id,source_table:source.source_table,source_sheet:'',source_page:source.source_page,source_row_label:src.county_name,source_url:source.source_pdf_url,published_at:source.published_at,ingested_at:INGESTED_AT,vintage_id:uuid(`vintage:${code}:${source.reference_period_start}:1`),supersedes_observation_id:'',lower_bound:null,upper_bound:null,confidence_level:null,standard_error:null,sample_size:null,suppression_reason:'',crosswalk_id:'',notes:'Direct KNBS 2023/24 KHS Table 5.14 improved-source subtotal for households. No standard error, confidence interval or sample size is fabricated; ranking is withheld. No value transformation, interpolation, spatial modelling or parent-geography inheritance is applied.'});
  }
  await Promise.all([
    writeFile(path.join(root,`${dir}/indicators.json`),JSON.stringify(indicators,null,2)+'\n'),writeFile(path.join(root,`${dir}/indicators.csv`),csv(indicators)),
    writeFile(path.join(root,`${dir}/series.json`),JSON.stringify(series,null,2)+'\n'),writeFile(path.join(root,`${dir}/series.csv`),csv(series)),
    writeFile(path.join(root,`${dir}/observations.json`),JSON.stringify(observations,null,2)+'\n'),writeFile(path.join(root,`${dir}/observations.csv`),csv(observations))
  ]);
  console.log('P21_WATER_ACCESS_INDICATORS_OK counties=47 direct=47 national=78.1 ranking=withheld');
}

if(mode==='catalogue')await buildCatalogue();else await buildIndicators();
