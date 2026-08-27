import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = async p => JSON.parse(await readFile(path.join(root,p),'utf8'));
const readText = async p => readFile(path.join(root,p),'utf8');
const fail = msg => { throw new Error(msg); };
const assert = (ok,msg) => { if (!ok) fail(msg); };

function parseCsv(raw) {
  const lines=raw.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  const parseLine=line=>{ const out=[]; let cur=''; let q=false; for(let i=0;i<line.length;i++){const ch=line[i]; if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(ch===','&&!q){out.push(cur);cur='';}else cur+=ch;} out.push(cur); return out; };
  const h=parseLine(lines.shift());
  return lines.filter(Boolean).map(l=>{const v=parseLine(l);return Object.fromEntries(h.map((x,i)=>[x,v[i]??'']));});
}
function ym(d){return d.slice(0,7)}
function nextMonth(key){let [y,m]=key.split('-').map(Number);m++;if(m===13){m=1;y++;}return `${y}-${String(m).padStart(2,'0')}`;}
function assertUnique(rows,keyFn,label){const seen=new Set();for(const r of rows){const k=keyFn(r);assert(!seen.has(k),`${label}: duplicate ${k}`);seen.add(k);}}
function assertContinuousMonths(rows,start,end,label){const keys=new Set(rows.map(r=>ym(r.period_start)));let k=start;let n=0;while(k<=end){assert(keys.has(k),`${label}: missing month ${k}`);k=nextMonth(k);if(++n>1000)fail(`${label}: continuity loop guard`);}}
function finiteRange(v,min,max,label){const n=Number(v);assert(Number.isFinite(n),`${label}: non-finite ${v}`);assert(n>=min&&n<=max,`${label}: ${n} outside ${min}..${max}`);return n;}

const [cpi,cbr,fx,tbill,epra,cob,sources,geos,datasets,releases,series,obs,indicators] = await Promise.all([
  readText('data/sprint3/knbs-cpi-inflation-monthly.csv').then(parseCsv),
  readText('data/sprint3/cbk-cbr-history.csv').then(parseCsv),
  readText('data/sprint3/cbk-usdkes-monthly-average.csv').then(parseCsv),
  readText('data/sprint3/cbk-tbill91-monthly-average.csv').then(parseCsv),
  readText('data/sprint3/epra-super-petrol-nairobi-history.csv').then(parseCsv),
  readText('data/sprint3/cob-county-budget-history.csv').then(parseCsv),
  readJson('data/sprint3/sources.json'),
  readJson('data/geography/registry/geographies.json'),
  readJson('data/catalogue/registry/datasets.json'),
  readJson('data/catalogue/registry/releases.json'),
  readJson('data/indicators/registry/series.json'),
  readJson('data/indicators/registry/observations.json'),
  readJson('data/indicators/registry/indicators.json')
]);

// ---------------- source snapshots
assert(cpi.length===259,`CPI: expected 259 monthly observations, found ${cpi.length}`);
assert(cpi[0].period_start==='2005-01-01',`CPI: unexpected first period ${cpi[0].period_start}`);
assert(cpi.at(-1).period_start==='2026-07-01',`CPI: unexpected last period ${cpi.at(-1).period_start}`);
assertUnique(cpi,r=>r.period_start,'CPI');
assertContinuousMonths(cpi,'2005-01','2026-07','CPI');
for(const r of cpi) finiteRange(r.inflation_yoy_pct,-10,40,`CPI ${r.period_start}`);

assert(cbr.length>=120,`CBR: expected at least 120 decision observations, found ${cbr.length}`);
assert(cbr.at(-1).date>='2026-08-11',`CBR: latest decision is stale (${cbr.at(-1).date})`);
assertUnique(cbr,r=>r.date,'CBR');
for(const r of cbr) finiteRange(r.cbr_pct,3,30,`CBR ${r.date}`);

assert(fx.length===403,`FX: expected 403 monthly observations, found ${fx.length}`);
assertUnique(fx,r=>r.period_start,'FX');
assertContinuousMonths(fx,ym(fx[0].period_start),'2026-07','FX');
assert(fx.at(-1).period_start>='2026-07-01',`FX: latest month is stale (${fx.at(-1).period_start})`);
for(const r of fx) finiteRange(r.usd_kes_period_average,20,300,`FX ${r.period_start}`);

assert(tbill.length>=400,`T-bill: expected a long historical monthly series, found ${tbill.length}`);
assertUnique(tbill,r=>r.period_start,'T-bill');
assertContinuousMonths(tbill,'2005-01','2025-06','T-bill');
for(const r of tbill) finiteRange(r.tbill_91_monthly_avg_pct,0.01,40,`T-bill ${r.period_start}`);

