import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.argv[2];
if (!['catalogue', 'indicators'].includes(mode)) {
  console.error('Usage: node scripts/sprint3/build-native.mjs <catalogue|indicators>');
  process.exit(2);
}

const INGESTED_AT = '2026-08-27T00:00:00.000Z';
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const readText = async p => readFile(path.join(root, p), 'utf8');
const csvCell = value => `"${String(Array.isArray(value) ? value.join('|') : value ?? '').replaceAll('"', '""')}"`;
const csv = (rows, fields) => [fields.join(','), ...rows.map(row => fields.map(f => csvCell(row[f])).join(','))].join('\n') + '\n';
const unionFields = rows => [...new Set(rows.flatMap(row => Object.keys(row)))];
const uuid = name => {
  const h = createHash('sha1').update(`kenya-data-atlas:sprint3:${name}`).digest('hex').slice(0, 32);
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20)}`;
};

function parseCsv(raw) {
  const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (!lines.length) return [];
  const parseLine = line => {
    const out=[]; let cur=''; let quoted=false;
    for (let i=0;i<line.length;i++) {
      const ch=line[i];
      if (ch === '"') {
        if (quoted && line[i+1] === '"') { cur += '"'; i++; }
        else quoted=!quoted;
      } else if (ch === ',' && !quoted) { out.push(cur); cur=''; }
      else cur += ch;
    }
    out.push(cur); return out;
  };
  const headers=parseLine(lines.shift());
  return lines.filter(Boolean).map(line => {
    const vals=parseLine(line);
    return Object.fromEntries(headers.map((h,i)=>[h,vals[i] ?? '']));
  });
}

const sourceDoc = await readJson('data/sprint3/sources.json');
const sources = sourceDoc.sources;

const datasetDefs = [
  { key:'cpi', code:'DS-KNBS-CPI-HISTORY-S3', sourceBase:'DS-KNBS-CPI', title:'Headline Inflation — Historical Monthly Series', description:'Historical national headline year-on-year CPI inflation, monthly.', topic:'Economy', geographic_coverage:['country'], frequency:'monthly', known_limitations:'Headline year-on-year rate only. Historical values may span CPI rebasing regimes; values are reproduced as published and are not recomputed across base changes.' },
  { key:'cbr', code:'DS-CBK-CBR-HISTORY-S3', sourceBase:'DS-CBK-MONETARY', title:'Central Bank Rate — Historical Decision Series', description:'Historical Central Bank Rate observations from the official CBK CBR table.', topic:'Economy', geographic_coverage:['country'], frequency:'irregular', known_limitations:'Policy-rate decision observations only; unchanged intervals are not expanded to daily or monthly rows.' },
  { key:'fx', code:'DS-CBK-FX-MONTHLY-HISTORY-S3', sourceBase:'DS-CBK-MONETARY', title:'USD/KES — Monthly Period-Average Exchange Rate', description:'Official CBK monthly period-average Kenya shillings per US dollar.', topic:'Economy', geographic_coverage:['country'], frequency:'monthly', known_limitations:'Monthly period averages are a separate measure from the Atlas daily market-mid reference series and must not be merged into that daily series.' },
  { key:'tbill', code:'DS-CBK-TBILL91-MONTHLY-HISTORY-S3', sourceBase:'DS-CBK-MONETARY', title:'91-Day Treasury Bill — Historical Monthly Average', description:'Official CBK monthly 91-day Treasury bill rate history from the central-bank-rates table and Statistical Bulletins.', topic:'Economy', geographic_coverage:['country'], frequency:'monthly', known_limitations:'Monthly average series; it is distinct from individual weekly auction observations.' },
  { key:'epra', code:'DS-EPRA-NAIROBI-PETROL-HISTORY-S3', sourceBase:'DS-EPRA-ENERGY', title:'Super Petrol — Nairobi Pricing-Town History', description:'Historical maximum retail Super Petrol price for the Nairobi EPRA pricing town.', topic:'Economy', geographic_coverage:['pricing_town_nairobi'], frequency:'monthly', known_limitations:'Nairobi pricing-town observations only. These are not Nairobi County averages and are never propagated to other geographies.' },
  { key:'cob', code:'DS-COB-COUNTY-BUDGET-HISTORY-S3', sourceBase:'DS-COB-COUNTY-BUDGET', title:'County Budget Implementation — Historical Annual Series', description:'Annual county budget, expenditure and absorption measures from Controller of Budget annual reports.', topic:'Public Finance', geographic_coverage:['county'], frequency:'annual', known_limitations:'Official county fiscal-year values only. No allocation to constituencies or wards. Definitions are preserved from each annual report.' }
];

const releaseDefs = [
  { key:'cpi', code:'REL-KNBS-CPI-HISTORY-S3', source:'knbs_cpi', title:'Historical headline inflation table', start:()=>sources.knbs_cpi.first, end:()=>sources.knbs_cpi.last, url:()=>sources.knbs_cpi.url },
  { key:'cbr', code:'REL-CBK-CBR-HISTORY-S3', source:'cbk_cbr', title:'Historical Central Bank Rate table', start:()=>sources.cbk_cbr.first, end:()=>sources.cbk_cbr.last, url:()=>sources.cbk_cbr.url },
  { key:'fx', code:'REL-CBK-FX-MONTHLY-HISTORY-S3', source:'cbk_fx', title:'Monthly period-average exchange-rate file', start:()=>sources.cbk_fx.first, end:()=>sources.cbk_fx.last, url:()=>sources.cbk_fx.url },
  { key:'tbill', code:'REL-CBK-TBILL91-MONTHLY-HISTORY-S3', source:'cbk_tbill91', title:'Historical 91-day Treasury bill monthly-average series', start:()=>sources.cbk_tbill91.first, end:()=>sources.cbk_tbill91.last, url:()=>sources.cbk_tbill91.urls?.[0] || 'https://www.centralbank.go.ke/central-bank-rates/' },
  { key:'epra', code:'REL-EPRA-NAIROBI-PETROL-HISTORY-S3', source:'epra_nairobi_pms', title:'Nairobi Super Petrol pricing-town history', start:()=>sources.epra_nairobi_pms.first, end:()=>sources.epra_nairobi_pms.last, url:()=>sources.epra_nairobi_pms.url }
];

const fyCode = fy => fy.replace('/', '-');
const fyStart = fy => `${fy.slice(0,4)}-07-01`;
const fyEnd = fy => `${Number(fy.slice(0,4))+1}-06-30`;

async function buildCatalogue() {
  const dir='data/catalogue/registry';
  const [datasets,releases]=await Promise.all([readJson(`${dir}/datasets.json`),readJson(`${dir}/releases.json`)]);
  const byCode=new Map(datasets.map(d=>[d.dataset_code,d]));
  for (const def of datasetDefs) {
    if (byCode.has(def.code)) continue;
    const base=byCode.get(def.sourceBase);
    if (!base?.source_id) throw new Error(`Sprint 3 source dataset missing: ${def.sourceBase}`);
    const row={ dataset_id:uuid(`dataset:${def.code}`), dataset_code:def.code, source_id:base.source_id, title:def.title, description:def.description, topic:def.topic, geographic_coverage:def.geographic_coverage, frequency:def.frequency, publication_status:'published', methodology_url:'data/sprint3/README.md', known_limitations:def.known_limitations };
    datasets.push(row); byCode.set(def.code,row);
  }
  const releaseCodes=new Set(releases.map(r=>r.release_code));
  for (const def of releaseDefs) {
    if (releaseCodes.has(def.code)) continue;
    const ds=byCode.get(datasetDefs.find(d=>d.key===def.key).code);
    const src=sources[def.source];
    releases.push({ release_id:uuid(`release:${def.code}`), release_code:def.code, dataset_id:ds.dataset_id, title:def.title, reference_period_start:def.start(), reference_period_end:def.end(), published_at:'', discovered_at:INGESTED_AT, ingested_at:INGESTED_AT, release_url:def.url(), release_status:'published', version_label:'Sprint 3 snapshot', release_notes:src.note || src.definition || '', supersedes_release_id:'' });
    releaseCodes.add(def.code);
  }
  const cobDs=byCode.get('DS-COB-COUNTY-BUDGET-HISTORY-S3');
  for (const [fy,meta] of Object.entries(sources.cob_history.years)) {
    const code=`REL-COB-FY${fyCode(fy)}-S3`;
    if (releaseCodes.has(code)) continue;
    releases.push({ release_id:uuid(`release:${code}`), release_code:code, dataset_id:cobDs.dataset_id, title:`County Budget Implementation — FY ${fy}`, reference_period_start:fyStart(fy), reference_period_end:fyEnd(fy), published_at:'', discovered_at:INGESTED_AT, ingested_at:INGESTED_AT, release_url:meta.pdf_url || meta.landing_page, release_status:'published', version_label:'', release_notes:'Official Controller of Budget annual county budget implementation report.', supersedes_release_id:'' });
    releaseCodes.add(code);
  }
  await writeFile(path.join(root,`${dir}/datasets.json`),JSON.stringify(datasets,null,2)+'\n');
  await writeFile(path.join(root,`${dir}/releases.json`),JSON.stringify(releases,null,2)+'\n');
  await writeFile(path.join(root,`${dir}/datasets.csv`),csv(datasets,unionFields(datasets)));
  await writeFile(path.join(root,`${dir}/releases.csv`),csv(releases,unionFields(releases)));
  console.log(`Sprint 3 catalogue promoted: ${datasets.length} datasets, ${releases.length} releases.`);
}

async function buildIndicators() {
  const dir='data/indicators/registry';
  const [units,indicators,series,observations,geos,datasets,releases,sourcesRegistry,cpi,cbr,fx,tbill,epra,cob]=await Promise.all([
    readJson(`${dir}/units.json`), readJson(`${dir}/indicators.json`), readJson(`${dir}/series.json`), readJson(`${dir}/observations.json`),
    readJson('data/geography/registry/geographies.json'), readJson('data/catalogue/registry/datasets.json'), readJson('data/catalogue/registry/releases.json'), readJson('data/catalogue/registry/sources.json'),
    readText('data/sprint3/knbs-cpi-inflation-monthly.csv').then(parseCsv), readText('data/sprint3/cbk-cbr-history.csv').then(parseCsv), readText('data/sprint3/cbk-usdkes-monthly-average.csv').then(parseCsv), readText('data/sprint3/cbk-tbill91-monthly-average.csv').then(parseCsv), readText('data/sprint3/epra-super-petrol-nairobi-history.csv').then(parseCsv), readText('data/sprint3/cob-county-budget-history.csv').then(parseCsv)
  ]);
  const unitByCode=new Map(units.map(u=>[u.code,u]));
  const indByCode=new Map(indicators.map(i=>[i.indicator_code,i]));
  const datasetByCode=new Map(datasets.map(d=>[d.dataset_code,d]));
  const releaseByCode=new Map(releases.map(r=>[r.release_code,r]));
  const sourceById=new Map(sourcesRegistry.map(s=>[s.source_id,s]));
  const geoByCode=new Map(geos.map(g=>[g.geo_code,g]));
  const country=geoByCode.get('KEN') || geos.find(g=>g.level==='country');
  if (!country) throw new Error('Sprint 3: country geography missing');

  const addIndicator=(code,name,shortName,description,unitCode,frequency,subtopic)=>{
    if (indByCode.has(code)) return indByCode.get(code);
    const u=unitByCode.get(unitCode); if (!u) throw new Error(`Sprint 3 unit missing: ${unitCode}`);
    const row={ indicator_id:uuid(`indicator:${code}`), indicator_code:code, name, short_name:shortName, description, topic:'Economy', subtopic, unit_id:u.unit_id, higher_is_better:null, preferred_frequency:frequency, minimum_geo_level:'country', minimum_denominator:null, methodology_url:'data/sprint3/README.md', comparable:true, active:true };
    indicators.push(row); indByCode.set(code,row); return row;
  };
  const fxMonthlyInd=addIndicator('IND-USD-KES-MONTHLY-AVG','USD/KES monthly period-average exchange rate','USD/KES monthly average','Monthly period-average Kenya shillings per US dollar published by CBK.','kes_per_usd','monthly','Exchange rates');
  const tbillMonthlyInd=addIndicator('IND-TBILL-91-MONTHLY-AVG','91-day Treasury bill monthly average rate','91-day T-bill monthly average','Monthly average 91-day Treasury bill rate published by CBK.','percent','monthly','Government securities');
  const cpiInd=indByCode.get('IND-CPI-INFLATION');
  const cbrInd=indByCode.get('IND-CBR');
  const fuelInd=indByCode.get('IND-FUEL-PETROL');
  const budgetInd=indByCode.get('IND-COUNTY-BUDGET-TOTAL');
  const spendInd=indByCode.get('IND-COUNTY-EXPENDITURE-TOTAL');
  const absInd=indByCode.get('IND-COUNTY-BUDGET-ABSORPTION');
  const devInd=indByCode.get('IND-COUNTY-DEVELOPMENT-ABSORPTION');
  for (const x of [cpiInd,cbrInd,fuelInd,budgetInd,spendInd,absInd,devInd]) if (!x) throw new Error('Sprint 3 required indicator missing');

  const ds={ cpi:datasetByCode.get('DS-KNBS-CPI-HISTORY-S3'), cbr:datasetByCode.get('DS-CBK-CBR-HISTORY-S3'), fx:datasetByCode.get('DS-CBK-FX-MONTHLY-HISTORY-S3'), tbill:datasetByCode.get('DS-CBK-TBILL91-MONTHLY-HISTORY-S3'), epra:datasetByCode.get('DS-EPRA-NAIROBI-PETROL-HISTORY-S3'), cob:datasetByCode.get('DS-COB-COUNTY-BUDGET-HISTORY-S3') };
  for (const [k,v] of Object.entries(ds)) if (!v) throw new Error(`Sprint 3 dataset missing: ${k}`);
  const rel={ cpi:releaseByCode.get('REL-KNBS-CPI-HISTORY-S3'), cbr:releaseByCode.get('REL-CBK-CBR-HISTORY-S3'), fx:releaseByCode.get('REL-CBK-FX-MONTHLY-HISTORY-S3'), tbill:releaseByCode.get('REL-CBK-TBILL91-MONTHLY-HISTORY-S3'), epra:releaseByCode.get('REL-EPRA-NAIROBI-PETROL-HISTORY-S3') };
  for (const [k,v] of Object.entries(rel)) if (!v) throw new Error(`Sprint 3 release missing: ${k}`);
  const agencyFor=d=>sourceById.get(d.source_id)?.agency_id || '';
  const seriesByCode=new Map(series.map(s=>[s.series_code,s]));
  const obsKey=new Set(observations.map(o=>`${o.series_id}|${o.period_start}|${o.period_end}`));

  const addSeries=({code,indicator,geo,unitCode,dataset,frequency,periodType,group,method='direct',currency='',transformation='level'})=>{
    if (seriesByCode.has(code)) return seriesByCode.get(code);
    const row={ series_id:uuid(`series:${code}`), series_code:code, indicator_id:indicator.indicator_id, geography_id:geo.geography_id, geography_taxonomy:geo.geography_system || 'electoral', boundary_version:geo.level==='country'?'':'2012-01', frequency, period_type:periodType, unit_id:unitByCode.get(unitCode).unit_id, price_basis:'not_applicable', base_period:'', currency, seasonal_adjustment:'none', transformation, geographic_method:method, comparability_group:group, dataset_id:dataset.dataset_id, agency_id:agencyFor(dataset), methodology_url:'data/sprint3/README.md', start_period:'', end_period:'', latest_observation_id:'', observation_count:0, last_updated_at:'', next_expected_release:'', status:'active', superseded_by_series_id:'' };
    series.push(row); seriesByCode.set(code,row); return row;
  };
  const addObs=({seriesRow,key,start,end,periodType,label,value,release,dataset,url,method='direct',status='final',rowLabel='',page='',notes=''})=>{
    const natural=`${seriesRow.series_id}|${start}|${end}`;
    if (obsKey.has(natural)) return null;
    const row={ observation_id:uuid(`observation:${key}`), series_id:seriesRow.series_id, geography_id:seriesRow.geography_id, boundary_version:seriesRow.boundary_version, period_start:start, period_end:end, period_type:periodType, period_label:label, value:Number(value), geographic_method:method, statistical_status:status, source_class:'official', badge:({direct:'A',aggregated:'B',interpolated:'C',modelled:'D',proxy:'C'}[method] || 'A'), source_release_id:release.release_id, source_dataset_id:dataset.dataset_id, source_table:'', source_sheet:'', source_page:page || '', source_row_label:rowLabel, source_url:url, published_at:'', ingested_at:INGESTED_AT, vintage_id:uuid(`vintage:${key}:1`), supersedes_observation_id:'', lower_bound:null, upper_bound:null, confidence_level:null, standard_error:null, sample_size:null, suppression_reason:'', crosswalk_id:'', notes };
    observations.push(row); obsKey.add(natural); return row;
  };

  const cpiSeries=seriesByCode.get('KDA-CPI-YOY-KEN');
  const cbrSeries=seriesByCode.get('KDA-CBR-KEN');
  if (!cpiSeries || !cbrSeries) throw new Error('Sprint 3 base national CPI/CBR series missing');
  cpiSeries.comparability_group='CPI-HEADLINE-YOY-PUBLISHED';
  cpiSeries.methodology_url='data/sprint3/README.md';
  for (const r of cpi) addObs({seriesRow:cpiSeries,key:`cpi:${r.period_start}`,start:r.period_start,end:r.period_end,periodType:'month',label:r.period_label,value:r.inflation_yoy_pct,release:rel.cpi,dataset:ds.cpi,url:sources.knbs_cpi.url,notes:'Headline year-on-year inflation as published; historical series spans CPI base regimes.'});
  for (const r of cbr) addObs({seriesRow:cbrSeries,key:`cbr:${r.date}`,start:r.date,end:r.date,periodType:'point_in_time',label:`CBR decision ${r.date}`,value:r.cbr_pct,release:rel.cbr,dataset:ds.cbr,url:sources.cbk_cbr.url,notes:'Official CBK policy-rate decision observation.'});

  const fxSeries=addSeries({code:'KDA-USDKES-MONTHLY-AVG-KEN',indicator:fxMonthlyInd,geo:country,unitCode:'kes_per_usd',dataset:ds.fx,frequency:'monthly',periodType:'month',group:'FX-USDKES-CBK-PERIOD-AVERAGE',currency:'KES'});
  for (const r of fx) addObs({seriesRow:fxSeries,key:`fx:${r.period_start}`,start:r.period_start,end:r.period_end,periodType:'month',label:r.period_label,value:r.usd_kes_period_average,release:rel.fx,dataset:ds.fx,url:sources.cbk_fx.url,notes:'Official CBK monthly period-average KES per USD; separate from daily market-mid series.'});

  const tbillSeries=addSeries({code:'KDA-TBILL91-MONTHLY-AVG-KEN',indicator:tbillMonthlyInd,geo:country,unitCode:'percent',dataset:ds.tbill,frequency:'monthly',periodType:'month',group:'TBILL-91-CBK-MONTHLY-AVERAGE'});
  for (const r of tbill) addObs({seriesRow:tbillSeries,key:`tbill91:${r.period_start}`,start:r.period_start,end:r.period_end,periodType:'month',label:r.period_label,value:r.tbill_91_monthly_avg_pct,release:rel.tbill,dataset:ds.tbill,url:r.source_url || sources.cbk_tbill91.urls?.[0],notes:'Official CBK monthly-average 91-day Treasury bill rate.'});

  const nairobi=geoByCode.get('KEN-C047');
  if (!nairobi) throw new Error('Sprint 3 Nairobi geography missing');
  const epraSeries=seriesByCode.get('KDA-FUEL-PETROL-KEN-C047');
  if (!epraSeries) throw new Error('Sprint 3 canonical Nairobi fuel series missing');
  for (const r of epra) addObs({seriesRow:epraSeries,key:`epra-nairobi:${r.period_start}`,start:r.period_start,end:r.period_end,periodType:'period',label:`${r.period_start} to ${r.period_end}`,value:r.super_petrol_kes_per_litre,release:rel.epra,dataset:ds.epra,url:r.source_url || sources.epra_nairobi_pms.url,method:'proxy',rowLabel:'Nairobi',notes:'Nairobi EPRA pricing-town maximum retail Super Petrol price; not a Nairobi County average.'});

  const budgetDefs=[
    ['budget_total_ksh_mn','BUDGET',budgetInd,'COB-COUNTY-BUDGET-ANNUAL'],
    ['expenditure_total_ksh_mn','EXPENDITURE',spendInd,'COB-COUNTY-EXPENDITURE-ANNUAL'],
    ['overall_absorption_pct','ABSORPTION',absInd,'COB-COUNTY-ABSORPTION-ANNUAL'],
    ['development_absorption_pct','DEV-ABSORPTION',devInd,'COB-COUNTY-DEV-ABSORPTION-ANNUAL']
  ];
  for (const r of cob) {
    const geo=geoByCode.get(r.geo_code); if (!geo) throw new Error(`Sprint 3 CoB unknown geography ${r.geo_code}`);
    const release=releaseByCode.get(`REL-COB-FY${fyCode(r.fiscal_year)}-S3`); if (!release) throw new Error(`Sprint 3 CoB release missing ${r.fiscal_year}`);
    for (const [field,suffix,indicator,group] of budgetDefs) {
      const code=`KDA-COUNTY-${suffix}-${r.geo_code}`;
      let s=seriesByCode.get(code);
      if (!s) s=addSeries({code,indicator,geo,unitCode:field.endsWith('_pct')?'percent':'kes_million',dataset:ds.cob,frequency:'annual',periodType:'fiscal_year',group,currency:field.endsWith('_pct')?'':'KES'});
      s.comparability_group=group; s.methodology_url='data/sprint3/README.md';
      addObs({seriesRow:s,key:`cob:${suffix}:${r.geo_code}:${r.fiscal_year}`,start:r.period_start,end:r.period_end,periodType:'fiscal_year',label:`FY ${r.fiscal_year}`,value:r[field],release,dataset:ds.cob,url:r.source_url,rowLabel:r.name,page:r.source_page,notes:'Official Controller of Budget annual county value; no sub-county allocation.'});
    }
  }

  for (const s of series) {
    const own=observations.filter(o=>o.series_id===s.series_id).sort((a,b)=>a.period_start.localeCompare(b.period_start)||a.period_end.localeCompare(b.period_end));
    if (!own.length) continue;
    s.start_period=own[0].period_label; s.end_period=own.at(-1).period_label; s.latest_observation_id=own.at(-1).observation_id; s.observation_count=own.length;
    if (own.some(o=>o.ingested_at===INGESTED_AT)) s.last_updated_at=INGESTED_AT;
  }

  const unitFields=['unit_id','code','name','symbol','dimension','scale_factor','decimal_places','currency_code'];
  const indicatorFields=['indicator_id','indicator_code','name','short_name','description','topic','subtopic','unit_id','higher_is_better','preferred_frequency','minimum_geo_level','minimum_denominator','methodology_url','comparable','active'];
  const seriesFields=['series_id','series_code','indicator_id','geography_id','geography_taxonomy','boundary_version','frequency','period_type','unit_id','price_basis','base_period','currency','seasonal_adjustment','transformation','geographic_method','comparability_group','dataset_id','agency_id','start_period','end_period','latest_observation_id','observation_count','status'];
  const obsFields=['observation_id','series_id','geography_id','period_start','period_end','period_type','period_label','value','geographic_method','statistical_status','source_class','badge','source_release_id','source_dataset_id','source_url','published_at','notes'];
  for (const [name,rows,fields] of [['units',units,unitFields],['indicators',indicators,indicatorFields],['series',series,seriesFields],['observations',observations,obsFields]]) {
    await writeFile(path.join(root,`${dir}/${name}.json`),JSON.stringify(rows,null,2)+'\n');
    await writeFile(path.join(root,`${dir}/${name}.csv`),csv(rows,fields));
  }
  console.log(`Sprint 3 indicators promoted: ${indicators.length} indicators, ${series.length} series, ${observations.length} observations.`);
}

if (mode==='catalogue') await buildCatalogue();
else await buildIndicators();
