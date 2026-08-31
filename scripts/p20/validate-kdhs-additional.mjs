import fs from 'node:fs';

const json = file => JSON.parse(fs.readFileSync(file,'utf8'));
const assert = (ok,message) => { if(!ok) throw new Error(`P20 KDHS validation: ${message}`); };

const source = json('data/p20/source/kdhs-2022-additional-county.json');
const geographies = json('data/geography/registry/geographies.json');
const indicators = json('data/indicators/registry/indicators.json');
const series = json('data/indicators/registry/series.json');
const observations = json('data/indicators/registry/observations.json');
const datasets = json('data/catalogue/registry/datasets.json');
const summary = json('data/completeness/summary.json');
const ledger = json('data/completeness/slot-ledger.json');

const counties = geographies.filter(row=>row.level==='county').sort((a,b)=>String(a.geo_code).localeCompare(String(b.geo_code)));
const sourceByGeo = new Map((source.counties||[]).map(row=>[row.geo_code,row]));
const indicatorByCode = new Map(indicators.map(row=>[row.indicator_code,row]));
const obsById = new Map(observations.map(row=>[row.observation_id,row]));
const datasetById = new Map(datasets.map(row=>[row.dataset_id,row]));
const seriesByGeoIndicator = new Map();
for(const row of series){
  const key=`${row.geography_id}|${row.indicator_id}`;
  if(!seriesByGeoIndicator.has(key)) seriesByGeoIndicator.set(key,[]);
  seriesByGeoIndicator.get(key).push(row);
}
function latest(county,code){
  const indicator=indicatorByCode.get(code); if(!indicator) return null;
  return (seriesByGeoIndicator.get(`${county.geography_id}|${indicator.indicator_id}`)||[])
    .map(row=>({series:row,obs:obsById.get(row.latest_observation_id)})).filter(pair=>pair.obs)
    .sort((a,b)=>String(b.obs.period_end||b.obs.period_start).localeCompare(String(a.obs.period_end||a.obs.period_start)))[0]||null;
}

const targets=[
  {code:'IND-TEENAGE-PREGNANCY',value:'teenage_pregnancy_pct',n:'teenage_pregnancy_sample_size',prefix:'KDA-P20-KDHS-TEENAGE-PREGNANCY-',table:'Key Indicators Report Table 6C — Teenage pregnancy by county'},
  {code:'IND-HOME-BIRTH-RATE',value:'home_birth_pct',n:'home_birth_sample_size',prefix:'KDA-P20-KDHS-HOME-BIRTH-',table:'Final Report Volume 1 Table 9.7C — Place of delivery by county'}
];

try{
  assert(counties.length===47,`expected 47 counties, found ${counties.length}`);
  assert(sourceByGeo.size===47,`source fixture must contain 47 unique counties, found ${sourceByGeo.size}`);
  let count=0;
  for(const target of targets){
    const indicator=indicatorByCode.get(target.code);
    assert(indicator?.lifecycle_status==='active'&&indicator.active===true,`${target.code} must be active`);
    assert(indicator.requires_sampling_uncertainty===true,`${target.code} must require survey uncertainty metadata`);
    assert(indicator.ranking_allowed===false,`${target.code} point-estimate ranking must remain withheld`);
    for(const county of counties){
      const src=sourceByGeo.get(county.geo_code);
      const pair=latest(county,target.code);
      assert(pair,`${target.code} ${county.geo_code}: observation missing`);
      assert(Number(pair.obs.value)===Number(src?.[target.value]),`${target.code} ${county.geo_code}: value diverges from reviewed KDHS table`);
      assert(Number(pair.obs.sample_size)===Number(src?.[target.n])&&Number(pair.obs.sample_size)>0,`${target.code} ${county.geo_code}: source-reported denominator missing/divergent`);
      assert(pair.obs.badge==='A'&&pair.obs.geographic_method==='direct',`${target.code} ${county.geo_code}: must remain official direct evidence`);
      assert(pair.obs.source_table===target.table,`${target.code} ${county.geo_code}: source-table metadata mismatch`);
      assert(String(pair.series.series_code).startsWith(target.prefix),`${target.code} ${county.geo_code}: P20 KDHS namespace mismatch`);
      const dataset=datasetById.get(pair.series.dataset_id);
      assert(dataset?.dataset_code==='DS-KNBS-KDHS-2022-COUNTY',`${target.code} ${county.geo_code}: canonical KDHS dataset mismatch`);
      const ledgerRow=ledger.rows.find(row=>row.level==='county'&&row.geo_code===county.geo_code&&row.indicator_code===target.code);
      assert(ledgerRow?.resolved===true,`${target.code} ${county.geo_code}: completeness slot must be resolved`);
      count++;
    }
  }
  assert(count===94,`expected 94 promoted observations, got ${count}`);
  console.log('P20_KDHS_47X2_RECONCILIATION_OK promoted=94');
  console.log('P20_KDHS_SURVEY_PRECISION_OK precision=published_weighted_denominator');
  console.log('P20_KDHS_NO_RANKING_NO_INHERITANCE_OK');

  assert(summary.total_slots===20115,`governed slot count changed: ${summary.total_slots}`);
  assert(summary.resolved_slots===2915,`expected 2,915 resolved slots, got ${summary.resolved_slots}`);
  assert(summary.unresolved_slots===17200,`expected 17,200 unresolved slots, got ${summary.unresolved_slots}`);
  assert(summary.by_completion_phase?.P20===470,`expected 470 P20 slots remaining, got ${summary.by_completion_phase?.P20}`);
  assert(summary.unknown_missing===0,'unknown_missing must remain zero');
  console.log('P20_KDHS_COMPLETENESS_OK resolved=2915 p20_remaining=470');
  console.log('P20_KDHS_ADDITIONAL_ALL_OK');
}catch(error){
  console.error(error.message||error);
  process.exit(1);
}
