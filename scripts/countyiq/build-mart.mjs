import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assignPeerGroups, computeRankingAndTrend, benchmarksFor, PEER_METHODOLOGY_VERSION } from '../p06/peer-intelligence.mjs';
import { buildGapsAndNarrative } from '../p07/gap-calculator.mjs';
import { buildPerformanceIndex } from '../p08/performance-index.mjs';
import { buildHistoricalValidation } from '../p09/historical-validation.mjs';
import { buildDeliveryLayer } from '../p10/delivery-layer.mjs';
import { buildRecognition } from '../p11/recognition.mjs';
import { INDICATOR_POLICY_VERSION, DOMAIN_ORDER, DOMAIN_TARGETS as TARGETS, domainForIndicator, policyForIndicator, rankingPolicyForIndicator } from '../policy/indicator-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = p => JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));

const BADGE_LABELS={A:'Official direct',B:'Official derived',C:'Spatially derived',D:'Modelled',E:'External'};
function dateKey(o){return [o.period_end||'',o.period_start||'',o.period_label||'',o.observation_id||''].join('|');}
function badgeOf(o){return o.badge||o.provenance_badge||o.provenance?.badge||'';}
function releaseIdOf(o){return o.source_release_id||o.release_id||null;}
function datasetIdOf(o,s){return o.source_dataset_id||o.dataset_id||s.dataset_id||null;}
function sourceIdOf(o,s,dataset){return o.source_id||s.source_id||dataset?.source_id||null;}
function uncertaintyOf(o){
  const value={
    lower_bound:o.lower_bound??null, upper_bound:o.upper_bound??null,
    confidence_level:o.confidence_level??null, standard_error:o.standard_error??null,
    sample_size:o.sample_size??null
  };
  return Object.values(value).some(v=>v!==null&&v!=='')?value:null;
}
function activeObservations(all){
  const superseded=new Set(all.map(o=>o.supersedes_observation_id).filter(Boolean));
  return all.filter(o=>!superseded.has(o.observation_id)).sort((a,b)=>dateKey(a).localeCompare(dateKey(b)));
}
function latestObservation(series,history){
  if(series.latest_observation_id){const exact=history.find(o=>o.observation_id===series.latest_observation_id);if(exact)return exact;}
  return history.at(-1)||null;
}
function sourceUrlOf(o,s,dataset,release){return o.source_url||s.source_url||release?.release_url||dataset?.methodology_url||s.methodology_url||'';}
function observationView(o,s,ctx){
  const datasetId=datasetIdOf(o,s), dataset=ctx.datasetById.get(datasetId), releaseId=releaseIdOf(o), release=ctx.releaseById.get(releaseId);
  const sourceId=sourceIdOf(o,s,dataset), source=ctx.sourceById.get(sourceId), agency=ctx.agencyById.get(source?.agency_id||s.agency_id);
  const badge=badgeOf(o);
  return {
    observation_id:o.observation_id,
    series_id:s.series_id,
    value:o.value??null,
    period_start:o.period_start??null,
    period_end:o.period_end??null,
    period_label:String(o.period_label||o.period_start||''),
    unit:s.unit_id,
    unit_code:ctx.unitById.get(s.unit_id)?.code||null,
    unit_name:ctx.unitById.get(s.unit_id)?.name||null,
    statistical_status:o.statistical_status||o.status||null,
    geographic_method:o.geographic_method||s.geographic_method||null,
    transformation:s.transformation||'level',
    provenance:{
      badge,
      badge_label:BADGE_LABELS[badge]||badge,
      agency_id:agency?.agency_id||source?.agency_id||s.agency_id||null,
      agency_name:agency?.name||agency?.agency_name||null,
      dataset_id:datasetId,
      release_id:releaseId,
      source_url:sourceUrlOf(o,s,dataset,release),
      dataset_title:dataset?.title||null,
      release_title:release?.title||null,
      source_table:o.source_table||null,
      source_page:o.source_page??null,
      methodology_url:s.methodology_url||dataset?.methodology_url||null,
      published_at:o.published_at||release?.published_at||null,
      ingested_at:o.ingested_at||release?.ingested_at||null,
      vintage_id:o.vintage_id||null
    },
    uncertainty:uncertaintyOf(o),
    notes:o.notes||null
  };
}
function chooseSeries(rows,obsBySeries){
  return [...rows].sort((a,b)=>{
    const ah=activeObservations(obsBySeries.get(a.series_id)||[]), bh=activeObservations(obsBySeries.get(b.series_id)||[]);
    const al=latestObservation(a,ah), bl=latestObservation(b,bh);
    return dateKey(bl||{}).localeCompare(dateKey(al||{})) || bh.length-ah.length || String(a.series_code).localeCompare(String(b.series_code));
  })[0];
}
function rankingDecision(indicator, metricCode, latestByCounty){
  const rows=latestByCounty.get(metricCode)||[];
  const periods=new Set(rows.map(x=>x.latest?.period_label).filter(Boolean));
  const badges=new Set(rows.map(x=>x.latest?.provenance?.badge).filter(Boolean));
  const validValues=rows.filter(x=>typeof x.latest?.value==='number'&&Number.isFinite(x.latest.value));
  const staticPolicy=rankingPolicyForIndicator(indicator);
  let reason=staticPolicy.static_reason_not_allowed;
  if(!reason&&rows.length!==47||!reason&&validValues.length!==47) reason='Current comparable value is not available for all 47 counties.';
  else if(!reason&&periods.size!==1) reason='Latest county observations do not share one comparable period.';
  else if(!reason&&[...badges].some(b=>!['A','B','C'].includes(b))) reason='Ranking is limited to A/B/C provenance in P02.';
  else if(!reason&&staticPolicy.requires_sampling_uncertainty&&rows.some(x=>!x.latest?.uncertainty)) reason='Required sampling uncertainty is not available for every county.';
  return {eligible:!reason,reason,period_key:periods.size===1?[...periods][0]:null,coverage_pct:Number(((rows.length/47)*100).toFixed(1)),policy_version:INDICATOR_POLICY_VERSION};
}
function trendView(history){
  const numeric=history.filter(x=>typeof x.value==='number'&&Number.isFinite(x.value));
  if(numeric.length<2)return {eligible:false,one_period_change:null,medium_term_change:null,medium_term_years:null,national_matched_change:null,peer_matched_change:null,direction:'not_classified',volatility:null,break_in_series:false};
  const last=numeric.at(-1), prev=numeric.at(-2), first=numeric[0];
  return {eligible:true,one_period_change:last.value-prev.value,medium_term_change:last.value-first.value,medium_term_years:null,national_matched_change:null,peer_matched_change:null,direction:'not_classified',volatility:null,break_in_series:false};
}
const FISCAL_CODES={budget:'IND-COUNTY-BUDGET-TOTAL',expenditure:'IND-COUNTY-EXPENDITURE-TOTAL',overall_absorption:'IND-COUNTY-BUDGET-ABSORPTION',development_absorption:'IND-COUNTY-DEVELOPMENT-ABSORPTION'};
const EXPECTED_FISCAL_YEARS=Array.from({length:12},(_,i)=>{const y=2013+i;return `${y}/${String(y+1).slice(-2)}`;});
function fiscalKey(o){
  const label=String(o?.period_label||'');const match=label.match(/(\d{4})\s*\/\s*(\d{2,4})/);
  if(match)return `${match[1]}/${match[2].slice(-2)}`;
  const start=String(o?.period_start||'');const y=Number(start.slice(0,4));return Number.isFinite(y)&&y>0?`${y}/${String(y+1).slice(-2)}`:null;
}
function finiteValue(o){const x=Number(o?.value);return Number.isFinite(x)?x:null;}
function stdev(values){const a=values.filter(Number.isFinite);if(a.length<2)return null;const mean=a.reduce((s,v)=>s+v,0)/a.length;return Number(Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/a.length).toFixed(2));}
function rankInPeriod(value,values){if(!Number.isFinite(value)||values.length!==47)return null;return 1+values.filter(v=>Number.isFinite(v)&&v>value).length;}
function fiscalChange(history,field,lag,kind){
  const last=history.at(-1),base=history.at(-(lag+1));if(!last||!base)return null;const current=last[field]?.value,prior=base[field]?.value;if(!Number.isFinite(current)||!Number.isFinite(prior))return null;
  const raw=kind==='percent'?prior===0?null:((current/prior)-1)*100:current-prior;if(raw===null||!Number.isFinite(raw))return null;
  return {lag_years:lag,from_period:base.fiscal_year,to_period:last.fiscal_year,value:Number(raw.toFixed(2)),unit:kind==='percent'?'percent':'percentage_points'};
}
function fiscalExperience(row,allRows){
  const maps={};for(const [key,code] of Object.entries(FISCAL_CODES)){maps[key]=new Map((row.metrics[code]?.history||[]).map(o=>[fiscalKey(o),o]).filter(([k])=>k));}
  const history=EXPECTED_FISCAL_YEARS.map(fy=>{
    const found={};for(const key of Object.keys(FISCAL_CODES)){found[key]=maps[key].get(fy);if(!found[key])throw new Error(`${row.county.geo_code}: missing ${key} for fiscal year ${fy}`);}
    const measure=key=>({value:finiteValue(found[key]),observation_id:found[key].observation_id,series_id:found[key].series_id,period_label:found[key].period_label,provenance:found[key].provenance});
    return {fiscal_year:fy,period_start:found.budget.period_start,period_end:found.budget.period_end,budget:measure('budget'),expenditure:measure('expenditure'),overall_absorption:measure('overall_absorption'),development_absorption:measure('development_absorption'),rankings:{}};
  });
  for(const fyRow of history){for(const [key,code] of Object.entries(FISCAL_CODES)){
    const peers=allRows.map(peer=>(peer.metrics[code]?.history||[]).find(o=>fiscalKey(o)===fyRow.fiscal_year)).map(finiteValue).filter(Number.isFinite);
    if(peers.length!==47)throw new Error(`${fyRow.fiscal_year}/${key}: common-period county coverage ${peers.length}/47`);
    const rate=key.includes('absorption');fyRow.rankings[key]={rank:rankInPeriod(fyRow[key].value,peers),eligible_count:47,period_key:fyRow.fiscal_year,common_period:true,interpretation:rate?'higher_rate_position':'scale_only'};
  }}
  const population=row.metrics['IND-POPULATION'];const availablePopulationPeriods=[...new Set((population?.history||[]).map(o=>String(o.period_label||o.period_start||'')).filter(Boolean))];
  return {
    period_start:history[0].fiscal_year,period_end:history.at(-1).fiscal_year,fiscal_year_count:history.length,
    measures:Object.fromEntries(Object.entries(FISCAL_CODES).map(([k,v])=>[k,{indicator_code:v}])),history,
    changes:{
      budget:{one_year:fiscalChange(history,'budget',1,'percent'),three_year:fiscalChange(history,'budget',3,'percent'),five_year:fiscalChange(history,'budget',5,'percent')},
      expenditure:{one_year:fiscalChange(history,'expenditure',1,'percent'),three_year:fiscalChange(history,'expenditure',3,'percent'),five_year:fiscalChange(history,'expenditure',5,'percent')},
      overall_absorption:{one_year:fiscalChange(history,'overall_absorption',1,'points'),three_year:fiscalChange(history,'overall_absorption',3,'points'),five_year:fiscalChange(history,'overall_absorption',5,'points')},
      development_absorption:{one_year:fiscalChange(history,'development_absorption',1,'points'),three_year:fiscalChange(history,'development_absorption',3,'points'),five_year:fiscalChange(history,'development_absorption',5,'points')}},
    volatility:{period_count:history.length,overall_absorption_sd_pp:stdev(history.map(x=>x.overall_absorption.value)),development_absorption_sd_pp:stdev(history.map(x=>x.development_absorption.value)),interpretation:'Population standard deviation across the twelve published annual absorption rates; descriptive only.'},
    denominators:{policy:'exact_or_explicitly_compatible_period_only',population:{indicator_code:'IND-POPULATION',compatible_annual_series:false,available_periods:availablePopulationPeriods,required_periods:EXPECTED_FISCAL_YEARS,interpolation_allowed:false,national_inheritance_allowed:false,reason:'No active canonical county population series provides an explicit compatible annual denominator for every fiscal year from FY2013/14 through FY2024/25.'},per_capita:{published:false,measures:[],reason:'Per-capita fiscal measures are withheld until a compatible official county population denominator series is activated.'}}
  };
}
function generatedAt(observations,releases){
  const candidates=[...observations.map(o=>o.ingested_at),...releases.map(r=>r.ingested_at||r.discovered_at)].filter(v=>v&&/^\d{4}-\d{2}-\d{2}T/.test(v)).sort();
  return candidates.at(-1)||'2026-08-28T00:00:00.000Z';
}

