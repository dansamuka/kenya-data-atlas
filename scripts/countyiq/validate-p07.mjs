import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const j=f=>JSON.parse(read(f));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P07 validation: ${msg}`);};

const mart=j('data/countyiq/county-summary.json');
const roadmap=j('data/project-roadmap.json');
const ui=read('assets/countyiq-view.js');

try{
  assert(mart.counties.length===47,'expected 47 counties');
  let gapCount=0,moneyGapCount=0,workingWellCount=0,needsAttentionCount=0,changedCount=0;
  for(const c of mart.counties){
    assert(c.gaps?.methodology_version==='P07-v1',`${c.geography.geo_code}: gaps.methodology_version must be P07-v1`);
    assert(Array.isArray(c.gaps.items),`${c.geography.geo_code}: gaps.items must be an array`);
    for(const g of c.gaps.items){
      gapCount++;
      for(const field of ['formula','benchmark_source','benchmark_selection_rule','period','source_url'])
        assert(g[field],`${c.geography.geo_code}/${g.indicator_code}: gap missing ${field}`);
      assert('denominator' in g,`${c.geography.geo_code}/${g.indicator_code}: gap missing denominator field`);
      assert(Number.isFinite(g.gap),`${c.geography.geo_code}/${g.indicator_code}: gap value not numeric`);
      assert(typeof g.favourable_to_county==='boolean',`${c.geography.geo_code}/${g.indicator_code}: favourable_to_county must be boolean`);
    }
    if(c.gaps.monetary_counterfactual){
      moneyGapCount++;
      const mc=c.gaps.monetary_counterfactual;
      for(const field of ['formula','benchmark_source','period','denominator','interpretation'])
        assert(mc[field],`${c.geography.geo_code}: monetary_counterfactual missing ${field}`);
      assert(Number.isFinite(mc.additional_development_spending_kes_million),`${c.geography.geo_code}: monetary_counterfactual value not numeric`);
      // The figure must be reconstructible from the three inputs it declares.
      const expected=Number((-(mc.county_rate_pct-mc.benchmark_rate_pct)/100*mc.county_budget_kes_million).toFixed(2));
      assert(Math.abs(expected-mc.additional_development_spending_kes_million)<0.01,`${c.geography.geo_code}: monetary_counterfactual is not reproducible from its own stated inputs`);
    }
    // No indicator without an active development-budget denominator may
    // carry a KES/monetary figure — only the overall-absorption
    // counterfactual is permitted to exist.
    assert(!c.gaps.items.some(g=>/kes|shilling/i.test(g.formula||'')),`${c.geography.geo_code}: a non-monetary gap formula must not reference currency`);
    workingWellCount+=c.narrative.working_well.length;
    needsAttentionCount+=c.narrative.needs_attention.length;
    changedCount+=c.narrative.what_changed.length;
    // Every narrative sentence must cite a real number and a real period —
    // a crude but effective reproducibility check: it must contain a digit
    // and a 4-digit year or FY token.
    for(const s of [...c.narrative.working_well,...c.narrative.needs_attention,...c.narrative.what_changed]){
      assert(/\d/.test(s),`${c.geography.geo_code}: narrative sentence has no number: "${s}"`);
      assert(/\d{4}|FY\d/.test(s),`${c.geography.geo_code}: narrative sentence has no period reference: "${s}"`);
    }
    // Direction wording sanity: "higher"/"lower" in a sentence must match
    // the actual sign of county_value vs the stated benchmark value quoted
    // in the same sentence (regression guard for the county-vs-benchmark
    // direction bug class).
    for(const s of [...c.narrative.working_well,...c.narrative.needs_attention]){
      const m=s.match(/^(.*?): ([\d.,]+)%? in .*— (higher|lower|equal to) than the \w+ median of ([\d.,]+)%?\./);
      if(!m)continue;
      const county=Number(m[2].replace(/,/g,'')),bench=Number(m[4].replace(/,/g,'')),word=m[3];
      if(county>bench)assert(word==='higher',`${c.geography.geo_code}: narrative says "${word}" but ${county} > ${bench}: "${s}"`);
      else if(county<bench)assert(word==='lower',`${c.geography.geo_code}: narrative says "${word}" but ${county} < ${bench}: "${s}"`);
    }
  }
  assert(gapCount>0,'no gaps computed');
  assert(moneyGapCount>0,'no monetary counterfactuals computed');
  assert(workingWellCount>0&&needsAttentionCount>0,`expected both strengths and weaknesses to appear across counties; working_well=${workingWellCount} needs_attention=${needsAttentionCount}`);
  console.log(`COUNTYIQ_P07_GAPS_OK gaps=${gapCount} monetary=${moneyGapCount}`);
  console.log(`COUNTYIQ_P07_NARRATIVE_OK working_well=${workingWellCount} needs_attention=${needsAttentionCount} changed=${changedCount}`);
  console.log('COUNTYIQ_P07_DIRECTION_WORDING_OK');

  for(const token of ['renderGapPanel','ciq-gap-panel','What changed'])assert(ui.includes(token),`CountyIQ UI missing ${token}`);
  console.log('COUNTYIQ_P07_UI_OK');

  const phase07=roadmap.phases.find(x=>x.id==='P07');
  assert(phase07?.status==='complete','P07 roadmap must be complete');
  const ids=roadmap.phases.map(x=>x.id),next=roadmap.phases.filter(x=>x.status==='next');
  assert(next.length===1,`exactly one phase must be marked next, found ${next.length}`);
  assert(ids.indexOf(next[0].id)>ids.indexOf('P07'),`the next phase (${next[0].id}) must come after P07`);
  console.log(`COUNTYIQ_P07_ROADMAP_OK next=${next[0].id}`);
  console.log('COUNTYIQ_P07_ALL_OK');
}catch(error){console.error(error.message||error);process.exit(1);}
