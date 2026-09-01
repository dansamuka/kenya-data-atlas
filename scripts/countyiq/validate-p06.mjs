import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const j=f=>JSON.parse(read(f));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P06 validation: ${msg}`);};

const mart=j('data/countyiq/county-summary.json');
const indicators=j('data/indicators/registry/indicators.json');
const roadmap=j('data/project-roadmap.json');
const ui=read('assets/countyiq-view.js');
const ux=read('assets/countyiq-ux.js');
const uxCss=read('assets/countyiq-ux.css');
const opportunities=read('assets/opportunity-finder.js');
const indByCode=new Map(indicators.map(x=>[x.indicator_code,x]));

try{
  assert(mart.meta?.methodology_version==='P06-v1','mart methodology_version must advance to P06-v1');
  assert(mart.meta?.peer_group_definition?.method==='population_quartile','peer-group definition must be published in mart meta');
  assert(mart.meta?.peer_group_definition?.reproducible_from,'peer-group definition must state how it is reproducible');
  console.log('COUNTYIQ_P06_METHODOLOGY_PUBLISHED_OK');

  assert(mart.counties.length===47,'expected 47 counties');
  const tierCounts={1:0,2:0,3:0,4:0};
  for(const c of mart.counties){
    const p=c.benchmarks?.peer_group;
    assert(p&&[1,2,3,4].includes(p.tier),`${c.geography.geo_code}: missing/invalid peer_group tier`);
    assert(typeof p.tier_label==='string'&&p.tier_label.length>0,`${c.geography.geo_code}: peer_group missing tier_label`);
    tierCounts[p.tier]++;
    assert(c.benchmarks?.national?.methodology_version==='P06-v1',`${c.geography.geo_code}: national benchmark methodology missing`);
  }
  assert(Object.values(tierCounts).every(n=>n>=8&&n<=15),`peer tiers should be roughly balanced quartiles, got ${JSON.stringify(tierCounts)}`);
  console.log(`COUNTYIQ_P06_PEER_GROUPS_OK tiers=${JSON.stringify(tierCounts)}`);

  const label=JSON.stringify(mart.meta.peer_group_definition);
  assert(/no implication about development performance/i.test(mart.meta.peer_group_definition.disclaimer||''),'peer-group definition must disclaim quality implication');
  for(const c of mart.counties)assert(!/best|worst|good|bad|weak|strong/i.test(c.benchmarks.peer_group.tier_label),`${c.geography.geo_code}: peer tier label must be neutral, got "${c.benchmarks.peer_group.tier_label}"`);
  console.log('COUNTYIQ_P06_PEER_GROUP_NEUTRALITY_OK');

  let rankedCount=0,directional=0,nonDirectional=0,trendEligible=0;
  for(const c of mart.counties){
    for(const [code,m] of Object.entries(c.metrics)){
      if(!m.ranking?.eligible)continue;
      rankedCount++;
      assert(Number.isInteger(m.ranking.rank)&&m.ranking.rank>=1&&m.ranking.rank<=m.ranking.eligible_count,`${c.geography.geo_code}/${code}: rank out of range`);
      assert(Number.isFinite(m.ranking.percentile),`${c.geography.geo_code}/${code}: percentile missing`);
      assert(Number.isFinite(m.ranking.national_median),`${c.geography.geo_code}/${code}: national_median missing`);
      const ind=indByCode.get(code);
      const expectedHib=ind?.higher_is_better??null;
      assert(m.ranking.higher_is_better===expectedHib,`${c.geography.geo_code}/${code}: ranking.higher_is_better must mirror the published indicator registry rule`);
      if(expectedHib===null)nonDirectional++;else directional++;
      if(m.ranking.peer_group){
        assert(m.ranking.peer_group.rank>=1&&m.ranking.peer_group.rank<=m.ranking.peer_group.eligible_count,`${c.geography.geo_code}/${code}: peer rank out of range`);
      }
      if(m.trend?.eligible){
        trendEligible++;
        assert(['improving','worsening','stable','rising','falling','flat','not_classified'].includes(m.trend.direction),`${c.geography.geo_code}/${code}: unrecognised trend direction "${m.trend.direction}"`);
        if(expectedHib===null)assert(['rising','falling','flat'].includes(m.trend.direction),`${c.geography.geo_code}/${code}: non-directional indicator must not use improving/worsening language, got "${m.trend.direction}"`);
        else assert(['improving','worsening','stable'].includes(m.trend.direction),`${c.geography.geo_code}/${code}: directional indicator should classify improving/worsening/stable, got "${m.trend.direction}"`);
      }
    }
  }
  assert(rankedCount>0,'no ranked metrics found — P06 computed nothing');
  assert(directional>0&&nonDirectional>0,'expected both directional and non-directional ranked indicators to be present');
  assert(trendEligible>0,'expected at least some metrics with a 2+ period trend');
  console.log(`COUNTYIQ_P06_RANKING_OK ranked=${rankedCount} directional=${directional} non_directional=${nonDirectional} trend_eligible=${trendEligible}`);

  const sample=mart.counties.find(c=>c.metrics['IND-COUNTY-BUDGET-ABSORPTION']?.ranking?.eligible);
  assert(sample,'expected at least one county with an eligible IND-COUNTY-BUDGET-ABSORPTION ranking');
  assert(sample.metrics['IND-COUNTY-BUDGET-ABSORPTION'].ranking.higher_is_better===true,'budget absorption must be higher-is-better');
  console.log('COUNTYIQ_P06_DIRECTION_SPOTCHECK_OK');

  for(const token of ['renderPeerIntelligence','peerTierLine','ciq-peer-group','Peer &amp; national standing'])assert(ui.includes(token),`CountyIQ UI missing ${token}`);
  console.log('COUNTYIQ_P06_UI_OK');

  for(const token of ['ciq-jump-nav','wrapFiscalTable','progressiveList','Back to top of CountyIQ'])assert(ux.includes(token),`CountyIQ UX enhancement missing ${token}`);
  for(const token of ['ciq-jump-nav-wrap','ciq-history-disclosure','ciq-disclosure-button','ciq-progressive-item'])assert(uxCss.includes(token),`CountyIQ UX stylesheet missing ${token}`);
  assert(opportunities.includes('assets/countyiq-ux.css')&&opportunities.includes('assets/countyiq-ux.js'),'Opportunity surface must load the CountyIQ UX enhancement');
  console.log('COUNTYIQ_P06_UX_CONTRACT_OK');

  const phase06=roadmap.phases.find(x=>x.id==='P06');
  assert(phase06?.status==='complete','P06 roadmap must be complete');
  const order=roadmap.phases.map(x=>x.id);
  const nextPhases=roadmap.phases.filter(x=>x.status==='next');
  if(nextPhases.length===0){
    assert(roadmap.phases.every(x=>x.status==='complete'),'zero next phases is permitted only when every roadmap phase is complete');
    console.log('COUNTYIQ_P06_ROADMAP_OK next=none_all_complete');
  }else{
    assert(nextPhases.length===1,`exactly one phase must be marked next during active development, found ${nextPhases.length}`);
    assert(order.indexOf(nextPhases[0].id)>order.indexOf('P06'),`the next phase (${nextPhases[0].id}) must come after P06 — roadmap must only move forward`);
    console.log(`COUNTYIQ_P06_ROADMAP_OK next=${nextPhases[0].id}`);
  }
  console.log('COUNTYIQ_P06_ALL_OK');
}catch(error){console.error(error.message||error);process.exit(1);}
