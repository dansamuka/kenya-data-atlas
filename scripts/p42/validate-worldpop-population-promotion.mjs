#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const fail=m=>{console.error('P42_WORLDPOP_PROMOTION_FAIL '+m);process.exit(1);};

const candidate=read('data/p42/worldpop-population-candidate.json');
const ledger=read('data/completeness/local-54-slot-ledger.json');
const summary=read('data/completeness/local-54-summary.json');
const series=read('data/indicators/registry/series.json');
const observations=read('data/indicators/registry/observations.json');
const indicators=read('data/indicators/registry/indicators.json');
const geographies=read('data/geography/registry/geographies.json');

if(candidate.summary?.promotion_eligible_cells!==1740) fail('candidate no longer has 1,740 eligible cells');
const population=indicators.find(i=>i.indicator_code==='IND-POPULATION');
if(!population) fail('IND-POPULATION missing');
const geoById=new Map(geographies.map(g=>[g.geography_id,g]));
const obsById=new Map(observations.map(o=>[o.observation_id,o]));

const promotedSeries=series.filter(s=>String(s.series_code||'').startsWith('KDA-P42-POP-2019-'));
if(promotedSeries.length!==1740) fail('expected 1,740 P42 population series, got '+promotedSeries.length);
let constituencySeries=0,wardSeries=0;
for(const s of promotedSeries){
  if(s.indicator_id!==population.indicator_id) fail('P42 series points to wrong indicator '+s.series_code);
  const geo=geoById.get(s.geography_id);
  if(!geo) fail('orphan geography '+s.series_code);
  if(geo.level==='constituency') constituencySeries++;
  else if(geo.level==='ward') wardSeries++;
  else fail('P42 population series at unexpected level '+geo.level);
  if(s.geographic_method!=='modelled') fail('non-modelled series '+s.series_code);
  const o=obsById.get(s.latest_observation_id);
  if(!o) fail('series lacks latest observation '+s.series_code);
  if(o.badge!=='D' || o.geographic_method!=='modelled' || o.statistical_status!=='estimated') fail('model metadata mismatch '+s.series_code);
  if(o.source_class!=='derived') fail('source_class must be derived '+s.series_code);
  if(!Number.isFinite(o.value)||o.value<=0) fail('invalid population value '+s.series_code);
  if(!Number.isFinite(o.lower_bound)||!Number.isFinite(o.upper_bound)||o.lower_bound>o.value||o.upper_bound<o.value) fail('invalid sensitivity envelope '+s.series_code);
  if(o.confidence_level!==null) fail('sensitivity envelope must not be represented as a confidence interval '+s.series_code);
}
if(constituencySeries!==290||wardSeries!==1450) fail(`series geography split ${constituencySeries}/${wardSeries}`);

const popRows=ledger.rows.filter(r=>r.indicator_code==='IND-POPULATION');
const county=popRows.filter(r=>r.level==='county');
const constituency=popRows.filter(r=>r.level==='constituency');
const ward=popRows.filter(r=>r.level==='ward');
if(county.length!==47||constituency.length!==290||ward.length!==1450) fail('population Local-54 denominator mismatch');
if(county.some(r=>r.status!=='published_direct'||r.badge!=='A'||r.geographic_method!=='direct')) fail('official county population controls were changed');
for(const r of [...constituency,...ward]){
  if(r.status!=='published_modelled'||r.badge!=='D'||r.geographic_method!=='modelled'||r.value==='') fail('local population cell not truthfully published_modelled: '+r.geo_code);
}
if(summary.numeric_evidence_cells!==7747) fail('numeric evidence expected 7,747 after promotion, got '+summary.numeric_evidence_cells);
if(summary.numeric_evidence_pct!==8.03) fail('numeric evidence pct expected 8.03, got '+summary.numeric_evidence_pct);
if(summary.by_status?.published_modelled!==1740) fail('published_modelled expected 1,740, got '+summary.by_status?.published_modelled);
if(summary.governed_closure_cells!==88751) fail('governed closures expected 88,751, got '+summary.governed_closure_cells);
console.log('P42_WORLDPOP_PROMOTION_OK numeric=7747 pct=8.03 constituency=290 ward=1450 modelled=1740 closures=88751');
