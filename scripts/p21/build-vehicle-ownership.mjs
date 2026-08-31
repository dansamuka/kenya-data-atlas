import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mode=process.argv[2];
if(!['catalogue','indicators'].includes(mode)){console.error('Usage: node scripts/p21/build-vehicle-ownership.mjs <catalogue|indicators>');process.exit(2);}
const SOURCE_FILE='data/p21/source/vehicle-ownership-kphc-2019.json';
const DATASET_CODE='DS-KNBS-KPHC-VEHICLE-OWNERSHIP-2019-P21';
const RELEASE_CODE='REL-KNBS-KPHC-VEHICLE-OWNERSHIP-2019-P21';
const PREFIXES={motorcycle:'KDA-P21-MOTORCYCLE-OWN-',car:'KDA-P21-CAR-OWN-'};
const INDICATORS={motorcycle:'IND-HOUSEHOLD-MOTORCYCLE-OWNERSHIP',car:'IND-HOUSEHOLD-CAR-OWNERSHIP'};
const INGESTED_AT='2026-08-31T18:05:00.000Z';
const EXPECTED=Array.from({length:47},(_,i)=>`KEN-C${String(i+1).padStart(3,'0')}`);
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const csvCell=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`;
const csv=rows=>{const f=[...new Set(rows.flatMap(r=>Object.keys(r)))];return [f.join(','),...rows.map(r=>f.map(k=>csvCell(r[k])).join(','))].join('\n')+'\n';};
const uuid=name=>{const h=createHash('sha1').update(`kenya-data-atlas:p21-vehicle-ownership:${name}`).digest();h[6]=(h[6]&15)|80;h[8]=(h[8]&63)|128;const x=h.subarray(0,16).toString('hex');return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`;};
const norm=v=>String(v??'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const formal=g=>g.geo_code==='KEN-C006'?'Taita-Taveta':g.geo_code==='KEN-C013'?'Tharaka-Nithi':g.geo_code==='KEN-C021'?"Murang'a":g.geo_code==='KEN-C028'?'Elgeyo-Marakwet':g.geo_code==='KEN-C047'?'Nairobi City':g.name;

function validate(source){
  const rows=source.counties||[],byCode=new Map(rows.map(r=>[r.geo_code,r]));
  if(rows.length!==47||byCode.size!==47||EXPECTED.some(c=>!byCode.has(c)))throw new Error(`P21 vehicle ownership: expected exact 47 county rows; rows=${rows.length} unique=${byCode.size}`);
  for(const r of rows)for(const k of ['motorcycle','car'])if(!Number.isFinite(Number(r[k]))||Number(r[k])<0||Number(r[k])>100)throw new Error(`P21 vehicle ownership: invalid ${k} ${r.geo_code}`);
  if(Number(source.national_values?.motorcycle)!==9.2||Number(source.national_values?.car)!==6.3)throw new Error('P21 vehicle ownership: national anchors must be motorcycle=9.2 car=6.3');
  if(Number(source.national_conventional_households)!==12043016)throw new Error('P21 vehicle ownership: national conventional-household anchor must be 12,043,016');
  if(!source.source_url||!source.source_pdf_url||!source.source_table||!source.crosscheck_url)throw new Error('P21 vehicle ownership: source metadata incomplete');
  return {rows,byCode};
}

async function catalogue(){
  const dir='data/catalogue/registry';let [datasets,releases,sources,source]=await Promise.all([readJson(`${dir}/datasets.json`),readJson(`${dir}/releases.json`),readJson(`${dir}/sources.json`),readJson(SOURCE_FILE)]);validate(source);
  const src=sources.find(s=>s.source_code==='KNBS-STATISTICS');if(!src)throw new Error('P21 vehicle ownership: KNBS-STATISTICS missing');
  const df={source_id:src.source_id,title:'2019 KPHC — Motorcycle and car ownership by county',description:'Percentage of conventional households owning motorcycles and cars for all 47 counties, published as separate columns in KNBS 2019 KPHC Volume IV Table 2.36.',topic:'Transport and household assets',geographic_coverage:['county'],frequency:'decennial',publication_status:'published',methodology_url:source.source_url,known_limitations:'Census household-asset ownership, not NTSA vehicle registrations. Values describe the share of conventional households owning each named asset. A household may own more than one asset, so columns must not be summed into a unique household-vehicle share. No vehicle counts, registration rates or per-capita vehicle stocks are inferred.'};
  let d=datasets.find(x=>x.dataset_code===DATASET_CODE);if(!d){d={dataset_id:uuid(`dataset:${DATASET_CODE}`),dataset_code:DATASET_CODE,...df};datasets.push(d);}else Object.assign(d,df);
  const rf={release_code:RELEASE_CODE,dataset_id:d.dataset_id,title:'2019 KPHC Table 2.36 motorcycle and car ownership by county',reference_period_start:source.reference_period_start,reference_period_end:source.reference_period_end,published_at:source.published_at,discovered_at:INGESTED_AT,ingested_at:INGESTED_AT,release_url:source.source_url,release_status:'published',version_label:'P21 governed hard-county replacement',release_notes:`${source.publication}; ${source.source_table}. Direct county motorcycle and car ownership percentages. Peer-reviewed PLOS ONE Table 1 independently reproduces the same 47-county columns from the KPHC. No combined vehicle share is created.`,supersedes_release_id:''};
  let r=releases.find(x=>x.release_code===RELEASE_CODE);if(!r){r={release_id:uuid(`release:${RELEASE_CODE}`),...rf};releases.push(r);}else Object.assign(r,rf);
  await Promise.all([writeFile(path.join(root,`${dir}/datasets.json`),JSON.stringify(datasets,null,2)+'\n'),writeFile(path.join(root,`${dir}/datasets.csv`),csv(datasets)),writeFile(path.join(root,`${dir}/releases.json`),JSON.stringify(releases,null,2)+'\n'),writeFile(path.join(root,`${dir}/releases.csv`),csv(releases))]);
  console.log('P21_VEHICLE_OWNERSHIP_CATALOGUE_OK dataset=1 release=1 counties=47 measures=2');
}

async function indicatorsBuild(){
  const dir='data/indicators/registry';let [source,units,indicators,series,observations,geographies,datasets,releases,sources]=await Promise.all([readJson(SOURCE_FILE),readJson(`${dir}/units.json`),readJson(`${dir}/indicators.json`),readJson(`${dir}/series.json`),readJson(`${dir}/observations.json`),readJson('data/geography/registry/geographies.json'),readJson('data/catalogue/registry/datasets.json'),readJson('data/catalogue/registry/releases.json'),readJson('data/catalogue/registry/sources.json')]);
  const {byCode}=validate(source);const counties=geographies.filter(g=>g.level==='county').sort((a,b)=>String(a.geo_code).localeCompare(String(b.geo_code)));if(counties.length!==47)throw new Error(`P21 vehicle ownership: canonical counties=${counties.length}`);
  for(const g of counties){const r=byCode.get(g.geo_code);if(!r||norm(r.county_name)!==norm(formal(g)))throw new Error(`P21 vehicle ownership: county mismatch ${g.geo_code}: ${r?.county_name} vs ${formal(g)}`);}
  const unit=units.find(u=>u.code==='percent'),dataset=datasets.find(d=>d.dataset_code===DATASET_CODE),release=releases.find(r=>r.release_code===RELEASE_CODE),catSource=dataset?sources.find(s=>s.source_id===dataset.source_id):null;
  if(!unit||!dataset||!release||!catSource)throw new Error('P21 vehicle ownership: required unit/catalogue records missing');
  for(const key of Object.keys(INDICATORS)){
    const indicator=indicators.find(i=>i.indicator_code===INDICATORS[key]);if(!indicator)throw new Error(`P21 vehicle ownership: indicator missing ${INDICATORS[key]}`);
    const prefix=PREFIXES[key],oldIds=new Set(series.filter(s=>String(s.series_code).startsWith(prefix)).map(s=>s.series_id));series=series.filter(s=>!oldIds.has(s.series_id));observations=observations.filter(o=>!oldIds.has(o.series_id));
    const label=key==='motorcycle'?'motorcycle':'car';
    Object.assign(indicator,{name:`Households owning a ${label}`,short_name:`${label[0].toUpperCase()+label.slice(1)} ownership`,description:`Percentage of conventional households owning a ${label} in KNBS 2019 KPHC Volume IV Table 2.36.`,unit_id:unit.unit_id,methodology_url:source.source_url,active:true,lifecycle_status:'active',comparable:true,ranking_allowed:false,requires_sampling_uncertainty:false,higher_is_better:null,expected_source:'KNBS — 2019 KPHC Volume IV, Table 2.36',expected_source_url:source.source_url,expected_availability_note:`Published directly for all 47 counties. This is household ${label} ownership, not an administrative vehicle-registration count or vehicles per capita. It is non-directional and excluded from ranking. No combined vehicle-ownership total is inferred.`});
    for(const g of counties){const r=byCode.get(g.geo_code),code=`${prefix}${g.geo_code}`,sid=uuid(`series:${code}`),oid=uuid(`observation:${code}:${source.reference_period_start}:${source.reference_period_end}`);series.push({series_id:sid,series_code:code,indicator_id:indicator.indicator_id,geography_id:g.geography_id,geography_taxonomy:g.geography_system||'electoral',boundary_version:'2012-01',frequency:'decennial',period_type:'census_period',unit_id:unit.unit_id,price_basis:'not_applicable',base_period:'',currency:'',seasonal_adjustment:'none',transformation:'level',geographic_method:'direct',comparability_group:`P21-KPHC-2019-${key.toUpperCase()}-OWNERSHIP-COUNTY`,dataset_id:dataset.dataset_id,agency_id:catSource.agency_id,methodology_url:source.source_url,start_period:source.period_label,end_period:source.period_label,latest_observation_id:oid,observation_count:1,last_updated_at:INGESTED_AT,next_expected_release:'',status:'active',superseded_by_series_id:''});observations.push({observation_id:oid,series_id:sid,geography_id:g.geography_id,boundary_version:'2012-01',period_start:source.reference_period_start,period_end:source.reference_period_end,period_type:'census_period',period_label:source.period_label,value:Number(r[key]),geographic_method:'direct',statistical_status:'final',source_class:'official',badge:'A',source_release_id:release.release_id,source_dataset_id:dataset.dataset_id,source_table:source.source_table,source_sheet:'',source_page:'',source_row_label:r.county_name,source_url:source.source_pdf_url,published_at:source.published_at,ingested_at:INGESTED_AT,vintage_id:uuid(`vintage:${code}:${source.reference_period_start}:1`),supersedes_observation_id:'',lower_bound:null,upper_bound:null,confidence_level:null,standard_error:null,sample_size:null,suppression_reason:'',crosswalk_id:'',notes:`Direct KNBS 2019 KPHC Table 2.36 percentage of conventional households owning a ${label}. This is not a registered-vehicle count, NTSA registration location, vehicle stock or per-capita vehicle rate. The 47-county values are independently cross-checked against the KPHC-derived PLOS ONE Table 1. No ownership columns are summed into a synthetic total.`});}
  }
  await Promise.all([writeFile(path.join(root,`${dir}/indicators.json`),JSON.stringify(indicators,null,2)+'\n'),writeFile(path.join(root,`${dir}/indicators.csv`),csv(indicators)),writeFile(path.join(root,`${dir}/series.json`),JSON.stringify(series,null,2)+'\n'),writeFile(path.join(root,`${dir}/series.csv`),csv(series)),writeFile(path.join(root,`${dir}/observations.json`),JSON.stringify(observations,null,2)+'\n'),writeFile(path.join(root,`${dir}/observations.csv`),csv(observations))]);
  console.log('P21_VEHICLE_OWNERSHIP_INDICATORS_OK counties=47 motorcycle=47 car=47 national_motorcycle=9.2 national_car=6.3 ranking=withheld');
}

if(mode==='catalogue')await catalogue();else await indicatorsBuild();