export function buildMart(input){
  const {geographies,indicators,series,observations,units,datasets,releases,sources,agencies,atlasVersion='0.10.0'}=input;
  const counties=geographies.filter(g=>g.level==='county').sort((a,b)=>Number(a.county_code)-Number(b.county_code)||String(a.geo_code).localeCompare(String(b.geo_code)));
  if(counties.length!==47)throw new Error(`CountyIQ mart requires 47 counties, found ${counties.length}`);
  const countyIds=new Set(counties.map(g=>g.geography_id));
  const indicatorById=new Map(indicators.map(i=>[i.indicator_id,i]));
  const datasetById=new Map(datasets.map(x=>[x.dataset_id,x]));
  const releaseById=new Map(releases.map(x=>[x.release_id,x]));
  const sourceById=new Map(sources.map(x=>[x.source_id,x]));
  const agencyById=new Map(agencies.map(x=>[x.agency_id,x]));
  const unitById=new Map(units.map(x=>[x.unit_id,x]));
  const obsBySeries=new Map();
  for(const o of observations){if(!obsBySeries.has(o.series_id))obsBySeries.set(o.series_id,[]);obsBySeries.get(o.series_id).push(o);}
  const ctx={datasetById,releaseById,sourceById,agencyById,unitById};
  const publishedDatasetIds=new Set(datasets.filter(d=>d.publication_status==='published').map(d=>d.dataset_id));
  const countySeries=series.filter(s=>countyIds.has(s.geography_id)&&(!s.status||s.status==='active')&&publishedDatasetIds.has(s.dataset_id));
  const seriesByCounty=new Map(counties.map(c=>[c.geography_id,[]]));
  countySeries.forEach(s=>seriesByCounty.get(s.geography_id)?.push(s));
  const rows=[];
  const latestByCounty=new Map();

  for(const county of counties){
    const grouped=new Map();
    for(const s of seriesByCounty.get(county.geography_id)||[]){
      const indicator=indicatorById.get(s.indicator_id);
      if(!indicator||indicator.active===false||indicator.lifecycle_status&&indicator.lifecycle_status!=='active')continue;
      if(!grouped.has(s.indicator_id))grouped.set(s.indicator_id,[]);grouped.get(s.indicator_id).push(s);
    }
    const metrics={};
    for(const [indicatorId,candidates] of grouped){
      const indicator=indicatorById.get(indicatorId), selected=chooseSeries(candidates,obsBySeries);
      const rawHistory=activeObservations(obsBySeries.get(selected.series_id)||[]);
      if(!rawHistory.length)continue;
      const history=rawHistory.map(o=>observationView(o,selected,ctx));
      const latestRaw=latestObservation(selected,rawHistory), latest=observationView(latestRaw,selected,ctx);
      if(!latest.provenance.badge||!BADGE_LABELS[latest.provenance.badge])throw new Error(`${selected.series_code}: missing A-E provenance badge`);
      if(!latest.provenance.source_url)throw new Error(`${selected.series_code}: missing source URL`);
      if(!latest.period_label)throw new Error(`${selected.series_code}: missing period label`);
      if(!unitById.has(selected.unit_id))throw new Error(`${selected.series_code}: missing unit ${selected.unit_id}`);
      const code=indicator.indicator_code;
      const policy=policyForIndicator(indicator);
      const metric={
        indicator_id:indicator.indicator_id,indicator_code:code,name:indicator.name,domain:domainForIndicator(indicator),status:'active',
        latest,history,
        ranking:null,
        trend:trendView(history),
        eligibility:{ranking_allowed:false,higher_is_better:policy.direction.higher_is_better,minimum_coverage:100,
          requires_sampling_uncertainty:policy.uncertainty.required_for_ranking,trend_allowed:policy.trend.allowed,composite_eligible:policy.composite.eligible,
          publication_status:policy.publication_status,parent_value_inheritance_allowed:policy.inheritance.parent_value_inheritance_allowed,
          policy_version:INDICATOR_POLICY_VERSION,reason_not_eligible:'P02 ranking eligibility pending cross-county check.'}
      };
      metrics[code]=metric;
      if(!latestByCounty.has(code))latestByCounty.set(code,[]);
      latestByCounty.get(code).push({county:county.geo_code,latest,metric,indicator});
    }
    rows.push({county,metrics});
  }

  for(const row of rows){
    for(const metric of Object.values(row.metrics)){
      const indicator=indicatorById.get(metric.indicator_id), decision=rankingDecision(indicator,metric.indicator_code,latestByCounty);
      metric.eligibility.ranking_allowed=decision.eligible;
      metric.eligibility.reason_not_eligible=decision.reason;
      metric.ranking={eligible:decision.eligible,rank:null,eligible_count:decision.eligible?47:null,percentile:null,national_median:null,distance_from_median:null,period_key:decision.period_key,coverage_pct:decision.coverage_pct};
    }
  }

  // P06 — peer groups, percentiles and trend intelligence. Runs after
  // eligibility is decided above, so it only ever computes positional
  // and trend statistics for metrics P02's own taxonomy already allows
  // to be ranked; it never overrides an ineligibility decision.
  const peerGroups=assignPeerGroups(rows);
  computeRankingAndTrend(rows,indicatorById,peerGroups);

  const outputCounties=rows.map(({county,metrics})=>{
    const domains={};
    for(const id of DOMAIN_ORDER){
      const count=Object.values(metrics).filter(m=>m.domain===id).length,target=TARGETS[id];
      domains[id]={available_indicators:count,target_indicators:target,coverage_pct:Number(((count/target)*100).toFixed(1)),score:null,score_status:'not_published',strengths:[],weaknesses:[]};
    }
    const last=Object.values(metrics).map(m=>m.latest?.provenance?.ingested_at||m.latest?.period_end||m.latest?.period_start).filter(Boolean).sort().at(-1)||null;
    const fiscal=fiscalExperience({county,metrics},rows);
    return {
      geography:{geography_id:county.geography_id,geo_code:county.geo_code,name:county.name,level:'county',county_code:county.county_code,boundary_version:county.boundary_version||'2012-01'},
      metrics,fiscal,domains,benchmarks:benchmarksFor(county,peerGroups,peerGroups.tierLabel),
      coverage:{active_metric_count:Object.keys(metrics).length,target_metric_count:Object.values(TARGETS).reduce((a,b)=>a+b,0),domain_count_with_active_metrics:Object.values(domains).filter(d=>d.available_indicators>0).length,last_data_update:last,stale_metric_count:0,held_metric_count:0,planned_metric_count:0}
    };
  });

  // P07 — development gap calculator and evidence narrative engine. Runs
  // last, on the assembled county records, since it reads across
  // metrics/fiscal/domains and writes back gaps + narrative + populates
  // the domain strengths/weaknesses arrays P02 left empty.
  buildGapsAndNarrative(outputCounties,indicatorById);
  const performanceIndexMethodology=buildPerformanceIndex(outputCounties,indicatorById);
  const releaseDecision=buildHistoricalValidation(outputCounties,performanceIndexMethodology);
  performanceIndexMethodology.status=releaseDecision.resulting_status;
  performanceIndexMethodology.label=releaseDecision.resulting_status==='published_snapshot'?'Published snapshot — P09 cleared the latest cross-sectional score for banded display; exact ranks remain diagnostic and longitudinal composite movement is withheld.':'Research/Beta — not cleared for public composite display by the P09 snapshot gate.';
  for(const county of outputCounties){county.performanceIndex.status=releaseDecision.resulting_status;county.performanceIndex.release_decision=releaseDecision;}
  performanceIndexMethodology.release_decision=releaseDecision;
  const deliveryMethodology=buildDeliveryLayer(outputCounties);
  const recognitionMethodology=buildRecognition(outputCounties);

  return {
    meta:{schema_version:'kda.countyiq.county-summary.v2',generated_at:generatedAt(observations,releases),atlas_data_version:atlasVersion,county_count:47,
      source_registries:['data/geography/registry/geographies.json','data/indicators/registry/indicators.json','data/indicators/registry/series.json','data/indicators/registry/observations.json','data/indicators/registry/units.json','data/catalogue/registry/datasets.json','data/catalogue/registry/releases.json','data/catalogue/registry/sources.json','data/catalogue/registry/agencies.json','data/policy/indicator-policy.json'],indicator_policy_version:INDICATOR_POLICY_VERSION,methodology_version:PEER_METHODOLOGY_VERSION,peer_group_definition:peerGroups.definition,performance_index_methodology:performanceIndexMethodology,delivery_layer_methodology:deliveryMethodology,recognition_methodology:recognitionMethodology},
    counties:outputCounties
  };
}

export function loadCanonical(rootDir=root){
  const r=p=>JSON.parse(fs.readFileSync(path.join(rootDir,p),'utf8'));
  const pkg=r('package.json');
  return {geographies:r('data/geography/registry/geographies.json'),indicators:r('data/indicators/registry/indicators.json'),series:r('data/indicators/registry/series.json'),observations:r('data/indicators/registry/observations.json'),units:r('data/indicators/registry/units.json'),datasets:r('data/catalogue/registry/datasets.json'),releases:r('data/catalogue/registry/releases.json'),sources:r('data/catalogue/registry/sources.json'),agencies:r('data/catalogue/registry/agencies.json'),atlasVersion:pkg.version};
}

function main(){
  const output=buildMart(loadCanonical(root));
  const target=path.join(root,'data/countyiq/county-summary.json');
  fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n');
  const metricCounts=output.counties.map(c=>c.coverage.active_metric_count);
  console.log(`COUNTYIQ_MART_BUILT counties=${output.counties.length} metrics_min=${Math.min(...metricCounts)} metrics_max=${Math.max(...metricCounts)}`);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
