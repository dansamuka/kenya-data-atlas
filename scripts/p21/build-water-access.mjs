import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mode=process.argv[2];
if(!['catalogue','indicators'].includes(mode)) throw new Error('Usage: node scripts/p21/build-water-access.mjs <catalogue|indicators>');

const SOURCE_FILE='data/p21/source/kphc-2019-drinking-water-county-subcounty.csv';
const DATASET_CODE='DS-KNBS-KPHC-IMPROVED-WATER-2019-P21';
const RELEASE_CODE='REL-KNBS-KPHC-IMPROVED-WATER-2019-P21';
const PREFIX='KDA-P21-IMPROVED-WATER-';
const INDICATOR_CODE='IND-WATER-ACCESS';
const INGESTED_AT='2026-08-31T12:05:00.000Z';
const SOURCE_URL='https://www.knbs.or.ke/wp-content/uploads/2023/09/2019-Kenya-population-and-Housing-Census-Analytical-Report-on-Housing-Conditions-and-Amenities.pdf';
const MIRROR_URL='https://open.africa/dataset/9b94fe50-9d75-4b92-be00-6354c6e6cc88/resource/ea9263c3-3c48-4b23-9a79-b175945e690e/download/percentage-distribution-of-conventional-households-by-main-source-of-drinking-water-county-and-s.csv';
const SOURCE_TABLE='2019 KPHC Volume IV — Percentage Distribution of Conventional Households by Main Source of Drinking Water, County and Sub-County; improved-source classification from Housing Conditions and Amenities Appendix 15 / Atlas H.8';
const IMPROVED_FIELDS=['Protected Spring','Protected Well','Borehole/ Tube well','Piped into dwelling','Piped to yard/ Plot','Bottled water','Rain/ Harvested water','Public tap/ Standpipe'];

const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const csvCell=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`;
const csv=rows=>{const fields=[...new Set(rows.flatMap(r=>Object.keys(r)))];return [fields.join(','),...rows.map(r=>fields.map(f=>csvCell(r[f])).join(','))].join('\n')+'\n';};
const uuid=name=>{const h=createHash('sha1').update(`kenya-data-atlas:p21-water:${name}`).digest();h[6]=(h[6]&15)|80;h[8]=(h[8]&63)|128;const x=h.subarray(0,16).toString('hex');return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`;};
const norm=v=>String(v??'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const formal=geo=>geo.geo_code==='KEN-C006'?'Taita-Taveta':geo.geo_code==='KEN-C013'?'Tharaka-Nithi':geo.geo_code==='KEN-C028'?'Elgeyo-Marakwet':geo.geo_code==='KEN-C043'?'Homa Bay':geo.geo_code==='KEN-C047'?'Nairobi City':geo.name;

function parseCsv(text){
  const rows=[]; let row=[]; let cell=''; let quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"')quoted=false;
      else cell+=ch;
    }else if(ch==='"')quoted=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
    else if(ch!=='\r')cell+=ch;
  }
  if(cell.length||row.length){row.push(cell);rows.push(row);}
  const header=rows.shift();
  return rows.filter(r=>r.some(v=>String(v).trim()!=='')).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]??''])));
}

function derivePct(row){
  const values=IMPROVED_FIELDS.map(f=>Number(row[f]));
  if(values.some(v=>!Number.isFinite(v))) throw new Error(`P21 water: non-numeric improved-source category for ${row['County/ Sub-County']}`);
  return Number(values.reduce((a,b)=>a+b,0).toFixed(1));
}

async function loadSource(){
  const raw=await readFile(path.join(root,SOURCE_FILE),'utf8');
  const rows=parseCsv(raw);
  const national=rows.find(r=>norm(r['County/ Sub-County'])==='kenya');
  if(!national) throw new Error('P21 water: national KENYA source row missing');
  const nationalPct=derivePct(national);
  if(nationalPct!==64.8) throw new Error(`P21 water: national improved-water reconciliation expected 64.8, got ${nationalPct}`);
  return {rows,nationalPct};
}

async function matchedCountyRows(){
  const [{rows,nationalPct},geographies]=await Promise.all([loadSource(),readJson('data/geography/registry/geographies.json')]);
  const counties=geographies.filter(g=>g.level==='county').sort((a,b)=>a.geo_code.localeCompare(b.geo_code));
  if(counties.length!==47) throw new Error(`P21 water: expected 47 canonical counties, got ${counties.length}`);
  const byNorm=new Map();
  for(const r of rows){
    const key=norm(r['County/ Sub-County']);
    if(key&&!byNorm.has(key)) byNorm.set(key,r);
  }
  const matches=[];
  for(const county of counties){
    const names=[formal(county),county.name];
    if(county.geo_code==='KEN-C047') names.push('Nairobi');
    const source=names.map(n=>byNorm.get(norm(n))).find(Boolean);
    if(!source) throw new Error(`P21 water: source county row missing for ${county.geo_code} ${formal(county)}`);
    const value=derivePct(source);
    if(value<0||value>100) throw new Error(`P21 water: invalid value ${value} for ${county.geo_code}`);
    matches.push({county,source,value});
  }
  if(new Set(matches.map(m=>norm(m.source['County/ Sub-County']))).size!==47) throw new Error('P21 water: county source matching is not one-to-one');
  return {matches,nationalPct};
}

