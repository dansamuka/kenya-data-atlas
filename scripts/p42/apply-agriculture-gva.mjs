import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mode=process.argv[2];
if(!['catalogue','indicators'].includes(mode)){
  console.error('Usage: node scripts/p42/apply-agriculture-gva.mjs <catalogue|indicators>');
  process.exit(2);
}
const read=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const write=async(p,x)=>writeFile(path.join(root,p),JSON.stringify(x,null,2)+'\n');
const INGESTED_AT='2026-09-23T12:13:12.000Z';
const DATASET_CODE='DS-KDA-P42-AGRI-GVA-2024';
const RELEASE_CODE='REL-KDA-P42-AGRI-GVA-2024';
const SERIES_PREFIX='KDA-P42-AGRI-GVA-2024-';
const METHOD_URL='https://github.com/dansamuka/kenya-data-atlas/blob/main/docs/methodology/P42-AGRICULTURE-GVA.md';
const WB_URL='https://datacatalog.worldbank.org/search/dataset/0061507/global-gridded-agricultural-gross-domestic-product-aggdp';
const KNBS_URL='https://www.knbs.or.ke/wp-content/uploads/2025/12/2025-Gross-County-Product.pdf';

const uuid=name=>{
  const hash=createHash('sha1').update('kenya-data-atlas:p42:agriculture-gva:'+name).digest();
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
  if(!kda) throw new Error('P42 Agriculture GVA: KDA-DERIVED source missing');
  let dataset=datasets.find(d=>d.dataset_code===DATASET_CODE);
  if(!dataset){
    dataset={
      dataset_id:uuid('dataset:'+DATASET_CODE),
      dataset_code:DATASET_CODE,
      source_id:kda.source_id,
      title:'KDA 2024 county-constrained Agriculture GVA local model',
      description:'Constituency and ward Agriculture GVA estimates at current 2024 prices. Official KNBS 2024 county Agriculture GVA controls are preserved in the full candidate allocation; World Bank gridded AgGDP supplies within-county central spatial weights. The sum of crop, livestock, fish and forest priors supplies a model-structure sensitivity specification.',
      topic:'Economy',
      geographic_coverage:['constituency','ward'],
      frequency:'annual',
      publication_status:'published',
      methodology_url:METHOD_URL,
      known_limitations:'S5 modelled estimates, not official constituency or ward economic accounts. The underlying economic spatial prior is circa 2010 and is used only for within-county allocation of official 2024 controls. Cells with model-structure spread above 50% remain unavailable. Lower/upper bounds are a model-structure sensitivity envelope, not a statistical confidence interval.'
    };
    datasets.push(dataset);
  }
  if(!releases.some(r=>r.release_code===RELEASE_CODE)){
    releases.push({
      release_id:uuid('release:'+RELEASE_CODE),
      release_code:RELEASE_CODE,
      dataset_id:dataset.dataset_id,
      title:'P42 county-constrained 2024 Agriculture GVA local estimates',
      reference_period_start:'2024-01-01',
      reference_period_end:'2024-12-31',
      published_at:'2026-09-23',
      discovered_at:INGESTED_AT,
      ingested_at:INGESTED_AT,
      release_url:METHOD_URL,
      release_status:'published',
      version_label:'P42-ECO-AGGVA-001',
      release_notes:'Derived by Kenya Data Atlas. Official controls: KNBS 2024 Agriculture GVA. Central spatial prior: World Bank Global Gridded Agricultural GDP, circa 2010. Sensitivity: summed crop/livestock/fish/forest input priors. Source rasters are CC BY 4.0; source rasters are not committed to KDA.',
      supersedes_release_id:''
    });
  }
  await Promise.all([writeRegistry(dir,'datasets',datasets),writeRegistry(dir,'releases',releases)]);
  console.log('P42_AGRICULTURE_GVA_CATALOGUE_OK');
}

