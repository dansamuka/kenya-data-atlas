import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mode=process.argv[2];
if(!['catalogue','indicators'].includes(mode)){console.error('Usage: node scripts/p21/build-class-c-road-length.mjs <catalogue|indicators>');process.exit(2);}

const SOURCE_FILE='data/p21/source/class-c-rural-road-length-economic-survey-2026.json';
const DATASET_CODE='DS-KNBS-CLASS-C-RURAL-ROADS-2025-P21';
const RELEASE_CODE='REL-KNBS-CLASS-C-RURAL-ROADS-2025-P21';
const INDICATOR_CODE='IND-CLASS-C-RURAL-ROAD-LENGTH';
const PREFIX='KDA-P21-CLASS-C-ROAD-';
const INGESTED_AT='2026-08-31T18:18:00.000Z';
const EXPECTED=Array.from({length:47},(_,i)=>`KEN-C${String(i+1).padStart(3,'0')}`);
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const csvCell=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`;
const csv=rows=>{const fields=[...new Set(rows.flatMap(r=>Object.keys(r)))];return [fields.join(','),...rows.map(r=>fields.map(f=>csvCell(r[f])).join(','))].join('\n')+'\n';};
const uuid=name=>{const h=createHash('sha1').update(`kenya-data-atlas:p21-class-c-road:${name}`).digest();h[6]=(h[6]&15)|80;h[8]=(h[8]&63)|128;const x=h.subarray(0,16).toString('hex');return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`;};
const norm=v=>String(v??'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const formal=g=>g.geo_code==='KEN-C006'?'Taita/Taveta':g.geo_code==='KEN-C013'?'Tharaka-Nithi':g.geo_code==='KEN-C021'?'Muranga':g.geo_code==='KEN-C028'?'Elgeyo/Marakwet':g.geo_code==='KEN-C047'?'Nairobi City':g.name;
const sum1=rows=>Number(rows.reduce((s,r)=>s+Number(r.total),0).toFixed(1));
const componentSum=(rows,key)=>Number(rows.reduce((s,r)=>s+(r[key]==null?0:Number(r[key])),0).toFixed(1));

function validate(source){
  const rows=source.counties||[],byCode=new Map(rows.map(r=>[r.geo_code,r]));
  if(rows.length!==47||byCode.size!==47||EXPECTED.some(code=>!byCode.has(code)))throw new Error(`P21 Class C road: expected exact 47 counties; rows=${rows.length} unique=${byCode.size}`);
  for(const r of rows){if(!Number.isFinite(Number(r.total))||Number(r.total)<0)throw new Error(`P21 Class C road: invalid total ${r.geo_code}`);for(const k of ['paved','unpaved'])if(r[k]!=null&&(!Number.isFinite(Number(r[k]))||Number(r[k])<0))throw new Error(`P21 Class C road: invalid ${k} ${r.geo_code}`);}
  if(Number(source.national_values?.total)!==28149.9||Number(source.national_values?.paved)!==5163.3||Number(source.national_values?.unpaved)!==22986.6)throw new Error('P21 Class C road: national anchors drifted from Table 11.9');
  if(sum1(rows)!==28150.5||componentSum(rows,'paved')!==5163.7||componentSum(rows,'unpaved')!==22986.8)throw new Error(`P21 Class C road: displayed county sums drifted total=${sum1(rows)} paved=${componentSum(rows,'paved')} unpaved=${componentSum(rows,'unpaved')}`);
  if(!source.source_url||!source.source_pdf_url||!source.source_table||source.period_label!=='2025 provisional')throw new Error('P21 Class C road: source metadata incomplete');
  return {rows,byCode};
}

async function buildCatalogue(){
  const dir='data/catalogue/registry';
  let [datasets,releases,sources,source]=await Promise.all([readJson(`${dir}/datasets.json`),readJson(`${dir}/releases.json`),readJson(`${dir}/sources.json`),readJson(SOURCE_FILE)]);
  validate(source);
  const src=sources.find(s=>s.source_code==='KNBS-STATISTICS');if(!src)throw new Error('P21 Class C road: KNBS-STATISTICS source missing');
  const datasetFields={source_id:src.source_id,title:'Economic Survey 2026 — Class C rural road length by county, 2025',description:'Published total kilometres of Class C rural roads for all 47 counties in 2025 from KNBS Economic Survey 2026 Table 11.9, underlying source Kenya Rural Roads Authority.',topic:'Transport infrastructure',geographic_coverage:['county'],frequency:'annual',publication_status:'published',methodology_url:source.source_url,known_limitations:'This is Class C rural-road length only, not total road length across every road class within a county. 2025 values are provisional. Published county totals are preserved verbatim; displayed county totals sum to 28,150.5 km versus the published national 28,149.9 km because of source publication precision/rounding. No balancing adjustment is made.'};
  let dataset=datasets.find(d=>d.dataset_code===DATASET_CODE);if(!dataset){dataset={dataset_id:uuid(`dataset:${DATASET_CODE}`),dataset_code:DATASET_CODE,...datasetFields};datasets.push(dataset);}else Object.assign(dataset,datasetFields);
  const releaseFields={release_code:RELEASE_CODE,dataset_id:dataset.dataset_id,title:'Economic Survey 2026 Table 11.9 — Class C rural roads by county, 2025',reference_period_start:source.reference_period_start,reference_period_end:source.reference_period_end,published_at:source.published_at,discovered_at:INGESTED_AT,ingested_at:INGESTED_AT,release_url:source.source_url,release_status:'published',version_label:'P21 governed hard-county replacement',release_notes:`${source.publication}; ${source.source_table}. The Atlas promotes only the published Total column for 2025 provisional Class C rural roads. Published totals are not recomputed from rounded surface components and Class C is not represented as all-class county road length.`,supersedes_release_id:''};
  let release=releases.find(r=>r.release_code===RELEASE_CODE);if(!release){release={release_id:uuid(`release:${RELEASE_CODE}`),...releaseFields};releases.push(release);}else Object.assign(release,releaseFields);
  await Promise.all([writeFile(path.join(root,`${dir}/datasets.json`),JSON.stringify(datasets,null,2)+'\n'),writeFile(path.join(root,`${dir}/datasets.csv`),csv(datasets)),writeFile(path.join(root,`${dir}/releases.json`),JSON.stringify(releases,null,2)+'\n'),writeFile(path.join(root,`${dir}/releases.csv`),csv(releases))]);
  console.log('P21_CLASS_C_ROAD_CATALOGUE_OK dataset=1 release=1 counties=47 national=28149.9');
}

async function buildIndicators(){
  const dir='data/indicators/registry';
  let [source,units,indicators,series,observations,geographies,datasets,releases,sources]=await Promise.all([readJson(SOURCE_FILE),readJson(`${dir}/units.json`),readJson(`${dir}/indicators.json`),readJson(`${dir}/series.json`),readJson(`${dir}/observations.json`),readJson('data/geography/registry/geographies.json'),readJson('data/catalogue/registry/datasets.json'),readJson('data/catalogue/registry/releases.json'),readJson('data/catalogue/registry/sources.json')]);
  const {byCode}=validate(source);const counties=geographies.filter(g=>g.level==='county').sort((a,b)=>String(a.geo_code).localeCompare(String(b.geo_code)));if(counties.length!==47)throw new Error(`P21 Class C road: canonical counties=${counties.length}`);
  for(const g of counties){const r=byCode.get(g.geo_code);if(!r||norm(r.county_name)!==norm(formal(g)))throw new Error(`P21 Class C road: county mismatch ${g.geo_code}: ${r?.county_name} vs ${formal(g)}`);}
  const indicator=indicators.find(i=>i.indicator_code===INDICATOR_CODE),unit=units.find(u=>u.code==='km'),dataset=datasets.find(d=>d.dataset_code===DATASET_CODE),release=releases.find(r=>r.release_code===RELEASE_CODE),catSource=dataset?sources.find(s=>s.source_id===dataset.source_id):null;
  if(!indicator||!unit||!dataset||!release||!catSource)throw new Error('P21 Class C road: required indicator/unit/catalogue records missing; run catalogue mode first');
  const oldIds=new Set(series.filter(s=>String(s.series_code||'').startsWith(PREFIX)).map(s=>s.series_id));series=series.filter(s=>!oldIds.has(s.series_id));observations=observations.filter(o=>!oldIds.has(o.series_id));
  Object.assign(indicator,{name:'Class C rural road length',short_name:'Class C road length',description:'Published total kilometres of Class C rural roads in each county in 2025 from KNBS Economic Survey 2026 Table 11.9.',unit_id:unit.unit_id,methodology_url:source.source_url,active:true,lifecycle_status:'active',comparable:true,ranking_allowed:false,requires_sampling_uncertainty:false,higher_is_better:null,expected_source:'KNBS Economic Survey 2026 Table 11.9; underlying source Kenya Rural Roads Authority',expected_source_url:source.source_url,expected_availability_note:'Published directly for all 47 counties for 2025 provisional. This is Class C rural-road length only, not total county road-network length. Published Total values are used verbatim and are not recomputed from rounded paved/unpaved components.'});
  for(const g of counties){const r=byCode.get(g.geo_code),code=`${PREFIX}${g.geo_code}`,sid=uuid(`series:${code}`),oid=uuid(`observation:${code}:${source.reference_period_start}:${source.reference_period_end}`);series.push({series_id:sid,series_code:code,indicator_id:indicator.indicator_id,geography_id:g.geography_id,geography_taxonomy:g.geography_system||'electoral',boundary_version:'2012-01',frequency:'annual',period_type:'calendar_year',unit_id:unit.unit_id,price_basis:'not_applicable',base_period:'',currency:'',seasonal_adjustment:'none',transformation:'level',geographic_method:'direct',comparability_group:'P21-KNBS-ES2026-CLASS-C-ROAD-2025-COUNTY',dataset_id:dataset.dataset_id,agency_id:catSource.agency_id,methodology_url:source.source_url,start_period:source.period_label,end_period:source.period_label,latest_observation_id:oid,observation_count:1,last_updated_at:INGESTED_AT,next_expected_release:'',status:'active',superseded_by_series_id:''});observations.push({observation_id:oid,series_id:sid,geography_id:g.geography_id,boundary_version:'2012-01',period_start:source.reference_period_start,period_end:source.reference_period_end,period_type:'calendar_year',period_label:source.period_label,value:Number(r.total),geographic_method:'direct',statistical_status:'provisional',source_class:'official',badge:'A',source_release_id:release.release_id,source_dataset_id:dataset.dataset_id,source_table:source.source_table,source_sheet:'',source_page:source.source_page,source_row_label:r.county_name,source_url:source.source_pdf_url,published_at:source.published_at,ingested_at:INGESTED_AT,vintage_id:uuid(`vintage:${code}:${source.reference_period_start}:1`),supersedes_observation_id:'',lower_bound:null,upper_bound:null,confidence_level:null,standard_error:null,sample_size:null,suppression_reason:'',crosswalk_id:'',notes:`Direct published 2025 provisional Total for Class C rural roads in KNBS Economic Survey 2026 Table 11.9; underlying source Kenya Rural Roads Authority. Published total ${r.total} km is preserved verbatim${r.paved==null||r.unpaved==null?'; at least one displayed surface component is a dash/null and is not inferred as zero':`; displayed components paved=${r.paved} km and unpaved=${r.unpaved} km are provenance only`}. This is not all-class county road-network length. No balancing against the published national 28,149.9 km total is applied.`});}
  await Promise.all([writeFile(path.join(root,`${dir}/indicators.json`),JSON.stringify(indicators,null,2)+'\n'),writeFile(path.join(root,`${dir}/indicators.csv`),csv(indicators)),writeFile(path.join(root,`${dir}/series.json`),JSON.stringify(series,null,2)+'\n'),writeFile(path.join(root,`${dir}/series.csv`),csv(series)),writeFile(path.join(root,`${dir}/observations.json`),JSON.stringify(observations,null,2)+'\n'),writeFile(path.join(root,`${dir}/observations.csv`),csv(observations))]);
  console.log('P21_CLASS_C_ROAD_INDICATORS_OK counties=47 direct=47 national=28149.9 displayed_county_sum=28150.5 ranking=withheld');
}

if(mode==='catalogue')await buildCatalogue();else await buildIndicators();
