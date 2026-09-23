import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mode=process.argv[2];
if(!['catalogue','indicators'].includes(mode)){
  console.error('Usage: node scripts/p42/apply-worldpop-population.mjs <catalogue|indicators>');
  process.exit(2);
}
const read=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const write=async(p,x)=>writeFile(path.join(root,p),JSON.stringify(x,null,2)+'\n');
const INGESTED_AT='2026-09-22T19:33:44.000Z';
const DATASET_CODE='DS-KDA-P42-WORLDPOP-POP-2019';
const RELEASE_CODE='REL-KDA-P42-WORLDPOP-POP-2019';
const SERIES_PREFIX='KDA-P42-POP-2019-';
const METHOD_URL='https://github.com/dansamuka/kenya-data-atlas/blob/main/docs/methodology/P42-WORLDPOP-POPULATION.md';
const WORLDPOP_URL='https://hub.worldpop.org/geodata/summary?id=54834';
const KNBS_URL='https://www.knbs.or.ke/2019-kenya-population-and-housing-census-results/';
const uuid=name=>{
  const hash=createHash('sha1').update('kenya-data-atlas:p42:worldpop-population:'+name).digest();
  hash[6]=(hash[6]&0x0f)|0x50; hash[8]=(hash[8]&0x3f)|0x80;
  const h=hash.subarray(0,16).toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
const csvCell=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`;
const csv=rows=>{
  const fields=[...new Set(rows.flatMap(r=>Object.keys(r)))];
  return [fields.join(','),...rows.map(r=>fields.map(f=>csvCell(r[f])).join(','))].join('\n')+'\n';
};
async function writeRegistry(dir,name,rows){
  await write(`${dir}/${name}.json`,rows);
  await writeFile(path.join(root,`${dir}/${name}.csv`),csv(rows));
}

async function buildCatalogue(){
  const dir='data/catalogue/registry';
  const [sources,datasets,releases]=await Promise.all([
    read(`${dir}/sources.json`),read(`${dir}/datasets.json`),read(`${dir}/releases.json`)
  ]);
  const kda=sources.find(s=>s.source_code==='KDA-DERIVED');
  if(!kda) throw new Error('P42 WorldPop: KDA-DERIVED catalogue source missing');
  let dataset=datasets.find(d=>d.dataset_code===DATASET_CODE);
  if(!dataset){
    dataset={
      dataset_id:uuid('dataset:'+DATASET_CODE),
      dataset_code:DATASET_CODE,
      source_id:kda.source_id,
      title:'KDA 2019 county-constrained WorldPop local population model',
      description:'Constituency and ward population estimates for the 2019 census reference period. Official KNBS county totals are preserved exactly; WorldPop R2024B 2019 100m constrained population provides the within-county spatial allocation and the unconstrained variant provides a model-structure sensitivity envelope.',
      topic:'Demography',
      geographic_coverage:['constituency','ward'],
      frequency:'decennial',
      publication_status:'published',
      methodology_url:METHOD_URL,
      known_limitations:'S5 modelled estimates, not census counts published by KNBS at these current KDA geographies. The WorldPop constrained/unconstrained difference is a model-structure sensitivity envelope, not a statistical confidence interval. Every child allocation is constrained to its official KNBS 2019 county total.'
    };
    datasets.push(dataset);
  }
  let release=releases.find(r=>r.release_code===RELEASE_CODE);
  if(!release){
    release={
      release_id:uuid('release:'+RELEASE_CODE),
      release_code:RELEASE_CODE,
      dataset_id:dataset.dataset_id,
      title:'P42 WorldPop county-constrained 2019 local population estimates',
      reference_period_start:'2019-08-24',
      reference_period_end:'2019-08-25',
      published_at:'2026-09-22',
      discovered_at:INGESTED_AT,
      ingested_at:INGESTED_AT,
      release_url:METHOD_URL,
      release_status:'published',
      version_label:'P42-W1-POP-001 / WorldPop R2024B v1',
      release_notes:'Derived by Kenya Data Atlas. Numeric controls: KNBS 2019 KPHC official county populations ('+KNBS_URL+'). Spatial allocation: WorldPop Global 2015–2030 R2024B 2019 100m constrained surface; sensitivity: corresponding unconstrained surface ('+WORLDPOP_URL+'). WorldPop data are CC BY 4.0.',
      supersedes_release_id:''
    };
    releases.push(release);
  }
  await Promise.all([writeRegistry(dir,'datasets',datasets),writeRegistry(dir,'releases',releases)]);
  console.log('P42_WORLDPOP_CATALOGUE_OK dataset='+DATASET_CODE+' release='+RELEASE_CODE);
}

async function buildIndicators(){
  const dir='data/indicators/registry';
  const [candidate,indicators,units,series0,observations0,geographies,datasets,releases,sources]=await Promise.all([
    read('data/p42/worldpop-population-candidate.json'),
    read(`${dir}/indicators.json`),read(`${dir}/units.json`),
    read(`${dir}/series.json`),read(`${dir}/observations.json`),
    read('data/geography/registry/geographies.json'),
    read('data/catalogue/registry/datasets.json'),read('data/catalogue/registry/releases.json'),
    read('data/catalogue/registry/sources.json')
  ]);
  if(candidate.status!=='candidate_only_not_yet_promoted') throw new Error('P42 WorldPop: candidate must remain candidate-only before apply');
  const eligible=candidate.rows.filter(r=>r.publish_eligible);
  if(eligible.length!==1740 || candidate.summary?.promotion_eligible_cells!==1740){
    throw new Error(`P42 WorldPop: expected all 1,740 candidates to pass; got ${eligible.length}`);
  }
  const indicator=indicators.find(i=>i.indicator_code==='IND-POPULATION');
  const unit=units.find(u=>u.code==='persons');
  const dataset=datasets.find(d=>d.dataset_code===DATASET_CODE);
  const release=releases.find(r=>r.release_code===RELEASE_CODE);
  const kdaSource=sources.find(s=>s.source_code==='KDA-DERIVED');
  if(!indicator||!unit||!dataset||!release||!kdaSource) throw new Error('P42 WorldPop: canonical dependencies missing');
  if(!['approved','published'].includes(dataset.publication_status)) throw new Error('P42 WorldPop: dataset is not publication-cleared');
  const geoById=new Map(geographies.map(g=>[g.geography_id,g]));

  // Idempotent rebuild: remove this tranche then regenerate it from the frozen candidate.
  const removedSeriesIds=new Set(series0.filter(s=>String(s.series_code).startsWith(SERIES_PREFIX)).map(s=>s.series_id));
  const series=series0.filter(s=>!removedSeriesIds.has(s.series_id));
  const observations=observations0.filter(o=>!removedSeriesIds.has(o.series_id));

  const existingKeys=new Set(series.map(s=>[
    s.indicator_id,s.geography_id,s.boundary_version,s.frequency,s.unit_id,s.price_basis,s.seasonal_adjustment,s.transformation
  ].join('|')));

  for(const r of eligible){
    const geo=geoById.get(r.geography_id);
    if(!geo) throw new Error('P42 WorldPop: unknown geography '+r.geography_id);
    if(geo.geo_code!==r.geo_code || geo.level!==r.level) throw new Error('P42 WorldPop: candidate geography mismatch '+r.geo_code);
    const code=SERIES_PREFIX+r.geo_code;
    const sid=uuid('series:'+code);
    const oid=uuid('observation:'+code+':2019-08-24:2019-08-25');
    const vid=uuid('vintage:'+code+':2019-08-24:1');
    const uniqueness=[
      indicator.indicator_id,geo.geography_id,'2012-01','decennial',unit.unit_id,'not_applicable','none','level'
    ].join('|');
    if(existingKeys.has(uniqueness)) throw new Error('P42 WorldPop: an existing population series already owns the canonical uniqueness key for '+r.geo_code);
    existingKeys.add(uniqueness);
    series.push({
      series_id:sid,series_code:code,indicator_id:indicator.indicator_id,
      geography_id:geo.geography_id,geography_taxonomy:geo.geography_system||'electoral',
      boundary_version:'2012-01',frequency:'decennial',period_type:'point_in_time',unit_id:unit.unit_id,
      price_basis:'not_applicable',base_period:'',currency:'',seasonal_adjustment:'none',transformation:'level',
      geographic_method:'modelled',comparability_group:'POP-2019-KNBS-CONTROLLED-WORLDPOP-R2024B',
      dataset_id:dataset.dataset_id,agency_id:kdaSource.agency_id,methodology_url:METHOD_URL,
      start_period:'Census night, 24–25 August 2019',end_period:'Census night, 24–25 August 2019',
      latest_observation_id:oid,observation_count:1,last_updated_at:INGESTED_AT,next_expected_release:'',
      status:'active',superseded_by_series_id:''
    });
    observations.push({
      observation_id:oid,series_id:sid,geography_id:geo.geography_id,boundary_version:'2012-01',
      period_start:'2019-08-24',period_end:'2019-08-25',period_type:'point_in_time',
      period_label:'Census night, 24–25 August 2019',
      value:r.value,geographic_method:'modelled',statistical_status:'estimated',source_class:'derived',badge:'D',
      source_release_id:release.release_id,source_dataset_id:dataset.dataset_id,
      source_table:'KNBS 2019 county control + WorldPop R2024B 2019 100m constrained/unconstrained spatial allocation',
      source_sheet:'',source_page:'',source_row_label:r.geo_code,
      source_url:METHOD_URL,published_at:'2026-09-22',ingested_at:INGESTED_AT,
      vintage_id:vid,supersedes_observation_id:'',
      lower_bound:r.lower_bound,upper_bound:r.upper_bound,confidence_level:null,standard_error:null,sample_size:null,
      suppression_reason:'',crosswalk_id:'P42-W1-POP-001',
      notes:`S5 modelled estimate. Official KNBS 2019 county population is preserved exactly. Central within-county allocation uses WorldPop R2024B 2019 constrained 100m raster; model-structure sensitivity uses the corresponding unconstrained raster. Sensitivity envelope ${r.lower_bound}–${r.upper_bound} persons; constrained-vs-unconstrained spread ${r.model_structure_spread_pct}%. This envelope is not a statistical confidence interval. WorldPop: ${WORLDPOP_URL}; KNBS control: ${KNBS_URL}`
    });
  }

  series.sort((a,b)=>String(a.series_code).localeCompare(String(b.series_code)));
  observations.sort((a,b)=>String(a.observation_id).localeCompare(String(b.observation_id)));
  await Promise.all([writeRegistry(dir,'series',series),writeRegistry(dir,'observations',observations)]);
  console.log(`P42_WORLDPOP_INDICATORS_OK promoted=${eligible.length} series_total=${series.length} observations_total=${observations.length}`);
}

if(mode==='catalogue') await buildCatalogue();
else await buildIndicators();
