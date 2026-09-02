import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mode=process.argv[2];
if(!['catalogue','indicators'].includes(mode))throw new Error('Usage: build-ngcdf-allocation.mjs <catalogue|indicators>');
const CONTRACT='data/p23/ngcdf-allocation-contract.json';
const REPORT_URL='https://libraryir.parliament.go.ke/bitstreams/2f057dd5-e327-4ceb-9673-286079f4be1e/download';
const ITEM_URL='https://libraryir.parliament.go.ke/items/2748fccd-b60c-47df-a1ed-f39486494a07';
const INGESTED_AT='2026-09-02T08:55:00.000Z';
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 NG-CDF allocation build: ${msg}`);};
const uuid=name=>{const b=createHash('sha1').update(`kenya-data-atlas:p23-ngcdf:${name}`).digest();b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const h=b.subarray(0,16).toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
const csvCell=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`;
const unionFields=rows=>[...new Set(rows.flatMap(r=>Object.keys(r)))];
const csv=rows=>{const f=unionFields(rows);return [f.join(','),...rows.map(r=>f.map(k=>csvCell(r[k])).join(','))].join('\n')+'\n';};
const contract=await readJson(CONTRACT);
const bandByWards=new Map(contract.derivation.ward_count_bands.map(r=>[Number(r.wards),r]));

const AGENCY_CODE='PARLIAMENT-KE';
const SOURCE_CODE='PARLIAMENT-NGCDF-BUDGET-CEILINGS';
const DATASET_CODE='DS-NGCDF-CONSTITUENCY-ALLOCATION-FY2025-26-P23';
const RELEASE_CODE='REL-NGCDF-CONSTITUENCY-ALLOCATION-FY2025-26-P23';

