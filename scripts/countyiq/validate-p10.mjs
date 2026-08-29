import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const j=f=>JSON.parse(read(f));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P10 validation: ${msg}`);};

const mart=j('data/countyiq/county-summary.json');
const roadmap=j('data/project-roadmap.json');
const source=j('data/countyiq/source/p10-fiscal-accountability-2024-25.json');
const ui=read('assets/countyiq-view.js');
const dm=mart.meta?.delivery_layer_methodology;

try{
  assert(dm?.version==='P10-v2','delivery methodology must be P10-v2');
  assert(dm.publication_status==='published','delivery methodology must be published');
  assert(dm.reference_fiscal_year==='2024/25','P10-v2 must use one coherent FY2024/25 reference period for scored pillars');
  assert(dm.source_fixture==='data/countyiq/source/p10-fiscal-accountability-2024-25.json','source fixture path must be published');
  assert(Object.keys(source.counties||{}).length===47,'P10 source fixture must cover all 47 county keys');
  console.log('COUNTYIQ_P10_SOURCE_AND_PERIOD_OK counties=47 fy=2024/25');

  assert(Array.isArray(dm.pillars_scored)&&dm.pillars_scored.length===3,'exactly three scored pillars are required');
  assert(dm.pillars_scored.map(x=>x.id).join('|')==='execution|revenue_mobilisation|arrears_control','scored pillars must be execution, revenue mobilisation, arrears control');
  const weightSum=dm.pillars_scored.reduce((s,x)=>s+x.weight,0);
  assert(Math.abs(weightSum-1)<1e-9,'scored pillar weights must sum to 1');
  assert(Array.isArray(dm.accountability_signals_not_scored)&&dm.accountability_signals_not_scored.length===2,'wage and audit signals must be explicitly published as non-scored');
  assert(dm.accountability_signals_not_scored.some(x=>x.id==='wage_ceiling_compliance')&&dm.accountability_signals_not_scored.some(x=>x.id==='audit_opinion'),'wage and audit non-scored signals missing');
  assert(/No imputation/i.test(dm.normalization)&&/No imputation/i.test(dm.missing_data_policy),'P10 must explicitly prohibit imputation');
  assert(/capped at 100/i.test(dm.osr_cap_policy),'OSR cap policy must be published');
  console.log('COUNTYIQ_P10_METHOD_OK pillars=3 wage_audit=non_scored');

  const scored=[];const incomplete=[];
  for(const c of mart.counties){
    const dl=c.deliveryLayer;
    assert(dl?.methodology_version==='P10-v2',`${c.geography.geo_code}: methodology version mismatch`);
    assert(dl.reference_fiscal_year==='2024/25',`${c.geography.geo_code}: reference FY mismatch`);
    assert(dl.imputation_used===false,`${c.geography.geo_code}: imputation must be false`);
    for(const id of ['execution','revenue_mobilisation','arrears_control'])assert(dl.pillars?.[id],`${c.geography.geo_code}: missing ${id} pillar`);
    const osr=dl.pillars.revenue_mobilisation.measures;
    if(Number.isFinite(osr.osr_target_attainment_pct))assert(osr.scoring_value_capped_at_100_pct<=100,`${c.geography.geo_code}: OSR scoring value exceeds 100 cap`);
    assert(dl.accountability_signals.wage_ceiling.scored===false,`${c.geography.geo_code}: wage signal must not be scored`);
    assert(dl.accountability_signals.audit_opinion.scored===false,`${c.geography.geo_code}: audit signal must not be scored`);
    assert(dl.accountability_signals.audit_opinion.unqualified===false,`${c.geography.geo_code}: source states no county executive had an unqualified opinion in 2023/24`);
    if(Number.isFinite(dl.score)){
      scored.push(c);
      assert(dl.status==='published',`${c.geography.geo_code}: complete score should be published`);
      assert(dl.score>=0&&dl.score<=100,`${c.geography.geo_code}: score out of range`);
      assert(Number.isInteger(dl.rank)&&dl.rank>=1&&dl.rank<=46,`${c.geography.geo_code}: rank invalid`);
      assert(dl.missing_data.length===0,`${c.geography.geo_code}: scored record cannot list missing scored pillars`);
    }else{
      incomplete.push(c);
      assert(dl.status==='published_incomplete',`${c.geography.geo_code}: incomplete record must say published_incomplete`);
      assert(dl.rank===null,`${c.geography.geo_code}: missing-pillar county must not receive a rank`);
      assert(dl.missing_data.length>0,`${c.geography.geo_code}: incomplete record must name the missing pillar`);
    }
  }
  assert(scored.length===46,`expected 46 complete scores, got ${scored.length}`);
  assert(incomplete.length===1&&incomplete[0].geography.geo_code==='KEN-C033','Narok must be the sole incomplete score because the published pending-bills table has no submitted value');
  assert(dm.eligible_count===46,'methodology eligible_count must be 46');
  console.log('COUNTYIQ_P10_SCORE_COVERAGE_OK scored=46 incomplete=KEN-C033');

  const compliant=mart.counties.filter(c=>c.deliveryLayer.accountability_signals.wage_ceiling.compliant).map(c=>c.geography.geo_code).sort();
  const sourceCompliant=[...source.wage_compliance.compliant_geo_codes].sort();
  assert(JSON.stringify(compliant)===JSON.stringify(sourceCompliant),'wage-compliance set must exactly match the source fixture');
  assert(compliant.length===8,'final source says exactly eight counties complied with the 35% wage ceiling');
  console.log('COUNTYIQ_P10_ACCOUNTABILITY_SIGNALS_OK wage_compliant=8');

  for(const token of ['renderDeliveryLayer','arrears','OSR','wage','audit'])assert(ui.toLowerCase().includes(token.toLowerCase()),`CountyIQ UI missing ${token}`);
  const phase10=roadmap.phases.find(x=>x.id==='P10');assert(phase10?.status==='complete','P10 roadmap must be complete');
  console.log('COUNTYIQ_P10_ALL_OK');
}catch(error){console.error(error.message||error);process.exit(1);}
