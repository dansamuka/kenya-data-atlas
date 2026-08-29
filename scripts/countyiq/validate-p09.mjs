import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const j=f=>JSON.parse(read(f));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P09 validation: ${msg}`);};

const mart=j('data/countyiq/county-summary.json');
const roadmap=j('data/project-roadmap.json');
const ui=read('assets/countyiq-view.js');
const meth=mart.meta?.performance_index_methodology;
const rd=meth?.release_decision;

try{
  assert(rd?.version==='P09-v2','release_decision.version must be P09-v2');
  assert(rd.release_scope==='snapshot_only','P09-v2 should publish only the latest snapshot, not a longitudinal composite');
  assert(rd.snapshot_release?.decision==='go','snapshot_release must pass before published_snapshot status is allowed');
  assert(rd.longitudinal_release?.decision==='no-go','current data should explicitly withhold longitudinal composite publication');
  assert(meth.status==='published_snapshot','methodology status must be published_snapshot after snapshot GO / longitudinal NO-GO');
  assert(/Published snapshot/.test(meth.label),'public label must say Published snapshot');
  console.log('COUNTYIQ_P09_SCOPE_DECISION_OK snapshot=go longitudinal=no-go');

  const sr=rd.snapshot_release;
  assert(Array.isArray(sr.plausible_weighting_scenarios)&&sr.plausible_weighting_scenarios.length>=2,'at least two plausible full-composite weighting scenarios are required');
  assert(sr.stress_scenario_excluded_from_gate==='fiscal_execution_only','fiscal-only scenario must be disclosed as an extreme stress test, not treated as a full-composite weighting');
  assert(sr.same_or_adjacent_share>=0.85,`same-or-adjacent band share ${sr.same_or_adjacent_share} is below 0.85 publication threshold`);
  assert(sr.exact_rank_publication==='diagnostic_only','exact rank must remain diagnostic-only');
  console.log(`COUNTYIQ_P09_SNAPSHOT_ROBUSTNESS_OK adjacent_share=${sr.same_or_adjacent_share} avg_plausible_rank_range=${sr.average_plausible_rank_range}`);

  const hb=rd.longitudinal_release?.historical_backtest;
  assert(Array.isArray(hb?.indicators_backtested)&&hb.indicators_backtested.length>0,'historical gate must back-test the indicators that actually have history');
  assert(Array.isArray(hb.indicators_not_backtestable)&&hb.indicators_not_backtestable.length>0,'single-period inputs must be named explicitly');
  assert(Array.isArray(hb.consecutive_year_pairs)&&hb.consecutive_year_pairs.length>=2,'historical back-test must contain consecutive-period comparisons');
  assert(hb.average_spearman_rank_correlation<0.8,'current longitudinal NO-GO should be supported by measured stability below the 0.80 gate');
  assert(rd.longitudinal_release.reasons_if_no_go.some(x=>/single comparable observed period|only one comparable observed period/i.test(x)),'longitudinal no-go must state the single-period limitation');
  console.log(`COUNTYIQ_P09_LONGITUDINAL_LIMITATION_OK avg_spearman=${hb.average_spearman_rank_correlation}`);

  for(const c of mart.counties){
    const pi=c.performanceIndex;
    assert(pi?.status==='published_snapshot',`${c.geography.geo_code}: county status must mirror published_snapshot`);
    assert(pi.release_decision?.version==='P09-v2',`${c.geography.geo_code}: missing P09-v2 release decision`);
    const snap=pi.snapshot;
    assert(snap?.status==='published_snapshot',`${c.geography.geo_code}: missing published snapshot object`);
    assert(Number.isFinite(snap.score)&&snap.score>=0&&snap.score<=100,`${c.geography.geo_code}: snapshot score invalid`);
    assert(Number.isInteger(snap.relative_position_band)&&snap.relative_position_band>=1&&snap.relative_position_band<=5,`${c.geography.geo_code}: band must be 1..5`);
    assert(typeof snap.relative_position_label==='string'&&snap.relative_position_label.length>3,`${c.geography.geo_code}: relative-position label missing`);
    assert(snap.exact_rank_status==='diagnostic_only',`${c.geography.geo_code}: exact rank must be diagnostic-only`);
    assert(snap.longitudinal_change_status==='withheld',`${c.geography.geo_code}: longitudinal composite movement must be withheld`);
    assert(snap.plausible_weighting_band_range.width<=1,`${c.geography.geo_code}: snapshot publication gate violated by a >1 band shift`);
  }
  console.log('COUNTYIQ_P09_COUNTY_SNAPSHOT_RECORDS_OK counties=47');

  for(const token of ['published_snapshot','diagnostic_only','longitudinal'])
    assert(JSON.stringify(mart.meta.performance_index_methodology).toLowerCase().includes(token.toLowerCase()),`methodology missing ${token}`);
  for(const token of ['renderPerformanceIndexPanel','relative_position_label','diagnostic','Longitudinal composite'])
    assert(ui.toLowerCase().includes(token.toLowerCase()),`CountyIQ UI missing ${token}`);

  const phase09=roadmap.phases.find(x=>x.id==='P09');
  assert(phase09?.status==='complete','P09 roadmap must be complete');
  console.log('COUNTYIQ_P09_ALL_OK');
}catch(error){console.error(error.message||error);process.exit(1);}