async function buildCatalogue(){
  const dir='data/catalogue/registry';
  let [datasets,releases,sources,{matches,nationalPct}]=await Promise.all([
    readJson(`${dir}/datasets.json`),readJson(`${dir}/releases.json`),readJson(`${dir}/sources.json`),matchedCountyRows()
  ]);
  if(matches.length!==47) throw new Error('P21 water: 47 matched counties required before catalogue publication');
  const catalogueSource=sources.find(r=>r.source_code==='KNBS-STATISTICS');
  if(!catalogueSource) throw new Error('P21 water: KNBS-STATISTICS catalogue source missing');
  let dataset=datasets.find(r=>r.dataset_code===DATASET_CODE);
  if(!dataset){
    dataset={
      dataset_id:uuid(`dataset:${DATASET_CODE}`),dataset_code:DATASET_CODE,source_id:catalogueSource.source_id,
      title:'2019 KPHC — Improved Drinking-Water Access by County',
      description:'County share of conventional households using an improved main drinking-water source, transparently derived from the eight source categories classified as improved by KNBS in the 2019 KPHC Housing Conditions and Amenities report / Atlas H.8.',
      topic:'Infrastructure',geographic_coverage:['county'],frequency:'decennial',publication_status:'published',methodology_url:SOURCE_URL,
      known_limitations:'Transparent subtotal from source category percentages rounded to one decimal place. A derived county subtotal can differ by about 0.1 percentage point from the separately published Appendix 15 subtotal because of source rounding. County only; no constituency or ward inheritance.'
    };
    datasets.push(dataset);
  }
  if(!releases.some(r=>r.release_code===RELEASE_CODE)) releases.push({
    release_id:uuid(`release:${RELEASE_CODE}`),release_code:RELEASE_CODE,dataset_id:dataset.dataset_id,
    title:'2019 KPHC improved drinking-water access by county — transparent category subtotal',
    reference_period_start:'2019-08-24',reference_period_end:'2019-08-25',published_at:'',discovered_at:INGESTED_AT,ingested_at:INGESTED_AT,
    release_url:SOURCE_URL,release_status:'published',version_label:'P21 transparent derived county promotion',
    release_notes:`${SOURCE_TABLE}. Improved categories: ${IMPROVED_FIELDS.join(', ')}. National published/reconciled anchor: ${nationalPct}%. Raw table snapshot retained at ${SOURCE_FILE}; public mirror ${MIRROR_URL}.`,supersedes_release_id:''
  });
  await Promise.all([
    writeFile(path.join(root,`${dir}/datasets.json`),JSON.stringify(datasets,null,2)+'\n'),writeFile(path.join(root,`${dir}/datasets.csv`),csv(datasets)),
    writeFile(path.join(root,`${dir}/releases.json`),JSON.stringify(releases,null,2)+'\n'),writeFile(path.join(root,`${dir}/releases.csv`),csv(releases))
  ]);
  console.log(`P21_WATER_CATALOGUE_OK counties=${matches.length} national_anchor=${nationalPct}`);
}