async function buildIndicators(){
  const dir='data/indicators/registry';
  const [cand,indicators,units,series0,obs0,geos,datasets,releases,sources]=await Promise.all([
    read('data/p42/agriculture-gva-candidate.json'),
    read(`${dir}/indicators.json`),read(`${dir}/units.json`),
    read(`${dir}/series.json`),read(`${dir}/observations.json`),
    read('data/geography/registry/geographies.json'),
    read('data/catalogue/registry/datasets.json'),read('data/catalogue/registry/releases.json'),
    read('data/catalogue/registry/sources.json')
  ]);
  if(cand.status!=='candidate_only_not_yet_promoted') throw new Error('P42 Agriculture GVA: candidate status');
  const eligible=cand.rows.filter(r=>r.publish_eligible);
  if(eligible.length!==1661) throw new Error(`P42 Agriculture GVA: expected 1661 eligible cells, got ${eligible.length}`);
  const indicator=indicators.find(i=>i.indicator_code==='IND-AGRICULTURE-GVA');
  const unit=units.find(u=>u.code==='kes_million');
  const dataset=datasets.find(d=>d.dataset_code===DATASET_CODE);
  const release=releases.find(r=>r.release_code===RELEASE_CODE);
  const kda=sources.find(s=>s.source_code==='KDA-DERIVED');
  if(!indicator||!unit||!dataset||!release||!kda) throw new Error('P42 Agriculture GVA: canonical dependency missing');
  const geoByCode=new Map(geos.map(g=>[g.geo_code,g]));

  const removedSeriesIds=new Set(series0.filter(s=>String(s.series_code).startsWith(SERIES_PREFIX)).map(s=>s.series_id));
  const series=series0.filter(s=>!removedSeriesIds.has(s.series_id));
  const observations=obs0.filter(o=>!removedSeriesIds.has(o.series_id));
  const existingKeys=new Set(series.map(s=>[
    s.indicator_id,s.geography_id,s.boundary_version,s.frequency,s.unit_id,s.price_basis,s.seasonal_adjustment,s.transformation
  ].join('|')));

  for(const r of eligible){
    const geo=geoByCode.get(r.geo_code);
    if(!geo||geo.level!==r.level) throw new Error('P42 Agriculture GVA: geography mismatch '+r.geo_code);
    const code=SERIES_PREFIX+r.geo_code;
    const sid=uuid('series:'+code);
    const oid=uuid('observation:'+code+':2024');
    const vid=uuid('vintage:'+code+':2024:1');
    const uniqueness=[
      indicator.indicator_id,geo.geography_id,'2012-01','annual',unit.unit_id,'nominal','none','level'
    ].join('|');
    if(existingKeys.has(uniqueness)) throw new Error('P42 Agriculture GVA: canonical uniqueness collision '+r.geo_code);
    existingKeys.add(uniqueness);
    series.push({
      series_id:sid,series_code:code,indicator_id:indicator.indicator_id,
      geography_id:geo.geography_id,geography_taxonomy:geo.geography_system||'electoral',
      boundary_version:'2012-01',frequency:'annual',period_type:'calendar_year',unit_id:unit.unit_id,
      price_basis:'nominal',base_period:'',currency:'',seasonal_adjustment:'none',transformation:'level',
      geographic_method:'modelled',comparability_group:'P42-AGRI-GVA-2024-WB-AGGDP',
      dataset_id:dataset.dataset_id,agency_id:kda.agency_id,methodology_url:METHOD_URL,
      start_period:'2024',end_period:'2024',latest_observation_id:oid,observation_count:1,
      last_updated_at:INGESTED_AT,next_expected_release:'',status:'active',superseded_by_series_id:''
    });
    observations.push({
      observation_id:oid,series_id:sid,geography_id:geo.geography_id,boundary_version:'2012-01',
      period_start:'2024-01-01',period_end:'2024-12-31',period_type:'calendar_year',period_label:'2024',
      value:r.value,geographic_method:'modelled',statistical_status:'estimated',source_class:'derived',badge:'D',
      source_release_id:release.release_id,source_dataset_id:dataset.dataset_id,
      source_table:'KNBS 2024 county Agriculture GVA control + World Bank gridded AgGDP spatial allocation',
      source_sheet:'',source_page:'',source_row_label:r.geo_code,source_url:METHOD_URL,
      published_at:'2026-09-23',ingested_at:INGESTED_AT,vintage_id:vid,supersedes_observation_id:'',
      lower_bound:r.lower_bound,upper_bound:r.upper_bound,confidence_level:null,standard_error:null,sample_size:null,
      suppression_reason:'',crosswalk_id:'P42-ECO-AGGVA-001',
      notes:`S5 modelled Agriculture GVA estimate at current 2024 prices. Official KNBS county control is allocated within county using World Bank AgGDP central weights. Sensitivity allocation uses the sum of crop, livestock, fish and forest priors. Model-structure spread=${r.model_structure_spread_pct}%. Envelope ${r.lower_bound}–${r.upper_bound} KES mn is not a confidence interval. Cells above the frozen 50% spread gate are not published. World Bank: ${WB_URL}; KNBS control: ${KNBS_URL}`
    });
  }
  series.sort((a,b)=>String(a.series_code).localeCompare(String(b.series_code)));
  observations.sort((a,b)=>String(a.observation_id).localeCompare(String(b.observation_id)));
  await Promise.all([writeRegistry(dir,'series',series),writeRegistry(dir,'observations',observations)]);
  console.log(`P42_AGRICULTURE_GVA_INDICATORS_OK promoted=${eligible.length}`);
}

if(mode==='catalogue') await buildCatalogue();
else await buildIndicators();
