import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async p => JSON.parse(await readFile(path.join(root,p),'utf8'));
const [taxonomy,indicators,series,observations,geographies,subsetsDoc] = await Promise.all([
  read('data/indicators/seed/placeholder-taxonomy.json'), read('data/indicators/registry/indicators.json'),
  read('data/indicators/registry/series.json'), read('data/indicators/registry/observations.json'),
  read('data/geography/registry/geographies.json'), read('data/geography/reference/geography-subsets.json')
]);

const errors=[];
const validLifecycle=new Set(['planned','sourced','active','retired']);
const validTabs=new Set(['people','economy','health','finance','representation','infrastructure','resilience']);
const validLevels=new Set(['county','constituency','ward']);
const byCode=new Map(indicators.map(i=>[i.indicator_code,i]));
const seriesByIndicator=new Map();
for(const s of series){if(!seriesByIndicator.has(s.indicator_id))seriesByIndicator.set(s.indicator_id,[]);seriesByIndicator.get(s.indicator_id).push(s);}
const obsBySeries=new Map();
for(const o of observations){if(!obsBySeries.has(o.series_id))obsBySeries.set(o.series_id,[]);obsBySeries.get(o.series_id).push(o);}
const subsetByKey=new Map((subsetsDoc.subsets||[]).map(s=>[s.key,s]));
const countyNames=new Set(geographies.filter(g=>g.level==='county').map(g=>g.name));
// §11.6 is source-type based, not tab based. Monetary poverty is generated
// from a household sample survey and therefore carries the same uncertainty
// obligations as the KDHS/NACADA rows once it becomes active.
const surveyCodes=new Set([...(taxonomy.survey_indicator_codes||[]),'IND-POVERTY-RATE']);
const noRankingCodes=new Set(taxonomy.sensitive_no_ranking_codes||[]);
const excludedCodes=new Set(taxonomy.excluded_subnational_composite_codes||[]);

for(const i of indicators){
  if(!validLifecycle.has(i.lifecycle_status)) errors.push(`${i.indicator_code}: invalid lifecycle_status ${i.lifecycle_status}`);
  if(!validTabs.has(i.tab)) errors.push(`${i.indicator_code}: invalid tab ${i.tab}`);
  if(!Array.isArray(i.applies_to_levels)) errors.push(`${i.indicator_code}: applies_to_levels must be an array`);
  else for(const level of i.applies_to_levels) if(!validLevels.has(level)) errors.push(`${i.indicator_code}: invalid applies_to_level ${level}`);
  const ownSeries=seriesByIndicator.get(i.indicator_id)||[];
  if(['planned','sourced'].includes(i.lifecycle_status)&&ownSeries.length) errors.push(`${i.indicator_code}: ${i.lifecycle_status} indicator has ${ownSeries.length} series`);
  if(i.lifecycle_status==='active'&&!ownSeries.length) errors.push(`${i.indicator_code}: active indicator has no series`);
  if(i.lifecycle_status==='sourced'&&(!i.expected_source||!i.expected_source_url)) errors.push(`${i.indicator_code}: sourced indicator requires expected_source + expected_source_url`);
  if(i.tab==='health'&&i.applies_to_levels.some(l=>l!=='county')) errors.push(`${i.indicator_code}: health tab may apply only to county`);
  if(i.tab==='finance'&&i.applies_to_levels.some(l=>l!=='county')) errors.push(`${i.indicator_code}: finance tab may apply only to county`);
  if(i.tab==='representation'&&i.applies_to_levels.some(l=>l==='county')) errors.push(`${i.indicator_code}: representation may not apply to county`);
  if(i.tab==='resilience'){
    if(i.applies_to_levels.some(l=>l!=='county')) errors.push(`${i.indicator_code}: resilience may apply only to county`);
    if(!i.applies_to_geography_subset) errors.push(`${i.indicator_code}: resilience requires a geography subset`);
    else if(!subsetByKey.has(i.applies_to_geography_subset)) errors.push(`${i.indicator_code}: undefined subset ${i.applies_to_geography_subset}`);
  }
  if(surveyCodes.has(i.indicator_code)&&i.requires_sampling_uncertainty!==true) errors.push(`${i.indicator_code}: sample-survey indicator must set requires_sampling_uncertainty=true`);
  if(noRankingCodes.has(i.indicator_code)&&i.ranking_allowed!==false) errors.push(`${i.indicator_code}: sensitive indicator must set ranking_allowed=false`);
  if(excludedCodes.has(i.indicator_code)&&(i.applies_to_levels||[]).length) errors.push(`${i.indicator_code}: excluded composite must not have subnational profile levels`);
}

