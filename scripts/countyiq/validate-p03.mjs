import fs from 'node:fs';
import path from 'node:path';
import { buildMart, loadCanonical } from './build-mart.mjs';
const root=process.cwd();const read=p=>fs.readFileSync(path.join(root,p),'utf8');const json=p=>JSON.parse(read(p));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P03 validation: ${msg}`);};
const YEARS=Array.from({length:12},(_,i)=>{const y=2013+i;return `${y}/${String(y+1).slice(-2)}`;});
const KEYS=['budget','expenditure','overall_absorption','development_absorption'];
try{
  const canonical=loadCanonical(root),mart=json('data/countyiq/county-summary.json'),rebuilt=buildMart(canonical);
  assert(JSON.stringify(mart)===JSON.stringify(rebuilt),'committed mart diverges from deterministic P03 build');
  assert(mart.meta?.schema_version==='kda.countyiq.county-summary.v2','schema must be v2');assert(mart.meta?.methodology_version==='P03-v1','methodology must be P03-v1');assert(mart.counties?.length===47,'expected 47 counties');
  const obsById=new Map(canonical.observations.map(o=>[o.observation_id,o]));
  for(const county of mart.counties){const f=county.fiscal;assert(f,`${county.geography.geo_code}: fiscal block missing`);assert(f.fiscal_year_count===12,`${county.geography.geo_code}: expected 12 fiscal years`);assert(f.history.map(x=>x.fiscal_year).join('|')===YEARS.join('|'),`${county.geography.geo_code}: fiscal year sequence mismatch`);
    for(const row of f.history){for(const key of KEYS){const m=row[key];assert(Number.isFinite(m?.value),`${county.geography.geo_code}/${row.fiscal_year}/${key}: finite value required`);assert(obsById.has(m.observation_id),`${county.geography.geo_code}/${row.fiscal_year}/${key}: canonical observation missing`);assert(m.provenance?.source_url,`${county.geography.geo_code}/${row.fiscal_year}/${key}: source URL missing`);const r=row.rankings?.[key];assert(r?.common_period===true&&r?.period_key===row.fiscal_year&&r?.eligible_count===47,`${county.geography.geo_code}/${row.fiscal_year}/${key}: common-period ranking invalid`);assert(Number.isInteger(r.rank)&&r.rank>=1&&r.rank<=47,`${county.geography.geo_code}/${row.fiscal_year}/${key}: rank invalid`);}}
    for(const key of KEYS){for(const window of ['one_year','three_year','five_year'])assert(Number.isFinite(f.changes?.[key]?.[window]?.value),`${county.geography.geo_code}/${key}/${window}: comparable change missing`);}assert(Number.isFinite(f.volatility?.overall_absorption_sd_pp)&&Number.isFinite(f.volatility?.development_absorption_sd_pp),`${county.geography.geo_code}: absorption volatility missing`);
    const d=f.denominators;assert(d?.policy==='exact_or_explicitly_compatible_period_only',`${county.geography.geo_code}: denominator policy missing`);assert(d.population?.compatible_annual_series===false,`${county.geography.geo_code}: annual population denominator must remain withheld`);assert(d.population?.interpolation_allowed===false&&d.population?.national_inheritance_allowed===false,`${county.geography.geo_code}: silent denominator substitution is not prohibited`);assert(d.per_capita?.published===false,`${county.geography.geo_code}: per-capita fiscal measures must be withheld`);
  }
  const html=read('index.html'),js=read('assets/countyiq-view.js'),css=read('assets/countyiq-view.css');assert(html.includes('id="ciq-fiscal-history"')&&html.includes('id="ciq-denominator"'),'P03 fiscal history/denominator UI anchors missing');assert(js.includes('renderFiscalHistory')&&js.includes('row.fiscal'),'runtime does not render mart fiscal block');assert(!js.includes('data/sprint3/')&&!js.includes('KDA.csv('),'runtime must not join Sprint 3 CSVs');assert(css.includes('.ciq-fiscal-history')&&css.includes('@media(max-width:700px)'),'mobile fiscal history styling missing');
  console.log('P03_47X12_FISCAL_HISTORY_OK');console.log('P03_COMMON_PERIOD_RANKS_OK');console.log('P03_DENOMINATOR_DISCIPLINE_OK');console.log('P03_MOBILE_FISCAL_UI_OK');console.log('P03_ALL_OK');
}catch(error){console.error(error.message||error);process.exit(1);}
