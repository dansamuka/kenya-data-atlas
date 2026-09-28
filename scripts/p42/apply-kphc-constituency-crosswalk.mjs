import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mode=process.argv[2];
if(!['catalogue','indicators'].includes(mode)){ console.error('Usage: node scripts/p42/apply-kphc-constituency-crosswalk.mjs <catalogue|indicators>'); process.exit(2); }
const read=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const write=async(p,x)=>writeFile(path.join(root,p),JSON.stringify(x,null,2)+'\n');
const csvCell=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`;
const csv=rows=>{const fields=[...new Set(rows.flatMap(r=>Object.keys(r)))]; return [fields.join(','),...rows.map(r=>fields.map(f=>csvCell(r[f])).join(','))].join('\n')+'\n';};
async function writeRegistry(dir,name,rows){await write(`${dir}/${name}.json`,rows); await writeFile(path.join(root,`${dir}/${name}.csv`),csv(rows));}

const DATASET_CODE='DS-KDA-P42-KPHC-SUBCOUNTY-XWALK-2019';
const RELEASE_CODE='REL-KDA-P42-KPHC-SUBCOUNTY-XWALK-2019';
const SERIES_PREFIX='KDA-P42-KPHC-XWALK-2019-';
const METHOD_URL='https://github.com/dansamuka/kenya-data-atlas/blob/main/docs/methodology/P42-KPHC-SUBCOUNTY-CROSSWALK.md';
const SOURCE_URL='https://www.knbs.or.ke/2019-kenya-population-and-housing-census-reports/';
const INGESTED_AT='2026-09-28T09:25:00.000Z';
const uuid=name=>{
 const hash=createHash('sha1').update('kenya-data-atlas:p42:kphc-subcounty-crosswalk:'+name).digest();
 hash[6]=(hash[6]&0x0f)|0x50; hash[8]=(hash[8]&0x3f)|0x80;
 const h=hash.subarray(0,16).toString('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};

async function catalogue(){
 const dir='data/catalogue/registry';
 const [sources,datasets,releases]=await Promise.all([read(`${dir}/sources.json`),read(`${dir}/datasets.json`),read(`${dir}/releases.json`)]);
 const knbs=sources.find(s=>s.source_code==='KNBS-STATISTICS');
 if(!knbs) throw new Error('KNBS-STATISTICS source missing');
 let dataset=datasets.find(d=>d.dataset_code===DATASET_CODE);
 if(!dataset){
   dataset={
    dataset_id:uuid('dataset:'+DATASET_CODE),dataset_code:DATASET_CODE,source_id:knbs.source_id,
    title:'KPHC 2019 sub-county observations crosswalked to geometry-equivalent constituencies',
    description:'KNBS 2019 KPHC Volume IV percentage observations exposed at constituency level only where the source sub-county and electoral constituency pass KDA\'s frozen one-to-one geometry-equivalence gate and the complete county set reconciles to the published county control.',
    topic:'Population and housing census',geographic_coverage:['constituency'],frequency:'decennial',
    publication_status:'published',methodology_url:METHOD_URL,
    known_limitations:'The numeric observation is an official KNBS sub-county value. Constituency exposure is a KDA geographic crosswalk and therefore carries Class C provenance; it is not represented as an official KNBS constituency publication.'
   }; datasets.push(dataset);
 }
 if(!releases.some(r=>r.release_code===RELEASE_CODE)){
   releases.push({
    release_id:uuid('release:'+RELEASE_CODE),release_code:RELEASE_CODE,dataset_id:dataset.dataset_id,
    title:'P42 KPHC 2019 geometry-equivalent constituency crosswalk tranche',
    reference_period_start:'2019-08-24',reference_period_end:'2019-08-25',
    published_at:'2026-09-28',discovered_at:INGESTED_AT,ingested_at:INGESTED_AT,
    release_url:SOURCE_URL,release_status:'published',version_label:'KPHC 2019 Volume IV / KDA P42 governed crosswalk',
    release_notes:'Official KNBS percentages preserved without numeric alteration. KDA publishes a constituency series only after frozen geometry equivalence and complete-county weighted reconciliation pass.',
    supersedes_release_id:''
   });
 }
 await Promise.all([writeRegistry(dir,'datasets',datasets),writeRegistry(dir,'releases',releases)]);
 console.log('P42_KPHC_XWALK_CATALOGUE_OK');
}

async function indicators(){
 const dir='data/indicators/registry';
 const [candidate,inds,units,series0,obs0,geos,datasets,releases,sources]=await Promise.all([
   read('data/p42/kphc-constituency-candidates.json'),read(`${dir}/indicators.json`),read(`${dir}/units.json`),
   read(`${dir}/series.json`),read(`${dir}/observations.json`),read('data/geography/registry/geographies.json'),
   read('data/catalogue/registry/datasets.json'),read('data/catalogue/registry/releases.json'),read('data/catalogue/registry/sources.json')
 ]);
 const eligible=(candidate.rows??[]).filter(r=>r.promotion_candidate);
 if(eligible.length<1) throw new Error('No KPHC constituency candidates passed geometry + county reconciliation');
 const dataset=datasets.find(d=>d.dataset_code===DATASET_CODE), release=releases.find(r=>r.release_code===RELEASE_CODE), knbs=sources.find(s=>s.source_code==='KNBS-STATISTICS');
 if(!dataset||!release||!knbs) throw new Error('KPHC crosswalk catalogue dependencies missing');
 const pct=units.find(u=>['percent','percentage','pct'].includes(String(u.code).toLowerCase())||String(u.name||'').toLowerCase()==='percent');
 if(!pct) throw new Error('Percent unit missing');
 const geoByCode=new Map(geos.map(g=>[g.geo_code,g])), indByCode=new Map(inds.map(i=>[i.indicator_code,i]));
 const removed=new Set(series0.filter(s=>String(s.series_code).startsWith(SERIES_PREFIX)).map(s=>s.series_id));
 const series=series0.filter(s=>!removed.has(s.series_id)), observations=obs0.filter(o=>!removed.has(o.series_id));
 const existing=new Set(series.map(s=>[s.indicator_id,s.geography_id,s.boundary_version,s.frequency,s.unit_id,s.price_basis,s.seasonal_adjustment,s.transformation].join('|')));
 for(const r of eligible){
   const ind=indByCode.get(r.indicator_id), geo=geoByCode.get(r.matched_geo_code);
   if(!ind||!geo) throw new Error('Unknown candidate '+r.indicator_id+' '+r.matched_geo_code);
   const code=SERIES_PREFIX+r.indicator_id.replace('IND-','')+'-'+r.matched_geo_code;
   const sid=uuid('series:'+code), oid=uuid('observation:'+code+':2019'), vid=uuid('vintage:'+code+':2019:1');
   const key=[ind.indicator_id,geo.geography_id,'2012-01','decennial',pct.unit_id,'not_applicable','none','level'].join('|');
   if(existing.has(key)) throw new Error('Canonical uniqueness collision '+r.indicator_id+' '+r.matched_geo_code); existing.add(key);
   series.push({
     series_id:sid,series_code:code,indicator_id:ind.indicator_id,geography_id:geo.geography_id,
     geography_taxonomy:geo.geography_system||'electoral',boundary_version:'2012-01',frequency:'decennial',
     period_type:'point_in_time',unit_id:pct.unit_id,price_basis:'not_applicable',base_period:'',currency:'',
     seasonal_adjustment:'none',transformation:'level',geographic_method:'interpolated',
     comparability_group:'KPHC-2019-SUBCOUNTY-CONSTITUENCY-EQUIVALENCE',dataset_id:dataset.dataset_id,
     agency_id:knbs.agency_id,methodology_url:METHOD_URL,start_period:'2019',end_period:'2019',
     latest_observation_id:oid,observation_count:1,last_updated_at:INGESTED_AT,next_expected_release:'',
     status:'active',superseded_by_series_id:''
   });
   observations.push({
     observation_id:oid,series_id:sid,geography_id:geo.geography_id,boundary_version:'2012-01',
     period_start:'2019-08-24',period_end:'2019-08-25',period_type:'point_in_time',period_label:'2019 KPHC',
     value:Number(r.source_value),geographic_method:'interpolated',statistical_status:'final',
     source_class:'primary',badge:'C',source_release_id:release.release_id,source_dataset_id:dataset.dataset_id,
     source_table:r.dataset,source_sheet:'',source_page:'',source_row_label:r.source_county+' / '+r.source_subcounty,
     source_url:SOURCE_URL,published_at:'2026-09-28',ingested_at:INGESTED_AT,vintage_id:vid,supersedes_observation_id:'',
     lower_bound:null,upper_bound:null,confidence_level:null,standard_error:null,sample_size:Number(r.source_weight)||null,
     suppression_reason:'',crosswalk_id:'P42-KPHC-SUBCOUNTY-CONSTITUENCY-2019',
     notes:`Class C spatially crosswalked official KNBS value. Source geography: ${r.source_county} / ${r.source_subcounty}. KDA constituency: ${r.matched_constituency} (${r.matched_geo_code}). Geography route=${r.geography_gate_route}. ${r.geometry_gate?.passes ? `Geometry IoU=${r.geometry_gate.iou}; source coverage=${r.geometry_gate.source_area_coverage}; constituency coverage=${r.geometry_gate.constituency_area_coverage}.` : `Pinned secondary PCode crosswalk ${r.source_subcounty_pcode} -> ${r.secondary_crosswalk_gate?.target_adm2_pcode}.`} Complete county weighted reconciliation passed within 0.15 percentage points. Numeric value is unchanged from the KNBS sub-county table; only the geography mapping is derived.`
   });
 }
 series.sort((a,b)=>String(a.series_code).localeCompare(String(b.series_code))); observations.sort((a,b)=>String(a.observation_id).localeCompare(String(b.observation_id)));
 await Promise.all([writeRegistry(dir,'series',series),writeRegistry(dir,'observations',observations)]);
 console.log('P42_KPHC_XWALK_INDICATORS_OK promoted='+eligible.length);
}
if(mode==='catalogue') await catalogue(); else await indicators();
