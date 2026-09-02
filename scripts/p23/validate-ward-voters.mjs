import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23X ward voters: ${msg}`);};
const [indicators,series,observations,geos,datasets,releases,decisions]=await Promise.all([
  read('data/indicators/registry/indicators.json'),read('data/indicators/registry/series.json'),read('data/indicators/registry/observations.json'),
  read('data/geography/registry/geographies.json'),read('data/catalogue/registry/datasets.json'),read('data/catalogue/registry/releases.json'),read('data/local-indicator-cascade-decisions.json')
]);
const ind=indicators.find(i=>i.indicator_code==='IND-REGISTERED-VOTERS'); assert(ind,'registered-voters indicator missing');
const wards=geos.filter(g=>g.level==='ward'); assert(wards.length===1450,'canonical ward registry != 1,450');
const wardIds=new Set(wards.map(g=>g.geography_id)); const geoById=new Map(wards.map(g=>[g.geography_id,g]));
const ownSeries=series.filter(s=>s.indicator_id===ind.indicator_id&&wardIds.has(s.geography_id));
assert(ownSeries.length===1440,`expected 1,440 published ward voter series, found ${ownSeries.length}`);
assert(new Set(ownSeries.map(s=>s.geography_id)).size===1440,'ward voter geography duplicated');
const ownSeriesIds=new Set(ownSeries.map(s=>s.series_id)); const ownObs=observations.filter(o=>ownSeriesIds.has(o.series_id));
assert(ownObs.length===1440,`expected 1,440 ward voter observations, found ${ownObs.length}`);
assert(ownObs.every(o=>Number.isInteger(o.value)&&o.value>0),'ward voter values must be positive integers');
assert(ownObs.reduce((a,o)=>a+o.value,0)<22102532,'published ward spatial subset must exclude ten held rows');
const direct=ownObs.filter(o=>o.geographic_method==='direct'&&o.badge==='A');
const crossed=ownObs.filter(o=>o.geographic_method==='aggregated'&&o.badge==='B'&&o.crosswalk_id);
assert(direct.length===1386,`expected 1,386 direct ward rows, found ${direct.length}`);
assert(crossed.length===54,`expected 54 crosswalked ward rows, found ${crossed.length}`);
assert(crossed.every(o=>(o.notes||'').includes('value itself is unchanged')&&(o.notes||'').includes('no parent value inherited')),'crosswalk disclosure incomplete');
assert(direct.every(o=>(o.notes||'').includes('No parent value inherited')),'direct anti-inheritance disclosure incomplete');
const heldCons=new Set([43,44]); const publishedHeld=ownSeries.filter(s=>heldCons.has(Number(geoById.get(s.geography_id)?.constituency_code)));
assert(publishedHeld.length===0,'Mandera East/Lafey ward spatial holds must remain unpublished');
const olKalou=ownObs.filter(o=>{
  const g=geoById.get(o.geography_id); return Number(g?.constituency_code)===91;
}).map(o=>o.value).sort((a,b)=>a-b);
assert(JSON.stringify(olKalou)===JSON.stringify([13540,13594,14695,15572,15596].sort((a,b)=>a-b)),'Ol Kalou ward anchors changed');
const ds=datasets.find(d=>d.dataset_code==='DS-IEBC-VOTERS-WARD-2022-P23X'); const rel=releases.find(r=>r.release_code==='REL-IEBC-VOTERS-WARD-2022-P23X');
assert(ds?.publication_status==='published'&&rel?.release_status==='published','P23X ward voter catalogue publication missing');
assert(ownSeries.every(s=>s.dataset_id===ds.dataset_id),'ward voter series not attached to P23X dataset');
assert(ownObs.every(o=>o.source_release_id===rel.release_id&&o.source_url==='https://www.iebc.or.ke/uploads/resources/L7k6ob1bau.pdf'),'ward observations not traceable to official Gazette release');
const decision=decisions.decisions.find(d=>d.indicator_code==='IND-REGISTERED-VOTERS'&&d.level==='ward');
assert(decision?.disposition==='direct_official','cascade decision must remain direct_official at ward level');
console.log(`P23X_WARD_VOTERS_VALIDATE_OK published=${ownSeries.length} direct=${direct.length} crosswalked=${crossed.length} held=10`);
console.log('P23X_WARD_VOTERS_NO_INHERITANCE_OK');
