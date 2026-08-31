import fs from 'node:fs';
const j=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P20 KENPHIA HIV validation: ${msg}`);};
const source=j('data/p20/source/kenphia-2018-hiv-prevalence-county.json');
const geographies=j('data/geography/registry/geographies.json');
const indicators=j('data/indicators/registry/indicators.json');
const series=j('data/indicators/registry/series.json');
const observations=j('data/indicators/registry/observations.json');
const datasets=j('data/catalogue/registry/datasets.json');
const ledger=j('data/completeness/slot-ledger.json');
const counties=geographies.filter(g=>g.level==='county').sort((a,b)=>a.geo_code.localeCompare(b.geo_code));
const srcByGeo=new Map((source.counties||[]).map(r=>[r.geo_code,r]));
const indicator=indicators.find(i=>i.indicator_code==='IND-HIV-PREVALENCE');
const dataset=datasets.find(d=>d.dataset_code==='DS-MOH-KENPHIA-HIV-PREVALENCE-2018-P20');
const obsById=new Map(observations.map(o=>[o.observation_id,o]));
const byGeo=new Map();
for(const s of series.filter(s=>s.indicator_id===indicator?.indicator_id)){
  const o=obsById.get(s.latest_observation_id); if(o) byGeo.set(o.geography_id,{s,o});
}
try{
  assert(counties.length===47&&srcByGeo.size===47,'source and canonical county coverage must reconcile 47/47');
  assert(source.reported_total_pct===4.9&&source.reported_total_unweighted_n===27745,'national point-estimate/sample anchor must remain 4.9%, n=27,745');
  assert(source.reported_total_standard_error===0.2&&source.reported_total_lower_95===4.5&&source.reported_total_upper_95===5.3,'national uncertainty anchor changed');
  assert(source.counties.reduce((a,r)=>a+Number(r.sample_size),0)===27745,'county unweighted samples must sum to 27,745');
  assert(indicator?.active===true&&indicator.lifecycle_status==='active','HIV indicator must be active');
  assert(indicator.requires_sampling_uncertainty===true,'survey uncertainty gate must remain enabled');
  assert(indicator.ranking_allowed===false,'county point-estimate ranking must remain withheld');
  assert(dataset?.publication_status==='published','KENPHIA P20 dataset must be published');
  for(const county of counties){
    const src=srcByGeo.get(county.geo_code); const pair=byGeo.get(county.geography_id);
    assert(src&&pair,`${county.geo_code}: source/observation missing`);
    assert(Number(pair.o.value)===Number(src.hiv_prevalence_pct),`${county.geo_code}: prevalence mismatch`);
    assert(Number(pair.o.sample_size)===Number(src.sample_size),`${county.geo_code}: sample size mismatch`);
    assert(Number(pair.o.standard_error)===Number(src.standard_error),`${county.geo_code}: standard error mismatch`);
    assert(pair.o.badge==='A'&&pair.o.geographic_method==='direct',`${county.geo_code}: must remain official direct survey evidence`);
    assert(pair.s.dataset_id===dataset.dataset_id,`${county.geo_code}: dataset mismatch`);
    assert(String(pair.s.series_code).startsWith('KDA-P20-KENPHIA-HIV-PREVALENCE-'),`${county.geo_code}: series namespace mismatch`);
    assert(String(pair.o.source_table).includes('Table 6.D')&&String(pair.o.source_table).includes('Table C.3'),`${county.geo_code}: source-table/uncertainty provenance missing`);
    if(county.geo_code==='KEN-C007'){
      assert(pair.o.value===0&&pair.o.standard_error===0,'Garissa published zero estimate/SE must be preserved');
      assert(pair.o.lower_bound===null&&pair.o.upper_bound===null&&pair.o.confidence_level===null,'Garissa unavailable confidence limits must remain null');
    }else{
      assert(Number(pair.o.lower_bound)===Number(src.lower_95)&&Number(pair.o.upper_bound)===Number(src.upper_95),`${county.geo_code}: confidence limits mismatch`);
      assert(Number(pair.o.confidence_level)===0.95,`${county.geo_code}: confidence level must remain 95%`);
    }
    const row=ledger.rows.find(r=>r.level==='county'&&r.geo_code===county.geo_code&&r.indicator_code==='IND-HIV-PREVALENCE');
    assert(row?.resolved===true,`${county.geo_code}: completeness slot must resolve`);
  }
  console.log('P20_KENPHIA_HIV_47X1_OK promoted=47');
  console.log('P20_KENPHIA_HIV_UNCERTAINTY_OK n=27745 national=4.9 garissa_bounds=null');
}catch(error){console.error(error.message||error);process.exit(1);}