for(const [level,tabs] of Object.entries(taxonomy.tabs||{})){
  if(!validLevels.has(level)) errors.push(`taxonomy: invalid level ${level}`);
  if(new Set(tabs).size!==tabs.length) errors.push(`taxonomy ${level}: duplicate tab`);
  for(const tab of tabs) if(tab!=='overview'&&!validTabs.has(tab)) errors.push(`taxonomy ${level}: invalid tab ${tab}`);
}
for(const [level,tabMap] of Object.entries(taxonomy.slots||{})){
  for(const [tab,codes] of Object.entries(tabMap)){
    if(!(taxonomy.tabs[level]||[]).includes(tab)) errors.push(`taxonomy ${level}/${tab}: slot list exists for a tab not rendered at this level`);
    for(const code of codes){
      const i=byCode.get(code);
      if(!i) {errors.push(`taxonomy ${level}/${tab}: unknown indicator ${code}`);continue;}
      if(!(i.applies_to_levels||[]).includes(level)) errors.push(`taxonomy ${level}/${tab}: ${code} does not apply to ${level}`);
    }
  }
}

for(const subset of subsetsDoc.subsets||[]){
  if(!subset.key||!subset.source_url||!subset.source_name) errors.push('geography subset: key/source_name/source_url required');
  if(subset.level!=='county') errors.push(`${subset.key}: only county subsets are supported by this taxonomy version`);
  if(!Array.isArray(subset.members)||!subset.members.length) errors.push(`${subset.key}: members required`);
  const seen=new Set();
  for(const name of subset.members||[]){
    if(seen.has(name)) errors.push(`${subset.key}: duplicate member ${name}`);seen.add(name);
    if(!countyNames.has(name)) errors.push(`${subset.key}: county ${name} does not resolve in geography registry`);
  }
  for(const partial of subset.partial_memberships||[]) if(!countyNames.has(partial.county)) errors.push(`${subset.key}: partial county ${partial.county} does not resolve`);
}

for(const code of surveyCodes){
  const i=byCode.get(code); if(!i) {errors.push(`survey rule: missing ${code}`);continue;}
  if(i.lifecycle_status!=='active') continue;
  for(const s of seriesByIndicator.get(i.indicator_id)||[]){
    for(const o of obsBySeries.get(s.series_id)||[]){
      if(o.confidence_level==null||o.standard_error==null||o.sample_size==null) errors.push(`${code}: active survey observation ${o.observation_id} lacks confidence_level/standard_error/sample_size`);
    }
  }
}

const pop2009=byCode.get('IND-POP-2009');
if(pop2009){
  const n=(seriesByIndicator.get(pop2009.indicator_id)||[]).length;
  if(n!==47) errors.push(`IND-POP-2009: expected 47 county series, found ${n}`);
}

if(errors.length){console.error(`FAIL placeholder taxonomy: ${errors.length} error(s)\n`+errors.slice(0,80).map(e=>`  - ${e}`).join('\n'));process.exit(1);}
console.log(`PASS placeholder taxonomy: ${indicators.length} indicators; lifecycle/tab/subset/survey rules valid.`);