async function buildIndicators(){
  const dir='data/indicators/registry';
  let [units,indicators,series,observations,geographies,datasets,releases,sources,{matches,nationalPct}]=await Promise.all([
    readJson(`${dir}/units.json`),readJson(`${dir}/indicators.json`),readJson(`${dir}/series.json`),readJson(`${dir}/observations.json`),
    readJson('data/geography/registry/geographies.json'),readJson('data/catalogue/registry/datasets.json'),readJson('data/catalogue/registry/releases.json'),readJson('data/catalogue/registry/sources.json'),matchedCountyRows()
  ]);
  const unit=units.find(u=>u.code==='percent');
  const indicator=indicators.find(i=>i.indicator_code===INDICATOR_CODE);
  const dataset=datasets.find(d=>d.dataset_code===DATASET_CODE);
  const release=releases.find(r=>r.release_code===RELEASE_CODE);
  const catalogueSource=dataset?sources.find(s=>s.source_id===dataset.source_id):null;
  if(!unit||!indicator||!dataset||!release||!catalogueSource) throw new Error('P21 water: canonical records missing; run catalogue mode before indicators mode');
  const geoByCode=new Map(geographies.map(g=>[g.geo_code,g]));
  const oldIds=new Set(series.filter(s=>String(s.series_code).startsWith(PREFIX)).map(s=>s.series_id));
  series=series.filter(s=>!oldIds.has(s.series_id));
  observations=observations.filter(o=>!oldIds.has(o.series_id));
  Object.assign(indicator,{
    name:'Households with improved drinking-water source',short_name:'Improved water access',
    description:'Share of conventional households whose main drinking-water source is one of the eight improved categories used by KNBS in the 2019 KPHC Housing Conditions and Amenities report: protected spring, protected well, borehole/tube well, piped into dwelling, piped to yard/plot, bottled water, rain/harvested water, or public tap/standpipe.',
    unit_id:unit.unit_id,methodology_url:SOURCE_URL,active:true,lifecycle_status:'active',comparable:true,
    expected_source:'KNBS 2019 KPHC Volume IV drinking-water table + Housing Conditions and Amenities Appendix 15 / Atlas H.8',expected_source_url:SOURCE_URL,
    expected_availability_note:'Transparent same-county subtotal for all 47 counties from eight official improved-source categories. Source category shares are rounded to one decimal place; county subtotal can differ by about 0.1 point from a separately printed subtotal. No lower-level inheritance.',
    requires_sampling_uncertainty:false,ranking_allowed:true
  });
  for(const {county,source,value} of matches){
    const geo=geoByCode.get(county.geo_code);
    const code=`${PREFIX}${county.geo_code}`; const sid=uuid(`series:${code}`); const oid=uuid(`observation:${code}:2019`);
    series.push({
      series_id:sid,series_code:code,indicator_id:indicator.indicator_id,geography_id:geo.geography_id,geography_taxonomy:geo.geography_system||'administrative',boundary_version:'2012-01',frequency:'decennial',period_type:'census',unit_id:unit.unit_id,
      price_basis:'not_applicable',base_period:'',currency:'',seasonal_adjustment:'none',transformation:'level',geographic_method:'aggregated',comparability_group:'P21-KPHC-2019-IMPROVED-WATER-COUNTY',dataset_id:dataset.dataset_id,agency_id:catalogueSource.agency_id,methodology_url:SOURCE_URL,
      start_period:'2019 Census',end_period:'2019 Census',latest_observation_id:oid,observation_count:1,last_updated_at:INGESTED_AT,next_expected_release:'',status:'active',superseded_by_series_id:''
    });
    observations.push({
      observation_id:oid,series_id:sid,geography_id:geo.geography_id,boundary_version:'2012-01',period_start:'2019-08-24',period_end:'2019-08-25',period_type:'census',period_label:'2019 Census',value,
      geographic_method:'aggregated',statistical_status:'final',source_class:'official',badge:'B',source_release_id:release.release_id,source_dataset_id:dataset.dataset_id,
      source_table:SOURCE_TABLE,source_sheet:'',source_page:'Appendix 15 / Atlas H.8',source_row_label:source['County/ Sub-County'],source_url:SOURCE_URL,published_at:'',ingested_at:INGESTED_AT,
      vintage_id:uuid(`vintage:${code}:2019:1`),supersedes_observation_id:'',lower_bound:null,upper_bound:null,confidence_level:null,standard_error:null,sample_size:null,suppression_reason:'',crosswalk_id:'',
      notes:`Transparent same-county category subtotal from ${IMPROVED_FIELDS.join(', ')}. Raw Volume IV source table is committed at ${SOURCE_FILE}. Source percentages are rounded to one decimal place, so a derived county subtotal can differ by about 0.1 percentage point from the separately printed Appendix subtotal. National reconciliation anchor: ${nationalPct}%. No geographic inheritance or crosswalk.`
    });
  }
  await Promise.all([
    writeFile(path.join(root,`${dir}/indicators.json`),JSON.stringify(indicators,null,2)+'\n'),writeFile(path.join(root,`${dir}/indicators.csv`),csv(indicators)),
    writeFile(path.join(root,`${dir}/series.json`),JSON.stringify(series,null,2)+'\n'),writeFile(path.join(root,`${dir}/series.csv`),csv(series)),
    writeFile(path.join(root,`${dir}/observations.json`),JSON.stringify(observations,null,2)+'\n'),writeFile(path.join(root,`${dir}/observations.csv`),csv(observations))
  ]);
  console.log(`P21_WATER_INDICATORS_OK counties=${matches.length} badge=B national_anchor=${nationalPct}`);
}

if(mode==='catalogue') await buildCatalogue(); else await buildIndicators();
