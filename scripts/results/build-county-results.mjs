#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const mart=read('data/countyiq/county-summary.json');
const evidence=read('data/evidence/county-documents.json');
const counties=mart.counties||[];
if(counties.length!==47)throw new Error(`Results release requires 47 CountyIQ counties, found ${counties.length}`);

const evidenceRows=Array.isArray(evidence)?evidence:(evidence.records||[]);
const evidenceByCounty=new Map();
for(const r of evidenceRows){if(!evidenceByCounty.has(r.geo_code))evidenceByCounty.set(r.geo_code,[]);evidenceByCounty.get(r.geo_code).push(r);}
const round=(v,d=2)=>Number.isFinite(Number(v))?Number(Number(v).toFixed(d)):null;
const latestView=m=>m?.latest?{value:m.latest.value??null,period_label:m.latest.period_label??null,unit_code:m.latest.unit_code??null,source_url:m.latest.provenance?.source_url||null}:null;

const countyRows=counties.map(c=>{
  const metrics=Object.entries(c.metrics||{}).map(([code,m])=>({
    indicator_code:code,
    name:m.name||code,
    domain:m.domain||null,
    latest:latestView(m),
    ranking:m.ranking?.eligible?{
      eligible:true,rank:m.ranking.rank,eligible_count:m.ranking.eligible_count,percentile:m.ranking.percentile,
      peer_rank:m.ranking.peer_group?.rank??null,peer_eligible_count:m.ranking.peer_group?.eligible_count??null,peer_percentile:m.ranking.peer_group?.percentile??null,
      higher_is_better:m.ranking.higher_is_better??m.eligibility?.higher_is_better??null
    }:{eligible:false},
    trend:m.trend?.eligible?{
      eligible:true,direction:m.trend.direction,one_period_change:m.trend.one_period_change,medium_term_change:m.trend.medium_term_change,
      medium_term_years:m.trend.medium_term_years,national_matched_change:m.trend.national_matched_change,peer_matched_change:m.trend.peer_matched_change,
      break_in_series:m.trend.break_in_series===true
    }:{eligible:false}
  })).filter(m=>m.ranking.eligible||m.trend.eligible);

  const snap=c.performanceIndex?.snapshot;
  const delivery=c.deliveryLayer||{};
  const admin=c.administrationScorecard||{};
  const ev=(evidenceByCounty.get(c.geography?.geo_code)||[]).map(r=>({
    record_id:r.record_id,family:r.family,title:r.title,period:r.period,publisher:r.publisher,
    verification_state:r.verification_state,document_url:r.document_url||null,source_page_url:r.source_page_url||null
  }));
  const recognition=(c.recognition?.entries||[]).filter(x=>x.qualifies).map(x=>({id:x.id,label:x.label,rank:x.rank,value:x.value,unit:x.unit}));
  return {
    geo_code:c.geography?.geo_code,name:c.geography?.name,
    peer_group:c.benchmarks?.peer_group?{label:c.benchmarks.peer_group.tier_label||null,tier:c.benchmarks.peer_group.tier||null}:null,
    metrics,
    development_snapshot:snap?{
      score:round(snap.score),relative_position_band:snap.relative_position_band,relative_position_label:snap.relative_position_label,
      diagnostic_rank:snap.primary_exact_rank_diagnostic,plausible_min_rank:snap.plausible_weighting_rank_range?.min_rank??null,
      plausible_max_rank:snap.plausible_weighting_rank_range?.max_rank??null,robustness:snap.robustness||null
    }:null,
    fiscal_delivery:{
      score:Number.isFinite(delivery.score)?round(delivery.score):null,rank:delivery.rank??null,eligible_count:delivery.eligible_count??null,
      execution_score:Number.isFinite(delivery.pillars?.execution?.score)?round(delivery.pillars.execution.score):null,
      revenue_score:Number.isFinite(delivery.pillars?.revenue_mobilisation?.score)?round(delivery.pillars.revenue_mobilisation.score):null,
      arrears_score:Number.isFinite(delivery.pillars?.arrears_control?.score)?round(delivery.pillars.arrears_control.score):null,
      osr_target_attainment_pct:round(delivery.pillars?.revenue_mobilisation?.measures?.osr_target_attainment_pct),
      pending_bills_pct_budget:round(delivery.pillars?.arrears_control?.measures?.pending_bills_pct_budget),
      wage_ceiling_compliant:delivery.accountability_signals?.wage_ceiling?.compliant??null,
      missing_data:delivery.missing_data||[]
    },
    administration:{
      baseline_fiscal_year:admin.baseline_fiscal_year||null,latest_fiscal_year:admin.latest_full_cycle_fiscal_year||null,
      overall_absorption_change_pp:round(admin.fiscal_changes?.overall_absorption_pp?.baseline_to_latest_change),
      development_absorption_change_pp:round(admin.fiscal_changes?.development_absorption_pp?.baseline_to_latest_change),
      current_fiscal_score:round(admin.current_fiscal_accountability?.p10_score)
    },
    strengths_and_gaps:{
      working_well:c.narrative?.working_well||[],needs_attention:c.narrative?.needs_attention||[],what_changed:c.narrative?.what_changed||[]
    },
    recognition,
    evidence:{count:ev.length,families:[...new Set(ev.map(x=>x.family))].sort(),records:ev}
  };
});

