import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mode=process.argv[2];
if(!['catalogue','indicators'].includes(mode)){ console.error('Usage: node scripts/p42/apply-published-sae.mjs <catalogue|indicators>'); process.exit(2); }
const read=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const write=async(p,x)=>writeFile(path.join(root,p),JSON.stringify(x,null,2)+'\n');
const DATASET_CODE='DS-KDA-P42-PUBLISHED-SAE-2022';
const RELEASE_CODE='REL-KDA-P42-PUBLISHED-SAE-2022';
const SERIES_PREFIX='KDA-P42-SAE-2022-';
const METHOD_URL='https://github.com/dansamuka/kenya-data-atlas/blob/main/docs/methodology/P42-PUBLISHED-SAE.md';
const SOURCE_URL='https://github.com/UW-Statistics/gatesweb/releases/tag/v2025.11.20';
const INGESTED_AT='2026-09-23T11:30:00.000Z';
const uuid=name=>{
 const hash=createHash('sha1').update('kenya-data-atlas:p42:published-sae:'+name).digest();
 hash[6]=(hash[6]&0x0f)|0x50; hash[8]=(hash[8]&0x3f)|0x80;
 const h=hash.subarray(0,16).toString('hex');
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
const csvCell=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`;
const csv=rows=>{const fields=[...new Set(rows.flatMap(r=>Object.keys(r)))]; return [fields.join(','),...rows.map(r=>fields.map(f=>csvCell(r[f])).join(','))].join('\n')+'\n';};
async function writeRegistry(dir,name,rows){ await write(`${dir}/${name}.json`,rows); await writeFile(path.join(root,`${dir}/${name}.csv`),csv(rows)); }

async function catalogue(){
 const dir='data/catalogue/registry';
 const [sources,datasets,releases]=await Promise.all([read(`${dir}/sources.json`),read(`${dir}/datasets.json`),read(`${dir}/releases.json`)]);
 const kda=sources.find(s=>s.source_code==='KDA-DERIVED'); if(!kda) throw new Error('KDA-DERIVED source missing');
 let dataset=datasets.find(d=>d.dataset_code===DATASET_CODE);
 if(!dataset){ dataset={dataset_id:uuid('dataset:'+DATASET_CODE),dataset_code:DATASET_CODE,source_id:kda.source_id,title:'KDA governed promotion of published Kenya 2022 small-area estimates',description:'Strictly gated constituency estimates from the UW Statistics Multi-Indicator Small Area Estimation Resource. Promotion requires county coherence plus near-identical source/KDA polygon geometry; non-equivalent Admin-2 areas remain unavailable.',topic:'Cross-sector small-area estimation',geographic_coverage:['constituency'],frequency:'irregular',publication_status:'published',methodology_url:METHOD_URL,known_limitations:'S5 modelled estimates, not official constituency observations. Only cells passing predeclared county and geometry gates are included.'}; datasets.push(dataset); }
 if(!releases.some(r=>r.release_code===RELEASE_CODE)) releases.push({release_id:uuid('release:'+RELEASE_CODE),release_code:RELEASE_CODE,dataset_id:dataset.dataset_id,title:'P42 published Kenya SAE 2022 strictly gated constituency tranche',reference_period_start:'2022-01-01',reference_period_end:'2022-12-31',published_at:'2026-09-23',discovered_at:INGESTED_AT,ingested_at:INGESTED_AT,release_url:SOURCE_URL,release_status:'published',version_label:'UW gatesweb v2025.11.20 / KDA P42 governed promotion',release_notes:'External published Bayesian small-area estimates with 90% intervals. KDA promotes only indicators passing county coherence and constituencies passing the frozen one-to-one geometry gate.',supersedes_release_id:''});
 await Promise.all([writeRegistry(dir,'datasets',datasets),writeRegistry(dir,'releases',releases)]);
 console.log('P42_PUBLISHED_SAE_CATALOGUE_OK');
}

async function indicators(){
 const dir='data/indicators/registry';
 const [cand,inds,units,series0,obs0,geos,datasets,releases,sources]=await Promise.all([read('data/p42/published-sae-constituency-candidate.json'),read(`${dir}/indicators.json`),read(`${dir}/units.json`),read(`${dir}/series.json`),read(`${dir}/observations.json`),read('data/geography/registry/geographies.json'),read('data/catalogue/registry/datasets.json'),read('data/catalogue/registry/releases.json'),read('data/catalogue/registry/sources.json')]);
 if(cand.status!=='candidate_only_not_yet_promoted'||!Array.isArray(cand.candidates)||cand.candidates.length<1) throw new Error('No validated P42 published-SAE candidates');
 const dataset=datasets.find(d=>d.dataset_code===DATASET_CODE), release=releases.find(r=>r.release_code===RELEASE_CODE), kda=sources.find(s=>s.source_code==='KDA-DERIVED');
 if(!dataset||!release||!kda) throw new Error('P42 published-SAE catalogue dependencies missing');
 const pctUnit=units.find(u=>['percent','percentage','pct'].includes(String(u.code).toLowerCase())||String(u.name||'').toLowerCase()==='percent');
 if(!pctUnit) throw new Error('Percent unit missing');
 const geoByCode=new Map(geos.map(g=>[g.geo_code,g])), indByCode=new Map(inds.map(i=>[i.indicator_code,i]));
 const removed=new Set(series0.filter(s=>String(s.series_code).startsWith(SERIES_PREFIX)).map(s=>s.series_id));
 const series=series0.filter(s=>!removed.has(s.series_id)), observations=obs0.filter(o=>!removed.has(o.series_id));
 const existing=new Set(series.map(s=>[s.indicator_id,s.geography_id,s.boundary_version,s.frequency,s.unit_id,s.price_basis,s.seasonal_adjustment,s.transformation].join('|')));
 for(const r of cand.candidates){
   const ind=indByCode.get(r.indicator_id), geo=geoByCode.get(r.geo_code); if(!ind||!geo) throw new Error('Unknown candidate identity '+r.indicator_id+' '+r.geo_code);
   const code=SERIES_PREFIX+r.indicator_id.replace('IND-','')+'-'+r.geo_code;
   const sid=uuid('series:'+code), oid=uuid('observation:'+code+':2022'), vid=uuid('vintage:'+code+':2022:1');
   const key=[ind.indicator_id,geo.geography_id,'2012-01','irregular',pctUnit.unit_id,'not_applicable','none','level'].join('|');
   if(existing.has(key)) throw new Error('Canonical series uniqueness collision '+r.indicator_id+' '+r.geo_code); existing.add(key);
   series.push({series_id:sid,series_code:code,indicator_id:ind.indicator_id,geography_id:geo.geography_id,geography_taxonomy:geo.geography_system||'electoral',boundary_version:'2012-01',frequency:'irregular',period_type:'annual',unit_id:pctUnit.unit_id,price_basis:'not_applicable',base_period:'',currency:'',seasonal_adjustment:'none',transformation:'level',geographic_method:'modelled',comparability_group:'P42-UW-SAE-2022-STRICT-GEOMETRY',dataset_id:dataset.dataset_id,agency_id:kda.agency_id,methodology_url:METHOD_URL,start_period:'2022',end_period:'2022',latest_observation_id:oid,observation_count:1,last_updated_at:INGESTED_AT,next_expected_release:'',status:'active',superseded_by_series_id:''});
   observations.push({observation_id:oid,series_id:sid,geography_id:geo.geography_id,boundary_version:'2012-01',period_start:'2022-01-01',period_end:'2022-12-31',period_type:'annual',period_label:'2022',value:r.value,geographic_method:'modelled',statistical_status:'estimated',source_class:'derived',badge:'D',source_release_id:release.release_id,source_dataset_id:dataset.dataset_id,source_table:'UW Statistics Multi-Indicator Small Area Estimation Resource, Kenya 2022 Admin-2',source_sheet:'',source_page:'',source_row_label:r.source_parent+'_'+r.source_region,source_url:SOURCE_URL,published_at:'2026-09-23',ingested_at:INGESTED_AT,vintage_id:vid,supersedes_observation_id:'',lower_bound:r.lower_bound,upper_bound:r.upper_bound,confidence_level:90,standard_error:null,sample_size:null,suppression_reason:'',crosswalk_id:'P42-PUBLISHED-SAE-GEOM-001',notes:`S5 modelled estimate. Published external small-area estimate. County coherence passed predeclared P42 gate. Direct geography assignment permitted only because polygon IoU=${r.iou}, source coverage=${r.source_area_covered}, KDA coverage=${r.kda_area_covered}; all meet frozen thresholds. Excluded from official-only view.`});
 }
 series.sort((a,b)=>String(a.series_code).localeCompare(String(b.series_code))); observations.sort((a,b)=>String(a.observation_id).localeCompare(String(b.observation_id)));
 await Promise.all([writeRegistry(dir,'series',series),writeRegistry(dir,'observations',observations)]);
 console.log(`P42_PUBLISHED_SAE_INDICATORS_OK promoted=${cand.candidates.length}`);
}
if(mode==='catalogue') await catalogue(); else await indicators();
