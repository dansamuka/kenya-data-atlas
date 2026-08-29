import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const j=f=>JSON.parse(read(f));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P11 validation: ${msg}`);};

const mart=j('data/countyiq/county-summary.json');
const roadmap=j('data/project-roadmap.json');
const ui=read('assets/countyiq-view.js');
const rm=mart.meta?.recognition_methodology;

const fv=(c,fy,key)=>c.fiscal.history.find(h=>h.fiscal_year===fy)?.[key]?.value;

try{
  assert(rm?.version==='P11-v2','recognition methodology must be P11-v2');
  assert(rm.publication_status==='published','P11 must be published');
  assert(rm.subject==='county_administration_period','publication subject must be county_administration_period');
  assert(rm.person_attribution===false,'person attribution must be false');
  assert(/not a personal causal score|not a personal causal/i.test(rm.attribution_statement),'methodology must state the causal-attribution limitation');
  assert(/excluded/.test(rm.performance_index_excluded.toLowerCase()),'P08/P09 snapshot must be explicitly excluded from P11 recognition');
  console.log('COUNTYIQ_P11_ATTRIBUTION_GUARDRAIL_OK');

  const ap=rm.administration_periods;
  assert(ap?.status==='published','administration periods must now be published');
  assert(ap.record_count===47&&Array.isArray(ap.records)&&ap.records.length===47,'must publish 47 administration-period records');
  const cycle=ap.cycle_definition;
  assert(cycle.election_date==='2022-08-09','cycle must anchor to the 9 Aug 2022 general election');
  assert(cycle.baseline_fiscal_year==='2021/22','baseline must be last full pre-election fiscal year');
  assert(cycle.transition_fiscal_year==='2022/23','transition year must be FY2022/23');
  assert(cycle.first_full_cycle_fiscal_year==='2023/24','first full cycle FY must be 2023/24');
  assert(cycle.latest_full_cycle_fiscal_year==='2024/25','latest full cycle FY must be 2024/25');
  assert(/excluded/.test(rm.transition_year_policy.toLowerCase()),'transition-year policy must explicitly exclude FY2022/23 from baseline-change attribution');
  console.log('COUNTYIQ_P11_ADMIN_PERIODS_OK records=47');

  for(const c of mart.counties){
    const a=c.administrationScorecard;
    assert(a?.subject==='county_administration_period',`${c.geography.geo_code}: administration scorecard subject invalid`);
    assert(a.person_attribution===false&&a.office_holder_name===null,`${c.geography.geo_code}: no named person may be scored`);
    assert(a.baseline_fiscal_year==='2021/22'&&a.latest_full_cycle_fiscal_year==='2024/25',`${c.geography.geo_code}: baseline/latest periods invalid`);
    const expectedO=Number((fv(c,'2024/25','overall_absorption')-fv(c,'2021/22','overall_absorption')).toFixed(3));
    const expectedD=Number((fv(c,'2024/25','development_absorption')-fv(c,'2021/22','development_absorption')).toFixed(3));
    assert(Math.abs(a.fiscal_changes.overall_absorption_pp.baseline_to_latest_change-expectedO)<0.001,`${c.geography.geo_code}: overall baseline-to-latest change mismatch`);
    assert(Math.abs(a.fiscal_changes.development_absorption_pp.baseline_to_latest_change-expectedD)<0.001,`${c.geography.geo_code}: development baseline-to-latest change mismatch`);
    assert(a.fiscal_changes.overall_absorption_pp.transition_context===fv(c,'2022/23','overall_absorption'),`${c.geography.geo_code}: transition context must remain visible`);
    assert(c.recognition?.methodology_version==='P11-v2',`${c.geography.geo_code}: recognition methodology version mismatch`);
    assert(c.recognition.person_attribution===false,`${c.geography.geo_code}: recognition must not attribute to a person`);
  }
  console.log('COUNTYIQ_P11_BASELINE_CHANGE_RECOMPUTATION_OK counties=47');

  assert(Array.isArray(rm.recognition_rules_published)&&rm.recognition_rules_published.length>=5,'published recognition rules missing');
  for(const rule of rm.recognition_rules_published){
    for(const field of ['formula','eligible','tie_rule'])assert(typeof rule[field]==='string'&&rule[field].length>10,`${rule.id}: ${field} must be published`);
    const text=JSON.stringify(rule).toLowerCase();
    assert(!text.includes('performanceindex')&&!text.includes('equal_domain')&&!text.includes('equal_indicator'),`${rule.id}: P09 composite must not enter recognition formula`);
  }
  for(const r of rm.county_recognition){
    assert(Array.isArray(r.top)&&r.top.length>0,`${r.id}: recognition output must contain qualifying/top entries`);
    assert(Number.isInteger(r.eligible_count)&&r.eligible_count>0,`${r.id}: eligible_count must be published`);
    for(const t of r.top){
      assert(t.geo_code&&t.period&&Number.isFinite(t.value),`${r.id}: recognition entry missing geo_code/period/value`);
      assert(!('office_holder_name' in t)&&!('governor' in t),`${r.id}: person fields are prohibited`);
    }
  }
  const wage=rm.county_recognition.find(x=>x.id==='wage-ceiling-compliance');
  assert(wage?.qualifying_count===8&&wage.top.length===8,'wage-ceiling recognition must equally include the eight compliant counties');
  const pending=rm.county_recognition.find(x=>x.id==='lowest-pending-bills-burden');
  assert(pending?.eligible_count===46,'pending-bills recognition must exclude the one non-submitted value');
  console.log(`COUNTYIQ_P11_RECOGNITION_RULES_OK categories=${rm.county_recognition.length}`);

  for(const token of ['renderRecognitionPanel','administration','baseline','2022/23','person'])assert(ui.toLowerCase().includes(token.toLowerCase()),`CountyIQ UI missing ${token}`);
  const phase11=roadmap.phases.find(x=>x.id==='P11');assert(phase11?.status==='complete','P11 roadmap must be complete');
  console.log('COUNTYIQ_P11_ALL_OK');
}catch(error){console.error(error.message||error);process.exit(1);}
