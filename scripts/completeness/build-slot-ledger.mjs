import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const readJson=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const outDir=path.join(root,'data/completeness');
fs.mkdirSync(outDir,{recursive:true});

const [geographies,indicators,series,observations,taxonomy,subsetsDoc,datasets,sources,agencies]=[
  'data/geography/registry/geographies.json',
  'data/indicators/registry/indicators.json',
  'data/indicators/registry/series.json',
  'data/indicators/registry/observations.json',
  'data/indicators/seed/placeholder-taxonomy.json',
  'data/geography/reference/geography-subsets.json',
  'data/catalogue/registry/datasets.json',
  'data/catalogue/registry/sources.json',
  'data/catalogue/registry/agencies.json'
].map(readJson);

const overviewSlots={
  county:['IND-POPULATION','IND-REGISTERED-VOTERS','IND-LAND-AREA','IND-GCP-CURRENT','IND-COUNTY-BUDGET-ABSORPTION','IND-FUEL-PETROL'],
  constituency:['IND-POPULATION','IND-REGISTERED-VOTERS','IND-LAND-AREA'],
  ward:['IND-POPULATION','IND-REGISTERED-VOTERS','IND-LAND-AREA']
};

const indicatorByCode=new Map(indicators.map(i=>[i.indicator_code,i]));
const obsById=new Map(observations.map(o=>[o.observation_id,o]));
const datasetById=new Map(datasets.map(d=>[d.dataset_id,d]));
const sourceById=new Map(sources.map(s=>[s.source_id,s]));
const agencyById=new Map(agencies.map(a=>[a.agency_id,a]));
const subsetByKey=new Map((subsetsDoc.subsets||[]).map(s=>[s.key,s]));
const seriesByGeoIndicator=new Map();
for(const s of series){
  const key=`${s.geography_id}|${s.indicator_id}`;
  if(!seriesByGeoIndicator.has(key))seriesByGeoIndicator.set(key,[]);
  seriesByGeoIndicator.get(key).push(s);
}

const periodKey=o=>String(o?.period_end||o?.period_start||o?.period_label||'');
function latestPair(geoId,indicator){
  if(!indicator)return null;
  const pairs=(seriesByGeoIndicator.get(`${geoId}|${indicator.indicator_id}`)||[])
    .map(s=>({series:s,obs:obsById.get(s.latest_observation_id)}))
    .filter(x=>x.obs)
    .sort((a,b)=>periodKey(b.obs).localeCompare(periodKey(a.obs)));
  return pairs[0]||null;
}
function sourceLabel(s){
  if(!s)return '';
  const dataset=datasetById.get(s.dataset_id);
  const source=dataset?sourceById.get(dataset.source_id):null;
  const agency=source?agencyById.get(source.agency_id):null;
  return agency?.abbreviation||agency?.name||source?.name||dataset?.name||'';
}
function tabsFor(geo){
  return (taxonomy.tabs?.[geo.level]||[]).filter(tab=>{
    const subsetKey=taxonomy.conditional_tabs?.[tab];
    if(!subsetKey)return true;
    return Boolean(subsetByKey.get(subsetKey)?.members?.includes(geo.name));
  });
}
function slotCodes(geo,tab){
  if(tab==='overview')return overviewSlots[geo.level]||[];
  return taxonomy.slots?.[geo.level]?.[tab]||[];
}
function evidenceStatus(pair){
  const badge=String(pair.obs.badge||'').toUpperCase();
  const method=String(pair.obs.geographic_method||pair.series.geographic_method||'direct').toLowerCase();
  if(badge==='E')return 'external_verified';
  if(badge==='D'||method.includes('model'))return 'published_modelled';
  if(badge==='B'||badge==='C'||method!=='direct')return 'published_derived';
  return 'published_direct';
}
function plannedPhase(level,tab,status){
  if(level==='country')return 'P25';
  if(level==='constituency')return 'P23';
  if(level==='ward')return 'P24';
  if(tab==='resilience')return 'P22';
  if(status==='sourced_uningested')return 'P20';
  if(status==='active_missing')return 'P18';
  return 'P21';
}
function classify(geo,tab,code){
  const indicator=indicatorByCode.get(code);
  if(!indicator)return {status:'unknown_missing',resolved:false,reason:'Indicator code is referenced by the public slot taxonomy but absent from the canonical indicator registry.',completion_phase:'P18'};
  const pair=latestPair(geo.geography_id,indicator);
  if(pair){
    return {status:evidenceStatus(pair),resolved:true,reason:'Canonical series has a latest observation for this geography and indicator.',completion_phase:'complete',pair};
  }
  const lifecycle=indicator.lifecycle_status||(indicator.active?'active':'planned');
  let status='unknown_missing';
  if(lifecycle==='active')status='active_missing';
  else if(lifecycle==='sourced')status='sourced_uningested';
  else if(lifecycle==='planned')status='planned_unresolved';
  const reason=status==='active_missing'
    ? 'Indicator is active but no canonical observation is attached to this geography.'
    : status==='sourced_uningested'
      ? (indicator.expected_availability_note||'A source is identified but this geography has not yet been activated in the canonical registry.')
      : status==='planned_unresolved'
        ? (indicator.expected_availability_note||'The slot is planned and still requires a defensible primary source or an explicit retire/replace decision.')
        : 'Lifecycle state could not be classified.';
  return {status,resolved:false,reason,completion_phase:plannedPhase(geo.level,tab,status)};
}