const rankedCodes=new Map();
for(const c of countyRows)for(const m of c.metrics)if(m.ranking.eligible){if(!rankedCodes.has(m.indicator_code))rankedCodes.set(m.indicator_code,{indicator_code:m.indicator_code,name:m.name,domain:m.domain,rows:[]});rankedCodes.get(m.indicator_code).rows.push({county:c.name,geo_code:c.geo_code,latest:m.latest,ranking:m.ranking,trend:m.trend});}
const indicatorRankings=[...rankedCodes.values()].map(g=>({...g,rows:g.rows.sort((a,b)=>(a.ranking.rank??999)-(b.ranking.rank??999)||a.county.localeCompare(b.county))})).sort((a,b)=>a.domain.localeCompare(b.domain)||a.name.localeCompare(b.name));

const developmentLeaderboard=countyRows.filter(c=>c.development_snapshot).map(c=>({geo_code:c.geo_code,county:c.name,...c.development_snapshot})).sort((a,b)=>(a.diagnostic_rank??999)-(b.diagnostic_rank??999));
const fiscalLeaderboard=countyRows.map(c=>({geo_code:c.geo_code,county:c.name,...c.fiscal_delivery})).sort((a,b)=>Number.isFinite(a.rank)?(Number.isFinite(b.rank)?a.rank-b.rank:-1):(Number.isFinite(b.rank)?1:a.county.localeCompare(b.county)));
const recognitionMap=new Map();
for(const c of countyRows)for(const r of c.recognition){if(!recognitionMap.has(r.id))recognitionMap.set(r.id,{id:r.id,label:r.label,counties:[]});recognitionMap.get(r.id).counties.push({county:c.name,geo_code:c.geo_code,rank:r.rank,value:r.value,unit:r.unit});}
const recognition=[...recognitionMap.values()].map(g=>({...g,counties:g.counties.sort((a,b)=>(a.rank??999)-(b.rank??999)||a.county.localeCompare(b.county))}));

const output={
  schema_version:'kda.public-results.v1',
  generated_from:['data/countyiq/county-summary.json','data/evidence/county-documents.json'],
  generated_at:mart.meta?.generated_at||mart.generated_at||null,
  coverage:{counties:countyRows.length,ranked_indicators:indicatorRankings.length,fiscal_scores:fiscalLeaderboard.filter(x=>Number.isFinite(x.score)).length,evidence_profiles:countyRows.filter(x=>x.evidence.count>0).length},
  development_snapshot:developmentLeaderboard,
  fiscal_delivery:fiscalLeaderboard,
  indicator_rankings:indicatorRankings,
  recognition,
  counties:countyRows
};
fs.mkdirSync(path.join(root,'data/results'),{recursive:true});
fs.writeFileSync(path.join(root,'data/results/county-results.json'),JSON.stringify(output,null,2)+'\n');
console.log(`PUBLIC_RESULTS_BUILT counties=${output.coverage.counties} ranked_indicators=${output.coverage.ranked_indicators} fiscal_scores=${output.coverage.fiscal_scores} evidence_profiles=${output.coverage.evidence_profiles}`);
