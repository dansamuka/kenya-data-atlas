import fs from 'node:fs';
import path from 'node:path';
import { buildMart, loadCanonical } from './build-mart.mjs';

const root=process.cwd();
const readJson=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,message)=>{if(!ok)throw new Error(`CountyIQ mart validation: ${message}`);};
const BADGES=new Set(['A','B','C','D','E']);
const CORE=['IND-GCP-CURRENT','IND-COUNTY-BUDGET-TOTAL','IND-COUNTY-EXPENDITURE-TOTAL','IND-COUNTY-BUDGET-ABSORPTION','IND-COUNTY-DEVELOPMENT-ABSORPTION','IND-REGISTERED-VOTERS'];

try{
  const canonical=loadCanonical(root);
  const committed=readJson('data/countyiq/county-summary.json');
  const rebuilt=buildMart(canonical);
  const rebuiltAgain=buildMart(canonical);
  assert(JSON.stringify(rebuilt)===JSON.stringify(rebuiltAgain),'builder is not deterministic across repeated runs');
  assert(JSON.stringify(committed)===JSON.stringify(rebuilt),'committed county-summary.json diverges from deterministic registry build');
  assert(committed.meta?.schema_version==='kda.countyiq.county-summary.v1','unexpected schema version');
  assert(committed.meta?.county_count===47,'meta county_count must equal 47');
  assert(Array.isArray(committed.counties)&&committed.counties.length===47,'mart must contain exactly 47 counties');
  assert(new Set(committed.counties.map(c=>c.geography?.geo_code)).size===47,'county geo_codes must be unique');
  console.log('COUNTYIQ_MART_47_COUNTIES_OK');

  const geoById=new Map(canonical.geographies.map(g=>[g.geography_id,g]));
  const seriesById=new Map(canonical.series.map(s=>[s.series_id,s]));
  const obsById=new Map(canonical.observations.map(o=>[o.observation_id,o]));
  const datasetById=new Map(canonical.datasets.map(d=>[d.dataset_id,d]));
  const indicatorById=new Map(canonical.indicators.map(i=>[i.indicator_id,i]));
  let metricCount=0,historyCount=0,rankable=0;
  for(const county of committed.counties){
    const geo=geoById.get(county.geography?.geography_id);
    assert(geo?.level==='county',`${county.geography?.geo_code}: geography is not canonical county`);
    assert(geo.geo_code===county.geography.geo_code,`${county.geography.geo_code}: geography id/code mismatch`);
    for(const code of CORE)assert(county.metrics?.[code]?.status==='active',`${county.geography.geo_code}: missing core metric ${code}`);
    for(const [code,m] of Object.entries(county.metrics||{})){
      metricCount+=1;
      assert(m.indicator_code===code,`${county.geography.geo_code}/${code}: key/code mismatch`);
      const indicator=indicatorById.get(m.indicator_id);assert(indicator?.indicator_code===code,`${county.geography.geo_code}/${code}: unknown indicator`);
      assert(m.status==='active',`${county.geography.geo_code}/${code}: mart may surface active metrics only`);
      assert(m.latest?.observation_id,`${county.geography.geo_code}/${code}: latest observation id missing`);
      assert(m.latest?.series_id,`${county.geography.geo_code}/${code}: latest series id missing`);
      assert(m.latest?.period_label,`${county.geography.geo_code}/${code}: period missing`);
      assert(m.latest?.unit,`${county.geography.geo_code}/${code}: unit missing`);
      assert(BADGES.has(m.latest?.provenance?.badge),`${county.geography.geo_code}/${code}: invalid provenance badge`);
      assert(Boolean(m.latest?.provenance?.source_url),`${county.geography.geo_code}/${code}: source URL missing`);
      assert(m.latest?.provenance?.dataset_id,`${county.geography.geo_code}/${code}: dataset id missing`);
      assert(datasetById.get(m.latest.provenance.dataset_id)?.publication_status==='published',`${county.geography.geo_code}/${code}: source dataset is not published`);
      const s=seriesById.get(m.latest.series_id),o=obsById.get(m.latest.observation_id);
      assert(s&&o,`${county.geography.geo_code}/${code}: canonical series/observation not found`);
      assert(s.geography_id===geo.geography_id,`${county.geography.geo_code}/${code}: series geography mismatch`);
      assert(s.indicator_id===m.indicator_id,`${county.geography.geo_code}/${code}: series indicator mismatch`);
      assert(o.series_id===s.series_id,`${county.geography.geo_code}/${code}: observation series mismatch`);
      assert(JSON.stringify(o.value??null)===JSON.stringify(m.latest.value??null),`${county.geography.geo_code}/${code}: latest value diverges from canonical observation`);
      assert(String(o.period_label||o.period_start||'')===m.latest.period_label,`${county.geography.geo_code}/${code}: latest period diverges from canonical observation`);
      assert(o.inherited!==true&&String(o.geographic_method||'').toLowerCase()!=='inherited',`${county.geography.geo_code}/${code}: inherited value surfaced`);
      assert(Array.isArray(m.history)&&m.history.length>=1,`${county.geography.geo_code}/${code}: history is empty`);
      for(const h of m.history){
        historyCount+=1;const ho=obsById.get(h.observation_id),hs=seriesById.get(h.series_id);
        assert(ho&&hs,`${county.geography.geo_code}/${code}: history record is not canonical`);
        assert(hs.geography_id===geo.geography_id&&hs.indicator_id===m.indicator_id,`${county.geography.geo_code}/${code}: history geography/indicator mismatch`);
        assert(BADGES.has(h.provenance?.badge)&&Boolean(h.provenance?.source_url),`${county.geography.geo_code}/${code}: history provenance incomplete`);
      }
      if(m.eligibility?.ranking_allowed){rankable+=1;assert(m.ranking?.eligible===true,`${county.geography.geo_code}/${code}: ranking eligibility mismatch`);}
      if(indicator.requires_sampling_uncertainty===true&&m.history.some(h=>!h.uncertainty))assert(m.eligibility?.ranking_allowed===false,`${county.geography.geo_code}/${code}: survey ranking allowed without required uncertainty`);
    }
    const domainTotal=Object.values(county.domains||{}).reduce((sum,d)=>sum+(d.available_indicators||0),0);
    assert(domainTotal===Object.keys(county.metrics||{}).length,`${county.geography.geo_code}: domain coverage does not reconcile to metrics`);
    assert(county.coverage?.active_metric_count===Object.keys(county.metrics||{}).length,`${county.geography.geo_code}: coverage active metric count mismatch`);
    assert(!('indices' in county)&&!('administration' in county)&&!('development_gaps' in county)&&!('opportunities' in county)&&!('recognition' in county),'P02 must not publish gated analytical outputs');
  }
  console.log(`COUNTYIQ_MART_TRACEABILITY_OK metrics=${metricCount} history=${historyCount} rankable_records=${rankable}`);

  const runtime=fs.readFileSync(path.join(root,'assets/countyiq-view.js'),'utf8');
  assert(runtime.includes("const MART='data/countyiq/county-summary.json'"),'integrated runtime does not point to canonical mart');
  assert(runtime.includes('KDA.fetchJson(MART,{required:true})'),'integrated runtime does not use shared JSON loader for mart');
  assert(!runtime.includes('data/sprint1/')&&!runtime.includes('KDA.csv('),'integrated runtime still joins Sprint CSV files');
  console.log('COUNTYIQ_MART_RUNTIME_SWITCH_OK');
  console.log('COUNTYIQ_MART_ALL_OK');
}catch(error){console.error(error.message||error);process.exit(1);}
