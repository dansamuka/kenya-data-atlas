import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.argv[2];
if (!['catalogue', 'indicators'].includes(mode)) {
  console.error('Usage: node scripts/sprint1/build-native.mjs <catalogue|indicators>');
  process.exit(2);
}

const INGESTED_AT = '2026-08-26T20:30:00.000Z';
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const readText = async p => readFile(path.join(root, p), 'utf8');
const csvCell = value => `"${String(Array.isArray(value) ? value.join('|') : value ?? '').replaceAll('"', '""')}"`;
const csv = (rows, fields) => [fields.join(','), ...rows.map(row => fields.map(f => csvCell(row[f])).join(','))].join('\n') + '\n';
const unionFields = rows => [...new Set(rows.flatMap(row => Object.keys(row)))];
const uuid = name => {
  const h = createHash('sha1').update(`kenya-data-atlas:sprint1:${name}`).digest('hex').slice(0, 32);
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20)}`;
};
function parseCsv(raw) {
  const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  return lines.filter(Boolean).map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}
const sourceDoc = await readJson('data/sprint1/sources.json');
const sources = sourceDoc.sources;

const datasetDefs = [
  {
    key:'pop', code:'DS-KNBS-CENSUS-2009-COUNTY-S1', sourceBase:'DS-KNBS-CENSUS',
    title:'2009 Census — County Population Counts', description:'Official 2009 census population totals for all 47 counties.', topic:'Demography',
    geographic_coverage:['county'], frequency:'decennial', publication_status:'published',
    methodology_url:'data/sprint1/README.md', known_limitations:'Official county totals only; no allocation below county.'
  },
  {
    key:'voters', code:'DS-IEBC-VOTERS-COUNTY-2022-S1', sourceBase:'DS-IEBC-VOTERS',
    title:'Registered Voters — 2022 County Gazette Schedule', description:'IEBC Gazette Third Schedule registered-voter totals for all 47 counties.', topic:'Elections',
    geographic_coverage:['county'], frequency:'electoral_cycle', publication_status:'published',
    methodology_url:'data/sprint1/README.md', known_limitations:'County Gazette schedule totals 22,102,532; the later audited national topline is a different release vintage.'
  },
  {
    key:'gcp', code:'DS-KNBS-GCP-2025-S1', sourceBase:'DS-KNBS-GCP',
    title:'Gross County Product 2025 — Current Prices', description:'Gross County Product at current prices for all 47 counties, 2020–2024.', topic:'Economy',
    geographic_coverage:['county'], frequency:'annual', publication_status:'published',
    methodology_url:'data/sprint1/README.md', known_limitations:'2024 is preliminary. County values must not be allocated below county.'
  },
  {
    key:'budget', code:'DS-COB-COUNTY-BUDGET-FY2024-25-S1', sourceBase:'DS-COB-COUNTY-BUDGET',
    title:'County Budget Implementation — FY 2024/25', description:'County budget, expenditure and absorption measures for FY 2024/25.', topic:'Public Finance',
    geographic_coverage:['county'], frequency:'annual', publication_status:'published',
    methodology_url:'data/sprint1/README.md', known_limitations:'County fiscal-year totals and absorption rates only.'
  },
  {
    key:'fuel', code:'DS-EPRA-FUEL-MAJOR-TOWNS-S1', sourceBase:'DS-EPRA-ENERGY',
    title:'Super Petrol — Representative EPRA Pricing Towns, Aug–Sep 2026', description:'Published Super Petrol pricing-town observations linked to counties for navigation.', topic:'Economy',
    geographic_coverage:['county_where_pricing_town_linked'], frequency:'monthly', publication_status:'published',
    methodology_url:'data/sprint1/README.md', known_limitations:'Pricing-town observations, not county averages. Nyandarua uses the nearest published pricing town, Nyahururu.'
  }
];

const releaseDefs = [
  { key:'pop', code:'REL-KNBS-POP2009-COUNTY-S1', published:'2013-01-01', start:'2009-08-24', end:'2009-08-25', source:'population_2009' },
  { key:'voters', code:'REL-IEBC-VOTERS-COUNTY-2022-S1', published:'2022-06-21', start:'2022-06-20', end:'2022-06-20', source:'registered_voters_2022' },
  { key:'gcp', code:'REL-KNBS-GCP-2025-S1', published:'2025-12-01', start:'2020-01-01', end:'2024-12-31', source:'gcp_2020_2024' },
  { key:'budget', code:'REL-COB-FY2024-25-S1', published:'2025-09-17', start:'2024-07-01', end:'2025-06-30', source:'county_budget_fy2024_25' },
  { key:'fuel', code:'REL-EPRA-FUEL-AUG2026-S1', published:'2026-08-14', start:'2026-08-15', end:'2026-09-14', source:'fuel_aug_sep_2026' }
];

async function buildCatalogue() {
  const dir = 'data/catalogue/registry';
  const [datasets, releases] = await Promise.all([readJson(`${dir}/datasets.json`), readJson(`${dir}/releases.json`)]);
  const byCode = new Map(datasets.map(d => [d.dataset_code, d]));

  for (const def of datasetDefs) {
    if (byCode.has(def.code)) continue;
    const base = byCode.get(def.sourceBase);
    if (!base?.source_id) throw new Error(`Sprint 1 catalogue: source dataset ${def.sourceBase} missing`);
    const row = { dataset_id: uuid(`dataset:${def.code}`), dataset_code: def.code, source_id: base.source_id, ...Object.fromEntries(Object.entries(def).filter(([k]) => !['key','code','sourceBase'].includes(k))) };
    datasets.push(row); byCode.set(def.code, row);
  }

  const releaseCodes = new Set(releases.map(r => r.release_code));
  for (const def of releaseDefs) {
    if (releaseCodes.has(def.code)) continue;
    const ds = byCode.get(datasetDefs.find(d => d.key === def.key).code);
    const src = sources[def.source];
    const releaseUrl = def.key === 'fuel' ? (src.secondary_current_towns_url || src.url || src.primary_url) : src.url;
    releases.push({
      release_id: uuid(`release:${def.code}`), release_code: def.code, dataset_id: ds.dataset_id,
      title: src.title, reference_period_start: def.start, reference_period_end: def.end,
      published_at: def.published, discovered_at: INGESTED_AT, ingested_at: INGESTED_AT,
      release_url: releaseUrl, release_status:'published', version_label:'', release_notes: src.note || '', supersedes_release_id:''
    });
  }

  await writeFile(path.join(root, `${dir}/datasets.json`), JSON.stringify(datasets, null, 2) + '\n');
  await writeFile(path.join(root, `${dir}/releases.json`), JSON.stringify(releases, null, 2) + '\n');
  await writeFile(path.join(root, `${dir}/datasets.csv`), csv(datasets, unionFields(datasets)));
  await writeFile(path.join(root, `${dir}/releases.csv`), csv(releases, unionFields(releases)));
  console.log(`Sprint 1 catalogue promoted: ${datasets.length} datasets, ${releases.length} releases.`);
}

async function buildIndicators() {
  const dir = 'data/indicators/registry';
  const [units, indicators, series, observations, geos, datasets, releases, sourcesRegistry] = await Promise.all([
    readJson(`${dir}/units.json`), readJson(`${dir}/indicators.json`), readJson(`${dir}/series.json`), readJson(`${dir}/observations.json`),
    readJson('data/geography/registry/geographies.json'), readJson('data/catalogue/registry/datasets.json'),
    readJson('data/catalogue/registry/releases.json'), readJson('data/catalogue/registry/sources.json')
  ]);
  const [pop, voters, gcp, budget, fuel] = await Promise.all([
    readText('data/sprint1/population-2009.csv').then(parseCsv),
    readText('data/sprint1/voters-2022.csv').then(parseCsv),
    readText('data/sprint1/gcp-2020-2024.csv').then(parseCsv),
    readText('data/sprint1/county-budget-fy2024-25.csv').then(parseCsv),
    readText('data/sprint1/fuel-super-petrol-2026-08.csv').then(parseCsv)
  ]);

  const geoByCode = new Map(geos.map(g => [g.geo_code, g]));
  const unitByCode = new Map(units.map(u => [u.code, u]));
  if (!unitByCode.has('kes_million')) {
    units.push({ unit_id: uuid('unit:kes_million'), code:'kes_million', name:'Kenya Shillings, million', symbol:'KSh mn', dimension:'currency', scale_factor:1000000, decimal_places:2, currency_code:'KES' });
  }
  const refreshedUnitByCode = new Map(units.map(u => [u.code, u]));
  const indicatorByCode = new Map(indicators.map(i => [i.indicator_code, i]));
  const addIndicator = (code, name, shortName, description, topic, subtopic, unitCode, higher=null) => {
    if (indicatorByCode.has(code)) return indicatorByCode.get(code);
    const u = refreshedUnitByCode.get(unitCode); if (!u) throw new Error(`Sprint 1 indicator ${code}: unit ${unitCode} missing`);
    const row = { indicator_id: uuid(`indicator:${code}`), indicator_code:code, name, short_name:shortName, description, topic, subtopic, unit_id:u.unit_id, higher_is_better:higher, preferred_frequency:'annual', minimum_geo_level:'county', minimum_denominator:null, methodology_url:'data/sprint1/README.md', comparable:true, active:true };
    indicators.push(row); indicatorByCode.set(code, row); return row;
  };
  const gcpInd = addIndicator('IND-GCP-CURRENT','Gross County Product (current prices)','GCP','Gross County Product at current prices. 2024 is preliminary.','Economy','County economy','kes_million');
  const budgetInd = addIndicator('IND-COUNTY-BUDGET-TOTAL','County budget','County budget','Total county budget for the fiscal year.','Public Finance','County budgets','kes_million');
  const spendInd = addIndicator('IND-COUNTY-EXPENDITURE-TOTAL','County expenditure','County expenditure','Total county government expenditure for the fiscal year.','Public Finance','County budgets','kes_million');
  const absInd = addIndicator('IND-COUNTY-BUDGET-ABSORPTION','County budget absorption rate','Budget absorption','Total expenditure as a percentage of the county budget.','Public Finance','County budgets','percent',true);
  const devInd = addIndicator('IND-COUNTY-DEVELOPMENT-ABSORPTION','Development budget absorption rate','Development absorption','Development expenditure as a percentage of the development budget.','Public Finance','County budgets','percent',true);
  const popInd = indicatorByCode.get('IND-POPULATION');
  const votersInd = indicatorByCode.get('IND-REGISTERED-VOTERS');
  const fuelInd = indicatorByCode.get('IND-FUEL-PETROL');
  if (!popInd || !votersInd || !fuelInd) throw new Error('Sprint 1: required base indicators missing');

  const datasetByCode = new Map(datasets.map(d => [d.dataset_code, d]));
  const releaseByCode = new Map(releases.map(r => [r.release_code, r]));
  const sourceById = new Map(sourcesRegistry.map(s => [s.source_id, s]));
  const ds = Object.fromEntries(datasetDefs.map(d => [d.key, datasetByCode.get(d.code)]));
  const rel = Object.fromEntries(releaseDefs.map(r => [r.key, releaseByCode.get(r.code)]));
  for (const d of datasetDefs) if (!ds[d.key]) throw new Error(`Sprint 1 dataset ${d.code} missing from native catalogue`);
  for (const r of releaseDefs) if (!rel[r.key]) throw new Error(`Sprint 1 release ${r.code} missing from native catalogue`);

  const seriesByCode = new Map(series.map(s => [s.series_code, s]));
  const obsById = new Map(observations.map(o => [o.observation_id, o]));
  const agencyFor = dataset => sourceById.get(dataset.source_id)?.agency_id || '';

  function addSeries({ code, indicator, geo, unitCode, dataset, frequency, periodType, priceBasis='not_applicable', currency='', method='direct', group }) {
    if (seriesByCode.has(code)) return seriesByCode.get(code);
    const unit = refreshedUnitByCode.get(unitCode); if (!unit) throw new Error(`series ${code}: unit ${unitCode} missing`);
    const row = {
      series_id: uuid(`series:${code}`), series_code:code, indicator_id:indicator.indicator_id, geography_id:geo.geography_id,
      geography_taxonomy:geo.geography_system || 'electoral', boundary_version:geo.level === 'country' ? '' : '2012-01',
      frequency, period_type:periodType, unit_id:unit.unit_id, price_basis:priceBasis, base_period:'', currency,
      seasonal_adjustment:'none', transformation:'level', geographic_method:method, comparability_group:group,
      dataset_id:dataset.dataset_id, agency_id:agencyFor(dataset), methodology_url:'data/sprint1/README.md',
      start_period:'', end_period:'', latest_observation_id:'', observation_count:0, last_updated_at:'', next_expected_release:'', status:'active', superseded_by_series_id:''
    };
    series.push(row); seriesByCode.set(code,row); return row;
  }
  function addObs({ seriesRow, key, start, end, periodType, label, value, method='direct', status='final', sourceClass='official', release, dataset, table='', rowLabel='', url, published='', notes='' }) {
    const oid = uuid(`observation:${key}`);
    if (obsById.has(oid)) return obsById.get(oid);
    const badge = sourceClass === 'external' ? 'E' : ({direct:'A',aggregated:'B',interpolated:'C',modelled:'D'}[method] || null);
    const row = {
      observation_id:oid, series_id:seriesRow.series_id, geography_id:seriesRow.geography_id, boundary_version:seriesRow.boundary_version,
      period_start:start, period_end:end, period_type:periodType, period_label:label, value:Number(value), geographic_method:method,
      statistical_status:status, source_class:sourceClass, badge, source_release_id:release.release_id, source_dataset_id:dataset.dataset_id,
      source_table:table, source_sheet:'', source_page:'', source_row_label:rowLabel, source_url:url, published_at:published,
      ingested_at:INGESTED_AT, vintage_id:uuid(`vintage:${key}:1`), supersedes_observation_id:'', lower_bound:null, upper_bound:null,
      confidence_level:null, standard_error:null, sample_size:null, suppression_reason:'', crosswalk_id:'', notes
    };
    observations.push(row); obsById.set(oid,row); return row;
  }

  for (const r of pop) {
    const geo = geoByCode.get(r.geo_code); if (!geo) throw new Error(`population: unknown ${r.geo_code}`);
    const existing = series.find(s => s.indicator_id === popInd.indicator_id && s.geography_id === geo.geography_id);
    if (!existing) throw new Error(`population: existing county series missing for ${r.geo_code}`);
    addObs({ seriesRow:existing, key:`pop2009:${r.geo_code}`, start:'2009-08-24', end:'2009-08-25', periodType:'point_in_time', label:'2009 census', value:r.value, release:rel.pop, dataset:ds.pop, table:'Table 4a', rowLabel:geo.name, url:sources.population_2009.url, published:'2013-01-01', notes:sources.population_2009.note });
  }

  for (const r of voters) {
    const geo = geoByCode.get(r.geo_code); if (!geo) throw new Error(`voters: unknown ${r.geo_code}`);
    const s = addSeries({ code:`KDA-VOTERS-2022-${r.geo_code}`, indicator:votersInd, geo, unitCode:'persons', dataset:ds.voters, frequency:'irregular', periodType:'point_in_time', group:'IEBC-REGISTER-2022-COUNTY-GAZETTE' });
    addObs({ seriesRow:s, key:`voters2022:${r.geo_code}`, start:'2022-06-20', end:'2022-06-20', periodType:'point_in_time', label:'Certified register county schedule, June 2022', value:r.value, release:rel.voters, dataset:ds.voters, table:'Third Schedule — Registered Voters per County', rowLabel:geo.name, url:sources.registered_voters_2022.url, published:'2022-06-21', notes:sources.registered_voters_2022.note });
  }

  for (const r of gcp) {
    const geo = geoByCode.get(r.geo_code); if (!geo) throw new Error(`gcp: unknown ${r.geo_code}`);
    const s = addSeries({ code:`KDA-GCP-CURRENT-${r.geo_code}`, indicator:gcpInd, geo, unitCode:'kes_million', dataset:ds.gcp, frequency:'annual', periodType:'year', priceBasis:'nominal', currency:'KES', group:'KNBS-GCP-CURRENT-2025' });
    for (const year of ['2020','2021','2022','2023','2024']) addObs({ seriesRow:s, key:`gcp:${r.geo_code}:${year}`, start:`${year}-01-01`, end:`${year}-12-31`, periodType:'year', label:year === '2024' ? '2024 preliminary' : year, value:r[year], status:year === '2024' ? 'provisional' : 'final', release:rel.gcp, dataset:ds.gcp, table:'Table 8', rowLabel:geo.name, url:sources.gcp_2020_2024.url, published:'2025-12-01', notes:sources.gcp_2020_2024.note });
  }

  const budgetDefs = [
    ['budget_total_ksh_mn','BUDGET',budgetInd,'kes_million','COB-BUDGET-FY2024-25'],
    ['expenditure_total_ksh_mn','EXPENDITURE',spendInd,'kes_million','COB-EXPENDITURE-FY2024-25'],
    ['overall_absorption_pct','ABSORPTION',absInd,'percent','COB-ABSORPTION-FY2024-25'],
    ['development_absorption_pct','DEV-ABSORPTION',devInd,'percent','COB-DEV-ABSORPTION-FY2024-25']
  ];
  for (const r of budget) {
    const geo = geoByCode.get(r.geo_code); if (!geo) throw new Error(`budget: unknown ${r.geo_code}`);
    for (const [field, suffix, indicator, unitCode, group] of budgetDefs) {
      const s = addSeries({ code:`KDA-COUNTY-${suffix}-${r.geo_code}`, indicator, geo, unitCode, dataset:ds.budget, frequency:'annual', periodType:'fiscal_year', priceBasis:unitCode === 'kes_million' ? 'nominal' : 'not_applicable', currency:unitCode === 'kes_million' ? 'KES' : '', group });
      addObs({ seriesRow:s, key:`budget:${suffix}:${r.geo_code}`, start:'2024-07-01', end:'2025-06-30', periodType:'fiscal_year', label:'FY 2024/25', value:r[field], release:rel.budget, dataset:ds.budget, table:'Table 2.5', rowLabel:geo.name, url:sources.county_budget_fy2024_25.url, published:'2025-09-17', notes:sources.county_budget_fy2024_25.note });
    }
  }

  const existingFuelGeo = new Set(series.filter(s => s.indicator_id === fuelInd.indicator_id).map(s => s.geography_id));
  for (const r of fuel) {
    const geo = geoByCode.get(r.geo_code); if (!geo) throw new Error(`fuel: unknown ${r.geo_code}`);
    if (existingFuelGeo.has(geo.geography_id)) continue;
    const s = addSeries({ code:`KDA-FUEL-PETROL-${r.geo_code}`, indicator:fuelInd, geo, unitCode:'kes_per_litre', dataset:ds.fuel, frequency:'monthly', periodType:'period', group:'EPRA-SUPER-PETROL-PRICING-TOWN-AUG2026' });
    addObs({ seriesRow:s, key:`fuel:${r.geo_code}`, start:'2026-08-15', end:'2026-09-14', periodType:'period', label:'15 Aug–14 Sep 2026', value:r.super_petrol_kes_per_litre, release:rel.fuel, dataset:ds.fuel, rowLabel:r.pricing_town, url:sources.fuel_aug_sep_2026.secondary_current_towns_url || sources.fuel_aug_sep_2026.url, published:'', sourceClass:'external', notes:`Representative pricing town: ${r.pricing_town}. This is not a county average.${r.geo_code === 'KEN-C018' ? ' Nyandarua uses nearest published pricing town Nyahururu.' : ''}` });
  }

  for (const s of series) {
    const own = observations.filter(o => o.series_id === s.series_id).sort((a,b) => a.period_start.localeCompare(b.period_start));
    if (!own.length) continue;
    s.start_period = own[0].period_label; s.end_period = own.at(-1).period_label;
    s.latest_observation_id = own.at(-1).observation_id; s.observation_count = own.length; s.last_updated_at = own.at(-1).ingested_at;
  }

  const unitFields = ['unit_id','code','name','symbol','dimension','scale_factor','decimal_places','currency_code'];
  const indicatorFields = ['indicator_id','indicator_code','name','short_name','description','topic','subtopic','unit_id','higher_is_better','preferred_frequency','minimum_geo_level','minimum_denominator','methodology_url','comparable','active'];
  const seriesFields = ['series_id','series_code','indicator_id','geography_id','geography_taxonomy','boundary_version','frequency','period_type','unit_id','price_basis','base_period','currency','seasonal_adjustment','transformation','geographic_method','comparability_group','dataset_id','agency_id','start_period','end_period','latest_observation_id','observation_count','status'];
  const obsFields = ['observation_id','series_id','geography_id','period_start','period_end','period_type','period_label','value','geographic_method','statistical_status','source_class','badge','source_release_id','source_dataset_id','source_url','published_at','notes'];
  for (const [name, rows, fields] of [['units',units,unitFields],['indicators',indicators,indicatorFields],['series',series,seriesFields],['observations',observations,obsFields]]) {
    await writeFile(path.join(root, `${dir}/${name}.json`), JSON.stringify(rows, null, 2) + '\n');
    await writeFile(path.join(root, `${dir}/${name}.csv`), csv(rows, fields));
  }
  console.log(`Sprint 1 indicators promoted: ${units.length} units, ${indicators.length} indicators, ${series.length} series, ${observations.length} observations.`);
}

if (mode === 'catalogue') await buildCatalogue();
else await buildIndicators();
