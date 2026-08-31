import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mode=process.argv[2];
if(!['catalogue','indicators'].includes(mode)){console.error('Usage: node scripts/p21/build-social-assistance.mjs <catalogue|indicators>');process.exit(2);}
const SOURCE_FILE='data/p21/source/cash-transfer-social-assistance-kdhs-2022.json';
const DATASET_CODE='DS-KNBS-KDHS-CASH-SOCIAL-ASSISTANCE-2022-P21';
const RELEASE_CODE='REL-KNBS-KDHS-CASH-SOCIAL-ASSISTANCE-2022-P21';
const PREFIX='KDA-P21-CASH-SOCIAL-ASSIST-';
const INGESTED_AT='2026-08-31T17:48:00.000Z';
const EXPECTED=Array.from({length:47},(_,i)=>`KEN-C${String(i+1).padStart(3,'0')}`);
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const csvCell=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`;
const csv=rows=>{const f=[...new Set(rows.flatMap(r=>Object.keys(r)))];return [f.join(','),...rows.map(r=>f.map(k=>csvCell(r[k])).join(','))].join('\n')+'\n';};
const uuid=name=>{const h=createHash('sha1').update(`kenya-data-atlas:p21-social-assistance:${name}`).digest();h[6]=(h[6]&15)|80;h[8]=(h[8]&63)|128;const x=h.subarray(0,16).toString('hex');return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`;};
const norm=v=>String(v??'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const formal=g=>g.geo_code==='KEN-C006'?'Taita-Taveta':g.geo_code==='KEN-C013'?'Tharaka-Nithi':g.geo_code==='KEN-C021'?"Murang'a":g.geo_code==='KEN-C028'?'Elgeyo-Marakwet':g.geo_code==='KEN-C047'?'Nairobi City':g.name;

function validate(source){
  const rows=source.counties||[],byCode=new Map(rows.map(r=>[r.geo_code,r]));
  if(rows.length!==47||byCode.size!==47||EXPECTED.some(c=>!byCode.has(c)))throw new Error(`P21 social assistance: expected exact 47 county rows; rows=${rows.length} unique=${byCode.size}`);
  for(const r of rows){if(!Number.isFinite(Number(r.value))||Number(r.value)<0||Number(r.value)>100)throw new Error(`P21 social assistance: invalid percentage ${r.geo_code}`);if(!Number.isInteger(Number(r.household_sample))||Number(r.household_sample)<=0)throw new Error(`P21 social assistance: invalid household sample ${r.geo_code}`);}
  const n=rows.reduce((s,r)=>s+Number(r.household_sample),0),receiving=rows.reduce((s,r)=>s+Number(r.reported_receiving_households),0);
  if(n!==37911||n!==Number(source.national_household_sample))throw new Error(`P21 social assistance: county household sample must reconcile 37,911; got ${n}`);
  if(receiving!==6376||Number(source.national_reported_receiving_households)!==6380)throw new Error(`P21 social assistance: expected displayed county receiving sum 6,376 and national 6,380; got ${receiving}`);
  if(Number(source.national_value)!==16.8)throw new Error('P21 social assistance: national value must be 16.8');
  return {rows,byCode};
}

async function catalogue(){
  const dir='data/catalogue/registry';let [datasets,releases,sources,source]=await Promise.all([readJson(`${dir}/datasets.json`),readJson(`${dir}/releases.json`),readJson(`${dir}/sources.json`),readJson(SOURCE_FILE)]);validate(source);
  const src=sources.find(s=>s.source_code==='KNBS-STATISTICS');if(!src)throw new Error('P21 social assistance: KNBS-STATISTICS missing');
  const df={source_id:src.source_id,title:'KDHS 2022 — Households receiving cash transfer or social assistance by county',description:'Percentage of households receiving a cash transfer or any social assistance for all 47 counties, published directly in KDHS 2022 Table 2.21.3C.',topic:'Social protection',geographic_coverage:['county'],frequency:'periodic',publication_status:'published',methodology_url:source.source_url,known_limitations:'Household survey estimate broader than Inua Jamii. It is not an administrative beneficiary-person count, programme enrolment count or take-up rate. County confidence intervals/standard errors are not published in Table 2.21.3C; the Atlas retains household denominators and withholds ranking rather than fabricating uncertainty.'};
  let d=datasets.find(x=>x.dataset_code===DATASET_CODE);if(!d){d={dataset_id:uuid(`dataset:${DATASET_CODE}`),dataset_code:DATASET_CODE,...df};datasets.push(d);}else Object.assign(d,df);
  const rf={release_code:RELEASE_CODE,dataset_id:d.dataset_id,title:'KDHS 2022 Table 2.21.3C cash transfer/social assistance by county',reference_period_start:source.reference_period_start,reference_period_end:source.reference_period_end,published_at:source.published_at,discovered_at:INGESTED_AT,ingested_at:INGESTED_AT,release_url:source.source_url,release_status:'published',version_label:'P21 governed hard-county replacement',release_notes:`${source.publication}; ${source.source_table}. Direct household survey percentages for all 47 counties with published household denominators. The administrative Inua Jamii count concept is not inferred from this table.`,supersedes_release_id:''};
  let r=releases.find(x=>x.release_code===RELEASE_CODE);if(!r){r={release_id:uuid(`release:${RELEASE_CODE}`),...rf};releases.push(r);}else Object.assign(r,rf);
  await Promise.all([writeFile(path.join(root,`${dir}/datasets.json`),JSON.stringify(datasets,null,2)+'\n'),writeFile(path.join(root,`${dir}/datasets.csv`),csv(datasets)),writeFile(path.join(root,`${dir}/releases.json`),JSON.stringify(releases,null,2)+'\n'),writeFile(path.join(root,`${dir}/releases.csv`),csv(releases))]);
  console.log('P21_SOCIAL_ASSISTANCE_CATALOGUE_OK dataset=1 release=1 counties=47');
}

async function indicatorsBuild(){
  const dir='data/indicators/registry';let [source,units,indicators,series,observations,geographies,datasets,releases,sources]=await Promise.all([readJson(SOURCE_FILE),readJson(`${dir}/units.json`),readJson(`${dir}/indicators.json`),readJson(`${dir}/series.json`),readJson(`${dir}/observations.json`),readJson('data/geography/registry/geographies.json'),readJson('data/catalogue/registry/datasets.json'),readJson('data/catalogue/registry/releases.json'),readJson('data/catalogue/registry/sources.json')]);
  const {byCode}=validate(source);const counties=geographies.filter(g=>g.level==='county').sort((a,b)=>String(a.geo_code).localeCompare(String(b.geo_code)));if(counties.length!==47)throw new Error(`P21 social assistance: canonical counties=${counties.length}`);
  for(const g of counties){const r=byCode.get(g.geo_code);if(!r||norm(r.county_name)!==norm(formal(g)))throw new Error(`P21 social assistance: county mismatch ${g.geo_code}`);}
  const indicator=indicators.find(i=>i.indicator_code==='IND-HOUSEHOLDS-CASH-TRANSFER-SOCIAL-ASSISTANCE'),unit=units.find(u=>u.code==='percent'),dataset=datasets.find(d=>d.dataset_code===DATASET_CODE),release=releases.find(r=>r.release_code===RELEASE_CODE),catSource=dataset?sources.find(s=>s.source_id===dataset.source_id):null;
  if(!indicator||!unit||!dataset||!release||!catSource)throw new Error('P21 social assistance: required registry records missing');
  const oldIds=new Set(series.filter(s=>String(s.series_code).startsWith(PREFIX)).map(s=>s.series_id));series=series.filter(s=>!oldIds.has(s.series_id));observations=observations.filter(o=>!oldIds.has(o.series_id));
  Object.assign(indicator,{name:'Households receiving cash transfer or social assistance',short_name:'Cash transfer / social assistance',description:'Percentage of households receiving a cash transfer or any social assistance in KDHS 2022 Table 2.21.3C.',unit_id:unit.unit_id,methodology_url:source.source_url,active:true,lifecycle_status:'active',comparable:true,ranking_allowed:false,requires_sampling_uncertainty:true,expected_source:'KNBS and ICF — KDHS 2022 Table 2.21.3C',expected_source_url:source.source_url,expected_availability_note:'Published directly for all 47 counties. This is a household survey percentage broader than Inua Jamii, not an administrative beneficiary count. Household denominators are retained; confidence intervals are not fabricated and ranking is withheld.'});
  for(const g of counties){const r=byCode.get(g.geo_code),code=`${PREFIX}${g.geo_code}`,sid=uuid(`series:${code}`),oid=uuid(`observation:${code}:${source.reference_period_start}:${source.reference_period_end}`);series.push({series_id:sid,series_code:code,indicator_id:indicator.indicator_id,geography_id:g.geography_id,geography_taxonomy:g.geography_system||'electoral',boundary_version:'2012-01',frequency:'periodic',period_type:'survey_period',unit_id:unit.unit_id,price_basis:'not_applicable',base_period:'',currency:'',seasonal_adjustment:'none',transformation:'level',geographic_method:'direct',comparability_group:'P21-KDHS-2022-CASH-SOCIAL-ASSISTANCE-COUNTY',dataset_id:dataset.dataset_id,agency_id:catSource.agency_id,methodology_url:source.source_url,start_period:source.period_label,end_period:source.period_label,latest_observation_id:oid,observation_count:1,last_updated_at:INGESTED_AT,next_expected_release:'',status:'active',superseded_by_series_id:''});observations.push({observation_id:oid,series_id:sid,geography_id:g.geography_id,boundary_version:'2012-01',period_start:source.reference_period_start,period_end:source.reference_period_end,period_type:'survey_period',period_label:source.period_label,value:Number(r.value),geographic_method:'direct',statistical_status:'final',source_class:'official',badge:'A',source_release_id:release.release_id,source_dataset_id:dataset.dataset_id,source_table:source.source_table,source_sheet:'',source_page:source.source_page,source_row_label:r.county_name,source_url:source.source_pdf_url,published_at:source.published_at,ingested_at:INGESTED_AT,vintage_id:uuid(`vintage:${code}:${source.reference_period_start}:1`),supersedes_observation_id:'',lower_bound:null,upper_bound:null,confidence_level:null,standard_error:null,sample_size:Number(r.household_sample),suppression_reason:'',crosswalk_id:'',notes:`Direct KDHS 2022 Table 2.21.3C household percentage; published household denominator ${r.household_sample}; displayed households receiving assistance ${r.reported_receiving_households}. Broader than Inua Jamii and not a beneficiary-person count. No confidence interval is fabricated, ranking is withheld, and no lower-level inheritance is applied.`});}
  await Promise.all([writeFile(path.join(root,`${dir}/indicators.json`),JSON.stringify(indicators,null,2)+'\n'),writeFile(path.join(root,`${dir}/indicators.csv`),csv(indicators)),writeFile(path.join(root,`${dir}/series.json`),JSON.stringify(series,null,2)+'\n'),writeFile(path.join(root,`${dir}/series.csv`),csv(series)),writeFile(path.join(root,`${dir}/observations.json`),JSON.stringify(observations,null,2)+'\n'),writeFile(path.join(root,`${dir}/observations.csv`),csv(observations))]);
  console.log('P21_SOCIAL_ASSISTANCE_INDICATORS_OK counties=47 direct=47 national=16.8 n=37911 ranking=withheld');
}

if(mode==='catalogue')await catalogue();else await indicatorsBuild();
