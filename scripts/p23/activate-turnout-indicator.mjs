import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const dir=path.join(root,'data/indicators/registry');
const indicators=JSON.parse(fs.readFileSync(path.join(dir,'indicators.json'),'utf8'));
const series=JSON.parse(fs.readFileSync(path.join(dir,'series.json'),'utf8'));
const observations=JSON.parse(fs.readFileSync(path.join(dir,'observations.json'),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 turnout lifecycle activation: ${msg}`);};
const csvCell=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`;
const unionFields=rows=>[...new Set(rows.flatMap(r=>Object.keys(r)))];
const csv=(rows,fields)=>[fields.join(','),...rows.map(r=>fields.map(f=>csvCell(r[f])).join(','))].join('\n')+'\n';

const indicator=indicators.find(i=>i.indicator_code==='IND-TURNOUT-HISTORY');
assert(indicator,'IND-TURNOUT-HISTORY missing');
const ownSeries=series.filter(s=>s.indicator_id===indicator.indicator_id);
assert(ownSeries.length>0,'cannot activate turnout indicator without canonical series');
assert(ownSeries.every(s=>/^KDA-TURNOUT-CON-\d{3}-2022-PRES$/.test(s.series_code)),'unexpected turnout series code');
assert(ownSeries.every(s=>s.geographic_method==='direct'&&s.status==='active'),'turnout series must remain direct and active');
const seriesIds=new Set(ownSeries.map(s=>s.series_id));
const ownObs=observations.filter(o=>seriesIds.has(o.series_id));
assert(ownObs.length===ownSeries.length,'each turnout series must have exactly one canonical observation during 2022 rollout');
assert(ownObs.every(o=>o.source_class==='official'&&o.geographic_method==='direct'&&o.badge==='A'),'turnout observations must remain official direct Class A');
assert(ownObs.every(o=>Number.isFinite(Number(o.value))&&Number(o.value)>=0&&Number(o.value)<=100),'turnout observations must be numeric percentages in [0,100]');

indicator.lifecycle_status='active';
indicator.active=true;
fs.writeFileSync(path.join(dir,'indicators.json'),JSON.stringify(indicators,null,2)+'\n');
fs.writeFileSync(path.join(dir,'indicators.csv'),csv(indicators,unionFields(indicators)));
console.log(`P23_TURNOUT_LIFECYCLE_ACTIVE series=${ownSeries.length} observations=${ownObs.length} source_class=official geographic_method=direct values_logged=0`);
