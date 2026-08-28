import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const text=async p=>readFile(path.join(root,p),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
function parseCsv(raw){
  const lines=raw.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  const parseLine=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(ch===','&&!q){out.push(cur);cur='';}else cur+=ch;}out.push(cur);return out;};
  const h=parseLine(lines.shift()||'');
  return lines.filter(Boolean).map(line=>{const v=parseLine(line);return Object.fromEntries(h.map((x,i)=>[x,v[i]??'']));});
}
const METRICS=[
  ['IND-RENT-BURDEN','DS-KNBS-RENT-BURDEN-2024-LIFE','REL-KNBS-RENT-BURDEN-2024-LIFE','percent','economy'],
  ['IND-HOUSING-OWNER-OCCUPIED','DS-KNBS-HOUSING-TENURE-2021-LIFE','REL-KNBS-HOUSING-TENURE-2021-LIFE','percent','people'],
  ['IND-HEALTH-FACILITY-STOCK','DS-MOH-FACILITY-CENSUS-2023-LIFE','REL-MOH-FACILITY-CENSUS-2023-LIFE','count','health'],
  ['IND-SCHOOL-ATTENDANCE-RATE','DS-KNBS-SCHOOL-ATTENDANCE-2019-LIFE','REL-KNBS-SCHOOL-ATTENDANCE-2019-LIFE','percent','people'],
  ['IND-LABOUR-FORCE-PARTICIPATION','DS-KNBS-LFPR-2019-LIFE','REL-KNBS-LFPR-2019-LIFE','percent','economy']
];
const [rows,geos,units,indicators,series,observations,datasets,releases,compareJs]=await Promise.all([
  text('data/life-elsewhere/county-life-metrics.csv').then(parseCsv),
  read('data/geography/registry/geographies.json'),read('data/indicators/registry/units.json'),read('data/indicators/registry/indicators.json'),
  read('data/indicators/registry/series.json'),read('data/indicators/registry/observations.json'),
  read('data/catalogue/registry/datasets.json'),read('data/catalogue/registry/releases.json'),text('assets/compare.js')
]);
assert(rows.length===235,`County Life source rows ${rows.length} != 235`);
const counties=geos.filter(g=>g.level==='county');
assert(counties.length===47,'Canonical county count is not 47');
const countyByCode=new Map(counties.map(g=>[g.geo_code,g]));
const unitById=new Map(units.map(u=>[u.unit_id,u]));
const indicatorByCode=new Map(indicators.map(i=>[i.indicator_code,i]));
const datasetByCode=new Map(datasets.map(d=>[d.dataset_code,d]));
const releaseByCode=new Map(releases.map(r=>[r.release_code,r]));
const seriesByIndicator=new Map();
for(const s of series){if(!seriesByIndicator.has(s.indicator_id))seriesByIndicator.set(s.indicator_id,[]);seriesByIndicator.get(s.indicator_id).push(s);}
const obsBySeries=new Map();
for(const o of observations){if(!obsBySeries.has(o.series_id))obsBySeries.set(o.series_id,[]);obsBySeries.get(o.series_id).push(o);}

const sourceKeys=new Set();
let healthTotal=0;
for(const [metric,dsCode,relCode,unitCode,tab] of METRICS){
  const own=rows.filter(r=>r.metric_code===metric);
  assert(own.length===47,`${metric}: source rows ${own.length} != 47`);
  assert(new Set(own.map(r=>r.geo_code)).size===47,`${metric}: source county codes are incomplete/duplicated`);
  for(const r of own){
    assert(countyByCode.has(r.geo_code),`${metric}: unknown source county ${r.geo_code}`);
    assert(r.source_url && r.source_table,`${metric}/${r.geo_code}: missing source URL/table`);
    const v=Number(r.value);assert(Number.isFinite(v),`${metric}/${r.geo_code}: non-numeric value`);
    if(unitCode==='percent')assert(v>=0&&v<=100,`${metric}/${r.geo_code}: percent outside 0..100`);
    else assert(v>0&&v<5000,`${metric}/${r.geo_code}: count outside plausible gate`);
    const k=`${metric}|${r.geo_code}`;assert(!sourceKeys.has(k),`duplicate source key ${k}`);sourceKeys.add(k);
    if(metric==='IND-HEALTH-FACILITY-STOCK')healthTotal+=v;
  }
  const ds=datasetByCode.get(dsCode), rel=releaseByCode.get(relCode);
  assert(ds && ds.publication_status==='published',`${metric}: dataset missing/not published`);
  assert(rel && rel.release_status==='published' && rel.dataset_id===ds.dataset_id,`${metric}: release missing/not published/orphaned`);
  const ind=indicatorByCode.get(metric);
  assert(ind,`${metric}: native indicator missing`);
  assert(ind.lifecycle_status==='active'&&ind.active===true,`${metric}: indicator not active`);
  assert(ind.tab===tab,`${metric}: tab ${ind.tab} != ${tab}`);
  assert(Array.isArray(ind.applies_to_levels)&&ind.applies_to_levels.length===1&&ind.applies_to_levels[0]==='county',`${metric}: must apply only to county`);
  const unit=unitById.get(ind.unit_id);assert(unit?.code===unitCode,`${metric}: wrong unit`);
  const ownSeries=seriesByIndicator.get(ind.indicator_id)||[];
  assert(ownSeries.length===47,`${metric}: native county series ${ownSeries.length} != 47`);
  for(const s of ownSeries){
    const geo=geos.find(g=>g.geography_id===s.geography_id);
    assert(geo?.level==='county',`${metric}: lower/non-county series leaked (${s.series_code})`);
    assert(s.dataset_id===ds.dataset_id,`${metric}/${geo?.geo_code}: wrong dataset`);
    assert(s.geographic_method==='direct',`${metric}/${geo?.geo_code}: series is not direct`);
    const obs=obsBySeries.get(s.series_id)||[];
    assert(obs.length===1,`${metric}/${geo?.geo_code}: observations ${obs.length} != 1`);
    const o=obs[0], src=own.find(r=>r.geo_code===geo.geo_code);
    assert(src,`${metric}/${geo.geo_code}: source row missing`);
    assert(Math.abs(Number(src.value)-o.value)<1e-9,`${metric}/${geo.geo_code}: native/source value mismatch`);
    assert(o.period_start===src.period_start&&o.period_end===src.period_end&&o.period_label===src.period_label,`${metric}/${geo.geo_code}: period mismatch`);
    assert(o.geographic_method==='direct'&&o.badge==='A'&&o.source_class==='official',`${metric}/${geo.geo_code}: provenance class mismatch`);
    assert(o.source_dataset_id===ds.dataset_id&&o.source_release_id===rel.release_id,`${metric}/${geo.geo_code}: dataset/release trace mismatch`);
    assert(o.source_url===src.source_url,`${metric}/${geo.geo_code}: source URL mismatch`);
  }
}
assert(healthTotal===14366,`Health facility target total ${healthTotal} != 14366`);
assert(/active.*county metrics/i.test(compareJs)||compareJs.includes("lifecycle_status === 'active'"),'Compare does not auto-discover active county indicators');
assert(compareJs.includes('common reference period')||compareJs.includes('common-period'),'My Life Elsewhere common-period discipline missing');
console.log('PASS County Life: 235 source rows = 5 indicators × 47 counties; all native values, periods and provenance match.');
console.log('      Health facility target total reconciles to 14,366; no constituency/ward inheritance exists for the five indicators.');
