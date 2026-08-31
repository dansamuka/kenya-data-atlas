import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const j=f=>JSON.parse(read(f));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P08 validation: ${msg}`);};

const mart=j('data/countyiq/county-summary.json');
const roadmap=j('data/project-roadmap.json');
const ui=read('assets/countyiq-view.js');
const meth=mart.meta?.performance_index_methodology;

try{
  assert(meth,'mart.meta.performance_index_methodology is required');
  assert(['research','published_snapshot'].includes(meth.status),`index status must be research or P09-cleared published_snapshot, got ${meth.status}`);
  if(meth.status==='published_snapshot'){
    assert(meth.release_decision?.snapshot_release?.decision==='go','published_snapshot requires a P09 snapshot GO decision');
    assert(meth.release_decision?.longitudinal_release?.decision==='no-go','current publication scope must withhold longitudinal composite movement');
    assert(/Published snapshot/.test(meth.label),'published_snapshot label must say Published snapshot');
  }else assert(/Research\/Beta/.test(meth.label),'research label must say Research/Beta');
  for(const field of ['inclusion_rule','normalization','missing_data_policy','outlier_policy','weighting_disclosure','honest_limitation'])
    assert(typeof meth[field]==='string'&&meth[field].length>20,`methodology.${field} must be a substantive published statement`);
  assert(Array.isArray(meth.indicators_included)&&meth.indicators_included.length>=1,'at least one indicator must be included');
  assert(Array.isArray(meth.domains_excluded),'domains_excluded must be reported even if empty');
  console.log(`COUNTYIQ_P08_METHODOLOGY_PUBLISHED_OK indicators=${meth.indicators_included.length} domains_included=${meth.domains_included.length} domains_excluded=${meth.domains_excluded.length}`);

  assert(Array.isArray(meth.weighting_scenarios)&&meth.weighting_scenarios.length>=2,'sensitivity requires at least two weighting scenarios to be materially tested');
  assert(Array.isArray(meth.correlation_review)&&meth.correlation_review.length>0,'correlation review must be published for the included indicator set');
  console.log(`COUNTYIQ_P08_SENSITIVITY_SCENARIOS_OK scenarios=${meth.weighting_scenarios.length}`);

  let withRobustness=0,totalRange=0;
  for(const c of mart.counties){
    const pi=c.performanceIndex;
    assert(pi?.methodology_version==='P08-v1',`${c.geography.geo_code}: performanceIndex.methodology_version must be P08-v1`);
    assert(pi.status===meth.status,`${c.geography.geo_code}: performanceIndex.status must mirror methodology status`);
    for(const id of meth.weighting_scenarios){
      const s=pi.scenarios[id];
      if(s.score===null)continue;
      assert(Number.isFinite(s.score)&&s.score>=0&&s.score<=100,`${c.geography.geo_code}/${id}: score out of 0-100 range`);
      assert(Number.isInteger(s.rank)&&s.rank>=1,`${c.geography.geo_code}/${id}: rank invalid`);
    }
    if(pi.rank_robustness){
      withRobustness++;totalRange+=pi.rank_robustness.range;
      assert(pi.rank_robustness.max_rank>=pi.rank_robustness.min_rank,`${c.geography.geo_code}: rank_robustness max < min`);
      assert(pi.rank_robustness.range===pi.rank_robustness.max_rank-pi.rank_robustness.min_rank,`${c.geography.geo_code}: rank_robustness range does not match max-min`);
    }
  }
  assert(withRobustness===47,`expected rank robustness for all 47 counties, got ${withRobustness}`);
  const avgRange=Number((totalRange/47).toFixed(1));
  assert(avgRange>0,'rank robustness shows zero variation across scenarios — sensitivity scenarios are not actually different, so nothing was materially tested');
  console.log(`COUNTYIQ_P08_ROBUSTNESS_OK counties=${withRobustness} avg_rank_range=${avgRange}`);

  // The single most important guardrail in this phase: the index must
  // never claim comprehensiveness it does not have.
  assert(meth.domains_excluded.length>0,'given the current registry, at least one domain is expected to be excluded — if this ever reaches 0, re-verify the inclusion rule was not silently loosened');
  assert(/NOT a comprehensive/i.test(meth.honest_limitation),'methodology must explicitly disclaim comprehensiveness while domains are excluded');
  console.log('COUNTYIQ_P08_COMPREHENSIVENESS_DISCLAIMER_OK');

  for(const token of ['renderPerformanceIndexPanel','ciq-index-panel'])assert(ui.toLowerCase().includes(token.toLowerCase()),`CountyIQ UI missing ${token}`);
  console.log('COUNTYIQ_P08_UI_OK');

  const phase08=roadmap.phases.find(x=>x.id==='P08');
  assert(phase08?.status==='complete','P08 roadmap must be complete');
  const ids=roadmap.phases.map(x=>x.id),next=roadmap.phases.filter(x=>x.status==='next');
  if(next.length===0){
    assert(roadmap.phases.every(x=>x.status==='complete'),'zero next phases is permitted only when every roadmap phase is complete');
    console.log('COUNTYIQ_P08_ROADMAP_OK next=none_all_complete');
  }else{
    assert(next.length===1,`exactly one phase must be marked next during active development, found ${next.length}`);
    assert(ids.indexOf(next[0].id)>ids.indexOf('P08'),`the next phase (${next[0].id}) must come after P08`);
    console.log(`COUNTYIQ_P08_ROADMAP_OK next=${next[0].id}`);
  }
  console.log('COUNTYIQ_P08_ALL_OK');
}catch(error){console.error(error.message||error);process.exit(1);}