const rows=[];
for(const geo of geographies.filter(g=>['county','constituency','ward'].includes(g.level))){
  for(const tab of tabsFor(geo)){
    for(const code of slotCodes(geo,tab)){
      const indicator=indicatorByCode.get(code);
      const c=classify(geo,tab,code);
      const pair=c.pair;
      rows.push({
        slot_key:`${geo.geo_code}|profile|${tab}|${code}`,
        surface:'profile',
        geography_id:geo.geography_id,
        geo_code:geo.geo_code,
        geography_name:geo.name,
        level:geo.level,
        tab,
        indicator_code:code,
        indicator_name:indicator?.name||code,
        lifecycle_status:indicator?.lifecycle_status||'',
        status:c.status,
        resolved:c.resolved,
        completion_phase:c.completion_phase,
        reason:c.reason,
        series_code:pair?.series?.series_code||'',
        observation_id:pair?.obs?.observation_id||'',
        period_label:pair?.obs?.period_label||'',
        value:pair?.obs?.value??'',
        badge:pair?.obs?.badge||'',
        geographic_method:pair?.obs?.geographic_method||pair?.series?.geographic_method||'',
        source:pair?sourceLabel(pair.series):(indicator?.expected_source||''),
        source_url:indicator?.expected_source_url||indicator?.methodology_url||''
      });
    }
  }
}

const country=geographies.find(g=>g.level==='country');
for(const code of taxonomy.national_pulse_slots||[]){
  const indicator=indicatorByCode.get(code);
  const c=country?classify(country,'national_pulse',code):{status:'unknown_missing',resolved:false,reason:'Country geography missing.',completion_phase:'P18'};
  const pair=c.pair;
  rows.push({
    slot_key:`${country?.geo_code||'KEN'}|national_pulse|national_pulse|${code}`,
    surface:'national_pulse',
    geography_id:country?.geography_id||'',
    geo_code:country?.geo_code||'KEN',
    geography_name:country?.name||'Kenya',
    level:'country',
    tab:'national_pulse',
    indicator_code:code,
    indicator_name:indicator?.name||code,
    lifecycle_status:indicator?.lifecycle_status||'',
    status:c.status,
    resolved:c.resolved,
    completion_phase:c.completion_phase,
    reason:c.reason,
    series_code:pair?.series?.series_code||'',
    observation_id:pair?.obs?.observation_id||'',
    period_label:pair?.obs?.period_label||'',
    value:pair?.obs?.value??'',
    badge:pair?.obs?.badge||'',
    geographic_method:pair?.obs?.geographic_method||pair?.series?.geographic_method||'',
    source:pair?sourceLabel(pair.series):(indicator?.expected_source||''),
    source_url:indicator?.expected_source_url||indicator?.methodology_url||''
  });
}

rows.sort((a,b)=>a.slot_key.localeCompare(b.slot_key));
const countBy=key=>Object.fromEntries([...new Set(rows.map(r=>r[key]))].sort().map(value=>[value,rows.filter(r=>r[key]===value).length]));
const resolved=rows.filter(r=>r.resolved).length;
const uniqueIndicators=new Set(rows.map(r=>r.indicator_code)).size;
const summary={
  schema_version:'kda.completeness.summary.v1',
  definition:'A slot is resolved only when the canonical registry supplies a published/direct, transparently derived, modelled, or verified external observation. Sourced-but-uningested and planned slots remain unresolved until a later phase or an explicit evidence-state/retirement rule resolves them.',
  total_slots:rows.length,
  resolved_slots:resolved,
  unresolved_slots:rows.length-resolved,
  resolved_pct:Number((resolved/rows.length*100).toFixed(2)),
  unique_indicator_slots:uniqueIndicators,
  unknown_missing:rows.filter(r=>r.status==='unknown_missing').length,
  active_missing:rows.filter(r=>r.status==='active_missing').length,
  by_level:countBy('level'),
  by_status:countBy('status'),
  by_completion_phase:countBy('completion_phase')
};
const ledger={
  schema_version:'kda.completeness.slot-ledger.v1',
  target_definition:'Every public data slot must end in a defensible resolved evidence state; parent values are never inherited to fill child geographies.',
  expected_slot_instances:20115,
  rows
};

const csvCols=['slot_key','surface','geo_code','geography_name','level','tab','indicator_code','indicator_name','lifecycle_status','status','resolved','completion_phase','reason','series_code','observation_id','period_label','value','badge','geographic_method','source','source_url'];
const q=v=>`"${String(v??'').replaceAll('"','""')}"`;
const csv=[csvCols.join(','),...rows.map(r=>csvCols.map(c=>q(r[c])).join(','))].join('\n')+'\n';
fs.writeFileSync(path.join(outDir,'slot-ledger.json'),JSON.stringify(ledger,null,2)+'\n');
fs.writeFileSync(path.join(outDir,'slot-ledger.csv'),csv);
fs.writeFileSync(path.join(outDir,'summary.json'),JSON.stringify(summary,null,2)+'\n');

console.log(`P18_COMPLETENESS_LEDGER_OK slots=${rows.length} resolved=${resolved} unresolved=${rows.length-resolved} unknown=${summary.unknown_missing}`);
console.log(`P18_COMPLETENESS_LEVELS county=${summary.by_level.county||0} constituency=${summary.by_level.constituency||0} ward=${summary.by_level.ward||0} country=${summary.by_level.country||0}`);