if(mode==='catalogue'){
  const dir='data/catalogue/registry';
  const [agencies,sources,datasets,releases]=await Promise.all(['agencies','sources','datasets','releases'].map(x=>readJson(`${dir}/${x}.json`)));
  const agency=agencies.find(a=>a.agency_code===AGENCY_CODE);
  assert(agency,'Parliament agency is missing');
  let source=sources.find(s=>s.source_code===SOURCE_CODE);
  if(!source){source={source_id:uuid(`source:${SOURCE_CODE}`),source_code:SOURCE_CODE,agency_id:agency.agency_id,name:'National Assembly NG-CDF constituency budget-ceiling reports',source_type:'official_report',landing_page_url:ITEM_URL,expected_cadence:'annual',source_priority:'critical',access_method:'official_document_repository',reuse_status:'public_official_report',licence_name:null,licence_url:null,attribution_text:'Source: Parliament of Kenya — National Assembly, NG-CDF constituency budget ceilings',assessment_status:'approved_with_conditions',assessment_note:'Use the exact Parliament-approved ward-count ceiling for the stated fiscal year. Constituency values are official derivations from canonical ward counts; no parent-geography inheritance.'};sources.push(source);}
  let dataset=datasets.find(d=>d.dataset_code===DATASET_CODE);
  if(!dataset){dataset={dataset_id:uuid(`dataset:${DATASET_CODE}`),dataset_code:DATASET_CODE,source_id:source.source_id,title:'NG-CDF constituency budget ceilings — FY2025/26',description:'Parliament-approved FY2025/26 NG-CDF constituency budget ceilings, deterministically assigned from the official ward-count bands to the canonical 290 constituencies.',topic:'Public finance',geographic_coverage:['constituency'],frequency:'annual',publication_status:'published',methodology_url:CONTRACT,known_limitations:'The report publishes exact budget ceilings by ward-count class rather than 290 repeated constituency rows. Atlas observations are therefore classified Official derived (B), using only each constituency’s canonical child-ward count.'};datasets.push(dataset);}
  if(!releases.some(r=>r.release_code===RELEASE_CODE))releases.push({release_id:uuid(`release:${RELEASE_CODE}`),release_code:RELEASE_CODE,dataset_id:dataset.dataset_id,title:'NG-CDF constituency budget ceilings — FY2025/26',reference_period_start:'2025-07-01',reference_period_end:'2026-06-30',published_at:'2025-08-06',discovered_at:INGESTED_AT,ingested_at:INGESTED_AT,release_url:REPORT_URL,release_status:'published',version_label:'FY2025/26 Parliament-approved ceilings',release_notes:'Official Parliament Table 3 ward-count bands applied deterministically to the canonical constituency→ward hierarchy. Values are budget ceilings, not disbursements or expenditure.',supersedes_release_id:''});
  for(const [name,rows] of [['agencies',agencies],['sources',sources],['datasets',datasets],['releases',releases]]){await writeFile(path.join(root,`${dir}/${name}.json`),JSON.stringify(rows,null,2)+'\n');await writeFile(path.join(root,`${dir}/${name}.csv`),csv(rows));}
  console.log('P23_NGCDF_ALLOCATION_CATALOGUE_OK source=1 dataset=1 release=1');
}else{
  const idir='data/indicators/registry',cdir='data/catalogue/registry';
  let [units,indicators,series,observations,geos,datasets,releases,sources]=await Promise.all([
    readJson(`${idir}/units.json`),readJson(`${idir}/indicators.json`),readJson(`${idir}/series.json`),readJson(`${idir}/observations.json`),readJson('data/geography/registry/geographies.json'),readJson(`${cdir}/datasets.json`),readJson(`${cdir}/releases.json`),readJson(`${cdir}/sources.json`)
  ]);
  const unit=units.find(u=>u.code==='kes_million');
  const dataset=datasets.find(d=>d.dataset_code===DATASET_CODE),release=releases.find(r=>r.release_code===RELEASE_CODE);
  const source=dataset?sources.find(s=>s.source_id===dataset.source_id):null;
  assert(unit&&dataset&&release&&source,'required unit/catalogue records missing; run catalogue mode first');
  let indicator=indicators.find(i=>i.indicator_code==='IND-NGCDF-ALLOCATION');
  if(!indicator){
    indicator={indicator_id:uuid('indicator:IND-NGCDF-ALLOCATION'),indicator_code:'IND-NGCDF-ALLOCATION',name:'NG-CDF allocation',short_name:'NG-CDF allocation',description:'Annual constituency NG-CDF budget ceiling approved by Parliament for the stated financial year.',topic:'Public finance',subtopic:'Constituency development finance',unit_id:unit.unit_id,higher_is_better:null,preferred_frequency:'annual',minimum_geo_level:'constituency',minimum_denominator:null,methodology_url:CONTRACT,comparable:true,active:true,ranking_allowed:false,requires_sampling_uncertainty:false,lifecycle_status:'active',expected_source:'Parliament of Kenya — National Assembly NG-CDF budget-ceiling report',expected_source_url:ITEM_URL,expected_availability_note:'Official derived from Parliament-approved ward-count budget-ceiling bands and canonical constituency child-ward counts; never inherit a county value.',tab:'representation',applies_to_levels:['constituency'],applies_to_geography_subset:''};
    indicators.push(indicator);
  }else Object.assign(indicator,{unit_id:unit.unit_id,description:'Annual constituency NG-CDF budget ceiling approved by Parliament for the stated financial year.',methodology_url:CONTRACT,expected_source:'Parliament of Kenya — National Assembly NG-CDF budget-ceiling report',expected_source_url:ITEM_URL,expected_availability_note:'Official derived from Parliament-approved ward-count budget-ceiling bands and canonical constituency child-ward counts; never inherit a county value.',lifecycle_status:'active',active:true,ranking_allowed:false});

  const constituencies=geos.filter(g=>g.level==='constituency');
  const wards=geos.filter(g=>g.level==='ward');
  assert(constituencies.length===290,`canonical constituency count ${constituencies.length} != 290`);
  assert(wards.length===1450,`canonical ward count ${wards.length} != 1450`);
  const wardCounts=new Map(constituencies.map(g=>[g.geography_id,0]));
  for(const ward of wards){assert(wardCounts.has(ward.parent_id),`ward ${ward.geo_code} has non-constituency/missing parent ${ward.parent_id}`);wardCounts.set(ward.parent_id,wardCounts.get(ward.parent_id)+1);}
  const distribution={};
  for(const count of wardCounts.values())distribution[count]=(distribution[count]||0)+1;
  const expected=contract.derivation.required_registry_distribution;
  for(const [wardsPer,count] of Object.entries(expected))assert(Number(distribution[wardsPer]||0)===Number(count),`ward-count distribution ${wardsPer}: got ${distribution[wardsPer]||0}, expected ${count}`);
  assert(Object.values(distribution).reduce((a,b)=>a+b,0)===290,'ward-count distribution does not cover all 290 constituencies');
  assert(Object.keys(distribution).every(k=>bandByWards.has(Number(k))),`unexpected ward-count class(es): ${Object.keys(distribution).filter(k=>!bandByWards.has(Number(k))).join(',')}`);

  const prefix='KDA-P23-NGCDF-ALLOC-';
  const oldIds=new Set(series.filter(s=>String(s.series_code).startsWith(prefix)).map(s=>s.series_id));
  series=series.filter(s=>!oldIds.has(s.series_id));observations=observations.filter(o=>!oldIds.has(o.series_id));
  const sorted=[...constituencies].sort((a,b)=>Number(a.constituency_code)-Number(b.constituency_code));
  for(const geo of sorted){
    const wardsPer=wardCounts.get(geo.geography_id),band=bandByWards.get(wardsPer);assert(band,`no official band for ${geo.geo_code} with ${wardsPer} wards`);
    const scode=`${prefix}${String(geo.constituency_code).padStart(3,'0')}`,sid=uuid(`series:${scode}`),oid=uuid(`observation:${scode}:FY2025-26`);
    series.push({series_id:sid,series_code:scode,indicator_id:indicator.indicator_id,geography_id:geo.geography_id,geography_taxonomy:geo.geography_system||'electoral',boundary_version:'2012-01',frequency:'annual',period_type:'financial_year',unit_id:unit.unit_id,price_basis:'nominal',base_period:'',currency:'KES',seasonal_adjustment:'none',transformation:'level',geographic_method:'derived',comparability_group:'NGCDF-BUDGET-CEILING-FY2025-26',dataset_id:dataset.dataset_id,agency_id:source.agency_id,methodology_url:CONTRACT,start_period:'2025-07-01',end_period:'2026-06-30',latest_observation_id:oid,observation_count:1,last_updated_at:INGESTED_AT,next_expected_release:'',status:'active',superseded_by_series_id:''});
    observations.push({observation_id:oid,series_id:sid,geography_id:geo.geography_id,boundary_version:'2012-01',period_start:'2025-07-01',period_end:'2026-06-30',period_type:'financial_year',period_label:'FY2025/26',value:Number((Number(band.allocation_kes)/1_000_000).toFixed(6)),text_value:'',geographic_method:'derived',statistical_status:'final',source_class:'official',badge:'B',source_release_id:release.release_id,source_dataset_id:dataset.dataset_id,source_table:'Table 3 — Grand allocation by number of wards per constituency',source_sheet:'',source_page:'12 of 13',source_row_label:`${wardsPer} wards per constituency — KSh ${Number(band.allocation_kes).toLocaleString('en-US')}`,source_url:REPORT_URL,published_at:'2025-08-06',ingested_at:INGESTED_AT,vintage_id:uuid(`vintage:${scode}:FY2025-26:1`),supersedes_observation_id:'',lower_bound:null,upper_bound:null,confidence_level:null,standard_error:null,sample_size:null,suppression_reason:'',crosswalk_id:'',notes:`Official derived budget ceiling. Canonical ${geo.name} has ${wardsPer} child wards; Parliament Table 3 assigns KSh ${band.allocation_kes} to every constituency in that ward-count class. No county inheritance, interpolation or imputation.`});
  }
  for(const [name,rows] of [['indicators',indicators],['series',series],['observations',observations]]){await writeFile(path.join(root,`${idir}/${name}.json`),JSON.stringify(rows,null,2)+'\n');await writeFile(path.join(root,`${idir}/${name}.csv`),csv(rows));}
  console.log(`P23_NGCDF_ALLOCATION_INDICATORS_OK observations=290 distribution=${JSON.stringify(distribution)}`);
}