assert(epra.length>=6,`EPRA: expected historical Nairobi pricing cycles, found ${epra.length}`);
assertUnique(epra,r=>r.period_start,'EPRA');
for(const r of epra){finiteRange(r.super_petrol_kes_per_litre,50,400,`EPRA ${r.period_start}`);assert(String(r.pricing_town).toLowerCase()==='nairobi',`EPRA: non-Nairobi pricing town ${r.pricing_town}`);}

const countyGeos=geos.filter(g=>g.level==='county');
assert(countyGeos.length===47,`Geography registry: expected 47 counties, found ${countyGeos.length}`);
const countyCodes=new Set(countyGeos.map(g=>g.geo_code));
const fiscalYears=['2013/14','2014/15','2015/16','2016/17','2017/18','2018/19','2019/20','2020/21','2021/22','2022/23','2023/24'];
assert(cob.length===47*fiscalYears.length,`CoB: expected ${47*fiscalYears.length} rows, found ${cob.length}`);
assertUnique(cob,r=>`${r.fiscal_year}|${r.geo_code}`,'CoB');
for(const fy of fiscalYears){const rows=cob.filter(r=>r.fiscal_year===fy);assert(rows.length===47,`CoB ${fy}: expected 47 counties, found ${rows.length}`);assert(new Set(rows.map(r=>r.geo_code)).size===47,`CoB ${fy}: duplicate/missing county codes`);}
for(const r of cob){
  assert(countyCodes.has(r.geo_code),`CoB: unknown county ${r.geo_code}`);
  const budget=finiteRange(r.budget_total_ksh_mn,1,200000,`CoB budget ${r.fiscal_year} ${r.geo_code}`);
  const spend=finiteRange(r.expenditure_total_ksh_mn,0,200000,`CoB expenditure ${r.fiscal_year} ${r.geo_code}`);
  const overall=finiteRange(r.overall_absorption_pct,0,110,`CoB absorption ${r.fiscal_year} ${r.geo_code}`);
  finiteRange(r.development_absorption_pct,0,110,`CoB development absorption ${r.fiscal_year} ${r.geo_code}`);
  if(budget>0) assert(Math.abs(spend/budget*100-overall)<=5,`CoB ${r.fiscal_year} ${r.geo_code}: expenditure/budget differs from published absorption by >5pp`);
  assert(/^https?:\/\//.test(r.source_url),`CoB ${r.fiscal_year} ${r.geo_code}: missing source URL`);
}

// ---------------- provenance metadata
for(const key of ['knbs_cpi','cbk_cbr','cbk_fx','cbk_tbill91','epra_nairobi_pms','cob_history']) assert(sources.sources?.[key],`sources.json: missing ${key}`);
assert(sources.sources.cob_history.rows===cob.length,'sources.json: CoB row count does not match snapshot');
assert(Object.keys(sources.sources.cob_history.years||{}).length===11,'sources.json: expected 11 CoB annual release records');

const requiredDatasets=['DS-KNBS-CPI-HISTORY-S3','DS-CBK-CBR-HISTORY-S3','DS-CBK-FX-MONTHLY-HISTORY-S3','DS-CBK-TBILL91-MONTHLY-HISTORY-S3','DS-EPRA-NAIROBI-PETROL-HISTORY-S3','DS-COB-COUNTY-BUDGET-HISTORY-S3'];
const datasetByCode=new Map(datasets.map(d=>[d.dataset_code,d]));
for(const code of requiredDatasets){const d=datasetByCode.get(code);assert(d,`native catalogue: missing ${code}`);assert(['approved','published'].includes(d.publication_status),`native catalogue: ${code} not published`);}
const releaseCodes=new Set(releases.map(r=>r.release_code));
for(const code of ['REL-KNBS-CPI-HISTORY-S3','REL-CBK-CBR-HISTORY-S3','REL-CBK-FX-MONTHLY-HISTORY-S3','REL-CBK-TBILL91-MONTHLY-HISTORY-S3','REL-EPRA-NAIROBI-PETROL-HISTORY-S3']) assert(releaseCodes.has(code),`native catalogue: missing release ${code}`);
for(const fy of fiscalYears) assert(releaseCodes.has(`REL-COB-FY${fy.replace('/','-')}-S3`),`native catalogue: missing CoB release ${fy}`);

// ---------------- native series
const seriesByCode=new Map(series.map(s=>[s.series_code,s]));
const own=s=>obs.filter(o=>o.series_id===s.series_id);
const cpiSeries=seriesByCode.get('KDA-CPI-YOY-KEN'); assert(cpiSeries,'native: missing CPI series'); assert(own(cpiSeries).length===259,`native CPI: expected 259 observations, found ${own(cpiSeries).length}`);
const cbrSeries=seriesByCode.get('KDA-CBR-KEN'); assert(cbrSeries,'native: missing CBR series'); assert(own(cbrSeries).length>=120,`native CBR: only ${own(cbrSeries).length} observations`);
const fxSeries=seriesByCode.get('KDA-USDKES-MONTHLY-AVG-KEN'); assert(fxSeries,'native: missing monthly-average FX series'); assert(own(fxSeries).length===fx.length,`native FX count mismatch`);
const tbSeries=seriesByCode.get('KDA-TBILL91-MONTHLY-AVG-KEN'); assert(tbSeries,'native: missing monthly-average T-bill series'); assert(own(tbSeries).length===tbill.length,`native T-bill count mismatch`);

// EPRA must use the already-existing Nairobi county-linked fuel series to avoid
// a duplicate series key. Every historical observation must still say clearly
// that it is the Nairobi pricing town, not a county average.
const fuelIndicator=indicators.find(i=>i.indicator_code==='IND-FUEL-PETROL');assert(fuelIndicator,'native: fuel indicator missing');
const nairobi=geos.find(g=>g.geo_code==='KEN-C047');assert(nairobi,'native: Nairobi geography missing');
const nairobiFuel=series.find(s=>s.indicator_id===fuelIndicator.indicator_id&&s.geography_id===nairobi.geography_id);assert(nairobiFuel,'native: Nairobi fuel series missing');
const histFuel=own(nairobiFuel).filter(o=>o.source_dataset_id===datasetByCode.get('DS-EPRA-NAIROBI-PETROL-HISTORY-S3').dataset_id);
assert(histFuel.length===epra.length,`native EPRA: expected ${epra.length} historical observations, found ${histFuel.length}`);
for(const o of histFuel) assert(/not a Nairobi County average/i.test(o.notes),`native EPRA ${o.period_start}: county-average caveat missing`);

const budgetIndicators=new Set(['IND-COUNTY-BUDGET-TOTAL','IND-COUNTY-EXPENDITURE-TOTAL','IND-COUNTY-BUDGET-ABSORPTION','IND-COUNTY-DEVELOPMENT-ABSORPTION'].map(c=>indicators.find(i=>i.indicator_code===c)?.indicator_id));
assert(!budgetIndicators.has(undefined),'native: one or more county budget indicators missing');
const budgetSeries=series.filter(s=>budgetIndicators.has(s.indicator_id)&&countyGeos.some(g=>g.geography_id===s.geography_id));
assert(budgetSeries.length===47*4,`native CoB: expected 188 county fiscal series, found ${budgetSeries.length}`);
for(const s of budgetSeries) assert(own(s).length===12,`native CoB ${s.series_code}: expected 12 fiscal-year observations, found ${own(s).length}`);

const cobDatasetId=datasetByCode.get('DS-COB-COUNTY-BUDGET-HISTORY-S3').dataset_id;
const sprint3CobObs=obs.filter(o=>o.source_dataset_id===cobDatasetId);
assert(sprint3CobObs.length===cob.length*4,`native CoB: expected ${cob.length*4} historical measure observations, found ${sprint3CobObs.length}`);
const geoById=new Map(geos.map(g=>[g.geography_id,g]));
for(const o of sprint3CobObs){const g=geoById.get(o.geography_id);assert(g?.level==='county',`native CoB: observation propagated to ${g?.level||'unknown'} geography`);}

// raw-to-native spot/complete agreement for dedicated national series
for(const [raw,ser,field] of [[fx,fxSeries,'usd_kes_period_average'],[tbill,tbSeries,'tbill_91_monthly_avg_pct']]){
  const nativeByPeriod=new Map(own(ser).map(o=>[o.period_start,o.value]));
  for(const r of raw) assert(Math.abs(nativeByPeriod.get(r.period_start)-Number(r[field]))<1e-8,`${ser.series_code} ${r.period_start}: native/raw mismatch`);
}

const summary={
  status:'PASS',
  sprint:'Data Sprint 3 — Historical Kenya',
  raw_rows:{cpi:cpi.length,cbr:cbr.length,fx_monthly:fx.length,tbill91_monthly:tbill.length,epra_nairobi:epra.length,cob_county_fiscal:cob.length},
  native:{cpi_observations:own(cpiSeries).length,cbr_observations:own(cbrSeries).length,fx_monthly_observations:own(fxSeries).length,tbill_monthly_observations:own(tbSeries).length,county_fiscal_series:budgetSeries.length,county_fiscal_years:12},
  controls:{cob_counties_per_year:47,no_cob_below_county:true,fx_monthly_separate_from_daily:true,tbill_monthly_separate_from_auction:true,epra_not_county_average:true}
};
console.log(JSON.stringify(summary,null,2));
