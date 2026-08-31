import fs from 'node:fs';
const j=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P20 substance availability validation: ${msg}`);};
const source=j('data/p20/source/nacada-2022-county-availability.json');
const indicators=j('data/indicators/registry/indicators.json');
const series=j('data/indicators/registry/series.json');
const ledger=j('data/completeness/slot-ledger.json');
const indicator=indicators.find(i=>i.indicator_code==='IND-SUBSTANCE-ABUSE-PREVALENCE');
try{
  assert(source.geo_codes.length===47&&new Set(source.geo_codes).size===47,'source availability scope must contain 47 unique counties');
  assert(source.individual_sample_size===3314&&source.household_sample_size===3797,'NACADA sample anchors changed');
  assert(source.clusters_spread_across_all_47_counties===true,'cluster-coverage context must be retained');
  assert(source.county_prevalence_estimates_published===false&&source.county_uncertainty_estimates_published===false,'county estimates/uncertainty must remain explicitly unavailable');
  assert(JSON.stringify(source.published_estimate_levels)===JSON.stringify(['national','regional','urban_rural']),'published geography levels must remain national/regional/urban-rural');
  assert(indicator?.lifecycle_status==='sourced'&&indicator.active===false,'indicator must remain sourced but not numerically active at county level');
  assert(indicator.requires_sampling_uncertainty===true,'survey uncertainty requirement must remain enabled');
  assert(indicator.ranking_allowed===false,'substance-use ranking must remain withheld');
  const numericSeries=series.filter(s=>s.indicator_id===indicator.indicator_id);
  assert(numericSeries.length===0,`county/regional values must not be manufactured into the canonical county series registry; found ${numericSeries.length}`);
  for(const code of source.geo_codes){const row=ledger.rows.find(r=>r.level==='county'&&r.geo_code===code&&r.indicator_code==='IND-SUBSTANCE-ABUSE-PREVALENCE');assert(row,`${code}: completeness slot missing`);assert(row.resolved===true&&row.status==='official_unavailable',`${code}: county slot must resolve as official_unavailable`);assert(row.value===''||row.value===null||row.value===undefined,`${code}: county slot must not carry a numeric value`);assert(!row.series_code&&!row.observation_id,`${code}: county slot must not fabricate series/observation`);assert(String(row.reason).includes('regional')&&String(row.reason).includes('county'),`${code}: reason must explain geography mismatch`);}
  console.log('P20_SUBSTANCE_COUNTY_UNAVAILABLE_47_OK numeric_series=0');
  console.log('P20_SUBSTANCE_NO_REGIONAL_INHERITANCE_OK sampling_uncertainty_fabricated=false');
}catch(error){console.error(error.message||error);process.exit(1);}
